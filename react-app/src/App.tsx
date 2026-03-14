/**
 * Main Application component that sets up the routing for the IPTV application.
 */
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Player from "./Player";
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Player />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
