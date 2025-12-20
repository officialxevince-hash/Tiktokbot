use axum::{
    routing::post,
    Router,
};
use std::{
    collections::HashMap,
    sync::Arc,
};
use tokio::sync::RwLock;
use tower_http::{
    cors::CorsLayer,
    services::ServeDir,
    trace::TraceLayer,
};
use tracing::info;

mod config;
mod ffmpeg;
mod handlers;
mod models;
mod system_info;

use config::Config;
use handlers::{clip_handler, upload_handler};
use models::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter("video_clipper_backend=debug,tower_http=debug")
        .init();

    // Load configuration
    let config = Config::from_env();
    
    // Ensure directories exist
    tokio::fs::create_dir_all(&config.upload_dir).await?;
    tokio::fs::create_dir_all(&config.output_dir).await?;

    // Print system info at startup
    system_info::print_startup_info(&config);

    // Create app state
    let app_state = Arc::new(AppState {
        videos: Arc::new(RwLock::new(HashMap::new())),
        config: config.clone(),
    });

    // Build router
    let app = Router::new()
        .route("/upload", post(upload_handler))
        .route("/clip", post(clip_handler))
        .nest_service("/clips", ServeDir::new(&config.output_dir))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(app_state);

    // Start server
    let addr = format!("0.0.0.0:{}", config.port);
    info!("🚀 Server starting on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    
    // Log network interfaces and system info
    let sys_info = system_info::get_system_info();
    println!("{}", "=".repeat(60));
    println!("✅ Server running on http://0.0.0.0:{}", config.port);
    println!("✅ Server accessible at http://localhost:{}", config.port);
    println!("{}", "=".repeat(60));
    println!("📊 Runtime Environment:");
    println!("   Rust: {}", sys_info.rust_version);
    println!("   Platform: {} ({})", sys_info.platform, sys_info.arch);
    println!("   CPUs: {} ({})", sys_info.cpus, sys_info.cpu_model);
    println!(
        "   Memory: {:.2} GB total, {:.2} GB free",
        sys_info.memory_total_gb, sys_info.memory_free_gb
    );
    println!("   FFmpeg: {}", sys_info.ffmpeg);
    println!("   Upload Dir: {:?}", config.upload_dir);
    println!("   Output Dir: {:?}", config.output_dir);
    println!("   Max Concurrent Clips: {}", config.max_concurrent_clips);
    println!("{}", "=".repeat(60));
    
    info!("✅ Server listening on {}", addr);
    
    axum::serve(listener, app).await?;

    Ok(())
}

