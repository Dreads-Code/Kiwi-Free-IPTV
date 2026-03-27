//! New Zealand IPTV Stremio Addon.
//! This module defines the main Axum application, state management, and endpoint handlers.

pub mod iptv;
pub mod proxy;
pub mod tvmaze;

#[cfg(target_arch = "wasm32")]
pub mod wasm;

#[cfg(not(target_arch = "wasm32"))]
use axum::{
    Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Json, Redirect},
    routing::get,
};
#[cfg(not(target_arch = "wasm32"))]
use log::{debug, info};
#[cfg(not(target_arch = "wasm32"))]
use std::collections::HashMap;
#[cfg(not(target_arch = "wasm32"))]
use std::sync::Arc;
#[cfg(not(target_arch = "wasm32"))]
use stremio_core::types::addon::{Manifest, ManifestCatalog, ManifestResource};
#[cfg(not(target_arch = "wasm32"))]
use tower_http::cors::CorsLayer;
#[cfg(not(target_arch = "wasm32"))]
use url::Url;

#[cfg(not(target_arch = "wasm32"))]
/// Shared application state containing caches and external service clients.
#[derive(Clone)]
pub struct AppState {
    /// Cache for M3U8 stream playlists.
    pub stream_cache: Arc<moka::future::Cache<String, String>>,
    /// Cache for EPG XML data.
    pub epg_cache: Arc<moka::future::Cache<String, String>>,
    /// Cache for enriched show images (posters/banners).
    pub image_cache: Arc<moka::future::Cache<String, tvmaze::ShowImages>>,
    /// Client for TVMaze API integration.
    pub tvmaze_client: Arc<tvmaze::TvMazeClient>,
    /// Cache for processed channel lists.
    pub channel_cache: Arc<moka::future::Cache<String, Arc<Vec<iptv::ChannelMeta>>>>,
    /// Cache for individual channels indexed by ID (O(1) lookup).
    pub channel_map_cache: Arc<moka::future::Cache<String, iptv::ChannelMeta>>,
    /// Base URL for the M3U8 playlist.
    pub m3u8_url: String,
    /// Base URL for the EPG source.
    pub epg_url: String,
}

#[cfg(not(target_arch = "wasm32"))]
/// Constructs and configures the Axum Router for the addon.
/// Includes routes for the manifest, proxy, and Stremio resources.
pub fn build_router() -> Router {
    // Configure caches with appropriate TTLs
    let stream_cache = Arc::new(
        moka::future::Cache::builder()
            .time_to_live(std::time::Duration::from_secs(3600)) // 1 hour for streams
            .build(),
    );

    let epg_cache = Arc::new(
        moka::future::Cache::builder()
            .time_to_live(std::time::Duration::from_secs(86400)) // 24 hours for EPG
            .build(),
    );

    let image_cache = Arc::new(
        moka::future::Cache::builder()
            .time_to_live(std::time::Duration::from_secs(86400 * 7)) // 7 days for images
            .build(),
    );

    let tvmaze_client = Arc::new(tvmaze::TvMazeClient::new());

    let channel_cache = Arc::new(
        moka::future::Cache::builder()
            .time_to_live(std::time::Duration::from_secs(3600))
            .build(),
    );

    let channel_map_cache = Arc::new(
        moka::future::Cache::builder()
            .time_to_live(std::time::Duration::from_secs(3600))
            .build(),
    );

    let state = AppState {
        stream_cache,
        epg_cache,
        image_cache,
        tvmaze_client,
        channel_cache,
        channel_map_cache,
        m3u8_url: iptv::M3U8_URL.to_string(),
        epg_url: iptv::EPG_URL.to_string(),
    };

    Router::new()
        .route("/ping", get(|| async { "pong" }))
        .route(
            "/proxy",
            get(proxy::proxy_handler).head(proxy::proxy_handler),
        )
        .route(
            "/proxy/{*remainder}",
            get(proxy::proxy_path_handler).head(proxy::proxy_path_handler),
        )
        .route("/", get(|| async { Redirect::temporary("/configure") }))
        .route("/manifest.json", get(manifest_handler))
        .route("/logo.png", get(logo_handler))
        .route("/background.png", get(background_handler))
        .route("/api/data", get(data_handler))
        .route("/api/fetch", get(fetch_pass_through_handler))
        // Stremio resource routes
        .route("/{resource}/{type}/{id}/{extra}", get(resource_handler))
        .route("/{resource}/{type}/{id}", get(resource_handler))
        .fallback(|req: axum::extract::Request| async move {
            let path = req.uri().path().to_string();
            debug!("Fallback: route not found for path: {}", path);
            (
                axum::http::StatusCode::NOT_FOUND,
                format!("404 Not Found - {}", path),
            )
        })
        .layer(CorsLayer::permissive())
        .with_state(state)
}

