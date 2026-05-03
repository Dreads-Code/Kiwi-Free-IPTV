use iptv_nz_addon_rust::proxy::{is_safe_url, rewrite_m3u8};
use iptv_nz_addon_rust::tvmaze::{clean_title_for_search, process_epg_icon_url};

#[test]
fn test_clean_show_title_logic() {
    assert_eq!(
        clean_title_for_search("Shortland Street (2024)"),
        "Shortland Street"
    );
    assert_eq!(
        clean_title_for_search("Documentary: NZ - S01E01"),
        "Documentary: NZ"
    );
    assert_eq!(clean_title_for_search("The Project"), "The Project");
}

#[test]
fn test_clean_show_title_edge_cases() {
    // Empty and whitespace
    assert_eq!(clean_title_for_search(""), "");
    assert_eq!(clean_title_for_search("   "), "");

    // Multiple tags
    assert_eq!(clean_title_for_search("Show (2023) (New)"), "Show");
    assert_eq!(clean_title_for_search("Show (New) (2023)"), "Show");

    // Case sensitivity for states
    assert_eq!(clean_title_for_search("Show (new)"), "Show");
    assert_eq!(clean_title_for_search("Show (PREMIERE)"), "Show");

    // Season/Episode variants
    assert_eq!(clean_title_for_search("Show - s01e01"), "Show");
    assert_eq!(clean_title_for_search("Show - S01E01 - Extra"), "Show");

    // Non-matching parentheses
    assert_eq!(clean_title_for_search("Show (US)"), "Show (US)");
    assert_eq!(
        clean_title_for_search("Show (2024) (US)"),
        "Show (2024) (US)"
    );

    // Dash without season
    assert_eq!(clean_title_for_search("Show - Part 1"), "Show - Part 1");
    assert_eq!(clean_title_for_search("Show - Special"), "Show - Special");
}

#[cfg(target_arch = "wasm32")]
#[test]
fn test_wasm_clean_show_title_wrapper() {
    use iptv_nz_addon_rust::wasm::clean_show_title;
    // Verify the WASM wrapper correctly delegates to the underlying logic
    assert_eq!(
        clean_show_title("Shortland Street (2024)"),
        "Shortland Street"
    );
}

#[test]
fn test_rewrite_playlist_logic() {
    // using an unknown domain to ensure proxying (not direct offload)
    let m3u8 = "#EXTM3U\n#EXTINF:-1,Test\nhttp://unknown-domain.com/stream.ts\n";
    let proxy_base = "http://localhost:8080";
    let original = "http://unknown-domain.com/playlist.m3u8";

    let rewritten = rewrite_m3u8(m3u8, proxy_base, original, None);

    assert!(rewritten.contains(proxy_base));
    assert!(rewritten.contains("/proxy/"));
}

#[test]
fn test_process_icon_url_logic() {
    let result = process_epg_icon_url("https://i.mjh.nz/nz/channel.png");
    assert!(result.is_some());
}

#[test]
fn test_process_icon_url_edge_cases() {
    // Force HTTPS
    assert_eq!(
        process_epg_icon_url("http://example.com/image.png"),
        Some("https://example.com/image.png".to_string())
    );

    // Placeholder resolution (Portrait)
    assert_eq!(
        process_epg_icon_url("https://cdn.fullscreen.nz/image_[width]x[height].png"),
        Some("https://cdn.fullscreen.nz/image_300x450.png".to_string())
    );

    // Placeholder resolution (Landscape - Spotlight)
    assert_eq!(
        process_epg_icon_url("https://cdn.fullscreen.nz/Spotlight_[width]x[height].png"),
        Some("https://cdn.fullscreen.nz/Spotlight_600x338.png".to_string())
    );

    // Image extension validation
    assert!(process_epg_icon_url("https://example.com/image.webp").is_some());
    assert!(process_epg_icon_url("https://example.com/image.svg").is_some());
    assert!(process_epg_icon_url("https://example.com/not_an_image.txt").is_none());

    // Format query parameter
    assert!(process_epg_icon_url("https://example.com/image?format=jpg").is_some());

    // Empty URL
    assert!(process_epg_icon_url("").is_none());
}

#[cfg(target_arch = "wasm32")]
#[test]
fn test_wasm_process_icon_url_wrapper() {
    use iptv_nz_addon_rust::wasm::process_icon_url;
    // Verify the WASM wrapper correctly delegates to the underlying logic
    assert!(process_icon_url("https://i.mjh.nz/nz/channel.png").is_some());
}

#[test]
fn test_is_safe_proxy_url_logic() {
    assert!(is_safe_url("https://i.mjh.nz/nz/playlist.m3u8"));
    // SSRF bypass attempts
    assert!(!is_safe_url("http://0.0.0.0/admin"));
    assert!(!is_safe_url("http://[::]/admin"));
}
