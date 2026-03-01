// ── Alfred Home — 3-Panel Hyprland Layout with Fullscreen Support ───
import { marked } from "marked";
import { fetchDailyReport, generateReport, sendChatMessage } from "../api.js";

marked.setOptions({ breaks: true, gfm: true });

// ── State ────────────────────────────────────────────────────────────
let chatMessages = [];
let chatLoading = false;
let activePanel = null; // null = tiled home, "revision" | "report" | "chat"
let rootContainer = null;

const PANELS = [
  { id: "revision", icon: "📅", label: "Daily Revision" },
  { id: "report", icon: "📊", label: "Custom Report" },
  { id: "chat", icon: "💬", label: "Chat with Alfred" },
];

const SUGGESTIONS = [
  "What topics have I learned about?",
  "Summarize my recent notes",
  "What key concepts have I studied?",
];

// ── Main render ──────────────────────────────────────────────────────
export function renderHome(container) {
  chatMessages = [];
  chatLoading = false;
  activePanel = null;
  rootContainer = container;
  renderTiledView();
}

// ══════════════════════════════════════════════════════════════════════
//  TILED VIEW (3-panel Hyprland layout)
// ══════════════════════════════════════════════════════════════════════
function renderTiledView() {
  rootContainer.innerHTML = "";

  const page = document.createElement("div");
  page.className = "home-page";
  page.innerHTML = `
    <!-- ── Top Panel: Daily Revision Report ── -->
    <div class="home-panel panel-revision tile-clickable" data-panel="revision">
      <div class="panel-header">
        <span class="panel-title">📅 Daily Revision Report</span>
        <button class="panel-action-btn" id="revision-refresh-btn" title="Refresh">↻</button>
      </div>
      <div class="panel-body" id="revision-body">
        <div class="panel-loading"><div class="spinner"></div><span>Loading daily report…</span></div>
      </div>
    </div>

    <!-- ── Bottom Row ── -->
    <div class="home-bottom">
      <!-- ── Bottom-Left: Custom Report Generator ── -->
      <div class="home-panel panel-report tile-clickable" data-panel="report">
        <div class="panel-header">
          <span class="panel-title">📊 Custom Report</span>
        </div>
        <div class="panel-body panel-report-body">
          <textarea
            id="report-prompt-input"
            class="report-prompt-textarea"
            placeholder="Describe what you'd like a report about…"
            rows="3"
          ></textarea>
          <button class="panel-btn" id="report-generate-btn">✨ Generate Report</button>
          <div class="panel-scroll-area" id="report-output"></div>
        </div>
      </div>

      <!-- ── Bottom-Right: Chat ── -->
      <div class="home-panel panel-chat tile-clickable" data-panel="chat">
        <div class="panel-header">
          <span class="panel-title">💬 Chat with Alfred</span>
        </div>
        <div class="chat-messages panel-scroll-area" id="home-chat-messages">
          <div class="chat-welcome">
            <div class="chat-welcome-icon">🧠</div>
            <p>Ask anything about your knowledge base.</p>
            <div class="chat-suggestions" id="home-chat-suggestions">
              ${SUGGESTIONS.map((s) => `<button class="chat-suggestion">${s}</button>`).join("")}
            </div>
          </div>
        </div>
        <div class="home-chat-input-area">
          <textarea id="home-chat-input" class="chat-input" placeholder="Ask anything…" rows="1"></textarea>
          <button id="home-chat-send" class="chat-send-btn" title="Send">➤</button>
        </div>
      </div>
    </div>
  `;

  rootContainer.appendChild(page);

  // Wire up panels
  initRevisionPanel(page);
  initReportPanel(page);
  initChatPanel(page);

  // Click-to-expand: clicking a panel header opens it fullscreen
  page.querySelectorAll(".tile-clickable").forEach((panel) => {
    panel.addEventListener("click", (e) => {
      // Don't expand if user clicked an interactive element
      if (e.target.closest("button, textarea, input, a, .chat-suggestion"))
        return;
      const panelId = panel.dataset.panel;
      if (panelId) openFullscreen(panelId);
    });
    // Cursor hint
    panel.style.cursor = "pointer";
  });
}

