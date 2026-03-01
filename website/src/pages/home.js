// ── Alfred Home — Single Column Layout with Wireframe Design ────────
import { marked } from "marked";
import {
  fetchDailyReport,
  fetchTopicCounts,
  fetchTopics,
  generateCustomReport,
  sendChatMessage,
} from "../api.js";

marked.setOptions({ breaks: true, gfm: true });

// ── SVG Icons (Lucide-style, 24x24 viewBox) ─────────────────────────
const ICONS = {
  bookOpen: `<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  user: `<svg viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  sun: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  moon: `<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  mic: `<svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`,
  send: `<svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
  fileText: `<svg viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
  messageCircle: `<svg viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`,
  x: `<svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  arrowLeft: `<svg viewBox="0 0 24 24"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`,
  sparkles: `<svg viewBox="0 0 24 24"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
  inbox: `<svg viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  alertTriangle: `<svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  refreshCw: `<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>`,
};

// ── State ────────────────────────────────────────────────────────────
let chatMessages = [];
let chatLoading = false;
let activeView = null; // null = home, "report" | "chat"
let rootContainer = null;

const SUGGESTIONS = [
  "What topics have I learned about?",
  "Summarize my recent notes",
  "What key concepts have I studied?",
];

// ── Theme toggle helper ──────────────────────────────────────────────
function getTheme() {
  return document.documentElement.getAttribute("data-color-scheme") || "dark";
}

function toggleTheme() {
  const next = getTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-color-scheme", next);
  localStorage.setItem("alfred-theme", next);
  document.querySelectorAll(".theme-toggle").forEach((btn) => {
    btn.innerHTML = next === "dark" ? ICONS.sun : ICONS.moon;
  });
}

function themeIcon() {
  return getTheme() === "dark" ? ICONS.sun : ICONS.moon;
}

// ── Main render ──────────────────────────────────────────────────────
export function renderHome(container) {
  chatMessages = [];
  chatLoading = false;
  activeView = null;
  rootContainer = container;
  renderHomeView();
}

// ══════════════════════════════════════════════════════════════════════
//  HOME VIEW — Top Bar + Main Panel + Chat Input + Action Buttons
// ══════════════════════════════════════════════════════════════════════
function renderHomeView() {
  rootContainer.innerHTML = "";

  const page = document.createElement("div");
  page.className = "home-page";
  page.innerHTML = `
    <!-- Top Bar -->
    <div class="top-bar">
      <div class="top-bar-brand">
        <span class="top-bar-title">Alfred</span>
      </div>
    </div>

    <!-- Main Panel: Daily Revision Report -->
    <div class="main-panel">
      <div class="main-panel-header">
        <span class="main-panel-title">Daily Revision Report</span>
        <span class="main-panel-date" id="panel-date"></span>
      </div>
      <div class="main-panel-body" id="main-panel-body">
        <div class="panel-loading"><div class="spinner"></div><span>Loading topics...</span></div>
      </div>
    </div>

    <!-- Bottom Glass Region -->
    <div class="bottom-glass-region">
      <!-- Chat Input Bar -->
      <div class="chat-input-bar">
        <textarea class="chat-input" id="home-chat-input" placeholder="Ask Alfred anything..." rows="1"></textarea>
        <button class="send-btn" id="home-chat-send" title="Send">${ICONS.send}</button>
      </div>

      <!-- Action Buttons -->
      <div class="action-buttons-row">
        <button class="action-btn" data-action="report">${ICONS.fileText} Custom Report</button>
        <button class="action-btn" data-action="chat">${ICONS.messageCircle} Chat</button>
      </div>
    </div>
  `;

  rootContainer.appendChild(page);

  // Wire action buttons
  page.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "voice") openVoiceMode();
      else if (action === "report") openFullscreen("report");
      else if (action === "chat") openFullscreen("chat");
    });
  });

  // Wire chat input — typing + send opens chat fullscreen
  const chatInput = page.querySelector("#home-chat-input");
  const sendBtn = page.querySelector("#home-chat-send");

  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (text) {
        chatMessages.push({ role: "user", content: text, topics: [] });
        chatInput.value = "";
        openFullscreen("chat");
      }
    }
  });

  sendBtn.addEventListener("click", () => {
    const text = chatInput.value.trim();
    if (text) {
      chatMessages.push({ role: "user", content: text, topics: [] });
      chatInput.value = "";
      openFullscreen("chat");
    }
  });

  // Load daily report into main panel
  loadDailyReport();
}

// ── Load daily reports into main panel as clickable cards ────────────
async function loadDailyReport() {
  const bodyEl = document.querySelector("#main-panel-body");
  const dateEl = document.querySelector("#panel-date");

  try {
    const reports = await fetchDailyReport();

    if (!reports || reports.length === 0) {
      bodyEl.innerHTML = `
        <div class="panel-empty">
          <div class="empty-icon">${ICONS.inbox}</div>
          <p>No daily reports yet.</p>
          <small>Your daily revision reports will appear here once generated.</small>
        </div>`;
      return;
    }

    // Show date from first report
    const reportDate = reports[0]?.date;
    if (reportDate) {
      dateEl.textContent = new Date(reportDate).toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      });
    }

    bodyEl.innerHTML = `<div class="daily-report-cards">${reports
      .map(
        (r, i) => `
        <div class="daily-report-card" data-idx="${i}">
          <div class="daily-report-card-icon">${ICONS.bookOpen}</div>
          <div class="daily-report-card-info">
            <div class="daily-report-card-topic">${escapeHtml(r.topic)}</div>
            <div class="daily-report-card-meta">${r.memoryChunks} notes · ${r.kbChunks} KB entries</div>
          </div>
          <div class="daily-report-card-arrow">${ICONS.chevronRight || "›"}</div>
        </div>`,
      )
      .join("")}</div>`;

    // Click to open in glass overlay
    bodyEl.querySelectorAll(".daily-report-card").forEach((card) => {
      card.addEventListener("click", () => {
        const idx = parseInt(card.dataset.idx);
        const r = reports[idx];
        if (r) {
          openReportFullscreen(r.report, [r.topic], {
            memoryPoints: r.memoryChunks,
            knowledgePoints: r.kbChunks,
          }, true);
        }
      });
    });
  } catch (err) {
    bodyEl.innerHTML = `
      <div class="panel-empty">
        <div class="empty-icon">${ICONS.alertTriangle}</div>
        <p>Failed to load daily reports.</p>
        <small>${escapeHtml(err.message)}</small>
      </div>`;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  VOICE MODE — Real-time Live API (gemini-2.0-flash-live-001)
// ══════════════════════════════════════════════════════════════════════

// PCM audio worklet processor (inline)
const WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
  }
  process(inputs) {
    const input = inputs[0];
    if (input.length > 0) {
      const samples = input[0]; // Float32 mono
      // Accumulate ~100ms chunks at 16kHz = 1600 samples
      this._buffer.push(...samples);
      if (this._buffer.length >= 1600) {
        // Convert float32 → int16
        const pcm16 = new Int16Array(this._buffer.length);
        for (let i = 0; i < this._buffer.length; i++) {
          const s = Math.max(-1, Math.min(1, this._buffer[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
        this._buffer = [];
      }
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

function openVoiceMode() {
  const overlay = document.createElement("div");
  overlay.className = "voice-mode-overlay";
  overlay.innerHTML = `
    <div class="voice-orb" id="voice-orb">
      <div class="voice-orb-ring"></div>
      <div class="voice-orb-ring"></div>
      <div class="voice-orb-ring"></div>
      ${ICONS.mic}
    </div>
    <div class="voice-mode-label" id="voice-label">Connecting...</div>
    <div class="voice-mode-hint" id="voice-hint">Setting up live voice session with Alfred</div>
    <div class="voice-transcript" id="voice-transcript"></div>
    <button class="voice-mode-close" title="Close">${ICONS.x}</button>
  `;
  document.body.appendChild(overlay);

  const orb = overlay.querySelector("#voice-orb");
  const label = overlay.querySelector("#voice-label");
  const hint = overlay.querySelector("#voice-hint");
  const transcript = overlay.querySelector("#voice-transcript");
  const closeBtn = overlay.querySelector(".voice-mode-close");

  let ws = null;
  let audioCtx = null;
  let micStream = null;
  let workletNode = null;
  let isActive = false;

  // ── Audio playback queue ──────────────────────────────────────────
  const audioQueue = [];
  let isPlaying = false;

  function queueAudioChunk(base64Pcm) {
    // Decode base64 → raw bytes
    const raw = atob(base64Pcm);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    // Convert int16 PCM → float32 for Web Audio (24kHz from Gemini)
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    audioQueue.push(float32);
    if (!isPlaying) playNext();
  }

  function playNext() {
    if (audioQueue.length === 0) {
      isPlaying = false;
      return;
    }
    isPlaying = true;
    const samples = audioQueue.shift();
    const buf = audioCtx.createBuffer(1, samples.length, 24000);
    buf.getChannelData(0).set(samples);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.onended = playNext;
    src.start();
  }

  // ── Mic capture (16kHz PCM) ───────────────────────────────────────
  async function startMic() {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    audioCtx = new AudioContext({ sampleRate: 16000 });

    // Register worklet from inline code
    const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    await audioCtx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    const source = audioCtx.createMediaStreamSource(micStream);
    workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");

    workletNode.port.onmessage = (e) => {
      if (!ws || ws.readyState !== WebSocket.OPEN || !isActive) return;
      // e.data is an ArrayBuffer of int16 PCM
      const base64 = arrayBufferToBase64(e.data);
      ws.send(JSON.stringify({ type: "audio", data: base64 }));
    };

    source.connect(workletNode);
    workletNode.connect(audioCtx.destination); // needed to keep the graph alive (silent)
  }

  function stopMic() {
    if (workletNode) {
      workletNode.disconnect();
      workletNode = null;
    }
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++)
      binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  // ── WebSocket to server (/ws/voice → Google Live API) ─────────────
  async function connect() {
    try {
      await startMic();

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.hostname}:3001/ws/voice`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        label.textContent = "Setting up...";
        hint.textContent = "Establishing live session";
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === "setup_complete") {
          isActive = true;
          label.textContent = "Listening...";
          hint.textContent = "Speak naturally — Alfred is listening";
          orb.classList.add("live");
          return;
        }

        if (msg.type === "audio") {
          orb.classList.add("speaking");
          label.textContent = "Alfred is speaking...";
          queueAudioChunk(msg.data);
          return;
        }

        if (msg.type === "text") {
          transcript.textContent = msg.data;
          return;
        }

        if (msg.type === "turn_complete") {
          orb.classList.remove("speaking");
          label.textContent = "Listening...";
          return;
        }

        if (msg.type === "error") {
          label.textContent = "Error";
          hint.textContent = msg.message;
        }
      };

      ws.onerror = () => {
        label.textContent = "Connection error";
        hint.textContent = "Failed to connect to voice service";
      };

      ws.onclose = () => {
        isActive = false;
        orb.classList.remove("live", "speaking");
        label.textContent = "Disconnected";
      };
    } catch (err) {
      console.error("Voice mode error:", err);
      label.textContent = "Error";
      hint.textContent = err.message || "Microphone access denied";
    }
  }

  function cleanup() {
    isActive = false;
    stopMic();
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    overlay.remove();
  }

  closeBtn.addEventListener("click", cleanup);
  const escHandler = (e) => {
    if (e.key === "Escape") {
      cleanup();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);

  // Start immediately
  connect();
}

