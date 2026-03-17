import init, {
  greet,
  parse_nz_channels,
  clean_show_title,
} from "./iptv_nz_addon_rust.js";

async function testWasm() {
  console.log("Starting WASM test...");
  try {
    await init();
    console.log("WASM Initialized!");

    const greeting = greet("Frontend Developer");
    console.log("Greeting:", greeting);

    const cleaned = clean_show_title("Shortland Street (2024)");
    console.log(
      "Cleaned Title:",
      cleaned === "Shortland Street" ? "SUCCESS" : `FAILED: ${cleaned}`,
    );

    // Small sample for parsing test
    const m3u8 =
      '#EXTM3U\n#EXTINF:-1 tvg-id="test" tvg-logo="logo.png",Test Channel\nhttp://example.com/stream.m3u8';
    const epg =
      '<?xml version="1.0" encoding="UTF-8"?><tv><channel id="test"><display-name>Test</display-name></channel></tv>';

    const channels = parse_nz_channels(m3u8, epg);
    console.log("Parsed Channels Count:", channels.length);
    if (channels.length > 0) {
      console.log("First Channel Logo:", channels[0].logo);
    }
  } catch (e) {
    console.error("WASM Test Failed:", e);
  }
}

testWasm();
