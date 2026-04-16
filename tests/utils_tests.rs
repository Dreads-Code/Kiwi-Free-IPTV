use iptv_nz_addon_rust::utils::contains_ignore_ascii_case;

#[test]
fn test_contains_ignore_ascii_case() {
    assert!(contains_ignore_ascii_case("Hello World", "world"));
    assert!(contains_ignore_ascii_case("Hello World", "HELLO"));
    assert!(contains_ignore_ascii_case("Hello World", "o Wo"));
    assert!(contains_ignore_ascii_case("Hello World", ""));
    assert!(!contains_ignore_ascii_case("Hello World", "universe"));
    assert!(!contains_ignore_ascii_case("abc", "abcd"));
}
