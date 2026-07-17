use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use iptv_nz_addon_rust::build_router;
use tower::ServiceExt;

#[tokio::test]
async fn test_router_compilation() {
    // This ensures the router used in the entry point is valid and can handle requests.
    let router = build_router();
    let response = router
        .oneshot(Request::builder().uri("/ping").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_cors_layer_decoration() {
    let router = build_router();

    // 1. Success case
    let response = router
        .clone()
        .oneshot(Request::builder().uri("/ping").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-origin")
            .expect("Missing CORS header on 200"),
        "*"
    );

    // 2. Error case (400 Bad Request)
    let response = router
        .oneshot(
            Request::builder()
                .uri("/proxy/invalid-base64")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-origin")
            .expect("Missing CORS header on 400"),
        "*"
    );
}
