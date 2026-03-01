// ── Ask the Assistant — Chat Page ────────────────────────────────────
import { marked } from "marked";
import { sendChatMessage } from "../api.js";

// Configure marked for security
marked.setOptions({
  breaks: true,
  gfm: true,
});

let messages = [];
let isLoading = false;

const SUGGESTIONS = [
  "What topics have I learned about?",
  "Summarize my recent notes",
  "Explain the key concepts I've studied",
  "What do I know about business?",
];

export function renderChat(container) {
  messages = [];
  isLoading = false;

  const page = document.createElement("div");
  page.className = "page chat-container";
  page.innerHTML = `
    <div class="chat-messages" id="chat-messages">
      <div class="chat-welcome">
        <div class="chat-welcome-icon"><svg viewBox="0 0 24 24"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg></div>
        <h2>Ask the Assistant</h2>
        <p>Chat with your knowledge base. Ask questions about anything you've learned and get intelligent answers.</p>
        <div class="chat-suggestions" id="chat-suggestions">
          ${SUGGESTIONS.map(
            (s) => `<button class="chat-suggestion">${s}</button>`,
          ).join("")}
        </div>
      </div>
    </div>
    <div class="chat-input-area">
      <div class="chat-input-wrapper">
        <textarea
          id="chat-input"
          class="chat-input"
          placeholder="Ask anything about your knowledge base..."
          rows="1"
        ></textarea>
        <button id="chat-send" class="chat-send-btn" title="Send message">
          <svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
        </button>
      </div>
    </div>
  `;
  container.appendChild(page);

  const messagesEl = page.querySelector("#chat-messages");
  const inputEl = page.querySelector("#chat-input");
  const sendBtn = page.querySelector("#chat-send");

  // Auto-resize textarea
  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
  });

  // Send on Enter (Shift+Enter for newline)
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  sendBtn.addEventListener("click", handleSend);

  // Suggestion clicks
  page.querySelectorAll(".chat-suggestion").forEach((btn) => {
    btn.addEventListener("click", () => {
      inputEl.value = btn.textContent;
      handleSend();
    });
  });

  async function handleSend() {
    const text = inputEl.value.trim();
    if (!text || isLoading) return;

    // Clear welcome
    const welcome = messagesEl.querySelector(".chat-welcome");
    if (welcome) welcome.remove();

    // Add user message
    addMessage("user", text);
    inputEl.value = "";
    inputEl.style.height = "auto";

    // Show loading
    isLoading = true;
    sendBtn.disabled = true;
    const loadingEl = showLoading(messagesEl);

    try {
      const { answer, topics } = await sendChatMessage(text);
      loadingEl.remove();
      addMessage("assistant", answer, topics);
    } catch (err) {
      loadingEl.remove();
      addMessage("assistant", `Error: ${err.message}`);
    } finally {
      isLoading = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  function addMessage(role, content, topics = []) {
    messages.push({ role, content, topics });

    const msgEl = document.createElement("div");
    msgEl.className = `message ${role}`;

    const avatar =
      role === "user"
        ? `<svg viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
        : `<svg viewBox="0 0 24 24"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`;
    const parsedContent =
      role === "assistant" ? marked.parse(content) : escapeHtml(content);

    msgEl.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-body">
        <div class="message-content">${parsedContent}</div>
        ${
          topics.length
            ? `<div class="message-topics">
                ${topics
                  .map(
                    (t) =>
                      `<span class="message-topic-chip">${escapeHtml(t)}</span>`,
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    `;

    messagesEl.appendChild(msgEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

function showLoading(container) {
  const el = document.createElement("div");
  el.className = "message assistant";
  el.innerHTML = `
    <div class="message-avatar"><svg viewBox="0 0 24 24"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg></div>
    <div class="message-body">
      <div class="message-loading">
        <div class="loading-dot"></div>
        <div class="loading-dot"></div>
        <div class="loading-dot"></div>
      </div>
    </div>
  `;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
