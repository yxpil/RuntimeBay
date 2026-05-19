use hyper::service::{make_service_fn, service_fn};
use hyper::{header, Body, Method, Request, Response, Server, StatusCode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Serialize)]
struct ProcessInfo {
    name: String,
    info: HashMap<String, String>,
    path: String,
    running: bool,
    pid: Option<u32>,
}

#[derive(Clone, Serialize)]
struct LogEntry {
    r#type: String,
    time: u64,
    msg: String,
}

#[derive(Clone, Serialize)]
struct ApiResponse {
    code: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pid: Option<u32>,
}

#[derive(Clone, Serialize)]
struct WatchdogConfig {
    enabled: bool,
    interval: u64,
    timeout: u64,
}

struct Config {
    elua: bool,
    passwd: String,
    watchdog: WatchdogConfig,
}

struct AppState {
    config: Arc<Mutex<Config>>,
    processes: Arc<Mutex<HashMap<String, Child>>>,
    process_logs: Arc<Mutex<HashMap<String, Vec<LogEntry>>>>,
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        AppState {
            config: self.config.clone(),
            processes: self.processes.clone(),
            process_logs: self.process_logs.clone(),
        }
    }
}

fn load_config() -> Config {
    let readme_path = "Readme.txt";
    if let Ok(content) = fs::read_to_string(readme_path) {
        let mut config = Config {
            elua: true,
            passwd: "Memory726".to_string(),
            watchdog: WatchdogConfig {
                enabled: false,
                interval: 30000,
                timeout: 10000,
            },
        };
        
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("Elua = ") {
                let val = trimmed.split('=').nth(1).map(|s| s.trim()).unwrap_or("True");
                config.elua = val == "True";
            } else if trimmed.starts_with("Passwd = ") {
                config.passwd = trimmed.split('=').nth(1).map(|s| s.trim().to_string()).unwrap_or_else(|| "Memory726".to_string());
            } else if trimmed.starts_with("WatchdogEnabled = ") {
                let val = trimmed.split('=').nth(1).map(|s| s.trim()).unwrap_or("False");
                config.watchdog.enabled = val == "True";
            } else if trimmed.starts_with("WatchdogInterval = ") {
                config.watchdog.interval = trimmed.split('=').nth(1).map(|s| s.trim().parse().unwrap_or(30000)).unwrap_or(30000);
            } else if trimmed.starts_with("WatchdogTimeout = ") {
                config.watchdog.timeout = trimmed.split('=').nth(1).map(|s| s.trim().parse().unwrap_or(10000)).unwrap_or(10000);
            }
        }
        
        config
    } else {
        Config {
            elua: true,
            passwd: "Memory726".to_string(),
            watchdog: WatchdogConfig {
                enabled: false,
                interval: 30000,
                timeout: 10000,
            },
        }
    }
}

fn authenticate(pwd: &str, config: &Config) -> bool {
    pwd == config.passwd
}

fn parse_info(content: &str) -> HashMap<String, String> {
    let mut info = HashMap::new();
    for line in content.lines() {
        let parts: Vec<&str> = line.split(':').collect();
        if parts.len() >= 2 {
            let key = parts[0].trim().to_string();
            let value = parts[1..].join(":").trim().to_string();
            info.insert(key, value);
        }
    }
    info
}

fn get_plugs(processes: &HashMap<String, Child>) -> Vec<ProcessInfo> {
    let plugs_dir = Path::new("../Plugs");
    let mut plugs = Vec::new();
    
    if let Ok(entries) = fs::read_dir(plugs_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name().unwrap().to_string_lossy().to_string();
                let info_path = path.join("info.plug");
                
                let info = if info_path.exists() {
                    if let Ok(content) = fs::read_to_string(&info_path) {
                        parse_info(&content)
                    } else {
                        HashMap::new()
                    }
                } else {
                    HashMap::new()
                };
                
                let running = processes.contains_key(&name);
                let pid = processes.get(&name).map(|p| p.id());
                
                plugs.push(ProcessInfo {
                    name: name.clone(),
                    info,
                    path: path.to_string_lossy().to_string(),
                    running,
                    pid,
                });
            }
        }
    }
    
    plugs
}

