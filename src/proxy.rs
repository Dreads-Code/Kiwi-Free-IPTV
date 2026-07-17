//! Transparent Proxy Engine for IPTV Streams.
//! This module provides the logic for proxying M3U8 and TS streams,
//! handling MJH handshakes, surgical identity swapping, and M3U8 rewriting.

use crate::utils::contains_ignore_ascii_case;

#[cfg(not(target_arch = "wasm32"))]
use crate::AppState;
#[cfg(not(target_arch = "wasm32"))]
use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
};
#[cfg(target_arch = "wasm32")]
pub type HeaderMap = std::collections::HashMap<String, String>;

use base64::Engine as _;

#[cfg(not(target_arch = "wasm32"))]
use log::{error, warn};

#[cfg(not(target_arch = "wasm32"))]
use reqwest::Client;
use std::collections::HashMap;
#[cfg(not(target_arch = "wasm32"))]
use std::str::FromStr;
use std::sync::OnceLock;
use url::Url;

static RE_URI: OnceLock<regex::Regex> = OnceLock::new();

/// Fallback public NZ IP used when no trusted client IP is available.
/// MJH's playlist server (i.mjh.nz) geo-restricts responses to NZ IPs, so we present
/// a known NZ address for the X-Forwarded-For handshake when we cannot determine the
/// real client IP from trusted proxy headers.
#[cfg(not(target_arch = "wasm32"))]
const MJH_FALLBACK_NZ_IP: &str = "210.54.34.12";

pub fn is_private_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(ipv4) => {
            ipv4.is_private() || ipv4.is_loopback() || ipv4.is_link_local() || ipv4.is_unspecified()
        }
        std::net::IpAddr::V6(ipv6) => {
            ipv6.is_loopback()
                || ipv6.is_unspecified()
                || (ipv6.segments()[0] & 0xff00) == 0xfe00
                || (ipv6.segments()[0] & 0xfe00) == 0xfc00
                || ipv6
                    .to_ipv4()
                    .map(|ip| {
                        ip.is_private()
                            || ip.is_loopback()
                            || ip.is_link_local()
                            || ip.is_unspecified()
                    })
                    .unwrap_or(false)
        }
    }
}

fn is_whitelisted_host(host: &str, whitelisted_domains: &[&str]) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();

    whitelisted_domains.iter().any(|domain| {
        host == *domain
            || host
                .strip_suffix(domain)
                .is_some_and(|prefix| prefix.ends_with('.'))
    })
}