// ══════════════════════════════════════════════════════════════════════
//  FULLSCREEN VIEW (Chat & Report)
// ══════════════════════════════════════════════════════════════════════
function openFullscreen(panelId) {
  activeView = panelId;
  rootContainer.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "fullscreen-wrapper";

  // ── Floating navigation pill ──
  const nav = document.createElement("div");
  nav.className = "floating-nav";
  nav.innerHTML = `
    <button class="floating-nav-home" title="Back to Home">${ICONS.arrowLeft}</button>
    ${panelId !== "report" ? `<button class="floating-nav-btn" data-target="report">${ICONS.fileText}<span class="floating-nav-label">Report</span></button>` : ""}
    ${panelId !== "chat" ? `<button class="floating-nav-btn" data-target="chat">${ICONS.messageCircle}<span class="floating-nav-label">Chat</span></button>` : ""}
  `;

  const content = document.createElement("div");
  content.className = "fullscreen-content";

  if (panelId === "report") {
    content.innerHTML = `
      <div class="fullscreen-panel">
        <div class="panel-header">
          <span class="panel-title">Custom Report</span>
        </div>
        <div class="panel-body" style="gap:12px">
          <div class="report-topic-section">
            <span class="report-topic-label">Select topics for your custom report:</span>
            <div class="report-topic-chips" id="report-topic-chips">
              <div class="panel-loading"><div class="spinner"></div><span>Loading topics...</span></div>
            </div>
          </div>
          <button class="panel-btn" id="report-generate-btn" disabled>Generate Report</button>
          <div class="panel-scroll-area" id="report-output"></div>
          <div class="saved-reports-section" id="saved-reports-section">
            <div class="saved-reports-header">Saved Reports</div>
            <div class="saved-reports-list" id="saved-reports-list"></div>
          </div>
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
          <span class="panel-title">Chat with Alfred</span>
        </div>
        <div class="chat-messages panel-scroll-area" id="home-chat-messages">
          ${chatMessages.length === 0
        ? `<div class="chat-welcome">
                  <div class="chat-welcome-icon">${ICONS.sparkles}</div>
                  <p>Ask anything about your knowledge base.</p>
                  <div class="chat-suggestions" id="home-chat-suggestions">
                    ${SUGGESTIONS.map((s) => `<button class="chat-suggestion">${s}</button>`).join("")}
                  </div>
                </div>`
        : chatMessages
          .map(
            (m) => `
                  <div class="message ${m.role}">
                    <div class="message-avatar">${m.role === "user" ? ICONS.user : ICONS.sparkles}</div>
                    <div class="message-body">
                      <div class="message-content">${m.role === "assistant" ? marked.parse(m.content) : escapeHtml(m.content)}</div>
                      ${m.topics?.length ? `<div class="message-topics">${m.topics.map((t) => `<span class="message-topic-chip">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
                    </div>
                  </div>`,
          )
          .join("")
      }
        </div>
        <div class="chat-input-area">
          <textarea id="home-chat-input" class="chat-input" placeholder="Ask anything..." rows="1"></textarea>
          <button id="home-chat-send" class="chat-send-btn" title="Send">${ICONS.send}</button>
        </div>
      </div>`;
    wrapper.appendChild(nav);
    wrapper.appendChild(content);
    rootContainer.appendChild(wrapper);
    initChatPanel(content);

    // If there's a pending user message (from home input), auto-send it
    if (
      chatMessages.length > 0 &&
      chatMessages[chatMessages.length - 1].role === "user"
    ) {
      const messagesEl = content.querySelector("#home-chat-messages");
      const inputEl = content.querySelector("#home-chat-input");
      const sendBtnEl = content.querySelector("#home-chat-send");
      const lastMsg = chatMessages[chatMessages.length - 1];

      chatLoading = true;
      sendBtnEl.disabled = true;
      const loadingEl = showChatLoading(messagesEl);

      sendChatMessage(lastMsg.content)
        .then(({ answer, topics }) => {
          loadingEl.remove();
          chatMessages.push({ role: "assistant", content: answer, topics });
          addChatMessage(messagesEl, "assistant", answer, topics);
        })
        .catch((err) => {
          loadingEl.remove();
          const errMsg = `Error: ${err.message}`;
          chatMessages.push({ role: "assistant", content: errMsg, topics: [] });
          addChatMessage(messagesEl, "assistant", errMsg);
        })
        .finally(() => {
          chatLoading = false;
          sendBtnEl.disabled = false;
          inputEl.focus();
        });
    }

    const messagesEl = content.querySelector("#home-chat-messages");
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ── Nav event handlers ──
  nav.querySelector(".floating-nav-home").addEventListener("click", () => {
    activeView = null;
    renderHomeView();
  });

  nav.querySelectorAll(".floating-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => openFullscreen(btn.dataset.target));
  });
}

// ══════════════════════════════════════════════════════════════════════
//  PANEL INIT FUNCTIONS
// ══════════════════════════════════════════════════════════════════════

// ── Report Panel ─────────────────────────────────────────────────────
let reportSelectedTopics = new Set();

function initReportPanel(root) {
  const generateBtn = root.querySelector("#report-generate-btn");
  const outputEl = root.querySelector("#report-output");
  const chipsContainer = root.querySelector("#report-topic-chips");
  reportSelectedTopics = new Set();

  // Load topics and chunk counts as selectable chips
  Promise.all([fetchTopics(), fetchTopicCounts().catch(() => ({}))])
    .then(([topics, counts]) => {
      if (topics.length === 0) {
        chipsContainer.innerHTML = `<span class="report-topic-empty">No topics found in your knowledge base yet.</span>`;
        return;
      }
      chipsContainer.innerHTML = topics
        .map((t) => {
          const count = counts[t] || counts[t.toLowerCase()] || 0;
          return `<button class="report-topic-chip" data-topic="${escapeHtml(t)}" title="${count} chunk${count !== 1 ? "s" : ""}">${ICONS.bookOpen}<span>${escapeHtml(t)}</span><span class="chip-count">${count}</span></button>`;
        })
        .join("");

      chipsContainer.querySelectorAll(".report-topic-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          const topic = chip.dataset.topic;
          if (reportSelectedTopics.has(topic)) {
            reportSelectedTopics.delete(topic);
            chip.classList.remove("selected");
          } else {
            reportSelectedTopics.add(topic);
            chip.classList.add("selected");
          }
          updateReportBtn(generateBtn);
        });
      });
    })
    .catch(() => {
      chipsContainer.innerHTML = `<span class="report-topic-empty">Failed to load topics.</span>`;
    });

  generateBtn?.addEventListener("click", () =>
    handleGenerateReport(generateBtn, outputEl),
  );

  // Load saved reports
  renderSavedReports();
}

