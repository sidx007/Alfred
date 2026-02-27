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
        <div class="chat-welcome-icon">🧠</div>
        <h2>Ask the Assistant</h2>
        <p>Chat with your knowledge base. Ask questions about anything you've learned and get intelligent answers.</p>
        <div class="chat-suggestions" id="chat-suggestions">
          ${SUGGESTIONS.map(
        (s) => `<button class="chat-suggestion">${s}</button>`
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
          ➤
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
            addMessage("assistant", `⚠️ Error: ${err.message}`);
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

        const avatar = role === "user" ? "👤" : "🧠";
        const parsedContent =
            role === "assistant" ? marked.parse(content) : escapeHtml(content);

        msgEl.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-body">
        <div class="message-content">${parsedContent}</div>
        ${topics.length
                ? `<div class="message-topics">
                ${topics
                    .map((t) => `<span class="message-topic-chip">${escapeHtml(t)}</span>`)
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
    <div class="message-avatar">🧠</div>
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
