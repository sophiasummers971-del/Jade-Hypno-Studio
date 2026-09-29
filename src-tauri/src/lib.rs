use chrono::{DateTime, Duration, SecondsFormat, Utc};
use fs2::FileExt;
use jsonschema::JSONSchema;
use serde::Serialize;
use serde_json::Value;
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::LazyLock,
};
use tempfile::NamedTempFile;
use uuid::Uuid;

pub type Result<T> = std::result::Result<T, String>;
const MAX_FILE: u64 = 4 * 1024 * 1024;
static SESSION_VALIDATOR: LazyLock<JSONSchema> =
    LazyLock::new(|| validator(include_str!("../schemas/session.schema.json")));
static SETTINGS_VALIDATOR: LazyLock<JSONSchema> =
    LazyLock::new(|| validator(include_str!("../schemas/settings.schema.json")));
fn validator(source: &str) -> JSONSchema {
    JSONSchema::options()
        .should_validate_formats(true)
        .compile(&serde_json::from_str(source).expect("Bundled schema JSON"))
        .expect("Bundled schema compiles")
}
fn validate(value: &Value, session: bool) -> Result<()> {
    let schema = if session {
        &*SESSION_VALIDATOR
    } else {
        &*SETTINGS_VALIDATOR
    };
    if let Err(errors) = schema.validate(value) {
        // Never include validator error Display: it can quote private field contents.
        let paths: Vec<String> = errors
            .take(8)
            .map(|e| e.instance_path.to_string())
            .collect();
        return Err(format!(
            "Invalid {} structure or schema version at: {}. Original file unchanged.",
            if session { "session" } else { "settings" },
            paths.join(", ")
        ));
    }
    if session {
        if value["title"].as_str().unwrap_or("").trim().is_empty() {
            return Err("Session title cannot be blank.".into());
        }
        canonical_id(value["id"].as_str().unwrap_or(""))?;
        let created = DateTime::parse_from_rfc3339(value["createdAt"].as_str().unwrap_or(""))
            .map_err(|_| "Invalid creation timestamp.")?;
        let updated = DateTime::parse_from_rfc3339(value["updatedAt"].as_str().unwrap_or(""))
            .map_err(|_| "Invalid update timestamp.")?;
        if updated < created {
            return Err("Updated timestamp precedes creation timestamp.".into());
        }
        let mut ids = std::collections::HashSet::new();
        for block in value["blocks"].as_array().ok_or("Invalid blocks.")? {
            let id = block["id"].as_str().ok_or("Invalid block ID.")?;
            canonical_id(id)?;
            if !ids.insert(id) {
                return Err("Duplicate block IDs are not allowed.".into());
            }
        }
    }
    Ok(())
}
fn canonical_id(id: &str) -> Result<()> {
    let parsed = Uuid::parse_str(id).map_err(|_| "Invalid session ID. Expected a UUID.")?;
    if parsed.to_string() != id {
        return Err("ID must be a canonical lowercase UUID.".into());
    }
    Ok(())
}
fn reject_link(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => {
            Err("Refusing symbolic links in the application data store.".into())
        }
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Unable to inspect local data: {error}")),
    }
}
fn private_directory(path: &Path) -> Result<()> {
    reject_link(path)?;
    fs::create_dir_all(path)
        .map_err(|e| format!("Unable to create application data directory: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(|e| format!("Unable to secure data directory: {e}"))?;
    }
    Ok(())
}
fn read_json(path: &Path) -> Result<Value> {
    reject_link(path)?;
    let file = File::open(path).map_err(|e| format!("Unable to open local file: {e}"))?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("Expected a regular JSON file.".into());
    }
    let mut content = Vec::new();
    file.take(MAX_FILE + 1)
        .read_to_end(&mut content)
        .map_err(|e| format!("Unable to read local file: {e}"))?;
    if content.len() as u64 > MAX_FILE {
        return Err("File exceeds the 4 MiB safety limit. Original file unchanged.".into());
    }
    serde_json::from_slice(&content).map_err(|e| {
        format!(
            "Malformed JSON at line {}, column {}. Original file unchanged.",
            e.line(),
            e.column()
        )
    })
}
fn atomic_write(path: &Path, value: &Value, create: bool) -> Result<()> {
    atomic_write_checked(path, value, create, || Ok(()))
}
fn atomic_write_checked(
    path: &Path,
    value: &Value,
    create: bool,
    before_commit: impl FnOnce() -> Result<()>,
) -> Result<()> {
    reject_link(path)?;
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_FILE {
        return Err("Session exceeds the 4 MiB safety limit.".into());
    }
    let parent = path.parent().ok_or("Invalid internal storage path.")?;
    reject_link(parent)?;
    let mut temp =
        NamedTempFile::new_in(parent).map_err(|e| format!("Unable to prepare atomic save: {e}"))?;
    temp.write_all(&bytes)
        .and_then(|_| temp.as_file().sync_all())
        .map_err(|e| format!("Unable to write or flush temporary file: {e}"))?;
    before_commit()?;
    if create {
        temp.persist_noclobber(path)
            .map_err(|e| format!("Unable to create session without overwriting: {}", e.error))?;
    } else {
        temp.persist(path)
            .map_err(|e| format!("Unable to replace local file atomically: {}", e.error))?;
    }
    // A directory fsync failure means durability was not confirmed; never report success.
    #[cfg(unix)] File::open(parent).and_then(|f| f.sync_all()).map_err(|e| format!("File replaced, but directory durability could not be confirmed: {e}. Reopen before retrying."))?;
    Ok(())
}
#[derive(Serialize)]
pub struct Issue {
    file: String,
    message: String,
}
#[derive(Serialize)]
pub struct SessionList {
    pub sessions: Vec<Value>,
    pub issues: Vec<Issue>,
}

