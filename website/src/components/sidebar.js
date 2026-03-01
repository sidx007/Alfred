// ── Sidebar Navigation Component ────────────────────────────────────
import { navigate } from "../router.js";

const NAV_ITEMS = [
  {
    path: "/chat",
    icon: `<svg viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`,
    label: "Ask the Assistant",
  },
  {
    path: "/revision",
    icon: `<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
    label: "Daily Revision",
  },
  {
    path: "/report",
    icon: `<svg viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
    label: "Report Generator",
  },
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
      `,
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
