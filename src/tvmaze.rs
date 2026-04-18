//! TVMaze API Integration.
//! This module provides the client and utilities for fetching show artwork
//! and cleaning show titles for reliable search results.

use crate::utils::contains_ignore_ascii_case;
use log::debug;
#[cfg(not(target_arch = "wasm32"))]
use log::{info, warn};
use serde::{Deserialize, Serialize};
use url::Url;

/// Enriched show images including poster and banner URLs.
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ShowImages {
    /// URL to the show's poster image.
    pub poster: Option<String>,
    /// URL to the show's banner image.
    pub banner: Option<String>,
}

#[cfg(not(target_arch = "wasm32"))]
#[derive(Debug, Deserialize)]
struct TvMazeShowSearch {
    show: TvMazeShow,
}

#[cfg(not(target_arch = "wasm32"))]
#[derive(Debug, Deserialize)]
struct TvMazeShow {
    id: u32,
    image: Option<TvMazeImageLinks>,
}

#[cfg(not(target_arch = "wasm32"))]
#[derive(Debug, Deserialize)]
struct TvMazeImageLinks {
    original: Option<String>,
    medium: Option<String>,
}

#[cfg(not(target_arch = "wasm32"))]
#[derive(Debug, Deserialize)]
struct TvMazeImage {
    r#type: String,
    main: bool,
    resolutions: TvMazeResolutions,
}

#[cfg(not(target_arch = "wasm32"))]
#[derive(Debug, Deserialize)]
struct TvMazeResolutions {
    original: TvMazeUrl,
}

#[cfg(not(target_arch = "wasm32"))]
#[derive(Debug, Deserialize)]
struct TvMazeUrl {
    url: String,
}

#[cfg(not(target_arch = "wasm32"))]
/// Client for interacting with the TVMaze API.
pub struct TvMazeClient {
    client: reqwest::Client,
    base_url: String,
    cache: moka::future::Cache<String, ShowImages>,
}

#[cfg(not(target_arch = "wasm32"))]
impl TvMazeClient {
    /// Creates a new TVMaze client.
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
            base_url: "https://api.tvmaze.com".to_string(),
            cache: moka::future::Cache::builder()
                .time_to_live(std::time::Duration::from_secs(86400 * 7)) // 7 days
                .max_capacity(2048)
                .build(),
        }
    }

    /// Returns the base URL used by this client.
    pub fn base_url(&self) -> &str {
        &self.base_url
    }
}

#[cfg(not(target_arch = "wasm32"))]
impl Default for TvMazeClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(not(target_arch = "wasm32"))]
impl TvMazeClient {
    /// Creates a new TVMaze client with a custom base URL (useful for testing).
    pub fn with_base_url(base_url: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            base_url,
            cache: moka::future::Cache::builder()
                .time_to_live(std::time::Duration::from_secs(86400 * 7))
                .max_capacity(2048)
                .build(),
        }
    }

    /// Searches for a show by title and returns its poster and banner images.
    pub async fn fetch_show_images(&self, query: &str) -> Option<ShowImages> {
        let cleaned_query = clean_title_for_search(query);
        if cleaned_query.is_empty() {
            return None;
        }

        if let Some(cached) = self.cache.get(&cleaned_query).await {
            return Some(cached);
        }

        info!("[TVMaze] Searching for show images: \"{}\"", cleaned_query);

        let search_url = format!(
            "{}/search/shows?q={}",
            self.base_url,
            urlencoding::encode(&cleaned_query)
        );

        let search_res = match self.client.get(&search_url).send().await {
            Ok(res) => res.json::<Vec<TvMazeShowSearch>>().await.ok()?,
            Err(e) => {
                warn!(
                    "[TVMaze] Search request failed for \"{}\": {}",
                    cleaned_query, e
                );
                return None;
            }
        };

        if search_res.is_empty() {
            // Cache the negative result so repeated lookups for the same unknown show don't
            // re-hit the TVMaze API on every format_meta call.
            self.cache
                .insert(
                    cleaned_query,
                    ShowImages {
                        poster: None,
                        banner: None,
                    },
                )
                .await;
            return None;
        }

        let show = &search_res[0].show;
        let show_id = show.id;

        let mut images_result = ShowImages {
            poster: show
                .image
                .as_ref()
                .and_then(|img| img.original.clone().or_else(|| img.medium.clone())),
            banner: None,
        };

        // Attempt to fetch additional image types (e.g., banners)
        let images_url = format!("{}/shows/{}/images", self.base_url, show_id);
        if let Ok(res) = self.client.get(&images_url).send().await
            && let Ok(images_data) = res.json::<Vec<TvMazeImage>>().await
        {
            for img in images_data {
                if images_result.banner.is_none() && img.r#type == "banner" {
                    images_result.banner = Some(img.resolutions.original.url.clone());
                }
                if img.r#type == "poster" && img.main {
                    images_result.poster = Some(img.resolutions.original.url.clone());
                }
            }
        }

        self.cache
            .insert(cleaned_query, images_result.clone())
            .await;
        Some(images_result)
    }
}

/// Cleans a program title by removing years, tags like (Premiere), and extra whitespace.
pub fn clean_title_for_search(title: &str) -> String {
    let mut cleaned = title.trim().to_string();
    let mut last_cleaned;

    let regex_year = regex::Regex::new(r"\s{0,5}\(\d{4}\)$").unwrap();
    let regex_state = regex::Regex::new(r"(?i)\s{0,5}\((?:Premiere|New|Final|Repeat)\)$").unwrap();
    let regex_season = regex::Regex::new(r"(?i)\s*-\s*s\d+e\d+.*$").unwrap();

    loop {
        last_cleaned = cleaned.clone();
        cleaned = regex_year.replace(&cleaned, "").to_string();
        cleaned = regex_state.replace(&cleaned, "").to_string();
        cleaned = regex_season.replace(&cleaned, "").to_string();
        cleaned = cleaned.trim().to_string();
        if cleaned == last_cleaned {
            break;
        }
    }

    cleaned
}

/// Validates and processes an EPG icon URL, ensuring HTTPS and resolving placeholders.
pub fn process_epg_icon_url(url: &str) -> Option<String> {
    if url.is_empty() {
        return None;
    }

    let mut processed_url = url.to_string();

    // Force HTTPS for better compatibility with Stremio and Web players
    if processed_url.starts_with("http://") {
        processed_url = processed_url.replace("http://", "https://");
    }

    // Resolve dimension placeholders in Fullscreen CDN URLs
    if processed_url.contains("cdn.fullscreen.nz") {
        let is_landscape = processed_url.contains("Spotlight") || processed_url.contains("Banner");
        processed_url = processed_url
            .replace("[height]", if is_landscape { "338" } else { "450" })
            .replace("[width]", if is_landscape { "600" } else { "300" });
    }

    let parsed = Url::parse(&processed_url).ok()?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return None;
    }

    let pathname = parsed.path();
    let query = parsed.query().unwrap_or("");
    let image_extensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];

    let is_image_path = image_extensions.iter().any(|ext| {
        pathname.len() >= ext.len()
            && pathname[pathname.len() - ext.len()..].eq_ignore_ascii_case(ext)
    });

    let is_image_query = image_extensions
        .iter()
        .any(|ext| query.contains(&ext[1..]) || contains_ignore_ascii_case(query, "format="));

    let is_trusted_cdn = processed_url.contains("cdn.fullscreen.nz");

    if !is_image_path && !is_image_query && !is_trusted_cdn {
        debug!("Filtered out non-image EPG icon URL: {}", processed_url);
        return None;
    }

    Some(processed_url)
}