// ══════════════════════════════════════════════════════════════════════
//  FULLSCREEN VIEW
// ══════════════════════════════════════════════════════════════════════
function openFullscreen(panelId) {
  activePanel = panelId;
  rootContainer.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "fullscreen-wrapper";

  // ── Floating navigation pill on the left ──
  const otherPanels = PANELS.filter((p) => p.id !== panelId);
  const nav = document.createElement("div");
  nav.className = "floating-nav";
  nav.innerHTML = `
    <button class="floating-nav-home" title="Back to Home">
      <span>⬅</span>
    </button>
    ${otherPanels
      .map(
        (
          p,
        ) => `<button class="floating-nav-btn" data-target="${p.id}" title="${p.label}">
        <span class="floating-nav-icon">${p.icon}</span>
        <span class="floating-nav-label">${p.label}</span>
      </button>`,
      )
      .join("")}
  `;

  // ── Panel content ──
  const content = document.createElement("div");
  content.className = "fullscreen-content";

  if (panelId === "revision") {
    content.innerHTML = `
      <div class="fullscreen-panel">
        <div class="panel-header">
          <span class="panel-title">📅 Daily Revision Report</span>
          <button class="panel-action-btn" id="revision-refresh-btn" title="Refresh">↻</button>
        </div>
        <div class="panel-body" id="revision-body">
          <div class="panel-loading"><div class="spinner"></div><span>Loading daily report…</span></div>
        </div>
      </div>`;
    wrapper.appendChild(nav);
    wrapper.appendChild(content);
    rootContainer.appendChild(wrapper);
    initRevisionPanel(content);
  } else if (panelId === "report") {
    content.innerHTML = `
      <div class="fullscreen-panel">
        <div class="panel-header">
          <span class="panel-title">📊 Custom Report</span>
        </div>
        <div class="panel-body panel-report-body">
          <textarea
            id="report-prompt-input"
            class="report-prompt-textarea"
            placeholder="Describe what you'd like a report about… e.g. 'summarize everything I know about machine learning'"
            rows="3"
          ></textarea>
          <button class="panel-btn" id="report-generate-btn">✨ Generate Report</button>
          <div class="panel-scroll-area" id="report-output"></div>
        </div>
      </div>`;
    wrapper.appendChild(nav);
    wrapper.appendChild(content);
    rootContainer.appendChild(wrapper);
    initReportPanel(content);
  } else if (panelId === "chat") {
    content.innerHTML = `
      <div class="fullscreen-panel fullscreen-chat">
        <div class="panel-header">
          <span class="panel-title">💬 Chat with Alfred</span>
        </div>
        <div class="chat-messages panel-scroll-area" id="home-chat-messages">
          ${
            chatMessages.length === 0
              ? `<div class="chat-welcome">
                  <div class="chat-welcome-icon">🧠</div>
                  <p>Ask anything about your knowledge base.</p>
                  <div class="chat-suggestions" id="home-chat-suggestions">
                    ${SUGGESTIONS.map((s) => `<button class="chat-suggestion">${s}</button>`).join("")}
                  </div>
                </div>`
              : chatMessages
                  .map(
                    (m) => `<div class="message ${m.role}">
                    <div class="message-avatar">${m.role === "user" ? "👤" : "🧠"}</div>
                    <div class="message-body">
                      <div class="message-content">${
                        m.role === "assistant"
                          ? marked.parse(m.content)
                          : escapeHtml(m.content)
                      }</div>
                      ${
                        m.topics?.length
                          ? `<div class="message-topics">${m.topics
                              .map(
                                (t) =>
                                  `<span class="message-topic-chip">${escapeHtml(t)}</span>`,
                              )
                              .join("")}</div>`
                          : ""
                      }
                    </div>
                  </div>`,
                  )
                  .join("")
          }
        </div>
        <div class="home-chat-input-area">
          <textarea id="home-chat-input" class="chat-input" placeholder="Ask anything…" rows="1"></textarea>
          <button id="home-chat-send" class="chat-send-btn" title="Send">➤</button>
        </div>
      </div>`;
    wrapper.appendChild(nav);
    wrapper.appendChild(content);
    rootContainer.appendChild(wrapper);
    initChatPanel(content);

    // Scroll to bottom if messages exist
    const messagesEl = content.querySelector("#home-chat-messages");
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ── Nav event handlers ──
  nav.querySelector(".floating-nav-home").addEventListener("click", () => {
    activePanel = null;
    renderTiledView();
  });

  nav.querySelectorAll(".floating-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openFullscreen(btn.dataset.target);
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
//  PANEL INIT FUNCTIONS (shared between tiled & fullscreen)
// ══════════════════════════════════════════════════════════════════════

// ── Revision Panel ───────────────────────────────────────────────────
function initRevisionPanel(root) {
  const body = root.querySelector("#revision-body");
  const refreshBtn = root.querySelector("#revision-refresh-btn");

  loadDailyReport(body);

  refreshBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    body.innerHTML = `<div class="panel-loading"><div class="spinner"></div><span>Loading daily report…</span></div>`;
    loadDailyReport(body);
  });
}

async function loadDailyReport(bodyEl) {
  try {
    const { report, date } = await fetchDailyReport();
    if (!report) {
      bodyEl.innerHTML = `
        <div class="panel-empty">
          <span>📭</span>
          <p>No daily report available yet.</p>
          <small>Reports will appear here once added to the <em>daily report</em> collection.</small>
        </div>`;
      return;
    }
    const dateStr = date
      ? new Date(date).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "";
    bodyEl.innerHTML = `
      ${dateStr ? `<div class="revision-date-label">${dateStr}</div>` : ""}
      <div class="revision-report-content">${marked.parse(report)}</div>`;
  } catch (err) {
    bodyEl.innerHTML = `
      <div class="panel-empty">
        <span>⚠️</span>
        <p>Failed to load daily report.</p>
        <small>${escapeHtml(err.message)}</small>
      </div>`;
  }
}

// ── Report Panel ─────────────────────────────────────────────────────
function initReportPanel(root) {
  const promptInput = root.querySelector("#report-prompt-input");
  const generateBtn = root.querySelector("#report-generate-btn");
  const outputEl = root.querySelector("#report-output");

  promptInput?.addEventListener("click", (e) => e.stopPropagation());
  generateBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    handleGenerateReport(promptInput, generateBtn, outputEl);
  });

  promptInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleGenerateReport(promptInput, generateBtn, outputEl);
    }
  });
}

