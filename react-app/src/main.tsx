import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

import init, { init_panic_hook } from "./wasm/iptv_nz_addon_rust.js";

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

// Initialize the Rust WASM engine
init()
  .then(() => {
    init_panic_hook();
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    console.error("Failed to initialize WASM engine:", error);
    root.render(
      <div
        style={{
          backgroundColor: "#1a1a1a",
          color: "#ff4d4d",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>
          Engine Initialization Failed
        </h1>
        <p style={{ opacity: 0.8 }}>
          The application could not start because the core engine failed to
          load.
        </p>
        <pre
          style={{
            marginTop: "2rem",
            padding: "1rem",
            backgroundColor: "#000",
            borderRadius: "8px",
            fontSize: "0.9rem",
          }}
        >
          {error instanceof Error ? error.message : String(error)}
        </pre>
      </div>,
    );
  });