pub fn is_safe_url(url_str: &str) -> bool {
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
            "tvmaze.com",
            "e-cast.co.nz",
        ];

        if is_whitelisted_host(host, &whitelisted_domains) {
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

#[cfg(not(target_arch = "wasm32"))]
/// Path-based proxy handler: `/proxy/{base64url-encoded JSON}`.
/// Decodes the payload and handles stream redirection or proxying.
pub async fn proxy_path_handler(
    State(state): State<AppState>,
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
                .body(Body::from("Invalid base64 encoding"))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
    };

    let data: ProxyPathData = match serde_json::from_slice(&decoded) {
        Ok(d) => d,
        Err(_) => {
            return Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .body(Body::from("Invalid JSON payload"))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
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
        if cfg!(debug_assertions) {
            log::info!(
                "[Stremio-Direct] Redirecting client directly to safe CDN: {}",
                data.url
            );
        }
        return Response::builder()
            .status(StatusCode::FOUND)
            .header("Location", &data.url)
            .body(Body::empty())
            .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
    }

    if cfg!(debug_assertions) {
        log::info!(
            "[Proxy] Forwarding request: url={}, is_browser={}",
            data.url,
            is_browser
        );
    }

    let headers_json = data
        .headers
        .as_ref()
        .map(|h| serde_json::to_string(h).unwrap_or_default());
    do_proxy(
        state.client.as_ref(),
        method,
        &data.url,
        headers_json.as_deref(),
        &request_headers,
    )
    .await
}

#[cfg(not(target_arch = "wasm32"))]
/// Handler for the legacy query-based proxy endpoint.
pub async fn proxy_handler(
    State(state): State<AppState>,
    method: Method,
    Query(query): Query<ProxyQuery>,
    request_headers: HeaderMap,
) -> impl IntoResponse {
    do_proxy(
        state.client.as_ref(),
        method,
        &query.url,
        query.headers.as_deref(),
        &request_headers,
    )
    .await
}

#[cfg(not(target_arch = "wasm32"))]
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

#[cfg(not(target_arch = "wasm32"))]
/// Executes the core proxy logic, including header injection and MJH handshake.
pub async fn do_proxy(
    client: &Client,
    method: Method,
    target_url: &str,
    headers_str: Option<&str>,
    request_headers: &HeaderMap,
) -> Response {
    let base_url = get_base_url(request_headers);

    let upstream_method = if method == Method::HEAD {
        Method::GET
    } else {
        method.clone()
    };

    let range_header = request_headers.get("range").cloned();

    let payload_headers_raw: HashMap<String, String> = headers_str
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    let mut payload_headers = HeaderMap::new();
    for (k, v) in payload_headers_raw {
        let name_lower = k.to_lowercase();
        // Prevent spoofing by stripping sensitive headers from the payload
        // We also block X-Forwarded-Host and Forwarded to prevent host/identity spoofing
        if name_lower == "x-forwarded-for"
            || name_lower == "x-real-ip"
            || name_lower == "host"
            || name_lower == "x-forwarded-host"
            || name_lower == "forwarded"
        {
            continue;
        }

        if let Ok(name) = HeaderName::from_str(&k)
            && let Ok(value) = HeaderValue::from_str(&v)
        {
            payload_headers.insert(name, value);
        }
    }

    if !is_safe_url(target_url) {
        warn!("Blocked unsafe proxy target: {}", target_url);
        return Response::builder()
            .status(StatusCode::FORBIDDEN)
            .body(Body::from("Access denied: Unsafe or unauthorized URL"))
            .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
    }

    // Only trust forwarding headers if we are running behind a known trusted proxy.
    // x-vercel-id is a hint that the request arrived via Vercel's edge network, but it is NOT
    // cryptographically verified — a direct connection could forge it. Treat it as a
    // best-effort signal, not a security boundary. IPTV_TRUST_PROXY_HEADERS provides an
    // explicit opt-in for other reverse-proxy deployments.
    let is_trusted = request_headers.contains_key("x-vercel-id")
        || std::env::var("IPTV_TRUST_PROXY_HEADERS")
            .map(|v| v != "0" && !v.eq_ignore_ascii_case("false"))
            .unwrap_or_default();

    let user_ip = if is_trusted {
        request_headers
            .get("x-real-ip")
            .or_else(|| request_headers.get("x-forwarded-for"))
            .and_then(|v| v.to_str().ok())
            // Take the LAST entry in X-Forwarded-For if multiple exist.
            // Attackers can prepend spoofed IPs, but trusted proxies append the real peer IP.
            .and_then(|v| v.split(',').next_back())
            .map(|s| s.trim())
            .filter(|ip| {
                if let Ok(parsed_ip) = ip.parse::<std::net::IpAddr>() {
                    !is_private_ip(parsed_ip)
                } else {
                    false
                }
            })
            .unwrap_or(MJH_FALLBACK_NZ_IP)
            .to_string()
    } else {
        // Not a trusted proxy environment: use the fallback NZ IP so the MJH geo-handshake
        // succeeds without relying on potentially spoofed client headers.
        MJH_FALLBACK_NZ_IP.to_string()
    };

    let mut current_url = target_url.to_string();

    // MJH Handshake: i.mjh.nz is sensitive to region/fingerprinting.
    if current_url.contains("i.mjh.nz") {
        let success_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

        if let Ok(res) = client
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
                        if cfg!(debug_assertions) {
                            log::info!("[MJH-Handshake] Resolving: {} -> {}", current_url, loc_str);
                        }
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

        // Surgical Identity Swap: Inject tactical headers based on target server.
        if is_mjh {
            req_builder = req_builder.header("User-Agent", BROWSER_UA);
        } else {
            let mut ua = payload_headers
                .get("user-agent")
                .and_then(|v| v.to_str().ok())
                .unwrap_or(APPLE_UA);
            if current_url.contains("e-cast.co.nz") {
                ua = BROWSER_UA;
            }
            let ua_val =
                HeaderValue::from_str(ua).unwrap_or_else(|_| HeaderValue::from_static(APPLE_UA));
            req_builder = req_builder.header("User-Agent", ua_val);

            if !current_url.contains("e-cast.co.nz")
                && let Ok(ip_val) = HeaderValue::from_str(&user_ip)
            {
                req_builder = req_builder.header("X-Forwarded-For", ip_val);
            }

            if current_url.contains("shinetv.co.nz") {
                req_builder = req_builder.header("Referer", "https://shinetv.co.nz/");
            } else if current_url.contains("fullscreen.nz") {
                req_builder = req_builder.header("Referer", "https://www.threenow.co.nz/");
            } else if current_url.contains("tvnz.co.nz") || current_url.contains("e-cast.co.nz") {
                req_builder = req_builder.header("Referer", "https://www.tvnz.co.nz/");
            }
        }

        if let Some(val) = &range_header {
            req_builder = req_builder.header("Range", val.clone());
        }

        for (name, value) in &payload_headers {
            if name == "user-agent" || name == "x-forwarded-for" {
                continue;
            }
            req_builder = req_builder.header(name.clone(), value.clone());
        }

        match req_builder.send().await {
            Ok(res) => {
                let status = res.status();
                if status.is_redirection()
                    && redirect_count < max_redirects
                    && let Some(loc) = res.headers().get("location")
                    && let Ok(loc_str) = loc.to_str()
                {
                    let base = match Url::parse(&current_url) {
                        Ok(b) => b,
                        Err(e) => {
                            error!("Failed to parse current URL for redirect resolution: {}", e);
                            break Ok(res); // Fallback to returning the redirect itself
                        }
                    };
                    if let Ok(next_url) = base.join(loc_str) {
                        let next_url_s = next_url.to_string();
                        if !is_safe_url(&next_url_s) {
                            warn!("Blocked unsafe redirect location: {}", next_url_s);
                            break Ok(res); // Return the redirect itself but don't follow
                        }
                        if cfg!(debug_assertions) {
                            log::info!("[Proxy-Redirect] {} -> {}", current_url, next_url_s);
                        }
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
                    .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
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
                        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
                    *response.headers_mut() = response_headers;
                    return response;
                }
            } else {
                if contains_ignore_ascii_case(&current_url, ".ts") {
                    response_headers.insert("content-type", HeaderValue::from_static("video/mp2t"));
                }
                let body = Body::from_stream(res.bytes_stream());
                let mut response = Response::builder()
                    .status(status)
                    .body(body)
                    .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
                *response.headers_mut() = response_headers;
                return response;
            }

            Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from("Failed to process stream"))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        Err(e) => {
            error!("Network error in proxy: {}", e);
            Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(Body::from("Upstream error"))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
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
    let re = RE_URI.get_or_init(|| {
        regex::Regex::new(r#"URI=(["'])([^"']+)["']"#).expect("Invalid regex for URI parsing")
    });

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

    let mut has_custom_headers = false;
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
            has_custom_headers = true;
        }
    }

    // Bandwidth Optimization: If it's a safe URL/CDN and NO custom headers are needed,
    // return the direct URL to offload transfer from Vercel to the destination CDN.
    // Only offload HTTPS URLs to prevent mixed-content blocks when running on an HTTPS player.
    if !has_custom_headers && is_safe_url(&resolved_url) && resolved_url.starts_with("https://") {
        let path_no_query = resolved_url.split('?').next().unwrap_or(&resolved_url);
        // We offload EVERYTHING except playlists (.m3u8).
        // This covers .ts, .m4s, .aac, and even extensionless segments (like Al Jazeera).
        if !contains_ignore_ascii_case(path_no_query, ".m3u8") {
            if cfg!(debug_assertions) {
                log::info!(
                    "[Offload] Direct play offload for safe URL: {}",
                    resolved_url
                );
            }
            return resolved_url;
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
