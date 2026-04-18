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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    #[tokio::test]
    async fn test_router_compilation() {
        // This ensures the router used in the entry point is valid and can handle requests.
        let router = build_router();
        let response = router
            .oneshot(
                Request::builder()
                    .uri("/ping")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }
}
