// ── Sidebar Navigation Component ────────────────────────────────────
import { navigate } from "../router.js";

const NAV_ITEMS = [
    { path: "/chat", icon: "💬", label: "Ask the Assistant" },
    { path: "/revision", icon: "📅", label: "Daily Revision" },
    { path: "/report", icon: "📊", label: "Report Generator" },
];

export function renderSidebar(container) {
    container.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-logo">Alfred</div>
      <div class="sidebar-tagline">Your Knowledge Companion</div>
    </div>
    <nav class="sidebar-nav">
      ${NAV_ITEMS.map(
        (item) => `
        <a class="nav-item" data-route="${item.path}" id="nav-${item.path.slice(1)}">
          <span class="nav-icon">${item.icon}</span>
          <span>${item.label}</span>
        </a>
      `
    ).join("")}
    </nav>
    <div class="sidebar-footer">
      Alfred v1.0 — Powered by Qdrant + Gemini
    </div>
  `;

    // Bind clicks
    container.querySelectorAll(".nav-item").forEach((el) => {
        el.addEventListener("click", (e) => {
            e.preventDefault();
            navigate(el.dataset.route);
        });
    });
}
