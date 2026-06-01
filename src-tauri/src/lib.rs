use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use tokio::sync::mpsc;

// ============================================================================
// Types
// ============================================================================

/// Request payload for SSE streaming
#[derive(Debug, Deserialize)]
pub struct StreamRequest {
    pub url: String,
    pub api_key: String,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub stream_id: String,
    pub user_agent: Option<String>,
    pub debug: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// stream_options for requesting usage in streaming mode
#[derive(Debug, Serialize)]
struct StreamOptions {
    include_usage: bool,
}

/// OpenAI API request body
#[derive(Debug, Serialize)]
struct OpenAIRequestBody {
    model: String,
    messages: Vec<OpenAIMessage>,
    stream: bool,
    stream_options: StreamOptions,
}

#[derive(Debug, Serialize)]
struct OpenAIMessage {
    role: String,
    content: String,
}

/// SSE event payload emitted to frontend
#[derive(Debug, Serialize, Clone)]
pub struct StreamEventPayload {
    pub stream_id: String,
    pub data: String,
    pub done: bool,
    pub error: Option<String>,
    /// Raw line for debug (unrecognized lines, headers info, etc.)
    pub raw: Option<String>,
}

// ============================================================================
// Error type
// ============================================================================

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Other(String),
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Other(s)
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Other(e.to_string())
    }
}

// ============================================================================
// State: Active stream abort handles
// ============================================================================

/// Thread-safe map of active stream abort senders.
/// Key: stream_id, Value: abort sender channel.
pub type StreamAbortMap = Arc<Mutex<HashMap<String, mpsc::Sender<()>>>>;

/// Window state persisted to config.json.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

/// Debounce state for window event saving.
pub struct WindowSaveDebounce {
    pub pending: Mutex<Option<WindowState>>,
    pub last_event: Mutex<Instant>,
}

// ============================================================================
// Commands
// ============================================================================

/// Start an SSE stream to the OpenAI-compatible API.
/// Emits events on the `stream:data` channel.
#[tauri::command(rename_all = "snake_case")]
async fn cmd_stream_test(
    app: tauri::AppHandle,
    request: StreamRequest,
    abort_map: tauri::State<'_, StreamAbortMap>,
    client: tauri::State<'_, reqwest::Client>,
) -> Result<String, String> {
    let stream_id = request.stream_id.clone();

    // Build OpenAI request body
    let body = OpenAIRequestBody {
        model: request.model,
        messages: request
            .messages
            .into_iter()
            .map(|m| OpenAIMessage {
                role: m.role,
                content: m.content,
            })
            .collect(),
        stream: true,
        stream_options: StreamOptions {
            include_usage: true,
        },
    };

    let client = client.inner().clone();
    let mut req = client
        .post(&request.url)
        .header("Authorization", format!("Bearer {}", request.api_key))
        .header("Content-Type", "application/json");
    if let Some(ua) = &request.user_agent {
        req = req.header("User-Agent", ua);
    }
    let response = req
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("API error {}: {}", status, text));
    }

    // Create abort channel for this stream
    let (abort_tx, mut abort_rx) = mpsc::channel::<()>(1);
    {
        let mut map = abort_map.lock().unwrap_or_else(|e| e.into_inner());
        map.insert(stream_id.clone(), abort_tx);
    }

    // Spawn stream processing task
    let app_clone = app.clone();
    let stream_id_clone = stream_id.clone();
    let is_debug = request.debug.unwrap_or(false);
    tokio::spawn(async move {
        // Emit response metadata in debug mode
        if is_debug {
            let status = response.status();
            let headers: Vec<String> = response.headers().iter()
                .map(|(k, v)| format!("{}: {}", k, v.to_str().unwrap_or("(binary)")))
                .collect();
            let _ = app_clone.emit("stream:data", StreamEventPayload {
                stream_id: stream_id_clone.clone(),
                data: String::new(),
                done: false,
                error: None,
                raw: Some(format!(
                    "HTTP {}\n{}",
                    status,
                    headers.join("\n")
                )),
            });
        }

        let mut byte_stream = response.bytes_stream();
        let mut buffer = String::new();

        loop {
            tokio::select! {
                // Check for abort signal
                _ = abort_rx.recv() => {
                    let _ = app_clone.emit("stream:data", StreamEventPayload {
                        stream_id: stream_id_clone.clone(),
                        data: String::new(),
                        done: true,
                        error: Some("Aborted".to_string()),
                        raw: None,
                    });
                    break;
                }
                // Read next chunk from stream
                chunk = byte_stream.next() => {
                    match chunk {
                        Some(Ok(bytes)) => {
                            let text = String::from_utf8_lossy(&bytes);
                            buffer.push_str(&text);

                            // Process complete SSE lines
                            // Split by newline and keep incomplete last line in buffer
                            let raw_buffer = std::mem::take(&mut buffer);
                            let mut lines = raw_buffer.lines().peekable();
                            while let Some(line) = lines.next() {
                                // If this is the last line and raw_buffer doesn't end with newline,
                                // put it back into buffer
                                if lines.peek().is_none() && !raw_buffer.ends_with('\n') {
                                    buffer = line.to_string();
                                    break;
                                }

                                let line = line.trim();
                                if line.is_empty() {
                                    continue;
                                }
                                // Accept "data:" with or without space after colon
                                if let Some(data) = line.strip_prefix("data:") {
                                    let data = data.trim_start();
                                    if data == "[DONE]" {
                                        let _ = app_clone.emit("stream:data", StreamEventPayload {
                                            stream_id: stream_id_clone.clone(),
                                            data: String::new(),
                                            done: true,
                                            error: None,
                                            raw: None,
                                        });
                                        // Clean up abort map
                                        if let Ok(mut m) = app_clone.state::<StreamAbortMap>().lock() {
                                            m.remove(&stream_id_clone);
                                        }
                                        return;
                                    }
                                    let _ = app_clone.emit("stream:data", StreamEventPayload {
                                        stream_id: stream_id_clone.clone(),
                                        data: data.to_string(),
                                        done: false,
                                        error: None,
                                        raw: if is_debug { Some(line.to_string()) } else { None },
                                    });
                                } else if is_debug {
                                    // Unrecognized line — emit as raw for debugging
                                    let _ = app_clone.emit("stream:data", StreamEventPayload {
                                        stream_id: stream_id_clone.clone(),
                                        data: String::new(),
                                        done: false,
                                        error: None,
                                        raw: Some(format!("[unrecognized] {}", line)),
                                    });
                                }
                            }
                        }
                        Some(Err(e)) => {
                            let _ = app_clone.emit("stream:data", StreamEventPayload {
                                stream_id: stream_id_clone.clone(),
                                data: String::new(),
                                done: true,
                                error: Some(format!("Stream error: {}", e)),
                                raw: if is_debug { Some(format!("[stream error] {}", e)) } else { None },
                            });
                            break;
                        }
                        None => {
                            // Stream ended
                            let _ = app_clone.emit("stream:data", StreamEventPayload {
                                stream_id: stream_id_clone.clone(),
                                data: String::new(),
                                done: true,
                                error: None,
                                raw: if is_debug { Some("[stream end]".to_string()) } else { None },
                            });
                            break;
                        }
                    }
                }
            }
        }

        // Clean up abort map
        if let Ok(mut m) = app_clone.state::<StreamAbortMap>().lock() {
            m.remove(&stream_id_clone);
        }
    });

    Ok(stream_id)
}

