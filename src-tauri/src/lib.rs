use serde_json::Value;
use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
fn hidden_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

use tauri::ipc::Channel;
use futures_util::StreamExt;

#[tauri::command]
fn launch_app(app: String) -> Result<String, String> {
    // Only launch fixed, known targets. No user-controlled shell command execution.
    let target = match app.as_str() {
        "steam" => "steam://open/main",
        "discord" => "discord://",
        "vscode" => "vscode://",
        "explorer" => "explorer.exe",
        "terminal" => "wt.exe",
        "browser" => "https://www.google.com",
        _ => return Err("Unknown launcher".into()),
    };
    hidden_command("cmd").args(["/C", "start", "", target]).spawn()
        .map_err(|e| format!("Launch failed: {e}"))?;
    Ok(format!("Launched {app}"))
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if url.len() > 2048 || !(url.starts_with("https://") || url.starts_with("http://")) || (url.contains('\r') || url.contains('\n')) {
        return Err("Only valid HTTP(S) links are allowed".into());
    }
    #[cfg(target_os = "windows")]
    hidden_command("rundll32.exe").arg("url.dll,FileProtocolHandler").arg(&url)
        .spawn().map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "windows"))]
    return Err("Windows only".into());
    Ok(())
}

#[tauri::command]
fn tailscale_status() -> Result<Value, String> {
    let result = hidden_command("tailscale").args(["status", "--json"]).output()
        .map_err(|_| "Tailscale CLI not found. Install Tailscale and ensure tailscale.exe is on PATH.".to_string())?;
    if !result.status.success() { return Err(String::from_utf8_lossy(&result.stderr).to_string()); }
    serde_json::from_slice(&result.stdout).map_err(|e| e.to_string())
}

#[tauri::command]
fn gpu_stats() -> Result<Value, String> {
    let output = hidden_command("nvidia-smi")
        .args(["--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw", "--format=csv,noheader,nounits"])
        .output().map_err(|e| format!("NVIDIA-SMI unavailable: {e}"))?;
    if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).to_string()); }
    let text = String::from_utf8_lossy(&output.stdout);
    let cards: Vec<Value> = text.lines().filter_map(|line| {
        let parts: Vec<&str> = line.split(',').map(str::trim).collect();
        if parts.len() != 7 { return None; }
        let number = |s: &str| s.parse::<f64>().ok();
        Some(serde_json::json!({
            "index": parts[0].parse::<u32>().ok()?, "name": parts[1],
            "util": number(parts[2]), "used": number(parts[3]),
            "total": number(parts[4]), "temp": number(parts[5]), "power": number(parts[6])
        }))
    }).collect();
    if cards.is_empty() { return Err("No NVIDIA GPUs returned by nvidia-smi".into()); }
    Ok(serde_json::json!({"gpus":cards}))
}

#[tauri::command]
async fn ollama_chat_stream(model: String, messages: Vec<Value>, on_event: Channel<Value>) -> Result<(), String> {
    if model.is_empty() || model.len() > 150 || messages.len() > 30 { return Err("Invalid chat request".into()); }
    let client = reqwest::Client::builder().connect_timeout(std::time::Duration::from_secs(10))
        .build().map_err(|e| e.to_string())?;
    let body = serde_json::json!({"model":model,"messages":messages,"stream":true});
    let response = client.post("http://127.0.0.1:11434/api/chat")
        .json(&body).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().await.unwrap_or_default();
        return Err(format!("Ollama returned {status}: {}", detail.chars().take(250).collect::<String>()));
    }
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim().to_owned();
            buffer.drain(..=pos);
            if line.is_empty() { continue; }
            let value: Value = serde_json::from_str(&line).map_err(|e| format!("Invalid Ollama response: {e}"))?;
            if let Some(error) = value["error"].as_str() { return Err(error.to_owned()); }
            if let Some(content) = value["message"]["content"].as_str() {
                if !content.is_empty() { if on_event.send(serde_json::json!({"type":"token","text":content})).is_err() { return Ok(()); } }
            }
            if value["done"] == true {
                let _ = on_event.send(serde_json::json!({"type":"done", "eval_count":value["eval_count"], "eval_duration":value["eval_duration"]}));
                return Ok(());
            }
        }
    }
    Ok(())
}

fn ollama_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().timeout(std::time::Duration::from_secs(180))
        .build().map_err(|e| e.to_string())
}

#[tauri::command]
async fn ollama_models() -> Result<Value, String> {
    let response = ollama_client()?.get("http://127.0.0.1:11434/api/tags").send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Err(format!("Ollama returned {}", response.status())); }
    response.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn ollama_chat(model: String, messages: Vec<Value>) -> Result<String, String> {
    if model.is_empty() || model.len() > 150 || messages.len() > 30 { return Err("Invalid chat request".into()); }
    let body = serde_json::json!({"model":model,"messages":messages,"stream":false});
    let response = ollama_client()?.post("http://127.0.0.1:11434/api/chat")
        .json(&body).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Err(format!("Ollama returned {}", response.status())); }
    let value: Value = response.json().await.map_err(|e| e.to_string())?;
    value["message"]["content"].as_str().map(str::to_owned).ok_or("No reply from Ollama".into())
}


// Backups are explicitly chosen by the user; never overwrite without UI confirmation.
#[tauri::command]
async fn export_backup(data: Value) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file = rfd::FileDialog::new().set_title("Export dashboard backup")
            .add_filter("JSON backup", &["json"])
            .set_file_name("hybrid-command-center-backup.json").save_file();
        let Some(path) = file else { return Err("Backup canceled".to_string()); };
        let bytes = serde_json::to_vec_pretty(&serde_json::json!({
            "format": "hcc-backup-v1", "exportedAt": "local", "data": data
        })).map_err(|e| e.to_string())?;
        if bytes.len() > 10_000_000 { return Err("Backup exceeds 10 MB".into()); }
        std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
        Ok(path.display().to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn import_backup() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let file = rfd::FileDialog::new().set_title("Choose dashboard backup")
            .add_filter("JSON backup", &["json"]).pick_file();
        let Some(path) = file else { return Err("Restore canceled".to_string()); };
        let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        if metadata.len() > 10_000_000 { return Err("Backup exceeds 10 MB".into()); }
        let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
        let parsed: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        if parsed["format"] != "hcc-backup-v1" || !parsed["data"].is_object() {
            return Err("Unrecognized backup format".into());
        }
        Ok(parsed["data"].clone())
    }).await.map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![launch_app, open_url, tailscale_status, ollama_models, ollama_chat, gpu_stats, ollama_chat_stream, export_backup, import_backup])
        .run(tauri::generate_context!())
        .expect("error while running Hybrid Command Center");
}