function renderSavedReports() {
  const section = document.querySelector("#saved-reports-section");
  const list = document.querySelector("#saved-reports-list");
  if (!section || !list) return;

  const saved = JSON.parse(localStorage.getItem("alfred-saved-reports") || "[]");

  if (saved.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "";
  list.innerHTML = saved
    .map((item, idx) => {
      const date = new Date(item.savedAt).toLocaleDateString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
      const topicStr = (item.topics || []).join(", ");
      return `
        <div class="saved-report-card" data-idx="${idx}">
          <div class="saved-report-info">
            <div class="saved-report-topics">${escapeHtml(topicStr || "Untitled")}</div>
            <div class="saved-report-meta">${date} · ${item.stats?.memoryPoints || 0} notes</div>
          </div>
          <button class="saved-report-delete" data-idx="${idx}" title="Delete">${ICONS.x}</button>
        </div>`;
    })
    .join("");

  // Click to open
  list.querySelectorAll(".saved-report-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".saved-report-delete")) return;
      const idx = parseInt(card.dataset.idx);
      const item = saved[idx];
      if (item) openReportFullscreen(item.report, item.topics || [], item.stats || {}, true);
    });
  });

  // Delete button
  list.querySelectorAll(".saved-report-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      saved.splice(idx, 1);
      localStorage.setItem("alfred-saved-reports", JSON.stringify(saved));
      renderSavedReports();
    });
  });
}

