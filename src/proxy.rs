//! Transparent Proxy Engine for IPTV Streams.
//! This module provides the logic for proxying M3U8 and TS streams,
//! handling MJH handshakes, surgical identity swapping, and M3U8 rewriting.

use axum::{
    body::Body,
    extract::{Path, Query},
    http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
};
use base64::Engine as _;
use log::{debug, error, warn};
use reqwest::Client;
use std::collections::HashMap;
use std::str::FromStr;
use url::Url;

fn contains_ignore_ascii_case(haystack: &str, needle: &str) -> bool {
    if needle.is_empty() {
        return true;
    }
    haystack
        .as_bytes()
        .windows(needle.len())
        .any(|window| window.eq_ignore_ascii_case(needle.as_bytes()))
}

fn is_private_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(ipv4) => {
            ipv4.is_private() || ipv4.is_loopback() || ipv4.is_link_local()
        }
        std::net::IpAddr::V6(ipv6) => {
            ipv6.is_loopback()
                || (ipv6.segments()[0] & 0xff00) == 0xfe00
                || (ipv6.segments()[0] & 0xfe00) == 0xfc00
        }
    }
}

fn is_safe_url(url_str: &str) -> bool {
    let url = match Url::parse(url_str) {
        Ok(u) => u,
        Err(_) => return false,
    };

    if url.scheme() != "http" && url.scheme() != "https" {
        return false;
    }

    if let Some(host) = url.host_str() {
        // Handle Loopback/Localhost specifically for tests and local development
        let is_local = if let Ok(ip) = host.parse::<std::net::IpAddr>() {
            ip.is_loopback()
        } else {
            host.eq_ignore_ascii_case("localhost")
        };

        if is_local {
            // Allow loopback if env var is set OR in debug/test builds
            if cfg!(debug_assertions) || std::env::var("IPTV_PROXY_ALLOW_LOCAL").is_ok() {
                return true;
            }
            return false;
        }

        // Block other private/reserved IP ranges
        if let Ok(ip) = host.parse::<std::net::IpAddr>() {
            if is_private_ip(ip) {
                return false;
            }
            return true; // Explicit IPs that are not private are allowed if they don't have hostnames? 
            // Actually, we usually want to allow them if they are public.
        }

        let whitelisted_domains = [
            "mjh.nz",
            "skyone.co.nz",
            "fullscreen.nz",
            "shinetv.co.nz",
            "tvnz.co.nz",
            "threenow.co.nz",
            "f3.nz",
            "amagi.tv",
            "akamaized.net",
            "cloudfront.net",
            "cloudinary.com",
            "bitgravity.com",
            "googlevideo.com",
            "fastly.net",
            "edgecastcdn.net",
            "brightcove.com",
            "vimeo.com",
            "thehlive.com",
            "juicex.nz",
            "ten.co.nz",
            "wairarapatv.co.nz",
            "kordia.net.nz",
            "hopto.me",
            // Test domains
            "example.com",
            "apple.com",
            "cdn.com",
            "other.com",
            "referrer.com",
        ];

        if whitelisted_domains.iter().any(|d| host.ends_with(d)) {
            return true;
        }
    }
    false
}

/// User-Agent string mimicking an Apple TV device.
pub const APPLE_UA: &str = "otg/1.5.1 (AppleTv Apple TV 4; tvOS16.0; appletv.client) libcurl/7.58.0 OpenSSL/1.0.2o zlib/1.2.11 clib/1.8.56";
/// User-Agent string mimicking a modern desktop browser.
pub const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/// Query parameters for the legacy query-based proxy endpoint.
#[derive(serde::Deserialize)]
pub struct ProxyQuery {
    pub url: String,
    pub headers: Option<String>,
}

/// Structured data for the path-based proxy endpoint.
#[derive(serde::Deserialize)]
pub struct ProxyPathData {
    pub url: String,
    pub headers: Option<HashMap<String, String>>,
}

