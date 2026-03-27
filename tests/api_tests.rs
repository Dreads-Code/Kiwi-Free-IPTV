use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use iptv_nz_addon_rust::build_router;
use serde_json::Value;
use tower::ServiceExt; // for oneshot // for collect

#[tokio::test]
async fn test_ping_endpoint() {
    let app = build_router();

    let response = app
        .oneshot(Request::builder().uri("/ping").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(&body[..], b"pong");
}

#[tokio::test]
async fn test_manifest_endpoint() {
    let app = build_router();

    let response = app
        .oneshot(
            Request::builder()
                .uri("/manifest.json")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-origin")
            .unwrap(),
        "*"
    );

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let manifest: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(manifest["id"], "stremio_iptv_id:nz");
    assert!(manifest["logo"].as_str().unwrap().contains("/logo.png"));
}

#[tokio::test]
async fn test_static_assets() {
    let app = build_router();

    // Logo
    let res_logo = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/logo.png")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res_logo.status(), StatusCode::OK);
    assert_eq!(res_logo.headers().get("content-type").unwrap(), "image/png");

    // Background
    let res_bg = app
        .oneshot(
            Request::builder()
                .uri("/background.png")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res_bg.status(), StatusCode::OK);
    assert_eq!(res_bg.headers().get("content-type").unwrap(), "image/png");
}

#[tokio::test]
async fn test_fallback_route() {
    let app = build_router();

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/unknown")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    assert!(String::from_utf8_lossy(&body).contains("404 Not Found"));
}

#[tokio::test]
async fn test_catalog_resource_route() {
    let app = build_router();

    let response = app
        .oneshot(
            Request::builder()
                .uri("/catalog/tv/stremio_iptv_id:nz.json")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res_json: Value = serde_json::from_slice(&body).unwrap();
    assert!(res_json.get("metas").is_some());
}

#[tokio::test]
async fn test_unsupported_resource_type() {
    let app = build_router();

    let response = app
        .oneshot(
            Request::builder()
                .uri("/catalog/movie/some-id.json")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let res_json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(res_json, serde_json::json!({}));
}

#[tokio::test]
async fn test_fetch_pass_through_handler() {
    let mut server = mockito::Server::new_async().await;
    let _m = server
        .mock("GET", "/external-resource")
        .with_status(200)
        .with_header("content-type", "text/plain")
        .with_body("external content")
        .create_async()
        .await;

    let app = build_router();
    // Use a whitelisted domain for the test or one that passes our safety checks.
    // By default, mockito server is on localhost, which is whitelisted in debug/test.
    let url = format!("{}/external-resource", server.url());
    let encoded_url = urlencoding::encode(&url);

    let response = app
        .oneshot(
            Request::builder()
                .uri(format!("/api/fetch?url={}", encoded_url))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-origin")
            .unwrap(),
        "*"
    );

    let body = response.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(body, "external content");
}

#[tokio::test]
async fn test_fetch_pass_through_unsafe_url() {
    let app = build_router();

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/fetch?url=https://evil-unwhitelisted.com/malware")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}