/// Abort an active SSE stream by its stream_id.
#[tauri::command(rename_all = "snake_case")]
async fn cmd_abort_stream(
    stream_id: String,
    abort_map: tauri::State<'_, StreamAbortMap>,
) -> Result<bool, String> {
    let sender = {
        let mut map = abort_map.lock().unwrap_or_else(|e| e.into_inner());
        map.remove(&stream_id)
    };
    if let Some(sender) = sender {
        let _ = sender.send(()).await;
        Ok(true)
    } else {
        Ok(false)
    }
}

fn exe_dir() -> Result<std::path::PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("Failed to get exe path: {}", e))?;
    let dir = exe
        .parent()
        .ok_or("Failed to get exe directory")?
        .to_path_buf();
    Ok(dir)
}

/// Read config.json and extract windowState field.
fn read_window_state(exe_path: &std::path::Path) -> Option<WindowState> {
    let config_path = exe_path.join("config.json");
    let content = std::fs::read_to_string(&config_path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&content).ok()?;
    let ws = value.get("windowState")?;
    serde_json::from_value(ws.clone()).ok()
}

/// Update the windowState field in config.json, preserving other fields.
fn write_window_state(exe_path: &std::path::Path, ws: &WindowState) {
    let config_path = exe_path.join("config.json");
    let mut value: serde_json::Value = if let Ok(content) = std::fs::read_to_string(&config_path) {
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    value["windowState"] = serde_json::to_value(ws).unwrap();
    if let Ok(content) = serde_json::to_string_pretty(&value) {
        let _ = std::fs::write(&config_path, content);
    }
}

/// Capture current window position/size into a WindowState.
fn capture_window(window: &tauri::WebviewWindow) -> Option<WindowState> {
    let pos = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    let maximized = window.is_maximized().unwrap_or(false);
    Some(WindowState {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        maximized,
    })
}

/// Load config.json from the same directory as the executable.
#[tauri::command(rename_all = "snake_case")]
async fn cmd_load_config(exe_path: tauri::State<'_, std::path::PathBuf>) -> Result<serde_json::Value, String> {
    let config_path = exe_path.join("config.json");

    if !config_path.exists() {
        return Ok(serde_json::json!({}));
    }

    let content = tokio::fs::read_to_string(&config_path)
        .await
        .map_err(|e| format!("Failed to read config: {}", e))?;

    let value: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    Ok(value)
}

/// Save config.json to the same directory as the executable.
/// Merges with existing file to preserve fields not sent by frontend (e.g. windowState).
#[tauri::command(rename_all = "snake_case")]
async fn cmd_save_config(config: serde_json::Value, exe_path: tauri::State<'_, std::path::PathBuf>) -> Result<(), String> {
    let config_path = exe_path.join("config.json");

    // Read existing config to preserve fields the frontend didn't send
    let mut merged: serde_json::Value = if let Ok(content) = tokio::fs::read_to_string(&config_path).await {
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Merge frontend fields on top of existing config
    if let (Some(merged_obj), Some(new_obj)) = (merged.as_object_mut(), config.as_object()) {
        for (key, value) in new_obj {
            merged_obj.insert(key.clone(), value.clone());
        }
    }

    let content = serde_json::to_string_pretty(&merged)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    tokio::fs::write(&config_path, content)
        .await
        .map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

/// Minimize the main window.
#[tauri::command(rename_all = "snake_case")]
async fn cmd_minimize_window(window: tauri::Window) -> Result<(), String> {
    window
        .minimize()
        .map_err(|e| format!("Failed to minimize window: {}", e))
}

/// Maximize or restore the main window.
#[tauri::command(rename_all = "snake_case")]
async fn cmd_maximize_window(window: tauri::Window) -> Result<bool, String> {
    if window
        .is_maximized()
        .map_err(|e| format!("Failed to check maximized state: {}", e))?
    {
        window
            .unmaximize()
            .map_err(|e| format!("Failed to unmaximize window: {}", e))?;
        Ok(false)
    } else {
        window
            .maximize()
            .map_err(|e| format!("Failed to maximize window: {}", e))?;
        Ok(true)
    }
}

/// Close the main window.
#[tauri::command(rename_all = "snake_case")]
async fn cmd_close_window(window: tauri::Window) -> Result<(), String> {
    window
        .close()
        .map_err(|e| format!("Failed to close window: {}", e))
}

/// Generic HTTP fetch command for API requests (bypasses CORS).
#[derive(Debug, Deserialize)]
pub struct FetchRequest {
    pub url: String,
    pub options: Option<FetchOptions>,
}

#[derive(Debug, Deserialize)]
pub struct FetchOptions {
    pub method: Option<String>,
    pub headers: Option<std::collections::HashMap<String, String>>,
    pub body: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FetchResponse {
    pub ok: bool,
    pub status: u16,
    pub status_text: String,
    pub body: String,
}

#[tauri::command(rename_all = "snake_case")]
async fn cmd_api_fetch(request: FetchRequest, client: tauri::State<'_, reqwest::Client>) -> Result<FetchResponse, String> {
    let client = client.inner().clone();
    let method = request
        .options
        .as_ref()
        .and_then(|o| o.method.as_ref())
        .map(|m| match m.to_uppercase().as_str() {
            "GET" => reqwest::Method::GET,
            "POST" => reqwest::Method::POST,
            "PUT" => reqwest::Method::PUT,
            "DELETE" => reqwest::Method::DELETE,
            "PATCH" => reqwest::Method::PATCH,
            _ => reqwest::Method::GET,
        })
        .unwrap_or(reqwest::Method::GET);

    let mut req_builder = client.request(method, &request.url);

    if let Some(options) = &request.options {
        if let Some(headers) = &options.headers {
            for (key, value) in headers {
                req_builder = req_builder.header(key, value);
            }
        }
        if let Some(body) = &options.body {
            req_builder = req_builder.body(body.clone());
        }
    }

    let response = req_builder
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status();
    let status_text = status.canonical_reason().unwrap_or("Unknown").to_string();
    let body = response
        .text()
        .await
        .unwrap_or_default();

    Ok(FetchResponse {
        ok: status.is_success(),
        status: status.as_u16(),
        status_text,
        body,
    })
}

/// Toggle DevTools open/close (F12 in release builds).
#[tauri::command(rename_all = "snake_case")]
async fn cmd_toggle_devtools(webview: tauri::Webview) -> Result<(), String> {
    if webview.is_devtools_open() {
        webview.close_devtools();
    } else {
        webview.open_devtools();
    }
    Ok(())
}

/// Return the current platform ("macos", "windows", or "linux").
#[tauri::command(rename_all = "snake_case")]
async fn cmd_platform() -> Result<String, String> {
    Ok(std::env::consts::OS.to_string())
}

// ============================================================================
// App entry point
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let abort_map: StreamAbortMap = Arc::new(Mutex::new(HashMap::new()));
    let http_client = reqwest::Client::new();
    let exe_path = exe_dir().expect("Failed to determine exe directory");

    let debounce = Arc::new(WindowSaveDebounce {
        pending: Mutex::new(None),
        last_event: Mutex::new(Instant::now()),
    });

    // Spawn a background thread that flushes pending window state after 500ms of inactivity
    let debounce_bg = debounce.clone();
    let exe_bg = exe_path.clone();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(200));
            let should_write = {
                let last = debounce_bg.last_event.lock().unwrap();
                last.elapsed().as_millis() > 500
            };
            if should_write {
                let ws = debounce_bg.pending.lock().unwrap().take();
                if let Some(ws) = ws {
                    write_window_state(&exe_bg, &ws);
                }
            }
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(abort_map)
        .manage(http_client)
        .manage(exe_path.clone())
        .manage(debounce.clone())
        .setup(move |app| {
            // Build window with platform-specific settings
            let mut builder = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("how-many-tokens-per-second")
            .inner_size(1280.0, 800.0)
            .min_inner_size(730.0, 650.0)
            .background_color(tauri::window::Color(252, 252, 252, 255))
            .visible(false)
            .devtools(true);

            // macOS: overlay title bar with traffic lights
            #[cfg(target_os = "macos")]
            {
                use tauri::{LogicalPosition, TitleBarStyle};
                builder = builder
                    .decorations(true)
                    .title_bar_style(TitleBarStyle::Overlay)
                    .hidden_title(true)
                    .traffic_light_position(LogicalPosition::new(12.0, 17.0));
            }

            // Windows: no decorations
            #[cfg(target_os = "windows")]
            {
                builder = builder.decorations(false);
            }

            let window = builder.build()?;

            // Restore window state from config.json
            if let Some(ws) = read_window_state(&exe_path) {
                if ws.maximized {
                    let _ = window.maximize();
                } else {
                    let _ = window.set_size(tauri::PhysicalSize::new(ws.width, ws.height));
                    let _ = window.set_position(tauri::PhysicalPosition::new(ws.x, ws.y));
                }
            }
            let _ = window.show();

            // macOS: observe fullscreen notifications
            // NSWindowWill/DidEnter/ExitFullScreenNotification only fires for real fullscreen,
            // NOT for zoom/maximize. No styleMask check needed.
            #[cfg(target_os = "macos")]
            {
                use block2::RcBlock;
                use objc2::msg_send;
                use objc2::runtime::AnyObject;
                use objc2_foundation::NSString;
                use std::ffi::c_void;

                let w1 = window.clone();
                let w2 = window.clone();
                let w3 = window.clone();
                let w4 = window.clone();
                unsafe {
                    let center: *mut AnyObject = msg_send![objc2::class!(NSNotificationCenter), defaultCenter];

                    let register = |name: &str, block: RcBlock<dyn Fn(*mut c_void)>| {
                        let n = NSString::from_str(name);
                        let _: () = msg_send![center,
                            addObserverForName: &*n,
                            object: std::ptr::null::<c_void>(),
                            queue: std::ptr::null::<c_void>(),
                            usingBlock: &*block
                        ];
                    };

                    register("NSWindowWillEnterFullScreenNotification",
                        RcBlock::new(move |_: *mut c_void| { let _ = w1.emit("window-will-maximize-change", true); }));
                    register("NSWindowDidEnterFullScreenNotification",
                        RcBlock::new(move |_: *mut c_void| { let _ = w2.emit("window-did-maximize-change", true); }));
                    register("NSWindowWillExitFullScreenNotification",
                        RcBlock::new(move |_: *mut c_void| { let _ = w3.emit("window-will-maximize-change", false); }));
                    register("NSWindowDidExitFullScreenNotification",
                        RcBlock::new(move |_: *mut c_void| { let _ = w4.emit("window-did-maximize-change", false); }));
                }
            }

            // Track window move/resize to persist state
            let window_clone = window.clone();
            let debounce_clone = debounce.clone();
            window.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                        // Emit maximized change for frontend
                        if let Ok(maximized) = window_clone.is_maximized() {
                            let _ = window_clone.emit("window-maximized-change", maximized);
                        }
                        // Mark pending state for debounced flush
                        if let Some(ws) = capture_window(&window_clone) {
                            *debounce_clone.pending.lock().unwrap() = Some(ws);
                            *debounce_clone.last_event.lock().unwrap() = Instant::now();
                        }
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd_stream_test,
            cmd_abort_stream,
            cmd_load_config,
            cmd_save_config,
            cmd_minimize_window,
            cmd_maximize_window,
            cmd_close_window,
            cmd_api_fetch,
            cmd_toggle_devtools,
            cmd_platform,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
