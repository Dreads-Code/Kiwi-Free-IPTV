//! IPTV Data Management and Stremio Resource Handlers.
//! This module handles fetching, parsing, and caching of M3U8 and EPG data,
//! as well as formatting it for the Stremio Addon API.

#[cfg(not(target_arch = "wasm32"))]
use crate::AppState;
#[cfg(not(target_arch = "wasm32"))]
use crate::tvmaze::process_epg_icon_url;
#[cfg(not(target_arch = "wasm32"))]
use futures::stream::{self, StreamExt};

use log::error;
#[cfg(not(target_arch = "wasm32"))]
use log::{info, warn};
use quick_xml::de::from_str;
#[cfg(not(target_arch = "wasm32"))]
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

/// Hardcoded source URL for the M3U8 playlist.
pub const M3U8_URL: &str = "https://i.mjh.nz/nz/raw-tv.m3u8";
/// Hardcoded source URL for the EPG XML data.
pub const EPG_URL: &str = "https://i.mjh.nz/nz/epg.xml";

static RE_TVG_ID: OnceLock<regex::Regex> = OnceLock::new();
static RE_TVG_LOGO: OnceLock<regex::Regex> = OnceLock::new();

#[cfg(not(target_arch = "wasm32"))]
const CHANNEL_CACHE_KEY: &str = "data";
#[cfg(not(target_arch = "wasm32"))]
const CATALOG_META_CONCURRENCY: usize = 8;

/// Internal representation of the EPG XML structure.
#[derive(Debug, Deserialize, Serialize, Clone)]
struct Tv {
    #[serde(rename = "channel", default)]
    channels: Vec<EpgChannel>,
    #[serde(rename = "programme", default)]
    programmes: Vec<EpgProgramme>,
}

/// A channel entry within the EPG.
#[derive(Debug, Deserialize, Serialize, Clone)]
struct EpgChannel {
    #[serde(rename = "@id")]
    id: String,
    icon: Option<EpgIcon>,
}

/// Icon metadata from the EPG.
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct EpgIcon {
    #[serde(alias = "@src")]
    pub src: String,
}

/// Age rating or star rating metadata from the EPG.
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct EpgRating {
    pub value: Option<String>,
}

/// A single program entry in the EPG schedule.
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct EpgProgramme {
    #[serde(alias = "@start")]
    pub start: String,
    #[serde(alias = "@stop")]
    pub stop: String,
    #[serde(alias = "@channel")]
    pub channel: String,
    pub title: Option<String>,
    pub desc: Option<String>,
    pub icon: Option<EpgIcon>,
    #[serde(default)]
    pub category: Vec<String>,
    pub date: Option<String>,
    pub rating: Option<EpgRating>,
    #[serde(alias = "star-rating")]
    pub star_rating: Option<EpgRating>,
}

/// Unified metadata structure for a channel and its current programming.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChannelMeta {
    pub id: String,
    pub name: String,
    pub name_lower: String,
    pub type_name: String,
    pub poster: Option<String>,
    pub poster_shape: String,
    pub background: Option<String>,
    pub logo: Option<String>,
    pub description: String,
    pub url: String,
    pub category: String,
    #[serde(default)]
    pub programmes: Arc<Vec<EpgProgramme>>,
    #[serde(default)]
    pub http_headers: Option<HashMap<String, String>>,
}

#[cfg(not(target_arch = "wasm32"))]
/// Makes an HTTP GET request with a retry mechanism.
/// Retries for both network errors and non-success HTTP status codes.
pub async fn make_request(
    client: &Client,
    url: &str,
    retries: u32,
) -> Result<String, reqwest::Error> {
    let mut attempt = 0;
    loop {
        match client
            .get(url)
            .send()
            .await
            .and_then(|r| r.error_for_status())
        {
            Ok(res) => return res.text().await,
            Err(e) => {
                if attempt >= retries {
                    return Err(e);
                }
                warn!(
                    "Attempt {} failed for {}: {}. Retrying...",
                    attempt + 1,
                    url,
                    e
                );
                attempt += 1;
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            }
        }
    }
}

