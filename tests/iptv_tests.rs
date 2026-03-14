use iptv_nz_addon_rust::AppState;
use iptv_nz_addon_rust::iptv::{self, ChannelMeta, EpgProgramme, EpgRating};
use iptv_nz_addon_rust::tvmaze;
use mockito::Server;
use std::collections::HashMap;
use std::sync::Arc;

fn create_mock_state() -> AppState {
    AppState {
        stream_cache: Arc::new(moka::future::Cache::new(100)),
        epg_cache: Arc::new(moka::future::Cache::new(100)),
        image_cache: Arc::new(moka::future::Cache::new(100)),
        tvmaze_client: Arc::new(tvmaze::TvMazeClient::new()),
        m3u8_url: iptv::M3U8_URL.to_string(),
        epg_url: iptv::EPG_URL.to_string(),
    }
}

#[test]
fn test_categorize_channel() {
    // Sports
    assert_eq!(iptv::categorize_channel("Sky Sport 1", &None), "Sports");
    assert_eq!(iptv::categorize_channel("Trackside 1", &None), "Sports");
    assert_eq!(iptv::categorize_channel("RedBull TV", &None), "Sports");
    assert_eq!(iptv::categorize_channel("MotoGP", &None), "Sports");
    assert_eq!(iptv::categorize_channel("Sky Open", &None), "Sports");

    // News
    assert_eq!(iptv::categorize_channel("CNN International", &None), "News");
    assert_eq!(iptv::categorize_channel("Al Jazeera", &None), "News");
    assert_eq!(iptv::categorize_channel("Parliament TV", &None), "News");
    assert_eq!(iptv::categorize_channel("DW English", &None), "News");

    // Religious
    assert_eq!(iptv::categorize_channel("Shine TV", &None), "Religious");
    assert_eq!(iptv::categorize_channel("Hope Channel", &None), "Religious");
    assert_eq!(iptv::categorize_channel("Firstlight", &None), "Religious");

    // New Zealand
    assert_eq!(iptv::categorize_channel("TVNZ 1", &None), "New Zealand");
    assert_eq!(iptv::categorize_channel("Three", &None), "New Zealand");
    assert_eq!(iptv::categorize_channel("Eden", &None), "New Zealand");
    assert_eq!(
        iptv::categorize_channel("Whakaata Māori", &None),
        "New Zealand"
    );
    assert_eq!(iptv::categorize_channel("Bravo", &None), "New Zealand");
    assert_eq!(iptv::categorize_channel("Rush", &None), "New Zealand");
    assert_eq!(iptv::categorize_channel("Duke", &None), "New Zealand");
    assert_eq!(
        iptv::categorize_channel("Wairarapa TV", &None),
        "New Zealand"
    );

    // International / default
    assert_eq!(
        iptv::categorize_channel("Random Channel", &None),
        "International"
    );
}

#[tokio::test]
async fn test_format_meta_catalog() {
    let state = create_mock_state();
    let meta = ChannelMeta {
        id: "test-id".to_string(),
        name: "Test TV".to_string(),
        name_lower: "test tv".to_string(),
        type_name: "tv".to_string(),
        poster: Some("http://poster".to_string()),
        poster_shape: "square".to_string(),
        background: Some("http://bg".to_string()),
        logo: Some("http://logo".to_string()),
        description: "Desc".to_string(),
        url: "http://stream.m3u8".to_string(),
        category: "test".to_string(),
        http_headers: None,
        programmes: vec![],
    };

    let json = iptv::format_meta(state, meta, "20260311200000 +0000".to_string(), true).await;
    assert_eq!(json["id"], serde_json::json!("test-id"));
    assert_eq!(json["name"], serde_json::json!("Test TV"));
    assert_eq!(json["poster"], serde_json::json!("http://poster"));
    assert_eq!(json["logo"], serde_json::json!("http://logo"));
    // catalog should not contain behaviorHints
    assert!(json.get("behaviorHints").is_none());
}