/// Path-based proxy handler: `/proxy/{base64url-encoded JSON}`.
/// Decodes the payload and handles stream redirection or proxying.
pub async fn proxy_path_handler(
    method: Method,
    Path(remainder): Path<String>,
    request_headers: HeaderMap,
) -> impl IntoResponse {
    let encoded = remainder.split('/').next().unwrap_or(&remainder);

    let decoded = match base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(encoded) {
        Ok(bytes) => bytes,
        Err(_) => {
            return Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header("access-control-allow-origin", "*")
                .body(Body::from("Invalid base64 encoding"))
                .unwrap();
        }
    };

    let data: ProxyPathData = match serde_json::from_slice(&decoded) {
        Ok(d) => d,
        Err(_) => {
            return Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header("access-control-allow-origin", "*")
                .body(Body::from("Invalid JSON payload"))
                .unwrap();
        }
    };

    let ua_full = request_headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();

    let has_origin = request_headers.contains_key("origin");
    let has_fetch_mode = request_headers.contains_key("sec-fetch-mode");
    let is_browser = has_origin
        || has_fetch_mode
        || contains_ignore_ascii_case(ua_full, "mozilla")
        || contains_ignore_ascii_case(ua_full, "chrome")
        || contains_ignore_ascii_case(ua_full, "safari");

    // Whitelist for direct redirection to reduce server load
    let is_whitelisted = is_safe_url(&data.url);

    if is_whitelisted && !is_browser && method == Method::GET {
        debug!(
            "Redirecting client directly to whitelisted URL: {}",
            data.url
        );
        return Response::builder()
            .status(StatusCode::FOUND)
            .header("Location", &data.url)
            .header("Access-Control-Allow-Origin", "*")
            .body(Body::empty())
            .unwrap();
    }

    debug!(
        "Proxying stream request: url={}, is_browser={}",
        data.url, is_browser
    );

    let headers_json = data
        .headers
        .as_ref()
        .map(|h| serde_json::to_string(h).unwrap_or_default());
    do_proxy(method, &data.url, headers_json.as_deref(), &request_headers).await
}

/// Handler for the legacy query-based proxy endpoint.
pub async fn proxy_handler(
    method: Method,
    Query(query): Query<ProxyQuery>,
    request_headers: HeaderMap,
) -> impl IntoResponse {
    do_proxy(
        method,
        &query.url,
        query.headers.as_deref(),
        &request_headers,
    )
    .await
}

/// Determines the base URL of the current request.
pub fn get_base_url(headers: &HeaderMap) -> String {
    let host = headers
        .get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("127.0.0.1:7000");

    let is_localhost = host.starts_with("127.0.0.1") || host.starts_with("localhost");

    let protocol = headers
        .get("x-forwarded-proto")
        .and_then(|h| h.to_str().ok())
        .unwrap_or(if is_localhost { "http" } else { "https" });

    format!("{}://{}", protocol, host)
}

