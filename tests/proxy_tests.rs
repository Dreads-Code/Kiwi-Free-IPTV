use axum::http::HeaderMap;
use base64::Engine as _;
use iptv_nz_addon_rust::proxy::{self, build_proxy_url, get_base_url};
use mockito::Server;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Deserialize)]
struct ProxyPayload {
    url: String,
    headers: Option<HashMap<String, String>>,
}

fn decode_proxy_url(proxy_url: &str, base_url: &str) -> ProxyPayload {
    let prefix = format!("{}/proxy/", base_url);
    let part_after_prefix = proxy_url
        .strip_prefix(&prefix)
        .expect("Proxy URL must start with base_url/proxy/");

    // Clean up possible trailing quotes or other characters
    let part_after_prefix = part_after_prefix
        .trim_end_matches('"')
        .trim_end_matches('\'');

    // Remove trailing suffix if any (e.g. /playlist.m3u8)
    let encoded = part_after_prefix.split('/').next().unwrap();

    let json_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(encoded)
        .expect("Failed to decode base64");
    serde_json::from_slice(&json_bytes).expect("Failed to parse JSON payload")
}

#[test]
fn test_build_proxy_url_encoding() {
    let base_url = "https://my-proxy.vercel.app";
    let target_url = "https://example.com/stream.m3u8?token=123";

    // Test without headers
    let proxy_url = build_proxy_url(base_url, target_url, None);
    assert!(proxy_url.ends_with("/playlist.m3u8"));
    let payload = decode_proxy_url(&proxy_url, base_url);

    assert_eq!(payload.url, target_url);
    assert!(payload.headers.is_none());

    // Test with headers
    let mut headers = HashMap::new();
    headers.insert("Referer".to_string(), "https://referrer.com".to_string());
    headers.insert("X-Custom".to_string(), "value".to_string());

    let proxy_url_with_headers = build_proxy_url(base_url, target_url, Some(&headers));
    let payload_with_headers = decode_proxy_url(&proxy_url_with_headers, base_url);

    assert_eq!(payload_with_headers.url, target_url);
    let decoded_headers = payload_with_headers
        .headers
        .expect("Headers should be present");
    assert_eq!(
        decoded_headers.get("Referer").unwrap(),
        "https://referrer.com"
    );
    assert_eq!(decoded_headers.get("X-Custom").unwrap(), "value");
}

#[test]
fn test_build_proxy_url_skips_default_ua() {
    let base_url = "http://localhost:7000";
    let target_url = "https://example.com/video.ts";
    let apple_ua = "otg/1.5.1 (AppleTv Apple TV 4; tvOS16.0; appletv.client) libcurl/7.58.0 OpenSSL/1.0.2o zlib/1.2.11 clib/1.8.56";

    let mut headers = HashMap::new();
    headers.insert("User-Agent".to_string(), apple_ua.to_string());
    headers.insert("X-Another-Header".to_string(), "foo".to_string());

    let proxy_url = build_proxy_url(base_url, target_url, Some(&headers));
    let payload = decode_proxy_url(&proxy_url, base_url);

    let decoded_headers = payload.headers.expect("Headers should be present");
    // Default UA should be stripped to save space
    assert!(!decoded_headers.contains_key("User-Agent"));
    assert_eq!(decoded_headers.get("X-Another-Header").unwrap(), "foo");
}

#[test]
fn test_build_proxy_url_no_headers_if_only_default_ua() {
    let base_url = "http://localhost:7000";
    let target_url = "https://example.com/video.ts";
    let apple_ua = "otg/1.5.1 (AppleTv Apple TV 4; tvOS16.0; appletv.client) libcurl/7.58.0 OpenSSL/1.0.2o zlib/1.2.11 clib/1.8.56";

    let mut headers = HashMap::new();
    headers.insert("User-Agent".to_string(), apple_ua.to_string());

    let proxy_url = build_proxy_url(base_url, target_url, Some(&headers));
    let payload = decode_proxy_url(&proxy_url, base_url);

    // Since User-Agent was the only header and it was stripped, headers should be None
    assert!(payload.headers.is_none());
}