function updateReportBtn(btn) {
  const count = reportSelectedTopics.size;
  btn.disabled = count === 0;
  btn.textContent =
    count > 0
      ? `Generate Report (${count} topic${count !== 1 ? "s" : ""})`
      : "Generate Report";
}

async function handleGenerateReport(generateBtn, outputEl) {
  if (reportSelectedTopics.size === 0 || generateBtn.disabled) return;

  const topics = [...reportSelectedTopics];
  generateBtn.disabled = true;
  generateBtn.textContent = "Generating...";
  outputEl.innerHTML = `<div class="panel-loading"><div class="spinner"></div><span>Alfred is preparing your report — this may take a moment...</span></div>`;

  try {
    const { report, stats } = await generateCustomReport(topics);
    outputEl.innerHTML = `
      <div class="report-output-block">
        <div class="report-output-toolbar">
          <span>Based on <strong>${stats.memoryPoints}</strong> notes &amp; <strong>${stats.knowledgePoints}</strong> KB entries</span>
          <div style="display:flex;gap:6px">
            <button class="panel-action-btn" id="fullscreen-report-btn">⛶ Read</button>
            <button class="panel-action-btn" id="copy-report-btn">Copy</button>
          </div>
        </div>
        <div class="report-content">${marked.parse(report)}</div>
      </div>`;

    outputEl
      .querySelector("#copy-report-btn")
      ?.addEventListener("click", () => {
        navigator.clipboard.writeText(report).then(() => {
          const btn = outputEl.querySelector("#copy-report-btn");
          btn.textContent = "Copied!";
          setTimeout(() => (btn.textContent = "Copy"), 2000);
        });
      });

    outputEl
      .querySelector("#fullscreen-report-btn")
      ?.addEventListener("click", () => openReportFullscreen(report, topics, stats));
  } catch (err) {
    outputEl.innerHTML = `
      <div class="panel-empty">
        <div class="empty-icon">${ICONS.alertTriangle}</div>
        <p>Report generation failed.</p>
        <small>${escapeHtml(err.message)}</small>
      </div>`;
  } finally {
    updateReportBtn(generateBtn);
  }
}

