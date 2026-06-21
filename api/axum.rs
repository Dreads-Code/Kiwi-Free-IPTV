//! Vercel Runtime Handler for Axum.
//! This entry point is used when the addon is deployed as a Vercel Serverless Function.

use iptv_nz_addon_rust::build_router;
use log::info;
use tower::ServiceBuilder;
use vercel_runtime::Error;
use vercel_runtime::axum::VercelLayer;
use vercel_runtime::run;

#[tokio::main]
async fn main() -> Result<(), Error> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .target(env_logger::Target::Stdout)
        .init();

    info!("Starting NZ IPTV Stremio Addon (Vercel Serverless)...");

    let router = build_router();

    let app = ServiceBuilder::new()
        .layer(VercelLayer::new())
        .service(router);

    run(app).await
}
