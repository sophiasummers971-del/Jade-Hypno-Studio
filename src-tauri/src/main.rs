#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use jade_hypno_studio::{Result, SessionList, Store};
use serde_json::Value;
use std::sync::Mutex;
use tauri::{Manager, State};
struct AppStore(Result<Mutex<Store>>);
fn access<T>(state: State<'_, AppStore>, operation: impl FnOnce(&Store) -> Result<T>) -> Result<T> {
    let store = state
        .0
        .as_ref()
        .map_err(Clone::clone)?
        .lock()
        .map_err(|_| "The local store lock failed. Restart the application.".to_string())?;
    operation(&store)
}
#[tauri::command]
fn list_sessions(state: State<'_, AppStore>) -> Result<SessionList> {
    access(state, |s| s.list())
}
#[tauri::command]
fn load_session(state: State<'_, AppStore>, id: String) -> Result<Value> {
    access(state, |s| s.load(&id))
}
#[tauri::command]
fn save_session(
    state: State<'_, AppStore>,
    session: Value,
    expected_updated_at: Option<String>,
) -> Result<Value> {
    access(state, |s| s.save(session, expected_updated_at.as_deref()))
}
#[tauri::command]
fn trash_session(
    state: State<'_, AppStore>,
    id: String,
    expected_updated_at: String,
) -> Result<()> {
    access(state, |s| s.trash(&id, &expected_updated_at))
}
#[tauri::command]
fn load_settings(state: State<'_, AppStore>) -> Result<Value> {
    access(state, |s| s.load_settings())
}
#[tauri::command]
fn save_settings(state: State<'_, AppStore>, settings: Value) -> Result<Value> {
    access(state, |s| s.save_settings(settings))
}
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            let store = Store::open(root).map(Mutex::new);
            app.manage(AppStore(store));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![list_sessions, load_session, save_session, trash_session, load_settings, save_settings])
        .run(tauri::generate_context!())
        .expect("Jade Hypno Studio could not start. Check application data access and whether another instance is open.");
}
