use std::collections::HashMap;
use std::fs;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use axum::{
    extract::State,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use mdns_sd::{ServiceDaemon, ServiceInfo};
use tower_http::cors::CorsLayer;
use tauri::Manager;

#[derive(Clone, Serialize, Deserialize)]
struct Identity {
    id: String,
    name: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
struct Peer {
    id: String,
    name: String,
    ip: String,
    port: u16,
    #[serde(rename = "type")]
    device_type: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct FileItem {
    id: String,
    name: String,
    path: String,
    size: u64,
    last_modified: u64,
}

struct AppState {
    identity: Identity,
    uploads_dir: PathBuf,
    peers: Arc<Mutex<Vec<Peer>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();
            let downloads_dir = app_handle.path().download_dir().unwrap_or_else(|_| PathBuf::from("Downloads"));
            let uploads_dir = downloads_dir.join("AntahkarnVrinda");
            
            if !uploads_dir.exists() {
                fs::create_dir_all(&uploads_dir).expect("Failed to create uploads directory");
            }

            let id_uuid = Uuid::new_v4();
            let id = id_uuid.to_string();
            let name = whoami::hostname().unwrap_or_else(|_| "Unknown".to_string());
            let identity = Identity { id: id.clone(), name: name.clone() };

            let peers = Arc::new(Mutex::new(Vec::new()));
            let state = Arc::new(AppState {
                identity: identity.clone(),
                uploads_dir: uploads_dir.clone(),
                peers: peers.clone(),
            });

            // Start mDNS
            let mdns = ServiceDaemon::new().expect("Failed to create mDNS daemon");
            let service_type = "_localshare._tcp.local.";
            let instance_name = format!("{}-{}", name, &id[..4]);
            let host_name = format!("{}.local.", name);
            let port = 3000;
            
            let mut properties = HashMap::new();
            properties.insert("id".to_string(), id.clone());
            properties.insert("type".to_string(), "desktop".to_string());
            properties.insert("deviceName".to_string(), name.clone());

            let my_service = ServiceInfo::new(
                service_type,
                &instance_name,
                &host_name,
                "0.0.0.0",
                port,
                Some(properties),
            ).expect("Failed to create service info");

            mdns.register(my_service).expect("Failed to register mDNS service");

            // Start background peer discovery
            let peers_clone = peers.clone();
            let my_id = identity.id.clone();
            let app_handle_discovery = app_handle.clone();
            
            // Create a dedicated Tokio runtime for background tasks
            let rt = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
            let _handle = rt.handle().clone();

            // Start background peer discovery
            let peers_clone = peers.clone();
            let my_id = identity.id.clone();
            let mdns_discovery = mdns.clone();

            rt.spawn(async move {
                let receiver = mdns_discovery.browse(service_type).expect("Failed to browse mDNS");
                while let Ok(event) = receiver.recv() {
                    match event {
                        mdns_sd::ServiceEvent::ServiceResolved(info) => {
                            let mut peers = peers_clone.lock().await;
                            let id_prop = info.get_property("id");
                            if let Some(id_val) = id_prop {
                                let id = String::from_utf8_lossy(id_val.val().unwrap_or(&[])).to_string();
                                if id != my_id && !id.is_empty() {
                                    let peer = Peer {
                                        id,
                                        name: info.get_property("deviceName").and_then(|p| p.val().map(|v| String::from_utf8_lossy(v).to_string())).unwrap_or_default(),
                                        ip: info.get_addresses().iter().next().map(|a| a.to_string()).unwrap_or_default(),
                                        port: info.get_port(),
                                        device_type: info.get_property("type").and_then(|p| p.val().map(|v| String::from_utf8_lossy(v).to_string())).unwrap_or_default(),
                                    };
                                    if !peers.iter().any(|p| p.id == peer.id) {
                                      peers.push(peer);
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }
            });

            // Start API Server
            rt.spawn(async move {
                let app = Router::new()
                    .route("/api/identity", get(get_identity))
                    .route("/api/peers", get(get_peers))
                    .route("/api/files", get(list_files))
                    .layer(CorsLayer::permissive())
                    .with_state(state);

                let addr = SocketAddr::from(([0, 0, 0, 0], port));
                let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
                axum::serve(listener, app).await.unwrap();
            });

            // Prevent the runtime from being dropped immediately
            std::mem::forget(rt);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn get_identity(State(state): State<Arc<AppState>>) -> Json<Identity> {
    Json(state.identity.clone())
}

async fn get_peers(State(state): State<Arc<AppState>>) -> Json<Vec<Peer>> {
    let peers = state.peers.lock().await;
    Json(peers.clone())
}

async fn list_files(State(state): State<Arc<AppState>>) -> Json<Vec<FileItem>> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(&state.uploads_dir) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_file() {
                    files.push(FileItem {
                        id: entry.file_name().to_string_lossy().to_string(),
                        name: entry.file_name().to_string_lossy().to_string(),
                        path: entry.path().to_string_lossy().to_string(),
                        size: metadata.len(),
                        last_modified: metadata.modified().unwrap().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
                    });
                }
            }
        }
    }
    Json(files)
}
