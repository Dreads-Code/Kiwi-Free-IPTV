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
        .oneshot(
            Request::builder()
                .uri("/ping")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}