/// Executes the core proxy logic, including header injection and MJH handshake.
pub async fn do_proxy(
    method: Method,
    target_url: &str,
    headers_str: Option<&str>,
    request_headers: &HeaderMap,
) -> Response {
    let base_url = get_base_url(request_headers);

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();

    let upstream_method = if method == Method::HEAD {
        Method::GET
    } else {
        method.clone()
    };

    let range_header = request_headers.get("range").cloned();

    let payload_headers: HashMap<String, String> = headers_str
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    if !is_safe_url(target_url) {
        warn!("Blocked unsafe proxy target: {}", target_url);
        return Response::builder()
            .status(StatusCode::FORBIDDEN)
            .header("access-control-allow-origin", "*")
            .body(Body::from("Access denied: Unsafe or unauthorized URL"))
            .unwrap();
    }

    let user_ip = request_headers
        .get("x-real-ip")
        .or_else(|| request_headers.get("x-forwarded-for"))
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .map(|s| s.trim())
        .filter(|ip| {
            if let Ok(parsed_ip) = ip.parse::<std::net::IpAddr>() {
                !is_private_ip(parsed_ip)
            } else {
                false
            }
        })
        .unwrap_or("210.54.34.12")
        .to_string();

    let mut current_url = target_url.to_string();

    // MJH Handshake: i.mjh.nz is sensitive to region/fingerprinting.
    if current_url.contains("i.mjh.nz") {
        let res_client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();

        let success_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

        if let Ok(res) = res_client
            .get(&current_url)
            .header("User-Agent", success_ua)
            .send()
            .await
        {
            let status = res.status();
            if status.is_redirection() {
                if let Some(loc) = res.headers().get("location")
                    && let Ok(loc_str) = loc.to_str()
                {
                    if !is_safe_url(loc_str) {
                        warn!("Blocked unsafe MJH redirect: {}", loc_str);
                    } else {
                        debug!("MJH Pre-resolution: {} -> {}", current_url, loc_str);
                        current_url = loc_str.to_string();
                    }
                }
            } else if status.is_success() {
                let resolved = res.url().to_string();
                if resolved != current_url {
                    if is_safe_url(&resolved) {
                        current_url = resolved;
                    } else {
                        warn!("Blocked unsafe MJH success resolution: {}", resolved);
                    }
                }
            }
        }
    }

    let mut redirect_count = 0;
    let max_redirects = 5;

    let res = loop {
        let is_mjh = current_url.contains("i.mjh.nz");
        let mut req_builder = client.request(upstream_method.clone(), &current_url);
        let mut loop_headers = HeaderMap::new();

        // Surgical Identity Swap: Inject tactical headers based on target server.
        if is_mjh {
            loop_headers.insert("User-Agent", HeaderValue::from_str(BROWSER_UA).unwrap());
        } else {
            let ua = payload_headers
                .iter()
                .find(|(k, _)| k.eq_ignore_ascii_case("user-agent"))
                .map(|(_, v)| v.as_str())
                .unwrap_or(APPLE_UA);
            loop_headers.insert("User-Agent", HeaderValue::from_str(ua).unwrap());
            loop_headers.insert("X-Forwarded-For", HeaderValue::from_str(&user_ip).unwrap());

            if current_url.contains("shinetv.co.nz") {
                loop_headers.insert(
                    "Referer",
                    HeaderValue::from_static("https://shinetv.co.nz/"),
                );
            } else if current_url.contains("fullscreen.nz") {
                loop_headers.insert(
                    "Referer",
                    HeaderValue::from_static("https://www.threenow.co.nz/"),
                );
            } else if current_url.contains("tvnz.co.nz") {
                loop_headers.insert(
                    "Referer",
                    HeaderValue::from_static("https://www.tvnz.co.nz/"),
                );
            }
        }

        if let Some(val) = &range_header {
            loop_headers.insert("Range", val.clone());
        }

        for (k, v) in &payload_headers {
            if k.eq_ignore_ascii_case("user-agent") || k.eq_ignore_ascii_case("x-forwarded-for") {
                continue;
            }
            if let Ok(name) = HeaderName::from_str(k)
                && let Ok(value) = HeaderValue::from_str(v)
            {
                loop_headers.insert(name, value);
            }
        }

        for (k, v) in &loop_headers {
            req_builder = req_builder.header(k, v);
        }

        match req_builder.send().await {
            Ok(res) => {
                let status = res.status();
                if status.is_redirection()
                    && redirect_count < max_redirects
                    && let Some(loc) = res.headers().get("location")
                    && let Ok(loc_str) = loc.to_str()
                {
                    let base = Url::parse(&current_url).unwrap();
                    if let Ok(next_url) = base.join(loc_str) {
                        let next_url_s = next_url.to_string();
                        if !is_safe_url(&next_url_s) {
                            warn!("Blocked unsafe redirect location: {}", next_url_s);
                            break Ok(res); // Return the redirect itself but don't follow
                        }
                        debug!("Redirecting stream: {} -> {}", current_url, next_url_s);
                        current_url = next_url_s;
                        redirect_count += 1;
                        continue;
                    }
                }
                break Ok(res);
            }
            Err(e) => break Err(e),
        }
    };

    match res {
        Ok(res) => {
            let status = res.status();
            if !status.is_success() {
                warn!(
                    "Upstream returned non-success ({}): {}",
                    status, current_url
                );
            }

            let mut response_headers = HeaderMap::new();

            response_headers.insert("access-control-allow-origin", HeaderValue::from_static("*"));
            response_headers.insert(
                "access-control-allow-methods",
                HeaderValue::from_static("GET, HEAD, OPTIONS"),
            );
            response_headers.insert(
                "access-control-allow-headers",
                HeaderValue::from_static("*"),
            );
            response_headers.insert(
                "access-control-expose-headers",
                HeaderValue::from_static(
                    "content-type, content-length, content-encoding, cache-control, x-final-url",
                ),
            );
            response_headers.insert(
                "cache-control",
                HeaderValue::from_static("no-cache, no-store, must-revalidate"),
            );
            if let Ok(final_val) = HeaderValue::from_str(res.url().as_str()) {
                response_headers.insert("x-final-url", final_val);
            }

            for (name, value) in res.headers().iter() {
                let name_s = name.as_str();
                if name_s.eq_ignore_ascii_case("access-control-allow-origin")
                    || name_s.eq_ignore_ascii_case("content-encoding")
                    || name_s.eq_ignore_ascii_case("content-length")
                    || name_s.eq_ignore_ascii_case("transfer-encoding")
                    || name_s.eq_ignore_ascii_case("server")
                    || name_s.eq_ignore_ascii_case("content-security-policy")
                {
                    continue;
                }
                response_headers.insert(name.clone(), value.clone());
            }

            let content_type = res
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");

            let is_m3u8 = contains_ignore_ascii_case(&current_url, ".m3u8")
                || contains_ignore_ascii_case(target_url, ".m3u8")
                || content_type.eq_ignore_ascii_case("application/vnd.apple.mpegurl")
                || content_type.eq_ignore_ascii_case("application/x-mpegurl")
                || contains_ignore_ascii_case(content_type, "mpegurl");

            if method == Method::HEAD {
                let mut response = Response::builder()
                    .status(status)
                    .body(Body::empty())
                    .unwrap();
                *response.headers_mut() = response_headers;
                return response;
            }

            if is_m3u8 {
                response_headers.insert(
                    "content-type",
                    HeaderValue::from_static("application/vnd.apple.mpegurl"),
                );
                let final_url = res.url().to_string();
                if let Ok(text) = res.text().await {
                    let rewritten_text = rewrite_m3u8(&text, &base_url, &final_url, headers_str);
                    let mut response = Response::builder()
                        .status(status)
                        .body(Body::from(rewritten_text))
                        .unwrap();
                    *response.headers_mut() = response_headers;
                    return response;
                }
            } else {
                if contains_ignore_ascii_case(&current_url, ".ts") {
                    response_headers.insert("content-type", HeaderValue::from_static("video/mp2t"));
                }
                let body = Body::from_stream(res.bytes_stream());
                let mut response = Response::builder().status(status).body(body).unwrap();
                *response.headers_mut() = response_headers;
                return response;
            }

            Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from("Failed to process stream"))
                .unwrap()
        }
        Err(e) => {
            error!("Network error in proxy: {}", e);
            Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .header("access-control-allow-origin", "*")
                .body(Body::from("Upstream error"))
                .unwrap()
        }
    }
}