/// Categorizes a channel based on its pre-lowercased name and potential headers.
pub fn categorize_channel(name_lower: &str, _headers: &Option<HashMap<String, String>>) -> String {
    let sports_keywords = [
        "sport",
        "trackside",
        "redbull",
        "sailgp",
        "motogp",
        "sky open",
    ];
    if sports_keywords.iter().any(|k| name_lower.contains(k)) {
        return "Sports".to_string();
    }

    let news_keywords = ["news", "al jazeera", "cnn", "dw english", "parliament tv"];
    if news_keywords.iter().any(|k| name_lower.contains(k)) {
        return "News".to_string();
    }

    let religious_keywords = ["shine", "hope channel", "firstlight"];
    if religious_keywords.iter().any(|k| name_lower.contains(k)) {
        return "Religious".to_string();
    }

    let nz_networks = ["tvnz", "discovery", "māori"];
    if nz_networks.iter().any(|k| name_lower.contains(k)) {
        return "New Zealand".to_string();
    }

    let nz_channel_names = [
        "whakaata māori",
        "te reo",
        "three",
        "eden",
        "duke",
        "rush",
        "bravo",
        "wairarapa tv",
    ];
    if nz_channel_names.iter().any(|k| name_lower.starts_with(k)) {
        return "New Zealand".to_string();
    }

    "International".to_string()
}

