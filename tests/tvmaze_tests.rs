use iptv_nz_addon_rust::tvmaze::{TvMazeClient, clean_title_for_search, process_epg_icon_url};
use mockito::Server;

#[test]
fn test_clean_title() {
    assert_eq!(
        clean_title_for_search("Shortland Street (2024)"),
        "Shortland Street"
    );
    assert_eq!(clean_title_for_search("News (New) "), "News");
    assert_eq!(
        clean_title_for_search("The Chaseroom (Final) (2023)"),
        "The Chaseroom"
    );
}

#[test]
fn test_process_icon_url() {
    // Empty input -> None
    assert_eq!(process_epg_icon_url(""), None);

    // HTTP -> HTTPS upgrade
    assert_eq!(
        process_epg_icon_url("http://example.com/image.jpg"),
        Some("https://example.com/image.jpg".to_string())
    );

    // CDN [width] and [height] placeholders (landscape)
    assert_eq!(
        process_epg_icon_url("https://cdn.fullscreen.nz/Spotlight/[width]/[height]/image.jpg"),
        Some("https://cdn.fullscreen.nz/Spotlight/600/338/image.jpg".to_string())
    );

    // CDN [width] and [height] placeholders (portrait)
    assert_eq!(
        process_epg_icon_url("https://cdn.fullscreen.nz/SomeOther/[width]/[height]/image.jpg"),
        Some("https://cdn.fullscreen.nz/SomeOther/300/450/image.jpg".to_string())
    );

    // data: scheme rejection
    assert_eq!(
        process_epg_icon_url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA"),
        None
    );

    // Valid HTTPS URL passthrough
    assert_eq!(
        process_epg_icon_url("https://example.com/logo.png"),
        Some("https://example.com/logo.png".to_string())
    );

    // Invalid formats
    assert_eq!(process_epg_icon_url("not-a-url"), None);
    // Invalid path and query without allowed format -> None
    assert_eq!(
        process_epg_icon_url("https://example.com/page?param=1"),
        None
    );
}

#[tokio::test]
async fn test_fetch_show_images_success() {
    let mut server = Server::new_async().await;
    let show_search_json = r#"[{"show":{"id":123,"image":{"original":"http://poster.jpg","medium":"http://poster_m.jpg"}}}]"#;
    let show_images_json = r#"[{"type":"banner","main":false,"resolutions":{"original":{"url":"http://banner.jpg"}}}]"#;

    let m1 = server
        .mock("GET", "/search/shows?q=Test%20Show")
        .with_status(200)
        .with_body(show_search_json)
        .create_async()
        .await;

    let m2 = server
        .mock("GET", "/shows/123/images")
        .with_status(200)
        .with_body(show_images_json)
        .create_async()
        .await;

    let client = TvMazeClient::with_base_url(server.url());
    let result = client
        .fetch_show_images("Test Show")
        .await
        .expect("Should return ShowImages");

    assert_eq!(result.poster, Some("http://poster.jpg".to_string()));
    assert_eq!(result.banner, Some("http://banner.jpg".to_string()));
    m1.assert_async().await;
    m2.assert_async().await;
}

#[tokio::test]
async fn test_fetch_show_images_no_results() {
    let mut server = Server::new_async().await;
    let m = server
        .mock("GET", "/search/shows?q=Unknown")
        .with_status(200)
        .with_body("[]")
        .create_async()
        .await;

    let client = TvMazeClient::with_base_url(server.url());
    let result = client.fetch_show_images("Unknown").await;

    assert!(result.is_none());
    m.assert_async().await;
}

#[tokio::test]
async fn test_fetch_show_images_empty_query() {
    let client = TvMazeClient::new();
    let result = client.fetch_show_images("   ").await;
    assert!(result.is_none());
}

#[tokio::test]
async fn test_fetch_show_images_network_error() {
    let mut server = Server::new_async().await;
    let m = server
        .mock("GET", "/search/shows?q=Fail")
        .with_status(500)
        .create_async()
        .await;

    let client = TvMazeClient::with_base_url(server.url());
    let result = client.fetch_show_images("Fail").await;

    assert!(result.is_none());
    m.assert_async().await;
}

#[test]
fn test_tvmaze_client_new() {
    let client = TvMazeClient::new();
    assert_eq!(client.base_url(), "https://api.tvmaze.com");
}

#[test]
fn test_tvmaze_client_default() {
    let client = TvMazeClient::default();
    assert_eq!(client.base_url(), "https://api.tvmaze.com");
}

#[test]
fn test_tvmaze_client_with_base_url() {
    let client = TvMazeClient::with_base_url("https://test.tvmaze.com".to_string());
    assert_eq!(client.base_url(), "https://test.tvmaze.com");
}
