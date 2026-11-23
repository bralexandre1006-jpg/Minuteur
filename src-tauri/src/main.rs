#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicU64, Ordering::SeqCst};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State, UserAttentionType};
use tauri_plugin_notification::NotificationExt;

struct Generation(Arc<AtomicU64>);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// Wall-clock polling so the alarm survives sleep/hibernate and WebView throttling.
#[tauri::command]
fn arm(app: AppHandle, generation: State<Generation>, end_ms: u64, title: String, body: String) {
    let id = generation.0.fetch_add(1, SeqCst) + 1;
    let counter = generation.0.clone();
    std::thread::spawn(move || {
        loop {
            if counter.load(SeqCst) != id {
                return;
            }
            let now = now_ms();
            if now >= end_ms {
                break;
            }
            std::thread::sleep(Duration::from_millis((end_ms - now).min(250)));
        }
        let _ = app.notification().builder().title(&title).body(&body).show();
        let _ = app.emit("timer-fired", end_ms);
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.request_user_attention(Some(UserAttentionType::Critical));
        }
    });
}

#[tauri::command]
fn disarm(generation: State<Generation>) {
    generation.0.fetch_add(1, SeqCst);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(Generation(Arc::new(AtomicU64::new(0))))
        .invoke_handler(tauri::generate_handler![arm, disarm])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Minuteur");
}
