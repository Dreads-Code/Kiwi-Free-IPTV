//! Local development server entry point.
//! This binary runs the Axum router on a local TCP port.

use iptv_nz_addon_rust::build_router;
use log::info;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

    let app = build_router();

    let port: u16 = match env::var("PORT") {
        Ok(val) => val.parse().map_err(|e| {
            format!(
                "Failed to parse PORT environment variable '{}' as u16: {}",
                val, e
            )
        })?,
        Err(_) => 3000,
    };
    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));

    info!("Starting local development server on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;

    axum::serve(listener, app).await?;

    Ok(())
}
