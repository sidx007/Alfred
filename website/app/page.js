"use client";

import { useEffect } from "react";
import { boot } from "../src/main.js";

export default function HomePage() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.__alfredBooted) return;

    window.__alfredBooted = true;
    boot().catch((error) => {
      window.__alfredBooted = false;
      console.error("Failed to boot Alfred UI:", error);
    });
  }, []);

  return <div id="app" />;
}