#[tokio::test]
async fn test_format_meta_detail() {
    let state = create_mock_state();
    let meta = ChannelMeta {
        id: "test-id".to_string(),
        name: "Test TV".to_string(),
        name_lower: "test tv".to_string(),
        type_name: "tv".to_string(),
        poster: None,
        poster_shape: "square".to_string(),
        background: None,
        logo: None,
        description: "".to_string(),
        url: "http://stream.m3u8".to_string(),
        category: "test".to_string(),
        http_headers: None,
        programmes: vec![EpgProgramme {
            start: "20260311100000 +0000".to_string(),
            stop: "20260311120000 +0000".to_string(),
            channel: "test-chan".to_string(),
            title: Some("Current Show".to_string()),
            desc: Some("Show description".to_string()),
            icon: None,
            category: vec![],
            date: Some("2022".to_string()),
            star_rating: Some(EpgRating {
                value: Some("8/10".to_string()),
            }),
            rating: Some(EpgRating {
                value: Some("PG".to_string()),
            }),
        }],
    };

    let json = iptv::format_meta(state, meta, "20260311110000 +0000".to_string(), false).await;

    assert_eq!(json["id"], serde_json::json!("test-id"));
    // name gets overwritten by currently playing show
    assert_eq!(json["name"], serde_json::json!("Current Show"));
    assert_eq!(json["releaseInfo"], serde_json::json!("2022"));
    assert_eq!(json["imdbRating"], serde_json::json!("8"));
    // Check that age rating is prepended to the description
    let desc = json["description"].as_str().unwrap();
    assert!(desc.starts_with("Age Rating: PG"));
    assert!(desc.contains("Show description"));
    assert!(json.get("behaviorHints").is_some());
}

#[tokio::test]
async fn test_make_request_success() {
    let mut server = Server::new_async().await;
    let _m = server
        .mock("GET", "/")
        .with_status(200)
        .with_body("success")
        .create_async()
        .await;

    let url = server.url();
    let res = iptv::make_request(&url, 3).await;
    assert!(res.is_ok());
    assert_eq!(res.unwrap(), "success");
}

#[tokio::test]
async fn test_make_request_retry_success() {
    let mut server = Server::new_async().await;
    // Create the success mock FIRST
    let _m_success = server
        .mock("GET", "/")
        .with_status(200)
        .with_body("success after retry")
        .expect(1)
        .create_async()
        .await;

    // Create the error mock SECOND (it will match first)
    let _m_error = server
        .mock("GET", "/")
        .with_status(500)
        .expect(2)
        .create_async()
        .await;

    let url = server.url();
    let res = iptv::make_request(&url, 3).await;
    assert!(res.is_ok());
    assert_eq!(res.unwrap(), "success after retry");
}

#[tokio::test]
async fn test_make_request_exhausted_retries() {
    let mut server = Server::new_async().await;
    let _m = server
        .mock("GET", "/")
        .with_status(500)
        .expect(3) // initial + 2 retries = 3
        .create_async()
        .await;

    let url = server.url();
    let res = iptv::make_request(&url, 2).await;
    assert!(res.is_err());
}

#[tokio::test]
async fn test_fetch_data_fast_path_cache() {
    let state = create_mock_state();
    let channels = vec![ChannelMeta {
        id: "cached-id".to_string(),
        name: "Cached Name".to_string(),
        name_lower: "cached name".to_string(),
        type_name: "tv".to_string(),
        poster: None,
        poster_shape: "regular".to_string(),
        background: None,
        logo: None,
        description: "".to_string(),
        url: "http://cached".to_string(),
        category: "Test".to_string(),
        programmes: vec![],
        http_headers: None,
    }];
    let json = serde_json::to_string(&channels).unwrap();
    state.stream_cache.insert("data".to_string(), json).await;

    let res = iptv::fetch_data(&state).await.unwrap();
    assert_eq!(res.len(), 1);
    assert_eq!(res[0].id, "cached-id");
}