// ── Fullscreen Report Overlay ────────────────────────────────────────
function openReportFullscreen(report, topics, stats, isSaved = false) {
  const overlay = document.createElement("div");
  overlay.className = "report-fullscreen-overlay";
  overlay.innerHTML = `
    <div class="report-fullscreen-card">
      <div class="report-fullscreen-toolbar">
        <div class="report-fullscreen-title">${escapeHtml(topics.join(", "))}</div>
        <div class="report-fullscreen-actions">
          <span class="report-fullscreen-stats">${stats.memoryPoints} notes · ${stats.knowledgePoints} KB</span>
          <button class="panel-action-btn" id="fs-copy-btn">Copy</button>
          ${!isSaved ? '<button class="panel-action-btn" id="fs-save-btn">Save</button>' : ''}
          <button class="panel-action-btn report-fullscreen-close" id="fs-close-btn">${ICONS.x}</button>
        </div>
      </div>
      <div class="report-fullscreen-body">
        <div class="report-content">${marked.parse(report)}</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Force reflow then fade in
  requestAnimationFrame(() => overlay.classList.add("visible"));

  const closeBtn = overlay.querySelector("#fs-close-btn");
  const copyBtn = overlay.querySelector("#fs-copy-btn");
  const saveBtn = overlay.querySelector("#fs-save-btn");

  const cleanup = () => {
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 200);
    document.removeEventListener("keydown", escHandler);
  };

  closeBtn.addEventListener("click", cleanup);

  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(report).then(() => {
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy"), 2000);
    });
  });

  saveBtn.addEventListener("click", () => {
    const saved = JSON.parse(localStorage.getItem("alfred-saved-reports") || "[]");
    saved.unshift({
      id: Date.now(),
      topics,
      report,
      stats,
      savedAt: new Date().toISOString(),
    });
    localStorage.setItem("alfred-saved-reports", JSON.stringify(saved));
    saveBtn.textContent = "Saved!";
    setTimeout(() => (saveBtn.textContent = "Save"), 2000);
    renderSavedReports();
  });

  const escHandler = (e) => { if (e.key === "Escape") cleanup(); };
  document.addEventListener("keydown", escHandler);
}

// ── Chat Panel ───────────────────────────────────────────────────────
function initChatPanel(root) {
  const messagesEl = root.querySelector("#home-chat-messages");
  const inputEl = root.querySelector("#home-chat-input");
  const sendBtn = root.querySelector("#home-chat-send");

  inputEl?.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
  });

  inputEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleChatSend(messagesEl, inputEl, sendBtn);
    }
  });

  sendBtn?.addEventListener("click", () =>
    handleChatSend(messagesEl, inputEl, sendBtn),
  );

  root.querySelectorAll(".chat-suggestion").forEach((btn) => {
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
    const errMsg = `Error: ${err.message}`;
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
  const avatar = role === "user" ? ICONS.user : ICONS.sparkles;
  const parsedContent =
    role === "assistant" ? marked.parse(content) : escapeHtml(content);

  msgEl.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-body">
      <div class="message-content">${parsedContent}</div>
      ${topics.length
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
    <div class="message-avatar">${ICONS.sparkles}</div>
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

// ── Utility ──────────────────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