async function handleGenerateReport(promptInput, generateBtn, outputEl) {
  const prompt = promptInput.value.trim();
  if (!prompt || generateBtn.disabled) return;

  generateBtn.disabled = true;
  generateBtn.textContent = "⏳ Generating…";
  outputEl.innerHTML = `<div class="panel-loading"><div class="spinner"></div><span>Generating report…</span></div>`;

  try {
    const { report, stats } = await generateReport(prompt);
    const reportHtml = marked.parse(report);
    outputEl.innerHTML = `
      <div class="report-output-block">
        <div class="report-output-toolbar">
          <span>Based on <strong>${stats.memoryPoints}</strong> notes &amp; <strong>${stats.knowledgePoints}</strong> KB entries</span>
          <button class="panel-action-btn" id="copy-report-btn">📋 Copy</button>
        </div>
        <div class="report-content">${reportHtml}</div>
      </div>`;

    outputEl
      .querySelector("#copy-report-btn")
      ?.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(report).then(() => {
          const btn = outputEl.querySelector("#copy-report-btn");
          btn.textContent = "✅ Copied!";
          setTimeout(() => (btn.textContent = "📋 Copy"), 2000);
        });
      });
  } catch (err) {
    outputEl.innerHTML = `
      <div class="panel-empty">
        <span>⚠️</span>
        <p>Report generation failed.</p>
        <small>${escapeHtml(err.message)}</small>
      </div>`;
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = "✨ Generate Report";
  }
}

// ── Chat Panel ───────────────────────────────────────────────────────
function initChatPanel(root) {
  const messagesEl = root.querySelector("#home-chat-messages");
  const inputEl = root.querySelector("#home-chat-input");
  const sendBtn = root.querySelector("#home-chat-send");

  inputEl?.addEventListener("click", (e) => e.stopPropagation());
  inputEl?.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + "px";
  });

  inputEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleChatSend(messagesEl, inputEl, sendBtn);
    }
  });

  sendBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    handleChatSend(messagesEl, inputEl, sendBtn);
  });

  root.querySelectorAll(".chat-suggestion").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      inputEl.value = btn.textContent;
      handleChatSend(messagesEl, inputEl, sendBtn);
    });
  });
}

async function handleChatSend(messagesEl, inputEl, sendBtn) {
  const text = inputEl.value.trim();
  if (!text || chatLoading) return;

  const welcome = messagesEl.querySelector(".chat-welcome");
  if (welcome) welcome.remove();

  chatMessages.push({ role: "user", content: text, topics: [] });
  addChatMessage(messagesEl, "user", text);
  inputEl.value = "";
  inputEl.style.height = "auto";

  chatLoading = true;
  sendBtn.disabled = true;
  const loadingEl = showChatLoading(messagesEl);

  try {
    const { answer, topics } = await sendChatMessage(text);
    loadingEl.remove();
    chatMessages.push({ role: "assistant", content: answer, topics });
    addChatMessage(messagesEl, "assistant", answer, topics);
  } catch (err) {
    loadingEl.remove();
    const errMsg = `⚠️ Error: ${err.message}`;
    chatMessages.push({ role: "assistant", content: errMsg, topics: [] });
    addChatMessage(messagesEl, "assistant", errMsg);
  } finally {
    chatLoading = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

function addChatMessage(messagesEl, role, content, topics = []) {
  const msgEl = document.createElement("div");
  msgEl.className = `message ${role}`;
  const avatar = role === "user" ? "👤" : "🧠";
  const parsedContent =
    role === "assistant" ? marked.parse(content) : escapeHtml(content);

  msgEl.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-body">
      <div class="message-content">${parsedContent}</div>
      ${
        topics.length
          ? `<div class="message-topics">${topics
              .map(
                (t) =>
                  `<span class="message-topic-chip">${escapeHtml(t)}</span>`,
              )
              .join("")}</div>`
          : ""
      }
    </div>`;

  messagesEl.appendChild(msgEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showChatLoading(container) {
  const el = document.createElement("div");
  el.className = "message assistant";
  el.innerHTML = `
    <div class="message-avatar">🧠</div>
    <div class="message-body">
      <div class="message-loading">
        <div class="loading-dot"></div>
        <div class="loading-dot"></div>
        <div class="loading-dot"></div>
      </div>
    </div>`;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