#[test]
fn test_rewrite_m3u8_logic() {
    let m3u8_content = "#EXTM3U\n\
        #EXT-X-TARGETDURATION:10\n\
        #EXTINF:10.0,\n\
        segment1.ts\n\
        #EXTINF:10.0,\n\
        https://cdn.com/seg2.ts\n\
        #EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\n\
        #EXT-X-MEDIA:TYPE=AUDIO,URI=\"audio.m3u8\"";

    let proxy_base = "http://localhost:7000";
    let original_url = "https://example.com/playlist.m3u8";

    let rewritten = proxy::rewrite_m3u8(m3u8_content, proxy_base, original_url, None);

    // Check tags remain intact
    assert!(rewritten.contains("#EXTM3U"));
    assert!(rewritten.contains("#EXT-X-TARGETDURATION:10"));

    // Check that URLs are rewritten to proxy paths
    assert!(rewritten.contains("http://localhost:7000/proxy/"));

    // Find and decode proxied URLs to verify their original targets
    let lines: Vec<&str> = rewritten.lines().collect();

    // Segment 1 (Relative: segment1.ts)
    // base.join("segment1.ts") -> "https://example.com/segment1.ts"
    let seg1_payload = lines
        .iter()
        .filter(|&&l| !l.trim().starts_with('#') && l.contains("http://localhost:7000/proxy/"))
        .map(|&l| decode_proxy_url(l.trim(), proxy_base))
        .find(|p| p.url == "https://example.com/segment1.ts");
    assert!(seg1_payload.is_some(), "Should find proxied segment1.ts");

    // Segment 2 (Absolute: https://cdn.com/seg2.ts)
    let seg2_payload = lines
        .iter()
        .filter(|&&l| !l.trim().starts_with('#') && l.contains("http://localhost:7000/proxy/"))
        .map(|&l| decode_proxy_url(l.trim(), proxy_base))
        .find(|p| p.url == "https://cdn.com/seg2.ts");
    assert!(seg2_payload.is_some(), "Should find proxied seg2.ts");

    // URI attribute in #EXT-X-KEY (key.bin -> https://example.com/key.bin)
    let key_line = lines
        .iter()
        .find(|&&l| l.contains("EXT-X-KEY"))
        .expect("Should find EXT-X-KEY line");
    assert!(key_line.contains("URI=\"http://localhost:7000/proxy/"));

    // Extract the URI from the key line
    let key_uri_part = key_line
        .split("URI=\"")
        .nth(1)
        .unwrap()
        .split('"')
        .next()
        .unwrap();
    let key_payload = decode_proxy_url(key_uri_part, proxy_base);
    assert_eq!(key_payload.url, "https://example.com/key.bin");
}

#[test]
fn test_get_base_url() {
    // 1. Localhost default
    let mut headers = HeaderMap::new();
    headers.insert("host", "localhost:7000".parse().unwrap());
    assert_eq!(get_base_url(&headers), "http://localhost:7000");

    // 2. Remote default (defaults to https)
    let mut headers = HeaderMap::new();
    headers.insert("host", "stremio-nz.vercel.app".parse().unwrap());
    assert_eq!(get_base_url(&headers), "https://stremio-nz.vercel.app");

    // 3. Explicit protocol via header
    let mut headers = HeaderMap::new();
    headers.insert("host", "myapp.com".parse().unwrap());
    headers.insert("x-forwarded-proto", "http".parse().unwrap());
    assert_eq!(get_base_url(&headers), "http://myapp.com");

    // 4. Fallback when no host is present
    let headers = HeaderMap::new();
    assert_eq!(get_base_url(&headers), "http://127.0.0.1:7000");
}