#[cfg(not(target_arch = "wasm32"))]
/// Handler for the Stremio manifest.json.
/// Populates the manifest with dynamic logo and background URLs.
async fn manifest_handler(headers: HeaderMap) -> impl IntoResponse {
    let mut manifest = Manifest {
        id: "stremio_iptv_id:nz".to_string(),
        version: semver::Version::new(1, 1, 0),
        name: "New Zealand TV".to_string(),
        description: Some("Free-to-air New Zealand TV that provides rich metadata, show posters, IMDb ratings, genres, and age classifications. Huge thanks to https://www.matthuisman.nz/".to_string()),
        id_prefixes: Some(vec![
            "stremio_iptv_id:".to_string(), 
            "stremio_iptv_id:mjh-".to_string(),
            "stremio_iptv_id:mjh".to_string(),
        ]),
        resources: vec![
            ManifestResource::Short("catalog".to_string()),
            ManifestResource::Short("meta".to_string()),
            ManifestResource::Short("stream".to_string()),
        ],
        types: vec!["tv".to_string()],
        catalogs: vec![
            ManifestCatalog {
                r#type: "tv".to_string(),
                id: "stremio_iptv_id:nz".to_string(),
                name: Some("New Zealand TV".to_string()),
                extra: Default::default(),
            }
        ],
        addon_catalogs: vec![],
        contact_email: Some("dreads.code@gmail.com".to_string()),
        background: None,
        logo: None,
        behavior_hints: stremio_core::types::addon::ManifestBehaviorHints {
            configuration_required: false,
            ..Default::default()
        },
    };

    let base_url = proxy::get_base_url(&headers);

    if let Ok(url) = Url::parse(&format!("{}/logo.png", base_url)) {
        manifest.logo = Some(url);
    }
    if let Ok(url) = Url::parse(&format!("{}/background.png", base_url)) {
        manifest.background = Some(url);
    }

    let mut response_headers = HeaderMap::new();
    response_headers.insert("Cache-Control", "max-age=86400, public".parse().unwrap());

    (response_headers, Json(manifest))
}

#[cfg(not(target_arch = "wasm32"))]
/// Serves the addon logo.
async fn logo_handler() -> impl IntoResponse {
    let bytes = include_bytes!("../logo.png");
    (
        [(axum::http::header::CONTENT_TYPE, "image/png")],
        bytes.as_slice(),
    )
}

#[cfg(not(target_arch = "wasm32"))]
/// Serves the addon background.
async fn background_handler() -> impl IntoResponse {
    let bytes = include_bytes!("../background.png");
    (
        [(axum::http::header::CONTENT_TYPE, "image/png")],
        bytes.as_slice(),
    )
}

#[cfg(not(target_arch = "wasm32"))]
/// Returns the raw channel data, primarily for internal dashboard use.
async fn data_handler(State(state): State<AppState>) -> impl IntoResponse {
    let mut response_headers = HeaderMap::new();
    response_headers.insert(
        "Cache-Control",
        "s-maxage=60, stale-while-revalidate=30, max-age=0, public"
            .parse()
            .unwrap(),
    );

    match iptv::fetch_data(&state).await {
        Ok(metas) => (response_headers, Json(metas)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            response_headers,
            e.to_string(),
        )
            .into_response(),
    }
}