/// Core logic to parse M3U8 and EPG into consolidated ChannelMeta.
/// This is platform-agnostic and can run in WASM.
pub fn parse_channels(m3u8_text: &str, epg_text: &str) -> Vec<ChannelMeta> {
    let epg: Tv = match from_str(epg_text) {
        Ok(epg) => epg,
        Err(e) => {
            error!("Failed to parse EPG XML: {}", e);
            Tv {
                channels: vec![],
                programmes: vec![],
            }
        }
    };

    let mut epg_map = HashMap::new();
    for c in epg.channels {
        epg_map.insert(c.id.clone(), c);
    }

    let mut programmes_map: HashMap<String, Vec<EpgProgramme>> = HashMap::new();
    for p in epg.programmes {
        programmes_map.entry(p.channel.clone()).or_default().push(p);
    }
    let programmes_map: HashMap<String, Arc<Vec<EpgProgramme>>> = programmes_map
        .into_iter()
        .map(|(channel, programmes)| (channel, Arc::new(programmes)))
        .collect();

    let mut channels = Vec::new();

    let mut current_tvg_id = None;
    let mut current_tvg_logo = None;
    let mut current_name = None;
    let mut current_headers: HashMap<String, String> = HashMap::new();

    let re_id = RE_TVG_ID.get_or_init(|| {
        regex::Regex::new(r#"tvg-id="([^"]*)""#).expect("Invalid regex for tvg-id parsing")
    });
    let re_logo = RE_TVG_LOGO.get_or_init(|| {
        regex::Regex::new(r#"tvg-logo="([^"]*)""#).expect("Invalid regex for tvg-logo parsing")
    });

    for line in m3u8_text.lines() {
        let line = line.trim();
        if line.starts_with("#EXTINF:") {
            if let Some(cap) = re_id.captures(line) {
                let tvg_id = &cap[1];
                current_tvg_id = if tvg_id.is_empty() {
                    None
                } else {
                    Some(tvg_id.to_string())
                };
            }

            if let Some(cap) = re_logo.captures(line) {
                let tvg_logo = &cap[1];
                current_tvg_logo = if tvg_logo.is_empty() {
                    None
                } else {
                    Some(tvg_logo.to_string())
                };
            }

            if let Some(last_comma) = line.rfind(',') {
                current_name = Some(line[last_comma + 1..].trim().to_string());
            }
        } else if let Some(stripped) = line.strip_prefix("#EXTVLCOPT:http-user-agent=") {
            let val = stripped.trim();
            if !val.is_empty() {
                current_headers.insert("User-Agent".to_string(), val.to_string());
            }
        } else if let Some(stripped) = line.strip_prefix("#EXTVLCOPT:http-referrer=") {
            let val = stripped.trim();
            if !val.is_empty() {
                current_headers.insert("Referer".to_string(), val.to_string());
            }
        } else if !line.starts_with('#')
            && !line.is_empty()
            && let Some(name) = current_name.take()
        {
            let tvg_id = current_tvg_id.take().unwrap_or_default();
            let tvg_logo = current_tvg_logo.take();

            let channel_id = if tvg_id.is_empty() {
                format!("mjh-{}", name.replace(" ", "-").to_lowercase())
            } else if tvg_id.starts_with("mjh-") {
                tvg_id.clone()
            } else {
                format!("mjh-{}", tvg_id)
            };

            let epg_data = epg_map.get(&tvg_id);
            let channel_programmes = programmes_map.get(&tvg_id).cloned().unwrap_or_default();

            let icon =
                tvg_logo.or_else(|| epg_data.and_then(|e| e.icon.as_ref().map(|i| i.src.clone())));

            let headers = if current_headers.is_empty() {
                None
            } else {
                Some(current_headers.clone())
            };
            current_headers.clear();

            let name_lower = name.to_lowercase();
            channels.push(ChannelMeta {
                id: format!("stremio_iptv_id:{}", channel_id),
                name: name.clone(),
                name_lower: name_lower.clone(),
                type_name: "tv".to_string(),
                poster: icon.clone(),
                poster_shape: "regular".to_string(),
                background: icon.clone(),
                logo: icon.clone(),
                description: format!("Watch {}", name),
                url: line.to_string(),
                category: categorize_channel(&name_lower, &headers),
                programmes: channel_programmes,
                http_headers: headers,
            });
        }
    }

    // Sort channels with specific weights for common NZ networks
    channels.sort_by(|a, b| {
        let get_weight = |c: &ChannelMeta| {
            let name = &c.name_lower;
            let id = c.id.as_str();
            if name.contains("+1") || name.contains("plus 1") || id.ends_with("plus1") {
                1000
            } else {
                match id {
                    "stremio_iptv_id:mjh-tvnz-1" => 1,
                    "stremio_iptv_id:mjh-tvnz-2" => 2,
                    "stremio_iptv_id:mjh-three" => 3,
                    "stremio_iptv_id:mjh-bravo" => 4,
                    "stremio_iptv_id:mjh-maori-tv" => 5,
                    "stremio_iptv_id:mjh-tvnz-duke" => 6,
                    "stremio_iptv_id:mjh-sky-open" | "stremio_iptv_id:mjh-prime" => 7,
                    "stremio_iptv_id:mjh-eden" => 8,
                    "stremio_iptv_id:mjh-sky-hgtv" => 9,
                    _ => 100,
                }
            }
        };

        get_weight(a)
            .cmp(&get_weight(b))
            .then_with(|| a.name_lower.cmp(&b.name_lower))
    });

    channels
}

#[cfg(not(target_arch = "wasm32"))]
fn build_channel_index(channels: &[ChannelMeta]) -> Arc<HashMap<String, ChannelMeta>> {
    Arc::new(
        channels
            .iter()
            .cloned()
            .map(|channel| (channel.id.clone(), channel))
            .collect(),
    )
}

#[cfg(not(target_arch = "wasm32"))]
async fn get_channel_by_id(
    state: &AppState,
    id: &str,
) -> Result<Option<ChannelMeta>, Box<dyn std::error::Error>> {
    // Fast path: check the index cache first
    if let Some(index) = state.channel_index_cache.get(CHANNEL_CACHE_KEY).await {
        return Ok(index.get(id).cloned());
    }

    // Cache miss: fetch data (this populates both channel_cache and channel_index_cache)
    fetch_data(state).await?;

    // Now that the cache is populated, use the index for O(1) lookup
    if let Some(index) = state.channel_index_cache.get(CHANNEL_CACHE_KEY).await {
        return Ok(index.get(id).cloned());
    }

    Ok(None)
}

#[cfg(not(target_arch = "wasm32"))]
/// Fetches and processes M3U8 and EPG data into a collection of `ChannelMeta`.
/// Uses heavy caching to minimize external requests.
pub async fn fetch_data(
    state: &AppState,
) -> Result<Arc<Vec<ChannelMeta>>, Box<dyn std::error::Error>> {
    let channels = state
        .channel_cache
        .try_get_with(CHANNEL_CACHE_KEY.to_string(), async {
            // Fetch or use cached M3U8
            let m3u8_text = if let Some(cached) = state.stream_cache.get("m3u8").await {
                cached
            } else {
                info!("Refreshing M3U8 data...");
                let text = make_request(state.client.as_ref(), &state.m3u8_url, 3)
                    .await
                    .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
                state
                    .stream_cache
                    .insert("m3u8".to_string(), text.clone())
                    .await;
                text
            };

            // Fetch or use cached EPG
            let epg_text = if let Some(cached) = state.epg_cache.get("epg_text").await {
                cached
            } else {
                info!("Refreshing EPG data...");
                let text = make_request(state.client.as_ref(), &state.epg_url, 3)
                    .await
                    .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
                state
                    .epg_cache
                    .insert("epg_text".to_string(), text.clone())
                    .await;
                text
            };

            let channels_parsed =
                tokio::task::spawn_blocking(move || parse_channels(&m3u8_text, &epg_text))
                    .await
                    .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;

            let channels = Arc::new(channels_parsed);

            info!("Cached {} processed channels.", channels.len());

            Ok::<_, Box<dyn std::error::Error + Send + Sync>>(channels)
        })
        .await
        .map_err(|e| {
            Box::new(std::io::Error::other(e.to_string())) as Box<dyn std::error::Error>
        })?;

    // Avoid TOCTOU: use try_get_with to build and cache the index coalescently
    state
        .channel_index_cache
        .try_get_with(CHANNEL_CACHE_KEY.to_string(), async {
            Ok::<_, std::convert::Infallible>(build_channel_index(channels.as_ref()))
        })
        .await
        .ok();

    Ok(channels)
}

#[cfg(not(target_arch = "wasm32"))]
/// Formats a channel's metadata for a Stremio response, including EPG data.
/// Enriches metadata with artwork from TVMaze if applicable.
pub async fn format_meta(
    state: AppState,
    channel: &ChannelMeta,
    now_str: String,
    is_catalog: bool,
) -> serde_json::Value {
    let mut current_program = None;
    let now = now_str.as_str();
    // Binary search for the current programme (programmes are chronologically ordered)
    let idx = channel
        .programmes
        .partition_point(|p| p.stop.as_str() <= now);
    if let Some(p) = channel.programmes.get(idx)
        && p.start.as_str() <= now
    {
        current_program = Some(p);
    }

    let mut meta_obj = serde_json::json!({
        "id": channel.id,
        "name": channel.name,
        "type": channel.type_name,
        "poster": channel.poster,
        "posterShape": channel.poster_shape,
        "background": channel.background,
        "logo": channel.logo,
        "description": channel.description,
    });

    if !is_catalog {
        meta_obj["behaviorHints"] = serde_json::json!({ "defaultVideoId": channel.id });
    }

    if let Some(cp) = current_program {
        if let Some(t) = &cp.title {
            meta_obj["name"] = serde_json::json!(t);
        }

        let mut desc = cp.desc.clone().unwrap_or_default();

        if let Some(date) = &cp.date {
            meta_obj["releaseInfo"] = serde_json::json!(date);
        }

        if let Some(sr) = &cp.star_rating
            && let Some(val) = &sr.value
            && let Some(num) = val.split('/').next()
        {
            meta_obj["imdbRating"] = serde_json::json!(num);
        }

        if let (Ok(st), Ok(end)) = (
            chrono::DateTime::parse_from_str(&cp.start, "%Y%m%d%H%M%S %z"),
            chrono::DateTime::parse_from_str(&cp.stop, "%Y%m%d%H%M%S %z"),
        ) && let mins = (end - st).num_minutes()
            && mins > 0
        {
            meta_obj["runtime"] = serde_json::json!(format!("{} min", mins));
        }

        if let Some(r) = &cp.rating
            && let Some(val) = &r.value
        {
            desc = format!("Age Rating: {} | {}", val, desc);
        }

        meta_obj["description"] = serde_json::json!(format!("{}\n\nWatch {}", desc, channel.name));

        let mut poster = None;
        let mut banner = None;

        // Try to obtain artwork from EPG, fall back to TVMaze
        if let Some(icon) = &cp.icon
            && let Some(valid_url) = process_epg_icon_url(&icon.src)
        {
            poster = Some(valid_url);
        }

        if poster.is_none()
            && let Some(title) = &cp.title
            && let Some(enriched) = state.tvmaze_client.fetch_show_images(title).await
        {
            poster = enriched.poster;
            banner = enriched.banner;
        }

        if let Some(p) = poster {
            meta_obj["poster"] = serde_json::json!(p);
            meta_obj["background"] = serde_json::json!(banner.unwrap_or(p));
        }

        let genres = cp.category.clone();
        if !genres.is_empty() {
            meta_obj["genres"] = serde_json::json!(genres);
        }
    }

    meta_obj
}

#[cfg(not(target_arch = "wasm32"))]
/// Generates the catalog response for Stremio.
pub async fn catalog(state: &AppState) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let channels = fetch_data(state).await?;
    let now_str = chrono::Utc::now().format("%Y%m%d%H%M%S +0000").to_string();
    let res = {
        let state = state.clone();
        stream::iter(0..channels.len())
            .map(move |idx| {
                let channels = channels.clone();
                let state = state.clone();
                let now_str = now_str.clone();
                async move {
                    let channel = &channels[idx];
                    format_meta(state, channel, now_str, true).await
                }
            })
            .buffered(CATALOG_META_CONCURRENCY)
            .collect::<Vec<_>>()
            .await
    };
    Ok(serde_json::Value::Array(res))
}

#[cfg(not(target_arch = "wasm32"))]
/// Generates a single meta detail response for Stremio.
pub async fn meta(
    state: &AppState,
    id: &str,
) -> Result<Option<serde_json::Value>, Box<dyn std::error::Error>> {
    let channel = match get_channel_by_id(state, id).await? {
        Some(c) => c,
        None => return Ok(None),
    };

    let now_str = chrono::Utc::now().format("%Y%m%d%H%M%S +0000").to_string();

    Ok(Some(
        format_meta(state.clone(), &channel, now_str, false).await,
    ))
}

#[cfg(not(target_arch = "wasm32"))]
/// Generates the stream response for Stremio, applying MJH pre-resolution.
pub async fn stream(
    state: &AppState,
    id: &str,
    base_url: &str,
) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let channel = match get_channel_by_id(state, id).await? {
        Some(c) => c,
        None => return Ok(serde_json::json!([])),
    };

    let mut stream_url = channel.url.clone();

    // Pre-resolve MJH redirects to provide the final stream URL to Stremio
    if let Ok(res) = state
        .client
        .get(&channel.url)
        .header("User-Agent", crate::proxy::BROWSER_UA)
        .send()
        .await
    {
        if res.status().is_redirection() {
            if let Some(loc) = res.headers().get("location")
                && let Ok(loc_str) = loc.to_str()
            {
                stream_url = loc_str.to_string();
                info!(
                    "Pre-resolved MJH endpoint for {}: {}",
                    channel.name, stream_url
                );
            }
        } else if res.status().is_success() {
            stream_url = res.url().to_string();
        }
    }

    let now_str = chrono::Utc::now().format("%Y%m%d%H%M%S +0000").to_string();

    let now = now_str.as_str();
    let mut show_title = "Live TV".to_string();
    let idx = channel
        .programmes
        .partition_point(|p| p.stop.as_str() <= now);
    if let Some(p) = channel.programmes.get(idx)
        && p.start.as_str() <= now
        && let Some(t) = &p.title
    {
        show_title = t.to_string();
    }

    if show_title == "Live TV"
        && let Some(p) = channel.programmes.first()
        && let Some(t) = &p.title
    {
        show_title = format!("Next: {}", t);
    }

    let proxy_url =
        crate::proxy::build_proxy_url(base_url, &stream_url, channel.http_headers.as_ref());

    Ok(serde_json::json!([{
        "name": channel.name,
        "title": show_title,
        "url": proxy_url,
        "behaviorHints": {
            "isHLS": true,
            "notWebReady": false
        }
    }]))
}
