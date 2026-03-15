//! New Zealand IPTV Stremio Addon.
//! This module defines the main Axum application, state management, and endpoint handlers.

pub mod iptv;
pub mod proxy;
pub mod tvmaze;

use axum::{
    Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Json, Redirect},
    routing::get,
};
use log::{debug, info};
use std::collections::HashMap;
use std::sync::Arc;
use stremio_core::types::addon::{Manifest, ManifestCatalog, ManifestResource};
use tower_http::cors::CorsLayer;
use url::Url;

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
    pub channel_cache: Arc<moka::future::Cache<String, Vec<iptv::ChannelMeta>>>,
    /// Cache for indexed channels (O(1) lookup).
    pub channel_map_cache: Arc<moka::future::Cache<String, HashMap<String, iptv::ChannelMeta>>>,
    /// Base URL for the M3U8 playlist.
    pub m3u8_url: String,
    /// Base URL for the EPG source.
    pub epg_url: String,
}

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
        .route("/api/image/{title}", get(image_enrichment_handler))
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

/// Handler for the Stremio manifest.json.
/// Populates the manifest with dynamic logo and background URLs.
async fn manifest_handler(headers: HeaderMap) -> impl IntoResponse {
    let mut manifest = Manifest {
        id: "stremio_iptv_id:nz".to_string(),
        version: semver::Version::new(1, 0, 0),
        name: "New Zealand TV".to_string(),
        description: Some("NZ TV channels with EPG data, show posters, and metadata. Derived from publicly available sources.".to_string()),
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

/// Serves the addon logo.
async fn logo_handler() -> impl IntoResponse {
    let bytes = include_bytes!("../logo.png");
    (
        [(axum::http::header::CONTENT_TYPE, "image/png")],
        bytes.as_slice(),
    )
}

/// Serves the addon background.
async fn background_handler() -> impl IntoResponse {
    let bytes = include_bytes!("../background.png");
    (
        [(axum::http::header::CONTENT_TYPE, "image/png")],
        bytes.as_slice(),
    )
}

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

/// Enriches a show title with artwork from TVMaze.
async fn image_enrichment_handler(
    State(state): State<AppState>,
    Path(params): Path<HashMap<String, String>>,
) -> impl IntoResponse {
    let title = params.get("title").cloned().unwrap_or_default();
    let title = urlencoding::decode(&title)
        .unwrap_or(std::borrow::Cow::Borrowed(&title))
        .to_string();

    let mut response_headers = HeaderMap::new();
    response_headers.insert(
        "Cache-Control",
        "max-age=86400, stale-while-revalidate=43200, public"
            .parse()
            .unwrap(),
    );

    if let Some(cached) = state.image_cache.get(&title).await {
        return (response_headers, Json(cached)).into_response();
    }

    if let Some(enriched) = state.tvmaze_client.fetch_show_images(&title).await {
        state.image_cache.insert(title, enriched.clone()).await;
        (response_headers, Json(enriched)).into_response()
    } else {
        let empty = tvmaze::ShowImages {
            poster: None,
            banner: None,
        };
        state.image_cache.insert(title, empty.clone()).await;
        (response_headers, Json(empty)).into_response()
    }
}

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