/// Only native code chooses this root. No IPC operation accepts a filesystem path.
pub struct Store {
    root: PathBuf,
    _lock: File,
}
impl Store {
    pub fn open(root: PathBuf) -> Result<Self> {
        private_directory(&root)?;
        private_directory(&root.join("sessions"))?;
        private_directory(&root.join("Trash"))?;
        let lock_path = root.join(".studio.lock");
        reject_link(&lock_path)?;
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(lock_path)
            .map_err(|e| format!("Unable to open workspace lock: {e}"))?;
        lock.try_lock_exclusive().map_err(|_| {
            "This workspace is already open in another studio instance.".to_string()
        })?;
        Ok(Self { root, _lock: lock })
    }
    fn session_path(&self, id: &str) -> Result<PathBuf> {
        canonical_id(id)?;
        reject_link(&self.root)?;
        reject_link(&self.root.join("sessions"))?;
        Ok(self.root.join("sessions").join(format!("{id}.json")))
    }
    pub fn load(&self, id: &str) -> Result<Value> {
        let value = read_json(&self.session_path(id)?)?;
        validate(&value, true)?;
        if value["id"] != id {
            return Err("Session ID does not match its filename. Original file unchanged.".into());
        }
        Ok(value)
    }
    pub fn list(&self) -> Result<SessionList> {
        reject_link(&self.root.join("sessions"))?;
        let mut result = SessionList {
            sessions: vec![],
            issues: vec![],
        };
        let entries = fs::read_dir(self.root.join("sessions"))
            .map_err(|e| format!("Unable to list sessions: {e}"))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("Unable to inspect a session entry: {e}"))?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            let filename = entry.file_name().to_string_lossy().into_owned();
            let id = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            match self.load(id) {
                Ok(value) => result.sessions.push(value),
                Err(message) => result.issues.push(Issue {
                    file: filename,
                    message,
                }),
            }
        }
        result
            .sessions
            .sort_by(|a, b| b["updatedAt"].as_str().cmp(&a["updatedAt"].as_str()));
        Ok(result)
    }
    pub fn save(&self, mut value: Value, expected: Option<&str>) -> Result<Value> {
        validate(&value, true)?;
        let path = self.session_path(value["id"].as_str().ok_or("Missing ID.")?)?;
        reject_link(&path)?;
        let now = Utc::now();
        let timestamp = match expected {
            Some(expected) => {
                let current = self.load(value["id"].as_str().ok_or("Missing ID.")?)?;
                if current["updatedAt"] != expected {
                    return Err("Session changed on disk. Reopen it before saving, or save your edits as a copy.".into());
                }
                if current["createdAt"] != value["createdAt"] {
                    return Err("Creation timestamp cannot be changed.".into());
                }
                let previous = DateTime::parse_from_rfc3339(expected)
                    .map_err(|_| "Invalid expected timestamp.")?
                    .with_timezone(&Utc);
                std::cmp::max(now, previous + Duration::milliseconds(1))
            }
            None => {
                if path.try_exists().map_err(|e| e.to_string())? {
                    return Err("This session already exists. Creation cannot overwrite it.".into());
                }
                value["createdAt"] =
                    Value::String(now.to_rfc3339_opts(SecondsFormat::Millis, true));
                now
            }
        };
        value["updatedAt"] = Value::String(timestamp.to_rfc3339_opts(SecondsFormat::Millis, true));
        validate(&value, true)?;
        atomic_write(&path, &value, expected.is_none())?;
        Ok(value)
    }
    pub fn trash(&self, id: &str, expected: &str) -> Result<()> {
        let current = self.load(id)?;
        if current["updatedAt"] != expected {
            return Err("Session changed on disk. Refresh the list before deleting.".into());
        }
        let directory = self.root.join("Trash");
        reject_link(&directory)?;
        let destination = directory.join(format!("{id}-{}.json", Uuid::new_v4()));
        fs::rename(self.session_path(id)?, destination)
            .map_err(|e| format!("Unable to move session to Trash: {e}"))?;
        #[cfg(unix)]
        {
            for dir in [directory, self.root.join("sessions")] {
                File::open(dir).and_then(|f| f.sync_all()).map_err(|e| {
                    format!("Moved to Trash, but directory durability could not be confirmed: {e}")
                })?;
            }
        }
        Ok(())
    }
    pub fn load_settings(&self) -> Result<Value> {
        let path = self.root.join("settings.json");
        reject_link(&path)?;
        if !path.try_exists().map_err(|e| e.to_string())? {
            return serde_json::from_str(include_str!("../schemas/default-settings.json"))
                .map_err(|e| e.to_string());
        }
        let value = read_json(&path)?;
        validate(&value, false)?;
        Ok(value)
    }
    pub fn save_settings(&self, settings: Value) -> Result<Value> {
        validate(&settings, false)?;
        // Never overwrite a corrupted settings file with silent defaults.
        self.load_settings()?;
        reject_link(&self.root)?;
        atomic_write(&self.root.join("settings.json"), &settings, false)?;
        Ok(settings)
    }
}

#[cfg(test)]
mod tests;