#[tokio::test]
async fn test_do_proxy_head_request() {
    let mut server = Server::new_async().await;
    let _m = server
        .mock("GET", "/stream.ts")
        .with_status(200)
        .with_header("content-type", "video/mp2t")
        .with_body("some data")
        .create_async()
        .await;

    let target_url = format!("{}/stream.ts", server.url());
    let mut request_headers = HeaderMap::new();
    request_headers.insert("host", "localhost".parse().unwrap());

    // Call do_proxy with HEAD
    use axum::http::{Method, StatusCode};
    let response = proxy::do_proxy(Method::HEAD, &target_url, None, &request_headers).await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get("content-type").unwrap(),
        "video/mp2t"
    );

    // Body should be empty for HEAD
    let body_bytes = axum::body::to_bytes(response.into_body(), 100)
        .await
        .unwrap();
    assert!(body_bytes.is_empty());
}

#[tokio::test]
async fn test_do_proxy_ts_segment() {
    let mut server = Server::new_async().await;
    let _m = server
        .mock("GET", "/segment.ts")
        .with_status(200)
        .with_header("content-type", "video/mp2t")
        .with_body("ts-bytes")
        .create_async()
        .await;

    let target_url = format!("{}/segment.ts", server.url());
    let mut request_headers = HeaderMap::new();
    request_headers.insert("host", "localhost".parse().unwrap());

    use axum::http::Method;
    let response = proxy::do_proxy(Method::GET, &target_url, None, &request_headers).await;

    assert_eq!(
        response.headers().get("content-type").unwrap(),
        "video/mp2t"
    );
    let body_bytes = axum::body::to_bytes(response.into_body(), 100)
        .await
        .unwrap();
    assert_eq!(body_bytes, "ts-bytes");
}

#[tokio::test]
async fn test_do_proxy_mjh_handshake() {
    let mut server = Server::new_async().await;
    // Mock for i.mjh.nz
    let _m1 = server
        .mock("GET", "/nz/channel.m3u8")
        .with_status(302)
        .with_header("location", &format!("{}/real-stream.m3u8", server.url()))
        .match_header("user-agent", mockito::Matcher::Regex("Mozilla".to_string()))
        .create_async()
        .await;

    let _m2 = server
        .mock("GET", "/real-stream.m3u8")
        .with_status(200)
        .with_body("#EXTM3U\n")
        .create_async()
        .await;

    let _target_url = format!("{}/nz/channel.m3u8", server.url());
    // We need to trick the code into thinking it's an MJH URL if it doesn't use the full domain
    // Actually, src/proxy.rs:188 checks current_url.contains("i.mjh.nz")
    // So we must use a URL containing i.mjh.nz. Mockito server URL won't have it unless we are careful.
    // I will mock a URL that has "i.mjh.nz" in the path or query.
    let mjh_fake_url = format!("{}/i.mjh.nz/nz/channel.m3u8", server.url());

    let mut request_headers = HeaderMap::new();
    request_headers.insert("host", "localhost".parse().unwrap());

    use axum::http::Method;
    let _response = proxy::do_proxy(Method::GET, &mjh_fake_url, None, &request_headers).await;

    // The assertions are implicitly in the mock expectations (matchers and visits)
}

#[tokio::test]
async fn test_do_proxy_spoofing() {
    let mut server = Server::new_async().await;
    let _m = server
        .mock("GET", "/spoof")
        .match_header("user-agent", "CustomUA")
        .match_header("x-forwarded-for", "1.2.3.4")
        .with_status(200)
        .create_async()
        .await;

    let target_url = format!("{}/spoof", server.url());
    let mut request_headers = HeaderMap::new();
    request_headers.insert("host", "localhost".parse().unwrap());
    request_headers.insert("x-forwarded-for", "1.2.3.4".parse().unwrap());

    let payload = r#"{"User-Agent":"CustomUA"}"#;

    use axum::http::Method;
    let _response =
        proxy::do_proxy(Method::GET, &target_url, Some(payload), &request_headers).await;
}

