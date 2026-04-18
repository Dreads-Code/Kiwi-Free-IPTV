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
fn test_is_safe_proxy_url_logic() {
    assert!(is_safe_url("https://i.mjh.nz/nz/playlist.m3u8"));
    // SSRF bypass attempts
    assert!(!is_safe_url("http://0.0.0.0/admin"));
    assert!(!is_safe_url("http://[::]/admin"));
}
