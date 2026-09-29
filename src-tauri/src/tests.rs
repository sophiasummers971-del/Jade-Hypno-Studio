use super::*;
use serde_json::json;
fn fixture() -> Value {
    json!({"schemaVersion":1,"id":Uuid::new_v4().to_string(),"title":"Test session","description":"Structure only","mode":"standard","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z","durationEstimate":1200,"blocks":[],"audioSettings":{"narrationLevel":0.8,"musicLevel":0.3,"ambientLevel":0.2},"visualSettings":{"resolution":"1920x1080","backgroundColor":"#101319"},"safetyReview":{"status":"not-reviewed","notes":""},"exportSettings":{"directory":"","resolution":"1920x1080","captionsEnabled":true},"experimentMetadata":{"label":"","notes":""}})
}
fn setup() -> (tempfile::TempDir, Store) {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path().join("data")).unwrap();
    (dir, store)
}
#[test]
fn real_save_load_roundtrip_across_store_restart() {
    let (dir, store) = setup();
    let saved = store.save(fixture(), None).unwrap();
    let id = saved["id"].as_str().unwrap();
    assert_eq!(store.load(id).unwrap(), saved);
    drop(store);
    let reopened = Store::open(dir.path().join("data")).unwrap();
    assert_eq!(reopened.load(id).unwrap(), saved);
}
#[test]
fn malformed_json_is_not_mutated_and_list_remains_usable() {
    let (_dir, store) = setup();
    let good = store.save(fixture(), None).unwrap();
    let id = Uuid::new_v4().to_string();
    let path = store.session_path(&id).unwrap();
    fs::write(&path, "{not json").unwrap();
    assert!(store.load(&id).unwrap_err().contains("Malformed JSON"));
    let list = store.list().unwrap();
    assert_eq!(list.sessions, vec![good]);
    assert_eq!(list.issues.len(), 1);
    assert_eq!(fs::read_to_string(path).unwrap(), "{not json");
}
#[test]
fn corrupt_existing_file_cannot_be_overwritten() {
    let (_dir, store) = setup();
    let value = store.save(fixture(), None).unwrap();
    let path = store.session_path(value["id"].as_str().unwrap()).unwrap();
    fs::write(&path, "broken").unwrap();
    assert!(store
        .save(value.clone(), value["updatedAt"].as_str())
        .is_err());
    assert_eq!(fs::read_to_string(path).unwrap(), "broken");
}
#[test]
fn validates_ipc_payload_and_preserves_existing_data() {
    let (_dir, store) = setup();
    let saved = store.save(fixture(), None).unwrap();
    let mut invalid = saved.clone();
    invalid["audioSettings"]["musicLevel"] = json!(2);
    assert!(store.save(invalid, saved["updatedAt"].as_str()).is_err());
    assert_eq!(store.load(saved["id"].as_str().unwrap()).unwrap(), saved);
}
#[test]
fn unknown_schema_is_rejected() {
    let (_dir, store) = setup();
    let mut value = fixture();
    value["schemaVersion"] = json!(2);
    assert!(store.save(value, None).is_err());
}
#[test]
fn refuses_path_traversal() {
    let (_dir, store) = setup();
    assert!(store.load("../settings").is_err());
    assert!(store.trash("../../outside", "").is_err());
}
#[test]
fn duplicate_identity_can_be_saved_without_modifying_original() {
    let (_dir, store) = setup();
    let original = store.save(fixture(), None).unwrap();
    let mut copy = original.clone();
    copy["id"] = json!(Uuid::new_v4().to_string());
    copy["title"] = json!("Copy");
    let copied = store.save(copy, None).unwrap();
    assert_ne!(copied["id"], original["id"]);
    assert_eq!(
        store.load(original["id"].as_str().unwrap()).unwrap(),
        original
    );
    assert_eq!(store.list().unwrap().sessions.len(), 2);
}
#[test]
fn rename_advances_timestamp_and_rejects_stale_writes() {
    let (_dir, store) = setup();
    let saved = store.save(fixture(), None).unwrap();
    let mut edited = saved.clone();
    edited["title"] = json!("Renamed");
    let renamed = store.save(edited, saved["updatedAt"].as_str()).unwrap();
    assert!(renamed["updatedAt"].as_str() > saved["updatedAt"].as_str());
    assert_eq!(renamed["createdAt"], saved["createdAt"]);
    assert!(store
        .save(saved.clone(), saved["updatedAt"].as_str())
        .unwrap_err()
        .contains("changed on disk"));
    assert_eq!(store.load(saved["id"].as_str().unwrap()).unwrap(), renamed);
}
#[test]
fn creation_never_overwrites_an_existing_id() {
    let (_dir, store) = setup();
    let saved = store.save(fixture(), None).unwrap();
    assert!(store.save(saved, None).is_err());
}
#[test]
fn trash_preserves_exact_json_bytes() {
    let (_dir, store) = setup();
    let saved = store.save(fixture(), None).unwrap();
    let id = saved["id"].as_str().unwrap();
    let original = fs::read(store.session_path(id).unwrap()).unwrap();
    store
        .trash(id, saved["updatedAt"].as_str().unwrap())
        .unwrap();
    assert!(store.load(id).is_err());
    let entry = fs::read_dir(store.root.join("Trash"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap();
    assert_eq!(fs::read(entry.path()).unwrap(), original);
}
#[test]
fn settings_persist_across_restart() {
    let (dir, store) = setup();
    let mut settings = store.load_settings().unwrap();
    settings["defaultVoiceId"] = json!("placeholder");
    store.save_settings(settings.clone()).unwrap();
    drop(store);
    assert_eq!(
        Store::open(dir.path().join("data"))
            .unwrap()
            .load_settings()
            .unwrap(),
        settings
    );
}
#[test]
fn corrupted_settings_are_preserved() {
    let (_dir, store) = setup();
    let settings = store.load_settings().unwrap();
    fs::write(store.root.join("settings.json"), "broken").unwrap();
    assert!(store.load_settings().is_err());
    assert!(store.save_settings(settings).is_err());
    assert_eq!(
        fs::read_to_string(store.root.join("settings.json")).unwrap(),
        "broken"
    );
}
#[test]
fn second_instance_cannot_write_same_store() {
    let (_dir, store) = setup();
    assert!(Store::open(store.root.clone()).is_err());
}
#[test]
fn oversize_file_is_rejected_without_changes() {
    let (_dir, store) = setup();
    let id = Uuid::new_v4().to_string();
    let path = store.session_path(&id).unwrap();
    fs::write(&path, vec![b' '; MAX_FILE as usize + 1]).unwrap();
    assert!(store.load(&id).unwrap_err().contains("4 MiB"));
    assert_eq!(fs::metadata(path).unwrap().len(), MAX_FILE + 1);
}
#[test]
fn no_temporary_files_remain_after_successful_save() {
    let (_dir, store) = setup();
    let saved = store.save(fixture(), None).unwrap();
    store
        .save(saved.clone(), saved["updatedAt"].as_str())
        .unwrap();
    assert_eq!(
        fs::read_dir(store.root.join("sessions")).unwrap().count(),
        1
    );
}
#[cfg(unix)]
#[test]
fn refuses_symlink_file_and_session_directory() {
    use std::os::unix::fs::symlink;
    let (dir, store) = setup();
    let id = Uuid::new_v4().to_string();
    let outside = dir.path().join("outside.json");
    fs::write(&outside, "untouched").unwrap();
    symlink(&outside, store.session_path(&id).unwrap()).unwrap();
    assert!(store.load(&id).is_err());
    assert_eq!(fs::read_to_string(outside).unwrap(), "untouched");
    fs::remove_file(store.session_path(&id).unwrap()).unwrap();
    fs::remove_dir(store.root.join("sessions")).unwrap();
    symlink(dir.path(), store.root.join("sessions")).unwrap();
    assert!(store.list().is_err());
}
#[test]
fn interrupted_atomic_write_leaves_original_and_cleans_temporary_file() {
    let (_dir, store) = setup();
    let saved = store.save(fixture(), None).unwrap();
    let path = store.session_path(saved["id"].as_str().unwrap()).unwrap();
    let bytes = fs::read(&path).unwrap();
    let mut edited = saved.clone();
    edited["title"] = json!("Not committed");
    assert!(atomic_write_checked(&path, &edited, false, || Err(
        "Simulated failure before rename".into()
    ))
    .is_err());
    assert_eq!(fs::read(&path).unwrap(), bytes);
    assert_eq!(
        fs::read_dir(store.root.join("sessions")).unwrap().count(),
        1
    );
}
#[test]
fn filename_identity_mismatch_is_quarantined_in_list() {
    let (_dir, store) = setup();
    let value = fixture();
    let other = Uuid::new_v4().to_string();
    fs::write(
        store.session_path(&other).unwrap(),
        serde_json::to_vec(&value).unwrap(),
    )
    .unwrap();
    assert!(store.load(&other).unwrap_err().contains("filename"));
    assert_eq!(store.list().unwrap().issues.len(), 1);
}
#[test]
fn stale_delete_preserves_current_file() {
    let (_dir, store) = setup();
    let saved = store.save(fixture(), None).unwrap();
    assert!(store.trash(saved["id"].as_str().unwrap(), "stale").is_err());
    assert_eq!(store.load(saved["id"].as_str().unwrap()).unwrap(), saved);
}
