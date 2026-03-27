use crate::iptv::parse_channels;
use crate::proxy::rewrite_m3u8;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!(
        "Hello, {}! This is the Kiwi IPTV Rust Engine running in your browser.",
        name
    )
}

#[wasm_bindgen]
pub fn parse_nz_channels(m3u8_text: &str, epg_text: &str) -> Result<JsValue, JsValue> {
    let channels = parse_channels(m3u8_text, epg_text);
    serde_wasm_bindgen::to_value(&channels).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn rewrite_playlist(
    text: &str,
    proxy_base_url: &str,
    original_url: &str,
    headers_json: Option<String>,
) -> String {
    rewrite_m3u8(text, proxy_base_url, original_url, headers_json.as_deref())
}

#[wasm_bindgen]
pub fn clean_show_title(title: &str) -> String {
    crate::tvmaze::clean_title_for_search(title)
}

#[wasm_bindgen]
pub fn process_icon_url(url: &str) -> Option<String> {
    crate::tvmaze::process_epg_icon_url(url)
}

#[wasm_bindgen]
pub fn is_safe_proxy_url(url: &str) -> bool {
    crate::proxy::is_safe_url(url)
}
#[cfg(test)]
mod tests {
    use super::*;
    use wasm_bindgen_test::*;

    #[wasm_bindgen_test]
    fn test_greet() {
        let result = greet("Developer");
        assert!(result.contains("Hello, Developer!"));
    }

    #[wasm_bindgen_test]
    fn test_clean_show_title() {
        assert_eq!(
            clean_show_title("Documentary: NZ - S01E01"),
            "Documentary: NZ"
        );
    }

    #[wasm_bindgen_test]
    fn test_process_icon_url() {
        let result = process_icon_url("https://i.mjh.nz/nz/channel.png");
        assert!(result.is_some());
    }

    #[wasm_bindgen_test]
    fn test_is_safe_proxy_url() {
        assert!(is_safe_proxy_url("https://i.mjh.nz/nz/playlist.m3u8"));
        assert!(!is_safe_proxy_url("https://evil.com/malware"));
    }
}
