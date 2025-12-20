use crate::config::Config;
use serde::Serialize;
use sysinfo::System;

#[derive(Serialize, Debug)]
pub struct SystemInfo {
    pub rust_version: String,
    pub platform: String,
    pub arch: String,
    pub cpus: usize,
    pub cpu_model: String,
    pub memory_total_gb: f64,
    pub memory_free_gb: f64,
    pub memory_used_gb: f64,
    pub ffmpeg: String,
    pub uptime_minutes: f64,
}

#[derive(Debug)]
pub struct MemoryUsage {
    pub rss_mb: f64,
    #[allow(dead_code)]
    pub heap_mb: f64,
}

pub fn get_system_info() -> SystemInfo {
    let mut system = System::new();
    system.refresh_all();

    // Get FFmpeg version (synchronous check)
    let ffmpeg_version = match std::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
    {
        Ok(output) => {
            if output.status.success() {
                String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .next()
                    .unwrap_or("unknown")
                    .to_string()
            } else {
                "not available".to_string()
            }
        }
        Err(_) => "not available".to_string(),
    };

    let memory_total = system.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
    let memory_free = system.free_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
    let memory_used = memory_total - memory_free;

    let cpu_count = system.cpus().len();
    let cpu_model = system
        .cpus()
        .first()
        .map(|cpu| cpu.brand().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    SystemInfo {
        rust_version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        cpus: cpu_count,
        cpu_model,
        memory_total_gb: memory_total,
        memory_free_gb: memory_free,
        memory_used_gb: memory_used,
        ffmpeg: ffmpeg_version,
        uptime_minutes: 0.0, // System uptime not available in sysinfo 0.30
    }
}

pub fn get_memory_usage() -> MemoryUsage {
    // Rust doesn't have the same memory tracking as Node.js
    // We'll use a simplified version
    // In production, you might want to use a crate like `memory-stats`
    MemoryUsage {
        rss_mb: 0.0, // Placeholder - would need external crate for accurate measurement
        heap_mb: 0.0,
    }
}

pub fn print_startup_info(config: &Config) {
    println!("{}", "=".repeat(60));
    println!("🚀 Video Clipper Backend Starting...");
    println!("{}", "=".repeat(60));

    let sys_info = get_system_info();
    println!("📊 System Information:");
    println!("  Rust: {}", sys_info.rust_version);
    println!("  Platform: {} ({})", sys_info.platform, sys_info.arch);
    println!("  CPUs: {} ({})", sys_info.cpus, sys_info.cpu_model);
    println!(
        "  Memory: {:.2} GB total, {:.2} GB free, {:.2} GB used",
        sys_info.memory_total_gb, sys_info.memory_free_gb, sys_info.memory_used_gb
    );
    println!("  FFmpeg: {}", sys_info.ffmpeg);
    println!("  Uptime: {:.1} minutes", sys_info.uptime_minutes);
    println!("  Upload Dir: {:?}", config.upload_dir);
    println!("  Output Dir: {:?}", config.output_dir);
    println!("{}", "=".repeat(60));
}