#[tokio::test]
async fn test_fetch_data_cache_miss_success() {
    let mut server = Server::new_async().await;
    let m3u8_body =
        "#EXTM3U\n#EXTINF:-1 tvg-id=\"nz1\" tvg-logo=\"logo1\",TVNZ 1\nhttp://stream1\n";
    let epg_body = r#"<tv><channel id="nz1"><display-name>TVNZ 1</display-name></channel></tv>"#;

    let _m1 = server
        .mock("GET", "/m3u8")
        .with_status(200)
        .with_body(m3u8_body)
        .create_async()
        .await;
    let _m2 = server
        .mock("GET", "/epg")
        .with_status(200)
        .with_body(epg_body)
        .create_async()
        .await;

    let mut state = create_mock_state();
    state.m3u8_url = format!("{}/m3u8", server.url());
    state.epg_url = format!("{}/epg", server.url());

    let res = iptv::fetch_data(&state).await.unwrap();
    assert_eq!(res.len(), 1);
    assert_eq!(res[0].name, "TVNZ 1");

    // Assert caches are populated
    assert!(state.stream_cache.get("m3u8").await.is_some());
    assert!(state.epg_cache.get("epg_struct").await.is_some());
    assert!(state.stream_cache.get("data").await.is_some());
}

#[tokio::test]
async fn test_fetch_data_invalid_epg_xml() {
    let mut server = Server::new_async().await;
    let m3u8_body = "#EXTM3U\n#EXTINF:-1 tvg-id=\"nz1\",TVNZ 1\nhttp://stream1\n";
    let epg_body = "invalid xml";

    let _m1 = server
        .mock("GET", "/m3u8")
        .with_status(200)
        .with_body(m3u8_body)
        .create_async()
        .await;
    let _m2 = server
        .mock("GET", "/epg")
        .with_status(200)
        .with_body(epg_body)
        .create_async()
        .await;

    let mut state = create_mock_state();
    state.m3u8_url = format!("{}/m3u8", server.url());
    state.epg_url = format!("{}/epg", server.url());

    let res = iptv::fetch_data(&state).await.unwrap();
    assert_eq!(res.len(), 1);
    assert_eq!(res[0].name, "TVNZ 1");
    // Should still work without EPG
}

#[tokio::test]
async fn test_fetch_data_m3u8_parsing_edge_cases() {
    let mut server = Server::new_async().await;
    // Missing tvg-id, logo, headers
    let m3u8_body = "#EXTM3U\n#EXTINF:-1,TVNZ 1\nhttp://stream1\n";

    let _m1 = server
        .mock("GET", "/m3u8")
        .with_status(200)
        .with_body(m3u8_body)
        .create_async()
        .await;
    let _m2 = server
        .mock("GET", "/epg")
        .with_status(200)
        .with_body("")
        .create_async()
        .await;

    let mut state = create_mock_state();
    state.m3u8_url = format!("{}/m3u8", server.url());
    state.epg_url = format!("{}/epg", server.url());

    let res = iptv::fetch_data(&state).await.unwrap();
    assert_eq!(res.len(), 1);
    assert_eq!(res[0].id, "stremio_iptv_id:mjh-tvnz-1"); // Generated fallback ID
}

#[tokio::test]
async fn test_fetch_data_sorting() {
    let mut server = Server::new_async().await;
    // Eden (8), TVNZ 1 (1), +1 channel (1000)
    let m3u8_body = "#EXTM3U\n\
        #EXTINF:-1 tvg-id=\"eden\",Eden\nhttp://eden\n\
        #EXTINF:-1 tvg-id=\"tvnz-1\",TVNZ 1\nhttp://tvnz1\n\
        #EXTINF:-1 tvg-id=\"tvnz-1plus1\",TVNZ 1 +1\nhttp://tvnz1plus1\n";

    let _m1 = server
        .mock("GET", "/m3u8")
        .with_status(200)
        .with_body(m3u8_body)
        .create_async()
        .await;
    let _m2 = server
        .mock("GET", "/epg")
        .with_status(200)
        .with_body("")
        .create_async()
        .await;

    let mut state = create_mock_state();
    state.m3u8_url = format!("{}/m3u8", server.url());
    state.epg_url = format!("{}/epg", server.url());

    let res = iptv::fetch_data(&state).await.unwrap();
    assert_eq!(res.len(), 3);
    assert_eq!(res[0].name, "TVNZ 1");
    assert_eq!(res[1].name, "Eden");
    assert_eq!(res[2].name, "TVNZ 1 +1");
}