#[cfg(not(target_arch = "wasm32"))]
/// Pass-through proxy that adds CORS headers to any requested URL.
/// Used as a fallback for browser-side WASM fetches.
async fn fetch_pass_through_handler(
    axum::extract::Query(query): axum::extract::Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let url = query.get("url").cloned().unwrap_or_default();
    if url.is_empty() {
        return (StatusCode::BAD_REQUEST, "Missing url parameter").into_response();
    }

    // Safety check: only allow known safe domains (like mjh.nz or github)
    if !proxy::is_safe_url(&url) {
        return (StatusCode::FORBIDDEN, "Unsafe URL").into_response();
    }

    let client = reqwest::Client::new();
    match client.get(&url).send().await {
        Ok(res) => {
            let status = res.status();
            let mut headers = HeaderMap::new();
            // Critical: Add CORS headers so the browser can read the response
            headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
            headers.insert(
                "Access-Control-Allow-Methods",
                "GET, OPTIONS".parse().unwrap(),
            );

            if let Some(ct) = res.headers().get("content-type") {
                headers.insert("Content-Type", ct.clone());
            }

            let body = match res.bytes().await {
                Ok(b) => b,
                Err(e) => {
                    return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
                }
            };

            if cfg!(debug_assertions) {
                log::info!(
                    "[CORS-Proxy] Forwarding {} for frontend (Size: {:.2} KB)",
                    url,
                    body.len() as f64 / 1024.0
                );
            }

            (status, headers, body).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[cfg(not(target_arch = "wasm32"))]
/// Primary handler for Stremio resource requests (catalog, meta, stream).
async fn resource_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(params): Path<HashMap<String, String>>,
) -> impl IntoResponse {
    let resource = params.get("resource").cloned().unwrap_or_default();
    let type_name = params.get("type").cloned().unwrap_or_default();
    let mut id = params.get("id").cloned().unwrap_or_default();

    // Clean up ID suffix if Stremio sends it (e.g., .json)
    if id.ends_with(".json") {
        id = id.trim_end_matches(".json").to_string();
    }

    let id = id.replace("%3A", ":");
    info!(
        "Processing Stremio request: resource={}, type={}, id={}",
        resource, type_name, id
    );

    let mut response_headers = HeaderMap::new();
    response_headers.insert(
        "Cache-Control",
        "s-maxage=60, stale-while-revalidate=30, max-age=0, public"
            .parse()
            .unwrap(),
    );

    if type_name != "tv" {
        return (
            StatusCode::OK,
            response_headers,
            Json(serde_json::json!({})),
        )
            .into_response();
    }

    match resource.as_str() {
        "catalog" => {
            let metas = iptv::catalog(&state)
                .await
                .unwrap_or_else(|_| serde_json::json!([]));
            (
                response_headers,
                Json(serde_json::json!({ "metas": metas })),
            )
                .into_response()
        }
        "meta" => {
            let meta = iptv::meta(&state, &id).await.unwrap_or_else(|e| {
                debug!("Metadata lookup failed for {}: {}", id, e);
                None
            });
            (response_headers, Json(serde_json::json!({ "meta": meta }))).into_response()
        }
        "stream" => {
            let base_url = proxy::get_base_url(&headers);
            let streams = iptv::stream(&state, &id, &base_url)
                .await
                .unwrap_or_else(|_| serde_json::json!([]));
            (
                response_headers,
                Json(serde_json::json!({ "streams": streams })),
            )
                .into_response()
        }
        _ => (
            StatusCode::OK,
            response_headers,
            Json(serde_json::json!({})),
        )
            .into_response(),
    }
}
