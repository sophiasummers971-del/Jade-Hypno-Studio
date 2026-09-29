fn main() {
    #[cfg(feature = "desktop")]
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "list_sessions",
            "load_session",
            "save_session",
            "trash_session",
            "load_settings",
            "save_settings",
        ]),
    ))
    .expect("Unable to build Tauri manifest");
}
