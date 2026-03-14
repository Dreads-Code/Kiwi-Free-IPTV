use iptv_nz_addon_rust::tvmaze::{clean_title_for_search, process_epg_icon_url};

#[test]
fn test_clean_title() {
    assert_eq!(
        clean_title_for_search("Shortland Street (2024)"),
        "Shortland Street"
    );
    assert_eq!(clean_title_for_search("News (New) "), "News");
    assert_eq!(
        clean_title_for_search("The Chaseroom (Final) (2023)"),
        "The Chaseroom"
    );
}

#[test]
fn test_process_icon_url() {
    assert_eq!(
        process_epg_icon_url("http://example.com/image.jpg"),
        Some("https://example.com/image.jpg".to_string())
    );
    assert_eq!(
        process_epg_icon_url("https://cdn.fullscreen.nz/[width]x[height]/Spotlight/show.jpg"),
        Some("https://cdn.fullscreen.nz/600x338/Spotlight/show.jpg".to_string())
    );
    assert_eq!(process_epg_icon_url("not-a-url"), None);
    assert_eq!(process_epg_icon_url("https://example.com/page"), None);
}
