// ── Main Entry Point ────────────────────────────────────────────────
import { renderSidebar } from "./components/sidebar.js";
import { renderChat } from "./pages/chat.js";
import { renderReport } from "./pages/report.js";
import { renderRevision } from "./pages/revision.js";
import { registerRoute, startRouter } from "./router.js";

// Register routes
registerRoute("/chat", renderChat);
registerRoute("/revision", renderRevision);
registerRoute("/report", renderReport);

// Initialize
const sidebar = document.getElementById("sidebar");
const mainContent = document.getElementById("main-content");

renderSidebar(sidebar);
startRouter(mainContent);