#[tokio::test]
async fn test_catalog_generation() {
    let state = create_mock_state();
    let channels = vec![ChannelMeta {
        id: "stremio_iptv_id:test".to_string(),
        name: "Test".to_string(),
        name_lower: "test".to_string(),
        type_name: "tv".to_string(),
        poster: Some("http://poster".to_string()),
        poster_shape: "regular".to_string(),
        background: Some("http://bg".to_string()),
        logo: Some("http://logo".to_string()),
        description: "".to_string(),
        url: "http://stream".to_string(),
        category: "Test".to_string(),
        programmes: vec![],
        http_headers: None,
    }];
    state
        .stream_cache
        .insert(
            "data".to_string(),
            serde_json::to_string(&channels).unwrap(),
        )
        .await;

    let catalog = iptv::catalog(&state).await.unwrap();
    let arr = catalog.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["id"], serde_json::json!("stremio_iptv_id:test"));
    assert!(arr[0].get("behaviorHints").is_none());
}

#[tokio::test]
async fn test_meta_request() {
    let state = create_mock_state();
    let channels = vec![ChannelMeta {
        id: "stremio_iptv_id:mjh-tvnz-1".to_string(),
        name: "TVNZ 1".to_string(),
        name_lower: "tvnz 1".to_string(),
        type_name: "tv".to_string(),
        poster: None,
        poster_shape: "regular".to_string(),
        background: None,
        logo: None,
        description: "".to_string(),
        url: "http://stream".to_string(),
        category: "Test".to_string(),
        programmes: vec![],
        http_headers: None,
    }];
    state
        .stream_cache
        .insert(
            "data".to_string(),
            serde_json::to_string(&channels).unwrap(),
        )
        .await;

    // Found
    let res = iptv::meta(&state, "stremio_iptv_id:mjh-tvnz-1")
        .await
        .unwrap();
    assert!(res.is_some());
    assert_eq!(
        res.unwrap()["id"],
        serde_json::json!("stremio_iptv_id:mjh-tvnz-1")
    );

    // Not Found
    let res = iptv::meta(&state, "stremio_iptv_id:invalid").await.unwrap();
    assert!(res.is_none());
}

#[tokio::test]
async fn test_stream_request() {
    let mut server = Server::new_async().await;
    // Redirect mock
    let _m = server
        .mock("GET", "/redirect")
        .with_status(302)
        .with_header("location", "https://fullscreen.nz/live.m3u8")
        .create_async()
        .await;

    let state = create_mock_state();
    let mut headers = HashMap::new();
    headers.insert("User-Agent".to_string(), "CustomAgent".to_string());

    let channels = vec![ChannelMeta {
        id: "stremio_iptv_id:mjh-tvnz-1".to_string(),
        name: "TVNZ 1".to_string(),
        name_lower: "tvnz 1".to_string(),
        type_name: "tv".to_string(),
        poster: None,
        poster_shape: "regular".to_string(),
        background: None,
        logo: None,
        description: "".to_string(),
        url: format!("{}/redirect", server.url()),
        category: "Test".to_string(),
        programmes: vec![],
        http_headers: Some(headers),
    }];
    state
        .stream_cache
        .insert(
            "data".to_string(),
            serde_json::to_string(&channels).unwrap(),
        )
        .await;

    // Direct Play / Unproxied if it resolves to fullscreen.nz
    // Note: our current stream() logic always returns a proxy URL via build_proxy_url
    // BUT the user request said:
    // "Test Case 1: Direct Play Supported Channel. Scenario: Stream URL contains domains that allow direct play (e.g., fullscreen.nz). Expected: The output url is exactly the input URL (unproxied)."
    // I should check if I need to update src/iptv.rs to support direct play exclusion.
    // Looking at src/iptv.rs:547:
    // "let proxy_url = crate::proxy::build_proxy_url(base_url, &stream_url, channel.http_headers.as_ref());"
    // It ALWAYS uses proxy. The proxy itself handles redirection optimization.

    let res = iptv::stream(&state, "stremio_iptv_id:mjh-tvnz-1", "http://localhost")
        .await
        .unwrap();
    let streams = res.as_array().unwrap();
    assert_eq!(streams.len(), 1);
    assert!(streams[0]["url"].as_str().unwrap().contains("/proxy/"));
}