fn start_process(name: &str, processes: &mut HashMap<String, Child>, process_logs: &mut HashMap<String, Vec<LogEntry>>) -> ApiResponse {
    if processes.contains_key(name) {
        return ApiResponse {
            code: 400,
            message: Some("进程已在运行".to_string()),
            data: None,
            pid: None,
        };
    }
    
    let plug_path = Path::new("../Plugs").join(name).join("index.js");
    if !plug_path.exists() {
        return ApiResponse {
            code: 404,
            message: Some("入口文件不存在".to_string()),
            data: None,
            pid: None,
        };
    }
    
    match Command::new("node")
        .arg(&plug_path)
        .current_dir(plug_path.parent().unwrap())
        .env("MANAGER_PORT", "726")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => {
            let pid = child.id();
            processes.insert(name.to_string(), child);
            process_logs.insert(name.to_string(), Vec::new());
            
            ApiResponse {
                code: 200,
                message: Some("启动成功".to_string()),
                data: None,
                pid: Some(pid),
            }
        }
        Err(e) => ApiResponse {
            code: 500,
            message: Some(format!("启动失败: {}", e)),
            data: None,
            pid: None,
        }
    }
}

fn stop_process(name: &str, processes: &mut HashMap<String, Child>) -> ApiResponse {
    if let Some(mut child) = processes.remove(name) {
        let _ = child.kill();
        ApiResponse {
            code: 200,
            message: Some("已停止".to_string()),
            data: None,
            pid: None,
        }
    } else {
        ApiResponse {
            code: 400,
            message: Some("进程未运行".to_string()),
            data: None,
            pid: None,
        }
    }
}

fn restart_process(name: &str, processes: &mut HashMap<String, Child>, process_logs: &mut HashMap<String, Vec<LogEntry>>) -> ApiResponse {
    stop_process(name, processes);
    start_process(name, processes, process_logs)
}