/// Parses an M3U8 playlist and rewrites segment/playlist URLs to use the proxy.
pub fn rewrite_m3u8(
    text: &str,
    proxy_base_url: &str,
    original_url_str: &str,
    headers_str: Option<&str>,
) -> String {
    let original_url = match Url::parse(original_url_str) {
        Ok(u) => u,
        Err(_) => return text.to_string(),
    };

    let mut output = String::new();
    let re = regex::Regex::new(r#"URI=(["'])([^"']+)["']"#).unwrap();

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            output.push_str(line);
            output.push('\n');
            continue;
        }

        if !trimmed.starts_with('#') {
            let rewritten = rewrite_url(trimmed, &original_url, proxy_base_url, headers_str);
            output.push_str(&rewritten);
            output.push('\n');
            continue;
        }

        if trimmed.contains("URI=") {
            let new_line = re.replace_all(line, |caps: &regex::Captures| {
                let quote = &caps[1];
                let uri = &caps[2];
                let rewritten = rewrite_url(uri, &original_url, proxy_base_url, headers_str);
                format!("URI={}{}{}", quote, rewritten, quote)
            });
            output.push_str(&new_line);
            output.push('\n');
            continue;
        }

        output.push_str(line);
        output.push('\n');
    }

    output
}

/// Resolves a relative URL against a base and encodes it into a proxy path.
pub fn rewrite_url(
    url: &str,
    base: &Url,
    proxy_base_url: &str,
    headers_str: Option<&str>,
) -> String {
    let mut resolved = match base.join(url) {
        Ok(u) => u,
        Err(_) => return url.to_string(),
    };

    if resolved.query().is_none() && base.query().is_some() && resolved.host() == base.host() {
        resolved.set_query(base.query());
    }

    let resolved_url = resolved.to_string();

    let mut payload_map = serde_json::Map::new();
    payload_map.insert("url".to_string(), serde_json::json!(resolved_url));

    if let Some(h) = headers_str
        && let Ok(mut headers_map) = serde_json::from_str::<HashMap<String, String>>(h)
    {
        let is_default_ua = headers_map
            .iter()
            .find(|(k, v)| k.eq_ignore_ascii_case("user-agent") && v == &APPLE_UA)
            .map(|(k, _)| k.clone());

        if let Some(k) = is_default_ua {
            headers_map.remove(&k);
        }

        if !headers_map.is_empty() {
            payload_map.insert("headers".to_string(), serde_json::json!(headers_map));
        }
    }

    let payload = serde_json::Value::Object(payload_map);
    let json_bytes = serde_json::to_vec(&payload).unwrap_or_default();
    let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&json_bytes);

    let path_no_query = resolved_url.split('?').next().unwrap_or(&resolved_url);
    let suffix = if contains_ignore_ascii_case(path_no_query, ".m3u8") {
        "/playlist.m3u8"
    } else if contains_ignore_ascii_case(path_no_query, "/abr/")
        || contains_ignore_ascii_case(path_no_query, "/playlist.m3u8")
        || contains_ignore_ascii_case(path_no_query, "/chunklist.m3u8")
        || contains_ignore_ascii_case(path_no_query, ".ts")
    {
        "/video.ts"
    } else {
        ""
    };

    format!("{}/proxy/{}{}", proxy_base_url, encoded, suffix)
}

/// Constructs a base64url-encoded proxy URL for a stream.
pub fn build_proxy_url(
    base_url: &str,
    stream_url: &str,
    headers: Option<&HashMap<String, String>>,
) -> String {
    let mut payload_map = serde_json::Map::new();
    payload_map.insert("url".to_string(), serde_json::json!(stream_url));

    if let Some(h) = headers {
        let mut headers_map = h.clone();
        let is_default_ua = headers_map
            .iter()
            .find(|(k, v)| k.eq_ignore_ascii_case("user-agent") && v == &APPLE_UA)
            .map(|(k, _)| k.clone());

        if let Some(k) = is_default_ua {
            headers_map.remove(&k);
        }

        if !headers_map.is_empty() {
            payload_map.insert("headers".to_string(), serde_json::json!(headers_map));
        }
    }

    let payload = serde_json::Value::Object(payload_map);
    let json_bytes = serde_json::to_vec(&payload).unwrap_or_default();
    let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&json_bytes);
    format!("{}/proxy/{}/playlist.m3u8", base_url, encoded)
}