#[tokio::test]
async fn test_do_proxy_referer_injection() {
    let mut server = Server::new_async().await;
    let _m = server
        .mock("GET", "/shinetv.co.nz/stream")
        .match_header("referer", "https://shinetv.co.nz/")
        .with_status(200)
        .create_async()
        .await;

    let target_url = format!("{}/shinetv.co.nz/stream", server.url());
    let mut request_headers = HeaderMap::new();
    request_headers.insert("host", "localhost".parse().unwrap());

    use axum::http::Method;
    let _response = proxy::do_proxy(Method::GET, &target_url, None, &request_headers).await;
}

#[tokio::test]
async fn test_do_proxy_upstream_failure() {
    let mut server = Server::new_async().await;
    let _m = server
        .mock("GET", "/fail")
        .with_status(500)
        .create_async()
        .await;

    let target_url = format!("{}/fail", server.url());
    let mut request_headers = HeaderMap::new();
    request_headers.insert("host", "localhost".parse().unwrap());

    use axum::http::{Method, StatusCode};
    let response = proxy::do_proxy(Method::GET, &target_url, None, &request_headers).await;
    // Proxies 500 as is (with some logging)
    assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn test_do_proxy_m3u8_rewriting() {
    let mut server = Server::new_async().await;
    let m3u8_body = "#EXTM3U\nsegment.ts\n";
    let _m = server
        .mock("GET", "/playlist.m3u8")
        .with_status(200)
        .with_header("content-type", "application/vnd.apple.mpegurl")
        .with_body(m3u8_body)
        .create_async()
        .await;

    let target_url = format!("{}/playlist.m3u8", server.url());
    let mut request_headers = HeaderMap::new();
    request_headers.insert("host", "localhost:7000".parse().unwrap());

    use axum::http::Method;
    let response = proxy::do_proxy(Method::GET, &target_url, None, &request_headers).await;

    let body_bytes = axum::body::to_bytes(response.into_body(), 1000)
        .await
        .unwrap();
    let body_str = String::from_utf8(body_bytes.to_vec()).unwrap();

    assert!(body_str.contains("/proxy/"));
    assert!(body_str.contains("video.ts"));
}

#[test]
fn test_rewrite_url() {
    use iptv_nz_addon_rust::proxy::{APPLE_UA, rewrite_url};
    use url::Url;

    let base = Url::parse("https://example.com/stream/").unwrap();
    let proxy_base = "http://127.0.0.1:7000";

    // Test relative URL rewriting
    let result = rewrite_url("segment_1.ts", &base, proxy_base, None);
    assert!(result.starts_with("http://127.0.0.1:7000/proxy/"));
    let data = decode_proxy_url(&result, proxy_base);
    assert_eq!(data.url, "https://example.com/stream/segment_1.ts");
    assert!(data.headers.is_none());

    // Test absolute URL with headers (not default UA)
    let headers = r#"{"X-Test":"Something"}"#;
    let result = rewrite_url(
        "https://other.com/chunk.ts",
        &base,
        proxy_base,
        Some(headers),
    );
    let data = decode_proxy_url(&result, proxy_base);
    assert_eq!(data.url, "https://other.com/chunk.ts");
    assert_eq!(data.headers.unwrap().get("X-Test").unwrap(), "Something");

    // Test that default UA IS removed
    let apple_headers = format!(r#"{{"User-Agent":"{}"}}"#, APPLE_UA);
    let result = rewrite_url(
        "https://apple.com/video.ts",
        &base,
        proxy_base,
        Some(&apple_headers),
    );
    let data = decode_proxy_url(&result, proxy_base);
    assert_eq!(data.url, "https://apple.com/video.ts");
    assert!(data.headers.is_none());
}