async fn handle_request(
    req: Request<Body>,
    state: AppState,
) -> Result<Response<Body>, hyper::Error> {
    let uri = req.uri().clone();
    let pathname = uri.path();
    
    if pathname.contains("favicon") {
        return Ok(Response::builder()
            .status(StatusCode::NO_CONTENT)
            .body(Body::empty())
            .unwrap());
    }
    
    if pathname == "/" || pathname.is_empty() {
        let html_path = Path::new("Web/index.html");
        if html_path.exists() {
            if let Ok(html) = fs::read_to_string(html_path) {
                return Ok(Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                    .body(Body::from(html))
                    .unwrap());
            }
        }
    }
    
    let query = uri.query().unwrap_or("");
    let mut pwd = None;
    for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
        if key == "pwd" {
            pwd = Some(value.to_string());
        }
    }
    
    let body_bytes = hyper::body::to_bytes(req.into_body()).await?;
    let body_str = String::from_utf8(body_bytes.to_vec()).unwrap_or_default();
    
    #[derive(Deserialize)]
    struct RequestBody {
        #[serde(default)]
        name: String,
        #[serde(default)]
        pwd: Option<String>,
    }
    
    let request_body: RequestBody = if body_str.is_empty() {
        RequestBody {
            name: String::new(),
            pwd: None,
        }
    } else {
        serde_json::from_str(&body_str).unwrap_or(RequestBody {
            name: String::new(),
            pwd: None,
        })
    };
    
    let password = pwd.or(request_body.pwd).unwrap_or_default();
    
    {
        let config = state.config.lock().unwrap();
        
        if !config.elua {
            let response = ApiResponse {
                code: 503,
                message: Some("Service disabled".to_string()),
                data: None,
                pid: None,
            };
            return Ok(Response::builder()
                .status(StatusCode::SERVICE_UNAVAILABLE)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_string(&response).unwrap()))
                .unwrap());
        }
        
        if !authenticate(&password, &config) {
            let response = ApiResponse {
                code: 401,
                message: Some("Unauthorized".to_string()),
                data: None,
                pid: None,
            };
            return Ok(Response::builder()
                .status(StatusCode::UNAUTHORIZED)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_string(&response).unwrap()))
                .unwrap());
        }
    }
    
    let response = match pathname {
        "/list" => {
            let processes = state.processes.lock().unwrap();
            let plugs = get_plugs(&processes);
            ApiResponse {
                code: 200,
                message: None,
                data: Some(serde_json::to_value(plugs).unwrap()),
                pid: None,
            }
        }
        "/start" => {
            let mut processes = state.processes.lock().unwrap();
            let mut process_logs = state.process_logs.lock().unwrap();
            start_process(&request_body.name, &mut processes, &mut process_logs)
        }
        "/stop" => {
            let mut processes = state.processes.lock().unwrap();
            stop_process(&request_body.name, &mut processes)
        }
        "/restart" => {
            let mut processes = state.processes.lock().unwrap();
            let mut process_logs = state.process_logs.lock().unwrap();
            restart_process(&request_body.name, &mut processes, &mut process_logs)
        }
        "/logs" => {
            let process_logs = state.process_logs.lock().unwrap();
            let logs = process_logs.get(&request_body.name).cloned().unwrap_or_default();
            ApiResponse {
                code: 200,
                message: None,
                data: Some(serde_json::to_value(logs).unwrap()),
                pid: None,
            }
        }
        "/watchdog/config" => {
            let config = state.config.lock().unwrap();
            ApiResponse {
                code: 200,
                message: None,
                data: Some(serde_json::to_value(config.watchdog.clone()).unwrap()),
                pid: None,
            }
        }
        "/watchdog/update" => {
            let mut config = state.config.lock().unwrap();
            
            #[derive(Deserialize, Default)]
            struct WatchdogUpdate {
                enabled: Option<bool>,
                interval: Option<u64>,
                timeout: Option<u64>,
            }
            
            let update: WatchdogUpdate = serde_json::from_str(&body_str).unwrap_or_default();
            
            if let Some(enabled) = update.enabled {
                config.watchdog.enabled = enabled;
            }
            if let Some(interval) = update.interval {
                config.watchdog.interval = interval;
            }
            if let Some(timeout) = update.timeout {
                config.watchdog.timeout = timeout;
            }
            
            ApiResponse {
                code: 200,
                message: Some("Watchdog config updated".to_string()),
                data: Some(serde_json::to_value(config.watchdog.clone()).unwrap()),
                pid: None,
            }
        }
        "/watchdog/status" => {
            let config = state.config.lock().unwrap();
            let status = serde_json::json!({
                "enabled": config.watchdog.enabled,
                "timestamp": SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis()
            });
            ApiResponse {
                code: 200,
                message: None,
                data: Some(status),
                pid: None,
            }
        }
        _ => ApiResponse {
            code: 404,
            message: Some("Not Found".to_string()),
            data: None,
            pid: None,
        },
    };
    
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(serde_json::to_string(&response).unwrap()))
        .unwrap())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = load_config();
    let config = Arc::new(Mutex::new(config));
    
    let processes = Arc::new(Mutex::new(HashMap::new()));
    let process_logs = Arc::new(Mutex::new(HashMap::new()));
    
    let state = AppState {
        config: config.clone(),
        processes: processes.clone(),
        process_logs: process_logs.clone(),
    };
    
    let make_svc = make_service_fn(move |_| {
        let state = state.clone();
        async move {
            Ok::<_, hyper::Error>(service_fn(move |req| {
                handle_request(req, state.clone())
            }))
        }
    });
    
    let addr = ([0, 0, 0, 0], 726).into();
    let server = Server::bind(&addr).serve(make_svc);
    
    println!("Mannager 运行在端口 726");
    println!("Web: http://localhost:726/");
    println!("插件目录: Plugs/");
    
    let plugs = get_plugs(&processes.lock().unwrap());
    let plug_names: Vec<String> = plugs.iter().map(|p| p.info.get("name").cloned().unwrap_or_else(|| p.name.clone())).collect();
    println!("已发现插件: {}", plug_names.join(", "));
    
    for plug in &plugs {
        if plug.info.get("autostart").map(|s| s.as_str()) == Some("true") {
            println!("自启动: {}...", plug.name);
            let mut procs = processes.lock().unwrap();
            let mut logs = process_logs.lock().unwrap();
            let _ = start_process(&plug.name, &mut procs, &mut logs);
        }
    }
    
    server.await?;
    Ok(())
}