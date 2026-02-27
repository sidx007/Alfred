// ── Alfred Home — 3-Panel Hyprland Layout ───────────────────────────
import { marked } from "marked";
import { fetchDailyReport, generateReport, sendChatMessage } from "../api.js";

marked.setOptions({ breaks: true, gfm: true });

// ── Chat state ───────────────────────────────────────────────────────
let chatMessages = [];
let chatLoading = false;

const SUGGESTIONS = [
    "What topics have I learned about?",
    "Summarize my recent notes",
    "What key concepts have I studied?",
];

// ── Main render ──────────────────────────────────────────────────────
export function renderHome(container) {
    chatMessages = [];
    chatLoading = false;

    const page = document.createElement("div");
    page.className = "home-page";
    page.innerHTML = `
      <!-- ── Top Panel: Daily Revision Report ── -->
      <div class="home-panel panel-revision">
        <div class="panel-header">
          <span class="panel-title">📅 Daily Revision Report</span>
          <button class="panel-action-btn" id="revision-refresh-btn" title="Refresh">↻</button>
        </div>
        <div class="panel-body" id="revision-body">
          <div class="panel-loading">
            <div class="spinner"></div>
            <span>Loading daily report…</span>
          </div>
        </div>
      </div>

      <!-- ── Bottom Row ── -->
      <div class="home-bottom">

        <!-- ── Bottom-Left: Custom Report Generator ── -->
        <div class="home-panel panel-report">
          <div class="panel-header">
            <span class="panel-title">📊 Custom Report</span>
          </div>
          <div class="panel-body panel-report-body">
            <textarea
              id="report-prompt-input"
              class="report-prompt-textarea"
              placeholder="Describe what you'd like a report about… e.g. 'summarise everything I know about machine learning'"
              rows="3"
            ></textarea>
            <button class="panel-btn" id="report-generate-btn">✨ Generate Report</button>
            <div class="panel-scroll-area" id="report-output"></div>
          </div>
        </div>

        <!-- ── Bottom-Right: Chat ── -->
        <div class="home-panel panel-chat">
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
            <textarea
              id="home-chat-input"
              class="chat-input"
              placeholder="Ask anything…"
              rows="1"
            ></textarea>
            <button id="home-chat-send" class="chat-send-btn" title="Send">➤</button>
          </div>
        </div>

      </div>
    `;

    container.appendChild(page);

    // ── Wire up each panel ───────────────────────────────────────────
    initRevisionPanel(page);
    initReportPanel(page);
    initChatPanel(page);
}

// ── Revision Panel ───────────────────────────────────────────────────
function initRevisionPanel(page) {
    const body = page.querySelector("#revision-body");
    const refreshBtn = page.querySelector("#revision-refresh-btn");

    loadDailyReport(body);

    refreshBtn.addEventListener("click", () => {
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
                <small>Reports will appear here once added to the <em>daily report</em> collection in Qdrant.</small>
              </div>`;
            return;
        }
        const dateStr = date
            ? new Date(date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
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
function initReportPanel(page) {
    const promptInput = page.querySelector("#report-prompt-input");
    const generateBtn = page.querySelector("#report-generate-btn");
    const outputEl = page.querySelector("#report-output");

    generateBtn.addEventListener("click", () => handleGenerateReport(promptInput, generateBtn, outputEl));

    promptInput.addEventListener("keydown", (e) => {
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

        outputEl.querySelector("#copy-report-btn")?.addEventListener("click", () => {
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
function initChatPanel(page) {
    const messagesEl = page.querySelector("#home-chat-messages");
    const inputEl = page.querySelector("#home-chat-input");
    const sendBtn = page.querySelector("#home-chat-send");

    // Auto-resize textarea
    inputEl.addEventListener("input", () => {
        inputEl.style.height = "auto";
        inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + "px";
    });

    inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleChatSend(messagesEl, inputEl, sendBtn);
        }
    });

    sendBtn.addEventListener("click", () => handleChatSend(messagesEl, inputEl, sendBtn));

    page.querySelectorAll(".chat-suggestion").forEach((btn) => {
        btn.addEventListener("click", () => {
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

    addChatMessage(messagesEl, "user", text);
    inputEl.value = "";
    inputEl.style.height = "auto";

    chatLoading = true;
    sendBtn.disabled = true;
    const loadingEl = showChatLoading(messagesEl);

    try {
        const { answer, topics } = await sendChatMessage(text);
        loadingEl.remove();
        addChatMessage(messagesEl, "assistant", answer, topics);
    } catch (err) {
        loadingEl.remove();
        addChatMessage(messagesEl, "assistant", `⚠️ Error: ${err.message}`);
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
    const parsedContent = role === "assistant" ? marked.parse(content) : escapeHtml(content);

    msgEl.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-body">
        <div class="message-content">${parsedContent}</div>
        ${topics.length
            ? `<div class="message-topics">${topics.map((t) => `<span class="message-topic-chip">${escapeHtml(t)}</span>`).join("")}</div>`
            : ""}
      </div>`;

    messagesEl.appendChild(msgEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showChatLoading(messagesEl) {
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
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}
