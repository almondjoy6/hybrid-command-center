use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs::{self, OpenOptions}, io::Write, path::PathBuf, sync::{Arc, Mutex}, time::{Duration, SystemTime, UNIX_EPOCH}};
use tauri::{Manager, State};

#[derive(Clone, Deserialize)]
pub struct Job {
    id: String,
    title: String,
    due: Option<u64>,
    remaining: Option<u64>,
}
struct Scheduled { job: Job, deadline: Option<u64> }
struct Queue {
    jobs: Vec<Scheduled>,
    receipts: HashMap<String, String>,
    directory: PathBuf,
    status: String,
}
pub struct Scheduler(Arc<Mutex<Queue>>);
#[derive(Serialize)]
pub struct SyncResult { mono: u64, status: String, receipts: HashMap<String, String> }

pub fn monotonic_ms() -> u64 {
    #[cfg(windows)]
    {
        #[link(name = "kernel32")]
        extern "system" { fn GetTickCount64() -> u64; }
        // Windows uptime includes suspension and is independent of wall-clock adjustments.
        unsafe { GetTickCount64() }
    }
    #[cfg(not(windows))]
    {
        use std::{sync::OnceLock, time::Instant};
        static START: OnceLock<Instant> = OnceLock::new();
        START.get_or_init(Instant::now).elapsed().as_millis() as u64
    }
}
fn valid_id(id: &str) -> bool { !id.is_empty() && id.len() <= 100 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') }
fn validate(jobs: &[Job]) -> Result<(), String> {
    if jobs.len() > 10000 { return Err("Too many scheduled notifications".into()); }
    let mut ids = std::collections::HashSet::new();
    for job in jobs {
        if !valid_id(&job.id) || !ids.insert(&job.id) || job.title.trim().is_empty() || job.title.chars().count() > 120 || job.due.is_some() == job.remaining.is_some() || job.remaining.is_some_and(|n| n > 359999000) {
            return Err("Invalid scheduled notification".into());
        }
    }
    Ok(())
}
fn replace_jobs(queue: &mut Queue, jobs: Vec<Job>, mono: u64) {
    queue.jobs = jobs.into_iter().map(|job| {
        let deadline = job.remaining.map(|remaining| queue.jobs.iter().find(|old| old.job.id == job.id).and_then(|old| old.deadline).unwrap_or(mono.saturating_add(remaining)));
        Scheduled { job, deadline }
    }).collect();
}
fn is_due(job: &Scheduled, mono: u64, wall: u64) -> bool {
    job.deadline.map_or_else(|| job.job.due.is_some_and(|due| wall >= due), |deadline| mono >= deadline)
}
#[tauri::command]
pub async fn productivity_sync(jobs: Vec<Job>, scheduler: State<'_, Scheduler>) -> Result<SyncResult, String> {
    validate(&jobs)?;
    let mut queue = scheduler.0.lock().map_err(|_| "Notification scheduler unavailable")?;
    let mono = monotonic_ms();
    replace_jobs(&mut queue, jobs, mono);
    Ok(SyncResult { mono, status: queue.status.clone(), receipts: queue.receipts.clone() })
}
pub fn start(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // The native harness's disposable WebView2 profile also isolates notification receipts.
    let base = std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").map(PathBuf::from).unwrap_or(app.path().app_local_data_dir()?);
    let directory = base.join("productivity-notifications-v1");
    fs::create_dir_all(&directory)?;
    let mut receipts = HashMap::new();
    for entry in fs::read_dir(&directory)? {
        let entry = entry?;
        let id = entry.file_name().to_string_lossy().into_owned();
        if valid_id(&id) {
            receipts.insert(id, fs::read_to_string(entry.path())?);
        }
    }
    let status = "Windows desktop notifications ready. Windows settings and Focus Assist control banner visibility; no permission prompt is required.".to_string();
    let queue = Arc::new(Mutex::new(Queue { jobs: Vec::new(), receipts, directory, status }));
    app.manage(Scheduler(queue.clone()));
    let shared = queue;
    let identifier = app.config().identifier.clone();
    std::thread::Builder::new().name("hcc-notifications".into()).spawn(move || loop {
        std::thread::sleep(Duration::from_millis(250));
        let Ok(mut queue) = shared.lock() else { break };
        let mono = monotonic_ms();
        let wall = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
        let due: Vec<Job> = queue.jobs.iter().filter(|job| is_due(job, mono, wall) && !queue.receipts.contains_key(&job.job.id)).map(|job| job.job.clone()).collect();
        for job in due {
            if queue.receipts.contains_key(&job.id) || !queue.jobs.iter().any(|scheduled| scheduled.job.id == job.id) { continue; }
            let file = queue.directory.join(&job.id);
            // Claim durably before dispatch: a crash may lose one alert, but cannot send it twice.
            let claim = OpenOptions::new().write(true).create_new(true).open(&file).and_then(|mut file| { file.write_all(b"Notification claimed before dispatch")?; file.sync_all() });
            if let Err(error) = claim {
                if error.kind() == std::io::ErrorKind::AlreadyExists {
                    queue.receipts.insert(job.id, fs::read_to_string(&file).unwrap_or_else(|_| "Notification previously claimed".into()));
                } else { queue.status = format!("Cannot save notification receipt: {error}. Alerts paused until storage is available."); }
                continue;
            }
            queue.receipts.insert(job.id.clone(), "Notification claimed before dispatch".into());
            drop(queue);
            let delivery = show_notification(&identifier, &job.title);
            queue = match shared.lock() { Ok(queue) => queue, Err(_) => return };
            let result = match delivery {
                Ok(()) => "sent".to_string(),
                Err(error) => { queue.status = format!("Windows notification failed: {error}"); format!("Notification failed: {error}") },
            };
            if let Err(error) = fs::write(&file, &result) { queue.status = format!("Unable to save notification result: {error}"); }
            queue.receipts.insert(job.id, result);
        }
    })?;
    Ok(())
}

fn show_notification(identifier: &str, title: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use tauri_winrt_notification::Toast;
        let exe = std::env::current_exe().map_err(|error| error.to_string())?;
        let directory = exe.parent().ok_or("Cannot locate application directory")?;
        // Like Tauri's notification plugin, uninstalled target builds use Windows' registered host.
        let target_build = directory.ends_with("target/debug") || directory.ends_with("target/release");
        let app_id = if target_build { Toast::POWERSHELL_APP_ID } else { identifier };
        Toast::new(app_id).title("Hybrid Command Center").text1(title).show().map_err(|error| format!("{error:?}"))
    }
    #[cfg(not(windows))]
    { let _ = (identifier, title); Err("Desktop notifications require Windows".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn queue() -> Queue { Queue { jobs: vec![], receipts: HashMap::new(), directory: PathBuf::new(), status: String::new() } }
    fn timer() -> Job { Job { id: "timer-1".into(), title: "Countdown complete".into(), remaining: Some(5000), due: None } }
    #[test]
    fn countdown_keeps_monotonic_deadline_across_syncs_and_wall_changes() {
        let mut queue = queue();
        replace_jobs(&mut queue, vec![timer()], 100);
        replace_jobs(&mut queue, vec![timer()], 1100);
        assert_eq!(queue.jobs[0].deadline, Some(5100));
        assert!(!is_due(&queue.jobs[0], 5000, u64::MAX));
        assert!(is_due(&queue.jobs[0], 5100, 0));
        replace_jobs(&mut queue, vec![], 5100);
        assert!(queue.jobs.is_empty());
    }
    #[test]
    fn reminders_follow_local_instant_and_reject_invalid_jobs() {
        let reminder = Job { id: "reminder-1".into(), title: "Reminder".into(), remaining: None, due: Some(1000) };
        let mut queue = queue();
        replace_jobs(&mut queue, vec![reminder], 10);
        assert!(!is_due(&queue.jobs[0], 10000, 999));
        assert!(is_due(&queue.jobs[0], 10, 1000));
        let mut bad = timer(); bad.id = "../outside".into(); assert!(validate(&[bad]).is_err());
        let mut bad = timer(); bad.due = Some(1); assert!(validate(&[bad]).is_err());
        assert!(validate(&[timer()]).is_ok());
        assert!(validate(&[timer(), timer()]).is_err());
    }
}
