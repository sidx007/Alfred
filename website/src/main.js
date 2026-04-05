import { marked } from "marked";
import {
  fetchActivitySummary,
    fetchChecklistItems,
    fetchDailyReportTasks,
    fetchFlashcards,
    fetchTopicCounts,
    fetchTopics,
    generateCustomReport,
    generateFlashcardsFromTodayReports,
    runUploadPipeline,
    sendChatMessage,
} from "./api.js";

marked.setOptions({ gfm: true, breaks: true });

const SUGGESTIONS = [
  "What topics have I learned this week?",
  "Summarize the most important ideas in my notes.",
  "What should I revise next?",
  "Explain my latest learning progress.",
];

const MAX_UPLOAD_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 2000;
const DEFAULT_RSVP_WPM = 320;
const MIN_RSVP_WPM = 120;
const MAX_RSVP_WPM = 900;
const RSVP_CONTEXT_RADIUS = 8;
const MAX_PDF_PAGES = 120;
const MAX_PDF_TEXT_CHARS = 400000;

const readerState = {
  title: "",
  markdown: "",
  plainText: "",
  tokens: [],
  index: 0,
  mode: "markdown",
  running: false,
  timerId: null,
  wpm: DEFAULT_RSVP_WPM,
  contextVisible: true,
  elapsedMs: 0,
  lastTickAt: 0,
};

const state = {
  activeTab: "home",
  topics: [],
  topicCounts: {},
  dailyReports: [],
  checklist: [],
  checklistDone: new Set(),
  flashcards: [],
  flashcardRevealed: false,
  flashcardsLoading: false,
  flashcardsStatus: "No flashcards generated for today yet.",
  chatMessages: [],
  chatLoading: false,
  activityHeatmap: {
    year: new Date().getFullYear(),
    totalDays: 30,
    activeDays: 0,
    weekColumns: 5,
    monthLabels: [],
    cells: [],
  },
  activityYear: {
    year: new Date().getFullYear(),
    activeDays: 0,
    currentStreak: 0,
    longestStreak: 0,
    bestMonth: "Jan",
    bestMonthActiveDays: 0,
    todayActive: false,
    monthlyCounts: Array.from({ length: 12 }, () => 0),
  },
  activityExpanded: true,
  selectedTopics: new Set(),
  customLoading: false,
  customReport: "",
  customStats: null,
  jobs: [],
  queueRunning: false,
  uploadDrawerOpen: false,
};

function getDefaultActivityHeatmap() {
  return {
    year: new Date().getFullYear(),
    totalDays: 30,
    activeDays: 0,
    weekColumns: 5,
    monthLabels: [],
    cells: [],
  };
}

function getDefaultActivityYear() {
  return {
    year: new Date().getFullYear(),
    activeDays: 0,
    currentStreak: 0,
    longestStreak: 0,
    bestMonth: "Jan",
    bestMonthActiveDays: 0,
    todayActive: false,
    monthlyCounts: Array.from({ length: 12 }, () => 0),
  };
}

function normalizeActivityHeatmap(activity) {
  const candidate = activity?.heatmap;
  if (!candidate || !Array.isArray(candidate.cells)) {
    return getDefaultActivityHeatmap();
  }

  const totalDays = Number(candidate.totalDays || 0);
  if (totalDays < 1 || totalDays > 45) {
    return getDefaultActivityHeatmap();
  }

  const cells = candidate.cells;
  const derivedWeekColumns = Math.max(1, Math.ceil(cells.length / 7));
  const rawWeekColumns = Number(candidate.weekColumns || 0);
  const weekColumns =
    Number.isFinite(rawWeekColumns) &&
    rawWeekColumns >= 1 &&
    rawWeekColumns <= Math.max(12, derivedWeekColumns + 2)
      ? Math.round(rawWeekColumns)
      : derivedWeekColumns;

  return {
    year: Number(candidate.year || new Date().getFullYear()),
    totalDays,
    activeDays: Number(candidate.activeDays || 0),
    weekColumns,
    monthLabels: Array.isArray(candidate.monthLabels)
      ? candidate.monthLabels.filter((monthLabel) => {
          const column = Number(monthLabel?.column);
          return Number.isFinite(column) && column >= 0 && column < weekColumns;
        })
      : [],
    cells,
  };
}

function normalizeActivityYear(activity) {
  const candidate = activity?.year;
  if (!candidate) return getDefaultActivityYear();

  return {
    year: Number(candidate.year || new Date().getFullYear()),
    activeDays: Number(candidate.activeDays || 0),
    currentStreak: Number(candidate.currentStreak || 0),
    longestStreak: Number(candidate.longestStreak || 0),
    bestMonth: String(candidate.bestMonth || "Jan"),
    bestMonthActiveDays: Number(candidate.bestMonthActiveDays || 0),
    todayActive: Boolean(candidate.todayActive),
    monthlyCounts: Array.isArray(candidate.monthlyCounts)
      ? candidate.monthlyCounts
      : Array.from({ length: 12 }, () => 0),
  };
}

const reportCache = new Map();
let refs = {};
let idCounter = 0;
let hasBooted = false;

export async function boot() {
  if (hasBooted) return;
  hasBooted = true;
  renderShell();
  readerState.wpm = loadRsvpWpmPreference();
  readerState.contextVisible = loadRsvpContextPreference();
  readerState.mode = loadReaderModePreference();
  bindEvents();
  restoreTheme();
  switchTab("home");
  await hydrateData();
  renderAll();
}

function renderShell() {
  const app = document.getElementById("app");
  app.innerHTML = `
		<div class="portal-shell">
			<header class="masthead glass">
				<div class="brand-block">
					<p class="brand-kicker">Knowledge Operations</p>
					<h1>Alfred Portal</h1>
				</div>
				<div class="masthead-actions">
					<button id="theme-toggle" class="ghost-btn" type="button" aria-label="Toggle theme">
						Theme
					</button>
					<button id="upload-pill" class="upload-pill hidden" type="button"></button>
				</div>
			</header>

			<main class="panel-stack">
				<section class="panel glass is-active" data-panel="home">
					<div class="panel-head">
						<div>
							<h2>Capture Desk</h2>
              <p>Paste notes or upload a PDF. PDF text is extracted locally and sent through the same text processing pipeline.</p>
						</div>
					</div>

          <section id="activity-overview" class="activity-overview"></section>

					<div class="home-stats" id="home-stats"></div>

					<div class="home-grid">
						<article class="tile tile-text">
							<h3>Text Capture</h3>
              <div class="capture-entry-unified">
                <textarea id="text-capture" placeholder="Paste notes, ideas, or transcript text..."></textarea>
                <div class="capture-side-actions">
                  <button id="pdf-upload-trigger" class="ghost-btn" type="button">Upload PDF</button>
                  <button id="text-submit" class="primary-btn" type="button">Process Text</button>
                </div>
              </div>
              <input id="pdf-file" class="capture-file-input-hidden" type="file" accept="application/pdf,.pdf" />
						</article>

						<article class="tile tile-topics">
							<h3>Topic Heatmap</h3>
							<div id="topic-cloud" class="topic-cloud"></div>
						</article>

						<article class="tile tile-reports">
							<h3>Daily Reports</h3>
							<div id="daily-report-list" class="report-list"></div>
						</article>
					</div>
				</section>

				<section class="panel glass" data-panel="chat">
					<div class="panel-head">
						<div>
							<h2>Chat</h2>
							<p>Query your memory and knowledge base with RAG-powered answers.</p>
						</div>
					</div>

					<div id="chat-log" class="chat-log"></div>

					<div class="chat-entry">
						<textarea id="chat-input" placeholder="Ask Alfred anything about your knowledge..." rows="2"></textarea>
						<button id="chat-send" class="primary-btn" type="button">Send</button>
					</div>
				</section>

				<section class="panel glass" data-panel="reports">
					<div class="panel-head">
						<div>
							<h2>Custom Reports</h2>
							<p>Select topics and generate structured reports from your stored knowledge.</p>
						</div>
					</div>

					<div class="report-layout">
						<aside class="topics-pane">
							<div class="topic-actions">
								<button id="topics-select-all" class="ghost-btn" type="button">Select all</button>
								<button id="topics-clear" class="ghost-btn" type="button">Clear</button>
							</div>
							<div id="custom-topic-chips" class="custom-topic-chips"></div>
							<button id="custom-generate" class="primary-btn" type="button" disabled>Generate Report</button>
						</aside>
						<div id="custom-output" class="custom-output"></div>
					</div>
				</section>

				<section class="panel glass" data-panel="checklist">
					<div class="panel-head">
						<div>
							<h2>Checklist</h2>
							<p>Track completion and open full report details for each daily task.</p>
						</div>
					</div>
					<div id="checklist-list" class="checklist-list"></div>
				</section>

				<section class="panel glass" data-panel="flashcards">
					<div class="panel-head">
						<div>
							<h2>Flashcards</h2>
							<p>Use spaced repetition style grading for quick active recall.</p>
						</div>
					</div>

          <div class="flashcard-toolbar">
            <button id="flashcards-generate" class="primary-btn" type="button">Generate From Today's Reports</button>
            <p id="flashcards-status" class="flashcard-status"></p>
          </div>

					<div id="flashcard-stage" class="flashcard-stage"></div>

					<div id="flashcard-actions" class="flashcard-actions hidden">
						<button id="grade-again" class="grade-btn grade-again" type="button">Again</button>
						<button id="grade-good" class="grade-btn grade-good" type="button">Good</button>
						<button id="grade-easy" class="grade-btn grade-easy" type="button">Easy</button>
					</div>
				</section>
			</main>

			<nav class="dock glass">
				<button class="dock-btn is-active" type="button" data-tab="home">Home</button>
				<button class="dock-btn" type="button" data-tab="chat">Chat</button>
				<button class="dock-btn" type="button" data-tab="reports">Reports</button>
				<button class="dock-btn" type="button" data-tab="checklist">Checklist</button>
				<button class="dock-btn" type="button" data-tab="flashcards">Flashcards</button>
			</nav>
		</div>

		<div id="upload-overlay" class="drawer-overlay hidden" role="dialog" aria-modal="true">
			<aside class="drawer glass">
				<div class="drawer-head">
					<h3>Upload Status</h3>
					<div class="drawer-head-actions">
						<button id="upload-clear-done" class="ghost-btn" type="button">Clear done</button>
						<button id="upload-close" class="ghost-btn" type="button">Close</button>
					</div>
				</div>
				<div id="upload-jobs" class="upload-jobs"></div>
			</aside>
		</div>

    <div id="reader-overlay" class="reader-overlay hidden" role="dialog" aria-modal="true">
      <article id="reader-card" class="reader-card glass">
				<header class="reader-header">
					<div class="reader-heading">
						<h3 id="reader-title">Report</h3>
						<p id="reader-subtitle">Read in classic or RSVP mode.</p>
					</div>
					<div class="reader-header-actions">
						<button id="reader-mode-markdown" class="ghost-btn reader-mode-btn is-active" type="button">Classic</button>
						<button id="reader-mode-rsvp" class="ghost-btn reader-mode-btn" type="button">RSVP</button>
            <button id="reader-fullscreen" class="ghost-btn" type="button">Fullscreen</button>
						<button id="reader-close" class="ghost-btn" type="button">Close</button>
					</div>
				</header>
				<div id="reader-content" class="reader-content md-output"></div>
				<section id="rsvp-view" class="rsvp-view hidden">
					<div class="rsvp-meta">
						<p id="rsvp-progress-label">0 / 0 words</p>
						<p id="rsvp-time-label">Elapsed 0:00 · Left 0:00</p>
					</div>
					<div class="rsvp-progress-track" aria-hidden="true">
						<span id="rsvp-progress-fill" class="rsvp-progress-fill"></span>
					</div>

					<div class="rsvp-stage">
						<span class="rsvp-guide rsvp-guide-top" aria-hidden="true"></span>
						<span class="rsvp-guide rsvp-guide-bottom" aria-hidden="true"></span>
						<span class="rsvp-guide rsvp-guide-vertical" aria-hidden="true"></span>
						<div class="rsvp-word" id="rsvp-word">
							<span id="rsvp-left" class="rsvp-left"></span>
							<span id="rsvp-orp" class="rsvp-orp"></span>
							<span id="rsvp-right" class="rsvp-right"></span>
						</div>
					</div>

					<p id="rsvp-context" class="rsvp-context"></p>

					<div class="rsvp-controls">
						<button id="rsvp-back-10" class="ghost-btn" type="button">-10</button>
						<button id="rsvp-back-1" class="ghost-btn" type="button">-1</button>
						<button id="rsvp-play" class="primary-btn" type="button">Play</button>
						<button id="rsvp-forward-1" class="ghost-btn" type="button">+1</button>
						<button id="rsvp-forward-10" class="ghost-btn" type="button">+10</button>
						<button id="rsvp-restart" class="ghost-btn" type="button">Restart</button>
					</div>

					<div class="rsvp-speed-row">
						<label class="rsvp-speed-label" for="rsvp-wpm">Speed <strong id="rsvp-wpm-value">${DEFAULT_RSVP_WPM}</strong> WPM</label>
						<input id="rsvp-wpm" class="rsvp-wpm" type="range" min="${MIN_RSVP_WPM}" max="${MAX_RSVP_WPM}" step="10" value="${DEFAULT_RSVP_WPM}" />
						<button id="rsvp-context-toggle" class="ghost-btn" type="button">Hide Context</button>
					</div>

					<p class="rsvp-hint">Keys: Space play/pause · J/L jump 10 · A/D speed · C context · R restart</p>
				</section>
			</article>
		</div>
	`;

  refs = {
    panels: Array.from(document.querySelectorAll(".panel")),
    dockButtons: Array.from(document.querySelectorAll(".dock-btn")),
    themeToggle: document.getElementById("theme-toggle"),
    uploadPill: document.getElementById("upload-pill"),
    activityOverview: document.getElementById("activity-overview"),
    homeStats: document.getElementById("home-stats"),
    textCapture: document.getElementById("text-capture"),
    textSubmit: document.getElementById("text-submit"),
    pdfUploadTrigger: document.getElementById("pdf-upload-trigger"),
    pdfFile: document.getElementById("pdf-file"),
    topicCloud: document.getElementById("topic-cloud"),
    dailyReportList: document.getElementById("daily-report-list"),
    chatLog: document.getElementById("chat-log"),
    chatInput: document.getElementById("chat-input"),
    chatSend: document.getElementById("chat-send"),
    customTopicChips: document.getElementById("custom-topic-chips"),
    customGenerate: document.getElementById("custom-generate"),
    customOutput: document.getElementById("custom-output"),
    topicsSelectAll: document.getElementById("topics-select-all"),
    topicsClear: document.getElementById("topics-clear"),
    checklistList: document.getElementById("checklist-list"),
    flashcardsGenerate: document.getElementById("flashcards-generate"),
    flashcardsStatus: document.getElementById("flashcards-status"),
    flashcardStage: document.getElementById("flashcard-stage"),
    flashcardActions: document.getElementById("flashcard-actions"),
    gradeAgain: document.getElementById("grade-again"),
    gradeGood: document.getElementById("grade-good"),
    gradeEasy: document.getElementById("grade-easy"),
    uploadOverlay: document.getElementById("upload-overlay"),
    uploadJobs: document.getElementById("upload-jobs"),
    uploadClose: document.getElementById("upload-close"),
    uploadClearDone: document.getElementById("upload-clear-done"),
    readerOverlay: document.getElementById("reader-overlay"),
    readerCard: document.getElementById("reader-card"),
    readerTitle: document.getElementById("reader-title"),
    readerSubtitle: document.getElementById("reader-subtitle"),
    readerContent: document.getElementById("reader-content"),
    readerModeMarkdown: document.getElementById("reader-mode-markdown"),
    readerModeRsvp: document.getElementById("reader-mode-rsvp"),
    readerFullscreen: document.getElementById("reader-fullscreen"),
    rsvpView: document.getElementById("rsvp-view"),
    rsvpProgressLabel: document.getElementById("rsvp-progress-label"),
    rsvpTimeLabel: document.getElementById("rsvp-time-label"),
    rsvpProgressFill: document.getElementById("rsvp-progress-fill"),
    rsvpLeft: document.getElementById("rsvp-left"),
    rsvpOrp: document.getElementById("rsvp-orp"),
    rsvpRight: document.getElementById("rsvp-right"),
    rsvpContext: document.getElementById("rsvp-context"),
    rsvpBack10: document.getElementById("rsvp-back-10"),
    rsvpBack1: document.getElementById("rsvp-back-1"),
    rsvpPlay: document.getElementById("rsvp-play"),
    rsvpForward1: document.getElementById("rsvp-forward-1"),
    rsvpForward10: document.getElementById("rsvp-forward-10"),
    rsvpRestart: document.getElementById("rsvp-restart"),
    rsvpWpm: document.getElementById("rsvp-wpm"),
    rsvpWpmValue: document.getElementById("rsvp-wpm-value"),
    rsvpContextToggle: document.getElementById("rsvp-context-toggle"),
    readerClose: document.getElementById("reader-close"),
  };
}

function bindEvents() {
  refs.dockButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.tab);
    });
  });

  refs.themeToggle.addEventListener("click", toggleTheme);

  refs.textSubmit.addEventListener("click", handleTextUpload);
  refs.pdfUploadTrigger.addEventListener("click", () => {
    refs.pdfFile.click();
  });
  refs.pdfFile.addEventListener("change", handlePdfUpload);

  refs.chatSend.addEventListener("click", handleChatSend);
  refs.chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleChatSend();
    }
  });

  refs.topicsSelectAll.addEventListener("click", () => {
    state.selectedTopics = new Set(state.topics);
    renderCustomTopics();
    renderCustomOutput();
  });

  refs.topicsClear.addEventListener("click", () => {
    state.selectedTopics = new Set();
    renderCustomTopics();
    renderCustomOutput();
  });

  refs.customGenerate.addEventListener("click", handleGenerateCustomReport);

  refs.flashcardStage.addEventListener("click", () => {
    if (!state.flashcards.length || state.flashcardRevealed) return;
    state.flashcardRevealed = true;
    renderFlashcards();
  });

  refs.gradeAgain.addEventListener("click", () => gradeFlashcard("again"));
  refs.gradeGood.addEventListener("click", () => gradeFlashcard("good"));
  refs.gradeEasy.addEventListener("click", () => gradeFlashcard("easy"));
  refs.flashcardsGenerate.addEventListener(
    "click",
    handleGenerateDailyFlashcards,
  );

  refs.uploadPill.addEventListener("click", () => {
    setUploadDrawerOpen(true);
  });

  refs.uploadClose.addEventListener("click", () => {
    setUploadDrawerOpen(false);
  });

  refs.uploadOverlay.addEventListener("click", (event) => {
    if (event.target === refs.uploadOverlay) setUploadDrawerOpen(false);
  });

  refs.uploadClearDone.addEventListener("click", clearFinishedJobs);

  refs.readerModeMarkdown.addEventListener("click", () =>
    setReaderMode("markdown"),
  );
  refs.readerModeRsvp.addEventListener("click", () => setReaderMode("rsvp"));
  refs.readerFullscreen.addEventListener("click", toggleReaderFullscreen);
  refs.rsvpPlay.addEventListener("click", toggleRsvpPlayback);
  refs.rsvpBack10.addEventListener("click", () => shiftRsvpIndex(-10));
  refs.rsvpBack1.addEventListener("click", () => shiftRsvpIndex(-1));
  refs.rsvpForward1.addEventListener("click", () => shiftRsvpIndex(1));
  refs.rsvpForward10.addEventListener("click", () => shiftRsvpIndex(10));
  refs.rsvpRestart.addEventListener("click", restartRsvpPlayback);
  refs.rsvpWpm.addEventListener("input", () => {
    setRsvpWpm(Number(refs.rsvpWpm.value));
  });
  refs.rsvpContextToggle.addEventListener("click", toggleRsvpContext);

  refs.readerClose.addEventListener("click", closeReportReader);
  refs.readerOverlay.addEventListener("click", (event) => {
    if (event.target === refs.readerOverlay) closeReportReader();
  });

  document.addEventListener("fullscreenchange", syncReaderFullscreenButton);

  document.addEventListener("keydown", handleGlobalKeydown);
}

async function hydrateData() {
  const results = await Promise.allSettled([
    fetchTopics(),
    fetchTopicCounts(),
    fetchDailyReportTasks(),
    fetchChecklistItems(),
    fetchFlashcards(),
    fetchActivitySummary(),
  ]);

  if (results[0].status === "fulfilled") {
    state.topics = results[0].value;
  } else {
    console.error("Failed to load topics:", results[0].reason);
    state.topics = [];
  }

  if (results[1].status === "fulfilled") {
    state.topicCounts = results[1].value;
  } else {
    console.error("Failed to load topic counts:", results[1].reason);
    state.topicCounts = {};
  }

  if (results[2].status === "fulfilled") {
    state.dailyReports = Array.isArray(results[2].value)
      ? results[2].value
      : [];
  } else {
    console.error("Failed to load daily reports:", results[2].reason);
    state.dailyReports = [];
  }

  if (results[3].status === "fulfilled") {
    const items = Array.isArray(results[3].value) ? results[3].value : [];
    state.checklist = items.length ? items : state.dailyReports;
  } else {
    console.error("Failed to load checklist:", results[3].reason);
    state.checklist = state.dailyReports;
  }

  state.checklistDone = new Set(
    state.checklist
      .filter((item) => item.completed)
      .map((item) => String(item.id)),
  );

  if (results[4].status === "fulfilled") {
    const cards = Array.isArray(results[4].value) ? results[4].value : [];
    state.flashcards = cards;
    state.flashcardsStatus = cards.length
      ? `Loaded ${cards.length} flashcards for today.`
      : "No flashcards generated for today yet.";
  } else {
    console.error("Failed to load flashcards:", results[4].reason);
    state.flashcards = [];
    state.flashcardsStatus = "Could not load today's flashcards.";
  }

  if (results[5].status === "fulfilled") {
    const activity = results[5].value || {};
    state.activityHeatmap = normalizeActivityHeatmap(activity);
    state.activityYear = normalizeActivityYear(activity);
  } else {
    console.error("Failed to load activity summary:", results[5].reason);
    state.activityHeatmap = getDefaultActivityHeatmap();
    state.activityYear = getDefaultActivityYear();
  }

  state.flashcardRevealed = false;
}

function renderAll() {
  renderActivityOverview();
  renderHomeStats();
  renderTopicCloud();
  renderDailyReports();
  renderChat();
  renderCustomTopics();
  renderCustomOutput();
  renderChecklist();
  renderFlashcards();
  renderUploadPill();
  renderUploadDrawer();
}

function switchTab(tab) {
  state.activeTab = tab;
  refs.dockButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tab);
  });
  refs.panels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === tab);
  });
}

function getTheme() {
  return document.documentElement.getAttribute("data-color-scheme") || "dark";
}

function restoreTheme() {
  const saved = localStorage.getItem("alfred-theme") || "dark";
  document.documentElement.setAttribute("data-color-scheme", saved);
  refs.themeToggle.textContent = saved === "dark" ? "Light" : "Dark";
}

function toggleTheme() {
  const nextTheme = getTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-color-scheme", nextTheme);
  localStorage.setItem("alfred-theme", nextTheme);
  refs.themeToggle.textContent = nextTheme === "dark" ? "Light" : "Dark";
}

function renderHomeStats() {
  const topicCount = state.topics.length;
  const reportCount = state.dailyReports.length;
  const flashcardCount = state.flashcards.length;

  refs.homeStats.innerHTML = `
		<article>
			<h4>Topics</h4>
			<p>${topicCount}</p>
		</article>
		<article>
			<h4>Daily Reports</h4>
			<p>${reportCount}</p>
		</article>
		<article>
			<h4>Flashcards</h4>
			<p>${flashcardCount}</p>
		</article>
	`;
}

function renderActivityOverview() {
  const heatmap = state.activityHeatmap || {
    year: new Date().getFullYear(),
    totalDays: 30,
    activeDays: 0,
    weekColumns: 5,
    monthLabels: [],
    cells: [],
  };
  const year = state.activityYear || {
    year: new Date().getFullYear(),
    activeDays: 0,
    currentStreak: 0,
    longestStreak: 0,
    bestMonth: "Jan",
    bestMonthActiveDays: 0,
    todayActive: false,
    monthlyCounts: Array.from({ length: 12 }, () => 0),
  };

  const totalDays = Number(heatmap.totalDays || 30);
  const activeDays = Number(heatmap.activeDays || 0);
  const cells = Array.isArray(heatmap.cells) ? heatmap.cells : [];
  const derivedWeekColumns = Math.max(1, Math.ceil(cells.length / 7));
  const rawWeekColumns = Number(heatmap.weekColumns || 0);
  const weekColumns =
    Number.isFinite(rawWeekColumns) &&
    rawWeekColumns >= 1 &&
    rawWeekColumns <= Math.max(12, derivedWeekColumns + 2)
      ? Math.round(rawWeekColumns)
      : derivedWeekColumns;
  const monthLabels = Array.isArray(heatmap.monthLabels)
    ? heatmap.monthLabels.filter((monthLabel) => {
        const column = Number(monthLabel?.column);
        return Number.isFinite(column) && column >= 0 && column < weekColumns;
      })
    : [];
  const percent = totalDays > 0 ? Math.round((activeDays / totalDays) * 100) : 0;
  const emptyHeatmapCopy =
    activeDays > 0
      ? `${activeDays} focused days logged in this 30-day window.`
      : "No activity yet. Upload notes or chat today to light up your first square.";

  refs.activityOverview.innerHTML = `
    <article class="activity-card">
      <header class="activity-card-head">
        <div>
          <h3>Monthly Momentum</h3>
          <p>${activeDays}/${totalDays} active days in the last 30 days</p>
        </div>
        <span class="activity-pill">${percent}%</span>
      </header>

      <div class="activity-metric-strip">
        <article class="activity-metric">
          <h4>${Number(year.currentStreak || 0)}</h4>
          <p>Current streak</p>
        </article>
        <article class="activity-metric">
          <h4>${Number(year.longestStreak || 0)}</h4>
          <p>Longest streak</p>
        </article>
        <article class="activity-metric">
          <h4>${Number(year.bestMonthActiveDays || 0)}</h4>
          <p>Best month: ${escapeHtml(String(year.bestMonth || "Jan"))}</p>
        </article>
        <article class="activity-metric">
          <h4>${year.todayActive ? "Yes" : "No"}</h4>
          <p>Active today</p>
        </article>
      </div>

      <button id="activity-heatmap-toggle" class="activity-heatmap-toggle" type="button" aria-expanded="${state.activityExpanded}">
        <div class="activity-heatmap-shell">
          ${
            monthLabels.length
              ? `<div class="activity-month-labels" style="--week-columns:${weekColumns}">
                  ${monthLabels
                    .map((monthLabel) => {
                      const column = Math.max(1, Number(monthLabel.column || 0) + 1);
                      const label = escapeHtml(String(monthLabel.label || ""));
                      return `<span class="activity-month-label" style="grid-column:${column}">${label}</span>`;
                    })
                    .join("")}
                </div>`
              : ""
          }

          <div class="activity-heatmap-grid" style="--week-columns:${weekColumns}" role="img" aria-label="Activity heatmap for the last 30 days">
            ${cells
              .map((cell) => {
                if (!cell?.date) {
                  return `<span class="activity-cell is-empty" aria-hidden="true"></span>`;
                }
                const cellClass = cell.active
                  ? "is-active"
                  : cell.future
                    ? "is-future"
                    : "is-idle";
                const title = `${cell.date} - ${
                  cell.active
                    ? "Active"
                    : cell.future
                      ? "Upcoming day"
                      : "No activity"
                }`;
                return `<span class="activity-cell ${cellClass}" title="${title}"></span>`;
              })
              .join("")}
          </div>

          <div class="activity-legend" aria-hidden="true">
            <span class="activity-legend-item"><i class="activity-legend-swatch is-idle"></i>Idle</span>
            <span class="activity-legend-item"><i class="activity-legend-swatch is-active"></i>Active</span>
            <span class="activity-legend-item"><i class="activity-legend-swatch is-future"></i>Future</span>
          </div>
        </div>
      </button>

      <p class="activity-empty-copy">${escapeHtml(emptyHeatmapCopy)}</p>

      <p class="activity-hint">Click the heatmap to ${
        state.activityExpanded ? "hide" : "reveal"
      } detailed yearly streak stats</p>

      ${
        state.activityExpanded
          ? `<div class="activity-streak-grid">
              <article class="activity-streak-item">
                <h4>${Number(year.currentStreak || 0)}</h4>
                <p>Current streak</p>
              </article>
              <article class="activity-streak-item">
                <h4>${Number(year.longestStreak || 0)}</h4>
                <p>Best streak in ${Number(year.year || new Date().getFullYear())}</p>
              </article>
              <article class="activity-streak-item">
                <h4>${Number(year.activeDays || 0)}</h4>
                <p>Active days this year</p>
              </article>
              <article class="activity-streak-item">
                <h4>${escapeHtml(String(year.bestMonth || "Jan"))}</h4>
                <p>Most active month</p>
              </article>
              <article class="activity-streak-item">
                <h4>${Number(year.bestMonthActiveDays || 0)}</h4>
                <p>Days active in best month</p>
              </article>
              <article class="activity-streak-item">
                <h4>${year.todayActive ? "On track" : "Start now"}</h4>
                <p>Today status</p>
              </article>
            </div>`
          : ""
      }
    </article>
  `;

  const toggleButton = refs.activityOverview.querySelector(
    "#activity-heatmap-toggle",
  );
  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      state.activityExpanded = !state.activityExpanded;
      renderActivityOverview();
    });
  }
}

function renderTopicCloud() {
  const entries = Object.entries(state.topicCounts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    refs.topicCloud.innerHTML = `<p class="empty-note">No topic counts available yet.</p>`;
    return;
  }

  refs.topicCloud.innerHTML = entries
    .slice(0, 30)
    .map(([name, count]) => {
      const weight = Math.min(1, count / Math.max(entries[0][1], 1));
      const alpha = (0.2 + weight * 0.5).toFixed(2);
      return `<span class="topic-pill" style="--topic-alpha:${alpha}">${escapeHtml(name)} <strong>${count}</strong></span>`;
    })
    .join("");
}

function renderDailyReports() {
  if (!state.dailyReports.length) {
    refs.dailyReportList.innerHTML = `<p class="empty-note">No reports generated yet.</p>`;
    return;
  }

  refs.dailyReportList.innerHTML = state.dailyReports
    .map((report) => {
      const dateLabel = report.date ? formatDate(report.date) : "No date";
      return `
				<article class="report-row">
					<div>
						<h4>${escapeHtml(report.topic || "Untitled")}</h4>
						<p>${escapeHtml(dateLabel)} · ${Number(report.memoryChunks || 0)} memory · ${Number(report.kbChunks || 0)} KB</p>
					</div>
					<button class="ghost-btn report-open" type="button" data-report-id="${escapeHtml(String(report.id))}">Read</button>
				</article>
			`;
    })
    .join("");

  refs.dailyReportList.querySelectorAll(".report-open").forEach((button) => {
    button.addEventListener("click", () => {
      const report = state.dailyReports.find(
        (item) => String(item.id) === String(button.dataset.reportId),
      );
      if (!report) return;
      openReportReader(report.topic || "Daily Report", report.report || "");
    });
  });
}

function renderChat() {
  if (!state.chatMessages.length) {
    refs.chatLog.innerHTML = `
			<section class="chat-welcome">
				<h3>Ask the Assistant</h3>
				<p>Chat with your existing memory and knowledge base context.</p>
				<div class="suggestion-grid">
					${SUGGESTIONS.map(
            (suggestion) =>
              `<button class="suggestion-btn" type="button">${escapeHtml(suggestion)}</button>`,
          ).join("")}
				</div>
			</section>
		`;

    refs.chatLog.querySelectorAll(".suggestion-btn").forEach((button) => {
      button.addEventListener("click", () => {
        refs.chatInput.value = button.textContent;
        handleChatSend();
      });
    });
    return;
  }

  refs.chatLog.innerHTML = state.chatMessages
    .map((message) => {
      const content =
        message.role === "assistant"
          ? safeMarkdown(message.content)
          : `<p>${escapeHtml(message.content)}</p>`;
      const topics = Array.isArray(message.topics) ? message.topics : [];
      return `
				<article class="chat-bubble ${message.role}">
					<header>${message.role === "assistant" ? "Alfred" : "You"}</header>
					<div class="md-output">${content}</div>
					${
            topics.length
              ? `<div class="bubble-topics">${topics
                  .map((topic) => `<span>${escapeHtml(topic)}</span>`)
                  .join("")}</div>`
              : ""
          }
				</article>
			`;
    })
    .join("");

  if (state.chatLoading) {
    refs.chatLog.insertAdjacentHTML(
      "beforeend",
      `<article class="chat-bubble assistant"><header>Alfred</header><div class="loading-line">Thinking...</div></article>`,
    );
  }

  refs.chatLog.scrollTop = refs.chatLog.scrollHeight;
}

async function handleChatSend() {
  const message = refs.chatInput.value.trim();
  if (!message || state.chatLoading) return;

  refs.chatInput.value = "";
  state.chatMessages.push({ role: "user", content: message, topics: [] });
  state.chatLoading = true;
  renderChat();

  try {
    const response = await sendChatMessage(message);
    state.chatMessages.push({
      role: "assistant",
      content: response.answer || "No answer returned.",
      topics: response.topics || [],
    });
  } catch (error) {
    state.chatMessages.push({
      role: "assistant",
      content: `Error: ${toErrorMessage(error)}`,
      topics: [],
    });
  } finally {
    state.chatLoading = false;
    renderChat();
  }
}

function renderCustomTopics() {
  if (!state.topics.length) {
    refs.customTopicChips.innerHTML = `<p class="empty-note">No topics available yet.</p>`;
    refs.customGenerate.disabled = true;
    return;
  }

  refs.customTopicChips.innerHTML = state.topics
    .map((topic) => {
      const selected = state.selectedTopics.has(topic) ? "is-selected" : "";
      return `<button class="topic-choice ${selected}" type="button" data-topic="${escapeHtml(topic)}">${escapeHtml(topic)}</button>`;
    })
    .join("");

  refs.customTopicChips.querySelectorAll(".topic-choice").forEach((button) => {
    button.addEventListener("click", () => {
      const topic = button.dataset.topic || "";
      if (!topic) return;
      if (state.selectedTopics.has(topic)) {
        state.selectedTopics.delete(topic);
      } else {
        state.selectedTopics.add(topic);
      }
      renderCustomTopics();
      renderCustomOutput();
    });
  });

  refs.customGenerate.disabled =
    state.selectedTopics.size === 0 || state.customLoading;
}

function renderCustomOutput() {
  if (state.customLoading) {
    refs.customOutput.innerHTML = `<div class="loading-block">Generating report...</div>`;
    refs.customGenerate.disabled = true;
    return;
  }

  refs.customGenerate.disabled = state.selectedTopics.size === 0;

  if (!state.customReport) {
    const count = state.selectedTopics.size;
    refs.customOutput.innerHTML = `
			<div class="empty-block">
				${
          count
            ? `Ready to generate a report for <strong>${count}</strong> selected topic${count === 1 ? "" : "s"}.`
            : "Select one or more topics to generate a custom report."
        }
			</div>
		`;
    return;
  }

  refs.customOutput.innerHTML = `
		<div class="report-headline">
			<p>${state.selectedTopics.size} topic${state.selectedTopics.size === 1 ? "" : "s"} selected</p>
			${
        state.customStats
          ? `<p>${state.customStats.memoryPoints} memory · ${state.customStats.knowledgePoints} KB chunks</p>`
          : ""
      }
		</div>
		<div class="report-tools">
			<button id="custom-open-reader" class="ghost-btn" type="button">Read With RSVP</button>
			<button id="custom-copy-report" class="ghost-btn" type="button">Copy Report</button>
		</div>
		<div class="md-output">${safeMarkdown(state.customReport)}</div>
	`;

  const openReaderButton = refs.customOutput.querySelector(
    "#custom-open-reader",
  );
  if (openReaderButton) {
    openReaderButton.addEventListener("click", () => {
      openReportReader("Custom Report", state.customReport, "rsvp");
    });
  }

  const copyButton = refs.customOutput.querySelector("#custom-copy-report");
  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(state.customReport || "");
        copyButton.textContent = "Copied";
        setTimeout(() => {
          copyButton.textContent = "Copy Report";
        }, 1800);
      } catch (_error) {
        copyButton.textContent = "Copy Failed";
        setTimeout(() => {
          copyButton.textContent = "Copy Report";
        }, 1800);
      }
    });
  }
}

async function handleGenerateCustomReport() {
  if (state.selectedTopics.size === 0 || state.customLoading) return;

  const selected = [...state.selectedTopics].sort();
  const key = selected.join("||");

  if (reportCache.has(key)) {
    const cached = reportCache.get(key);
    state.customReport = cached.report;
    state.customStats = cached.stats;
    renderCustomOutput();
    return;
  }

  state.customLoading = true;
  state.customReport = "";
  state.customStats = null;
  renderCustomOutput();

  try {
    const result = await generateCustomReport(selected);
    state.customReport = result.report || "No report returned.";
    state.customStats = result.stats || {
      memoryPoints: 0,
      knowledgePoints: 0,
    };
    reportCache.set(key, {
      report: state.customReport,
      stats: state.customStats,
    });
  } catch (error) {
    state.customReport = `Error: ${toErrorMessage(error)}`;
    state.customStats = null;
  } finally {
    state.customLoading = false;
    renderCustomTopics();
    renderCustomOutput();
  }
}

function renderChecklist() {
  if (!state.checklist.length) {
    refs.checklistList.innerHTML = `<p class="empty-note">No checklist items available yet.</p>`;
    return;
  }

  refs.checklistList.innerHTML = state.checklist
    .map((task) => {
      const taskId = String(task.id);
      const checked = state.checklistDone.has(taskId) ? "is-checked" : "";
      const dateLabel = task.date ? formatDate(task.date) : "No date";
      return `
				<article class="check-item ${checked}">
					<button class="check-toggle" type="button" data-check-id="${escapeHtml(taskId)}" aria-label="Toggle completion">${state.checklistDone.has(taskId) ? "x" : ""}</button>
					<div class="check-body">
						<h4>${escapeHtml(task.topic || "Untitled")}</h4>
						<p>${escapeHtml(dateLabel)} · ${Number(task.memoryChunks || 0)} memory · ${Number(task.kbChunks || 0)} KB</p>
					</div>
					<button class="ghost-btn check-read" type="button" data-read-id="${escapeHtml(taskId)}">Read Report</button>
				</article>
			`;
    })
    .join("");

  refs.checklistList.querySelectorAll(".check-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const taskId = String(button.dataset.checkId);
      if (state.checklistDone.has(taskId)) {
        state.checklistDone.delete(taskId);
      } else {
        state.checklistDone.add(taskId);
      }
      renderChecklist();
    });
  });

  refs.checklistList.querySelectorAll(".check-read").forEach((button) => {
    button.addEventListener("click", () => {
      const task = state.checklist.find(
        (item) => String(item.id) === String(button.dataset.readId),
      );
      if (!task) return;
      openReportReader(task.topic || "Checklist Report", task.report || "");
    });
  });
}

function renderFlashcards() {
  refs.flashcardsGenerate.disabled = state.flashcardsLoading;
  refs.flashcardsGenerate.textContent = state.flashcardsLoading
    ? "Generating..."
    : "Generate From Today's Reports";
  refs.flashcardsStatus.textContent = state.flashcardsStatus || "";

  if (state.flashcardsLoading && !state.flashcards.length) {
    refs.flashcardStage.innerHTML = `<article class="flashcard empty"><h3>Generating flashcards</h3><p>Building active-recall cards from today's reports...</p></article>`;
    refs.flashcardActions.classList.add("hidden");
    return;
  }

  if (!state.flashcards.length) {
    refs.flashcardStage.innerHTML = `<article class="flashcard empty"><h3>No flashcards yet</h3><p>Press Generate to create high-value flashcards from today's reports.</p></article>`;
    refs.flashcardActions.classList.add("hidden");
    return;
  }

  const card = state.flashcards[0];
  refs.flashcardStage.innerHTML = `
		<article class="flashcard ${state.flashcardRevealed ? "revealed" : ""}">
			<p class="flashcard-counter">${state.flashcards.length} remaining</p>
			<h3>${escapeHtml(card.question || "Question")}</h3>
			${
        state.flashcardRevealed
          ? `<div class="flashcard-answer md-output">${safeMarkdown(card.answer || "")}</div>`
          : `<p class="flashcard-hint">Tap to reveal answer</p>`
      }
		</article>
	`;

  refs.flashcardActions.classList.toggle("hidden", !state.flashcardRevealed);
}

async function handleGenerateDailyFlashcards() {
  if (state.flashcardsLoading) return;

  state.flashcardsLoading = true;
  state.flashcardsStatus = "Generating flashcards from today's reports...";
  renderFlashcards();

  try {
    const result = await generateFlashcardsFromTodayReports();
    const cards = Array.isArray(result.flashcards) ? result.flashcards : [];
    state.flashcards = cards;
    state.flashcardRevealed = false;

    if (cards.length) {
      state.flashcardsStatus = result.cached
        ? `Loaded ${cards.length} cached flashcards for today's reports.`
        : `Generated ${cards.length} flashcards from today's reports.`;
    } else {
      state.flashcardsStatus = "No flashcards were generated for today.";
    }
  } catch (error) {
    state.flashcardsStatus = `Generation failed: ${toErrorMessage(error)}`;
  } finally {
    state.flashcardsLoading = false;
    renderFlashcards();
    renderHomeStats();
  }
}

function gradeFlashcard(mode) {
  if (!state.flashcards.length || !state.flashcardRevealed) return;

  const [current, ...rest] = state.flashcards;
  if (!current) return;

  if (mode === "again") {
    const insertAt = Math.max(rest.length - 1, 0);
    rest.splice(insertAt, 0, current);
    state.flashcards = rest;
  } else {
    state.flashcards = rest;
  }

  if (!state.flashcards.length) {
    state.flashcardsStatus =
      "Session complete. Cards remain saved for today and can be regenerated if reports change.";
  }

  state.flashcardRevealed = false;
  renderFlashcards();
  renderHomeStats();
}

async function handleTextUpload() {
  const text = refs.textCapture.value.trim();
  if (!text) return;
  refs.textCapture.value = "";
  enqueueJob("text", "Text note", { type: "text", text, language: "en" });
}

async function handlePdfUpload() {
  const file = refs.pdfFile.files?.[0];
  if (!file) return;

  const originalLabel = refs.pdfUploadTrigger.textContent;
  refs.pdfUploadTrigger.disabled = true;
  refs.pdfUploadTrigger.textContent = "Extracting...";

  try {
    const extraction = await extractTextFromPdfFile(file);
    const pageLabel = `${extraction.extractedPages} page${extraction.extractedPages === 1 ? "" : "s"}`;
    const truncatedLabel = extraction.truncated ? " (truncated)" : "";
    enqueueJob(
      "pdf",
      `${file.name || "PDF"} · ${pageLabel}${truncatedLabel}`,
      {
        type: "text",
        text: extraction.text,
        language: "en",
      },
    );
    refs.pdfFile.value = "";
  } catch (error) {
    enqueueErrorJob("pdf", file.name || "PDF", toErrorMessage(error));
  } finally {
    refs.pdfUploadTrigger.disabled = false;
    refs.pdfUploadTrigger.textContent = originalLabel;
  }
}

function enqueueErrorJob(type, label, errorMessage) {
  state.jobs.unshift({
    id: nextId(),
    type,
    label,
    payload: null,
    status: "failed",
    progress: "Failed before upload",
    completedSteps: [],
    attempts: 1,
    maxAttempts: 1,
    error: errorMessage,
    createdAt: Date.now(),
  });
  renderUploadPill();
  renderUploadDrawer();
}

function enqueueJob(type, label, payload) {
  state.jobs.unshift({
    id: nextId(),
    type,
    label,
    payload,
    status: "queued",
    progress: "Queued",
    completedSteps: ["Queued"],
    attempts: 0,
    maxAttempts: MAX_UPLOAD_RETRIES,
    error: "",
    createdAt: Date.now(),
  });
  renderUploadPill();
  renderUploadDrawer();
  runQueue();
}

async function runQueue() {
  if (state.queueRunning) return;
  state.queueRunning = true;

  try {
    while (true) {
      const job = state.jobs.find((candidate) => candidate.status === "queued");
      if (!job) break;
      await executeJob(job);
    }
  } finally {
    state.queueRunning = false;
    renderUploadPill();
    renderUploadDrawer();
  }
}

async function executeJob(job) {
  job.status = "running";
  job.progress = "Sending payload";
  pushJobStep(job, "Sending payload");
  renderUploadPill();
  renderUploadDrawer();

  try {
    const result = await runUploadPipeline(job.payload);
    const processed = Number(result.summary?.processed || 0);
    const segments = Number(result.summary?.segments || 0);
    pushJobStep(
      job,
      `Processed ${processed} result${processed === 1 ? "" : "s"}`,
    );
    pushJobStep(
      job,
      `Detected ${segments} segment${segments === 1 ? "" : "s"}`,
    );

    if (Array.isArray(result.topics) && result.topics.length) {
      pushJobStep(
        job,
        `Topics: ${result.topics.slice(0, 4).join(", ")}${result.topics.length > 4 ? "..." : ""}`,
      );
    }

    job.status = "completed";
    job.progress = "Completed";
    job.error = "";

    await refreshAfterUpload();
  } catch (error) {
    job.attempts += 1;
    job.error = toErrorMessage(error);

    if (job.attempts < job.maxAttempts) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, job.attempts - 1);
      job.status = "retrying";
      job.progress = `Retrying in ${Math.round(delay / 1000)}s`;
      pushJobStep(job, job.progress);
      renderUploadPill();
      renderUploadDrawer();
      await sleep(delay);
      job.status = "queued";
      job.progress = "Queued";
      renderUploadPill();
      renderUploadDrawer();
    } else {
      job.status = "failed";
      job.progress = "Failed";
    }
  }

  renderUploadPill();
  renderUploadDrawer();
}

async function refreshAfterUpload() {
  const results = await Promise.allSettled([
    fetchTopics(),
    fetchTopicCounts(),
    fetchDailyReportTasks(),
    fetchChecklistItems(),
    fetchFlashcards(),
    fetchActivitySummary(),
  ]);

  if (results[0].status === "fulfilled") state.topics = results[0].value;
  if (results[1].status === "fulfilled") state.topicCounts = results[1].value;
  if (results[2].status === "fulfilled") state.dailyReports = results[2].value;
  if (results[3].status === "fulfilled") {
    state.checklist = results[3].value.length
      ? results[3].value
      : state.dailyReports;
  }
  if (results[4].status === "fulfilled") {
    const cards = results[4].value;
    state.flashcards = Array.isArray(cards) ? cards : [];
    state.flashcardsStatus = state.flashcards.length
      ? `Loaded ${state.flashcards.length} flashcards for today.`
      : "No flashcards generated for today yet.";
    state.flashcardRevealed = false;
  } else {
    state.flashcards = [];
    state.flashcardsStatus = "Could not load today's flashcards.";
  }

  if (results[5].status === "fulfilled") {
    const activity = results[5].value || {};
    state.activityHeatmap = normalizeActivityHeatmap(activity);
    state.activityYear = normalizeActivityYear(activity);
  }

  renderActivityOverview();
  renderHomeStats();
  renderTopicCloud();
  renderDailyReports();
  renderChecklist();
  renderFlashcards();
  renderCustomTopics();
  renderCustomOutput();
}

function pushJobStep(job, step) {
  if (!step) return;
  if (job.completedSteps[job.completedSteps.length - 1] === step) return;
  job.completedSteps.push(step);
}

function clearFinishedJobs() {
  state.jobs = state.jobs.filter(
    (job) => job.status !== "completed" && job.status !== "failed",
  );
  renderUploadPill();
  renderUploadDrawer();
}

function retryJob(jobId) {
  const job = state.jobs.find((candidate) => candidate.id === jobId);
  if (!job || job.status !== "failed") return;
  job.status = "queued";
  job.progress = "Queued";
  job.error = "";
  job.attempts = 0;
  job.completedSteps = ["Queued"];
  renderUploadPill();
  renderUploadDrawer();
  runQueue();
}

function dismissJob(jobId) {
  state.jobs = state.jobs.filter((job) => job.id !== jobId);
  renderUploadPill();
  renderUploadDrawer();
}

function setUploadDrawerOpen(open) {
  state.uploadDrawerOpen = open;
  refs.uploadOverlay.classList.toggle("hidden", !open);
}

function renderUploadPill() {
  const status = getOverallUploadStatus();
  if (status === "idle") {
    refs.uploadPill.classList.add("hidden");
    refs.uploadPill.textContent = "";
    return;
  }

  refs.uploadPill.classList.remove("hidden");
  refs.uploadPill.classList.remove("uploading", "completed", "error");
  refs.uploadPill.classList.add(status);

  const active = state.jobs.find(
    (job) =>
      job.status === "running" ||
      job.status === "queued" ||
      job.status === "retrying",
  );
  const failedCount = state.jobs.filter(
    (job) => job.status === "failed",
  ).length;
  const doneCount = state.jobs.filter(
    (job) => job.status === "completed",
  ).length;

  if (status === "uploading") {
    refs.uploadPill.textContent = `Uploading · ${active?.progress || "Processing"}`;
  } else if (status === "error") {
    refs.uploadPill.textContent = `Failed · ${failedCount} job${failedCount === 1 ? "" : "s"}`;
  } else {
    refs.uploadPill.textContent = `Uploaded · ${doneCount} job${doneCount === 1 ? "" : "s"}`;
  }
}

function renderUploadDrawer() {
  if (!state.jobs.length) {
    refs.uploadJobs.innerHTML = `<p class="empty-note">No uploads in queue.</p>`;
    refs.uploadClearDone.disabled = true;
    return;
  }

  refs.uploadClearDone.disabled = !state.jobs.some(
    (job) => job.status === "completed" || job.status === "failed",
  );

  refs.uploadJobs.innerHTML = state.jobs
    .map((job) => {
      return `
				<article class="job-card ${job.status}">
					<header>
						<div>
							<h4>${escapeHtml(job.label)}</h4>
							<p>${escapeHtml(job.type.toUpperCase())} · ${escapeHtml(job.progress)} · ${timeAgo(job.createdAt)}</p>
						</div>
						<span class="job-status">${escapeHtml(job.status)}</span>
					</header>

					<ul>
						${job.completedSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
					</ul>

					${job.error ? `<p class="job-error">${escapeHtml(job.error)}</p>` : ""}

					<div class="job-actions">
						${
              job.status === "failed"
                ? `<button class="ghost-btn job-retry" type="button" data-job-id="${escapeHtml(job.id)}">Retry</button>`
                : ""
            }
						${
              job.status === "failed" || job.status === "completed"
                ? `<button class="ghost-btn job-dismiss" type="button" data-dismiss-id="${escapeHtml(job.id)}">Dismiss</button>`
                : ""
            }
					</div>
				</article>
			`;
    })
    .join("");

  refs.uploadJobs.querySelectorAll(".job-retry").forEach((button) => {
    button.addEventListener("click", () => retryJob(button.dataset.jobId));
  });

  refs.uploadJobs.querySelectorAll(".job-dismiss").forEach((button) => {
    button.addEventListener("click", () =>
      dismissJob(button.dataset.dismissId),
    );
  });
}

function getOverallUploadStatus() {
  if (!state.jobs.length) return "idle";

  const hasActive = state.jobs.some(
    (job) =>
      job.status === "queued" ||
      job.status === "running" ||
      job.status === "retrying",
  );
  if (hasActive) return "uploading";

  const hasFailed = state.jobs.some((job) => job.status === "failed");
  if (hasFailed) return "error";
  return "completed";
}

function handleGlobalKeydown(event) {
  if (event.key === "Escape") {
    closeReportReader();
    setUploadDrawerOpen(false);
    return;
  }

  if (refs.readerOverlay.classList.contains("hidden")) return;
  const key = event.key.toLowerCase();

  if (key === "f") {
    event.preventDefault();
    toggleReaderFullscreen();
    return;
  }

  if (readerState.mode !== "rsvp") return;

  const targetTag = String(event.target?.tagName || "").toLowerCase();
  const isEditable =
    targetTag === "input" ||
    targetTag === "textarea" ||
    targetTag === "select" ||
    Boolean(event.target?.isContentEditable);

  if (isEditable && event.code !== "Space") return;

  if (event.code === "Space") {
    event.preventDefault();
    toggleRsvpPlayback();
    return;
  }

  if (key === "j") {
    event.preventDefault();
    shiftRsvpIndex(-10);
    return;
  }

  if (key === "l") {
    event.preventDefault();
    shiftRsvpIndex(10);
    return;
  }

  if (key === "arrowleft") {
    event.preventDefault();
    shiftRsvpIndex(-1);
    return;
  }

  if (key === "arrowright") {
    event.preventDefault();
    shiftRsvpIndex(1);
    return;
  }

  if (key === "a") {
    event.preventDefault();
    setRsvpWpm(readerState.wpm - 25);
    return;
  }

  if (key === "d") {
    event.preventDefault();
    setRsvpWpm(readerState.wpm + 25);
    return;
  }

  if (key === "c") {
    event.preventDefault();
    toggleRsvpContext();
    return;
  }

  if (key === "r") {
    event.preventDefault();
    restartRsvpPlayback();
  }
}

function openReportReader(title, reportMarkdown, preferredMode = null) {
  const normalizedTitle = title || "Report";
  const markdown = String(reportMarkdown || "No content available.");

  readerState.title = normalizedTitle;
  readerState.markdown = markdown;
  readerState.plainText = markdownToPlainText(markdown);
  readerState.tokens = tokenizeRsvpText(readerState.plainText);
  readerState.index = 0;
  readerState.elapsedMs = 0;
  readerState.lastTickAt = 0;
  stopRsvpPlayback();

  refs.readerTitle.textContent = normalizedTitle;
  refs.readerSubtitle.textContent = readerState.tokens.length
    ? `${readerState.tokens.length} words ready for speed reading.`
    : "No RSVP-readable text detected. Showing classic markdown mode.";
  refs.readerContent.innerHTML = safeMarkdown(markdown);
  refs.readerOverlay.classList.remove("hidden");
  syncReaderFullscreenButton();

  const requestedMode = preferredMode || readerState.mode;
  setReaderMode(requestedMode);
  renderRsvpFrame();
}

function closeReportReader() {
  stopRsvpPlayback();
  exitReaderFullscreenIfActive();
  refs.readerOverlay.classList.add("hidden");
  syncReaderFullscreenButton();
}

function isReaderInFullscreen() {
  return document.fullscreenElement === refs.readerCard;
}

function syncReaderFullscreenButton() {
  refs.readerFullscreen.textContent = isReaderInFullscreen()
    ? "Exit Fullscreen"
    : "Fullscreen";
}

async function toggleReaderFullscreen() {
  if (!document.fullscreenEnabled || !refs.readerCard) return;

  try {
    if (isReaderInFullscreen()) {
      await document.exitFullscreen();
    } else {
      await refs.readerCard.requestFullscreen();
    }
  } catch (_error) {
    // Ignore fullscreen rejections due to browser permissions/user gesture constraints.
  } finally {
    syncReaderFullscreenButton();
  }
}

function exitReaderFullscreenIfActive() {
  if (!isReaderInFullscreen()) return;
  document.exitFullscreen().catch(() => {});
}

function setReaderMode(mode) {
  let nextMode = mode === "rsvp" ? "rsvp" : "markdown";
  if (nextMode === "rsvp" && !readerState.tokens.length) {
    nextMode = "markdown";
  }

  readerState.mode = nextMode;
  localStorage.setItem("alfred-reader-mode", nextMode);

  refs.readerModeMarkdown.classList.toggle(
    "is-active",
    nextMode === "markdown",
  );
  refs.readerModeRsvp.classList.toggle("is-active", nextMode === "rsvp");
  refs.readerContent.classList.toggle("hidden", nextMode !== "markdown");
  refs.rsvpView.classList.toggle("hidden", nextMode !== "rsvp");

  if (nextMode !== "rsvp") {
    pauseRsvpPlayback();
    return;
  }

  renderRsvpFrame();
}

function toggleRsvpPlayback() {
  if (readerState.running) {
    pauseRsvpPlayback();
    return;
  }
  startRsvpPlayback();
}

function startRsvpPlayback() {
  if (!readerState.tokens.length) return;

  if (readerState.index >= readerState.tokens.length - 1) {
    readerState.index = 0;
    readerState.elapsedMs = 0;
  }

  readerState.running = true;
  readerState.lastTickAt = Date.now();
  renderRsvpFrame();
  scheduleRsvpTick();
}

function pauseRsvpPlayback() {
  if (readerState.running && readerState.lastTickAt) {
    readerState.elapsedMs += Date.now() - readerState.lastTickAt;
  }

  readerState.running = false;
  readerState.lastTickAt = 0;
  clearRsvpTimer();
  renderRsvpFrame();
}

function stopRsvpPlayback() {
  readerState.running = false;
  readerState.lastTickAt = 0;
  clearRsvpTimer();
}

function restartRsvpPlayback() {
  const wasRunning = readerState.running;
  stopRsvpPlayback();
  readerState.index = 0;
  readerState.elapsedMs = 0;
  renderRsvpFrame();
  if (wasRunning) startRsvpPlayback();
}

function shiftRsvpIndex(delta) {
  if (!readerState.tokens.length) return;

  const wasRunning = readerState.running;
  if (wasRunning) pauseRsvpPlayback();

  readerState.index = clampNumber(
    readerState.index + delta,
    0,
    readerState.tokens.length - 1,
  );
  renderRsvpFrame();

  if (wasRunning) startRsvpPlayback();
}

function setRsvpWpm(value) {
  const clampedWpm = clampNumber(
    Math.round(Number(value) || DEFAULT_RSVP_WPM),
    MIN_RSVP_WPM,
    MAX_RSVP_WPM,
  );
  readerState.wpm = clampedWpm;
  localStorage.setItem("alfred-rsvp-wpm", String(clampedWpm));

  refs.rsvpWpm.value = String(clampedWpm);
  refs.rsvpWpmValue.textContent = String(clampedWpm);

  if (readerState.running) {
    if (readerState.lastTickAt) {
      readerState.elapsedMs += Date.now() - readerState.lastTickAt;
    }
    readerState.lastTickAt = Date.now();
    scheduleRsvpTick();
  }

  renderRsvpFrame();
}

function toggleRsvpContext() {
  readerState.contextVisible = !readerState.contextVisible;
  localStorage.setItem(
    "alfred-rsvp-context",
    readerState.contextVisible ? "1" : "0",
  );
  renderRsvpFrame();
}

function scheduleRsvpTick() {
  clearRsvpTimer();
  if (!readerState.running || !readerState.tokens.length) return;

  const currentWord = readerState.tokens[readerState.index] || "";
  const delay = getWordDurationMs(currentWord, readerState.wpm);

  readerState.timerId = window.setTimeout(() => {
    if (!readerState.running) return;

    if (readerState.lastTickAt) {
      readerState.elapsedMs += Date.now() - readerState.lastTickAt;
    }

    if (readerState.index >= readerState.tokens.length - 1) {
      readerState.running = false;
      readerState.lastTickAt = 0;
      clearRsvpTimer();
      renderRsvpFrame();
      return;
    }

    readerState.index += 1;
    readerState.lastTickAt = Date.now();
    renderRsvpFrame();
    scheduleRsvpTick();
  }, delay);
}

function renderRsvpFrame() {
  if (!refs.rsvpView) return;

  const total = readerState.tokens.length;
  const hasWords = total > 0;

  refs.rsvpWpm.value = String(readerState.wpm);
  refs.rsvpWpmValue.textContent = String(readerState.wpm);
  refs.rsvpPlay.disabled = !hasWords;
  refs.rsvpRestart.disabled = !hasWords;
  refs.rsvpContextToggle.disabled = !hasWords;

  if (!hasWords) {
    refs.rsvpLeft.textContent = "";
    refs.rsvpOrp.textContent = "No";
    refs.rsvpRight.textContent = " content";
    refs.rsvpProgressFill.style.width = "0%";
    refs.rsvpProgressLabel.textContent = "0 / 0 words";
    refs.rsvpTimeLabel.textContent = "Elapsed 0:00 · Left 0:00";
    refs.rsvpContext.classList.add("hidden");
    refs.rsvpContextToggle.textContent = "No Context";
    refs.rsvpBack10.disabled = true;
    refs.rsvpBack1.disabled = true;
    refs.rsvpForward1.disabled = true;
    refs.rsvpForward10.disabled = true;
    refs.rsvpPlay.textContent = "Play";
    return;
  }

  readerState.index = clampNumber(readerState.index, 0, total - 1);
  const token = readerState.tokens[readerState.index] || "";
  const parts = splitWordForOrp(token);

  refs.rsvpLeft.textContent = parts.left;
  refs.rsvpOrp.textContent = parts.orp || " ";
  refs.rsvpRight.textContent = parts.right;

  const progress = ((readerState.index + 1) / total) * 100;
  refs.rsvpProgressFill.style.width = `${progress.toFixed(2)}%`;
  refs.rsvpProgressLabel.textContent = `${readerState.index + 1} / ${total} words · ${Math.round(progress)}%`;

  const elapsedMs =
    readerState.elapsedMs +
    (readerState.running && readerState.lastTickAt
      ? Date.now() - readerState.lastTickAt
      : 0);
  const remainingWords = Math.max(0, total - (readerState.index + 1));
  const estimatedLeftMs =
    (remainingWords * 60000) / Math.max(readerState.wpm, 1);
  refs.rsvpTimeLabel.textContent = `Elapsed ${formatDurationClock(elapsedMs)} · Left ${formatDurationClock(estimatedLeftMs)}`;

  refs.rsvpBack10.disabled = readerState.index === 0;
  refs.rsvpBack1.disabled = readerState.index === 0;
  refs.rsvpForward1.disabled = readerState.index >= total - 1;
  refs.rsvpForward10.disabled = readerState.index >= total - 1;
  refs.rsvpPlay.textContent = readerState.running
    ? "Pause"
    : readerState.index >= total - 1
      ? "Replay"
      : "Play";

  refs.rsvpContextToggle.textContent = readerState.contextVisible
    ? "Hide Context"
    : "Show Context";
  refs.rsvpContext.classList.toggle("hidden", !readerState.contextVisible);
  if (readerState.contextVisible) {
    refs.rsvpContext.innerHTML = buildRsvpContextLine(
      readerState.tokens,
      readerState.index,
    );
  }
}

function splitWordForOrp(token) {
  const source = String(token || "");
  if (!source) return { left: "", orp: "", right: "" };

  const coreMatch = source.match(
    /^([^A-Za-z0-9]*)([A-Za-z0-9][A-Za-z0-9'’-]*)([^A-Za-z0-9]*)$/,
  );
  if (!coreMatch) {
    const chars = [...source];
    const index = clampNumber(
      getOrpIndex(chars.length),
      0,
      Math.max(chars.length - 1, 0),
    );
    return {
      left: chars.slice(0, index).join(""),
      orp: chars[index] || "",
      right: chars.slice(index + 1).join(""),
    };
  }

  const [, prefix, core, suffix] = coreMatch;
  const chars = [...core];
  const index = clampNumber(
    getOrpIndex(chars.length),
    0,
    Math.max(chars.length - 1, 0),
  );

  return {
    left: `${prefix}${chars.slice(0, index).join("")}`,
    orp: chars[index] || "",
    right: `${chars.slice(index + 1).join("")}${suffix}`,
  };
}

function getOrpIndex(length) {
  if (length <= 0) return 0;
  return Math.min(3, Math.floor((length - 1) / 3));
}

function getWordDurationMs(word, baseWpm) {
  const safeWpm = clampNumber(
    baseWpm || DEFAULT_RSVP_WPM,
    MIN_RSVP_WPM,
    MAX_RSVP_WPM,
  );
  const baseDuration = 60000 / safeWpm;
  const source = String(word || "");
  const core = source.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");

  let multiplier = 1;
  if (core.length > 8) multiplier += 0.3;
  if (core.length > 12) multiplier += 0.2;
  if (/[.!?]["')\]]?$/.test(source)) multiplier += 0.8;
  if (/[,;:]["')\]]?$/.test(source)) multiplier += 0.4;
  if (/^[A-Z]/.test(core) && core.length > 1) multiplier += 0.1;

  return clampNumber(Math.round(baseDuration * multiplier), 60, 2400);
}

function tokenizeRsvpText(text) {
  return (
    String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .match(/[^\s]+/g) || []
  );
}

function markdownToPlainText(markdown) {
  const template = document.createElement("template");
  template.innerHTML = safeMarkdown(markdown || "");
  return String(template.content.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRsvpContextLine(tokens, index) {
  const start = Math.max(0, index - RSVP_CONTEXT_RADIUS);
  const end = Math.min(tokens.length, index + RSVP_CONTEXT_RADIUS + 1);

  return tokens
    .slice(start, end)
    .map((token, offset) => {
      const absoluteIndex = start + offset;
      if (absoluteIndex === index) {
        return `<mark>${escapeHtml(token)}</mark>`;
      }
      return escapeHtml(token);
    })
    .join(" ");
}

function loadReaderModePreference() {
  return localStorage.getItem("alfred-reader-mode") === "rsvp"
    ? "rsvp"
    : "markdown";
}

function loadRsvpWpmPreference() {
  const saved = Number(localStorage.getItem("alfred-rsvp-wpm"));
  if (!Number.isFinite(saved)) return DEFAULT_RSVP_WPM;
  return clampNumber(saved, MIN_RSVP_WPM, MAX_RSVP_WPM);
}

function loadRsvpContextPreference() {
  return localStorage.getItem("alfred-rsvp-context") !== "0";
}

function clearRsvpTimer() {
  if (!readerState.timerId) return;
  window.clearTimeout(readerState.timerId);
  readerState.timerId = null;
}

function formatDurationClock(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function safeMarkdown(markdown) {
  const raw = marked.parse(markdown || "");
  return sanitizeHtml(raw);
}

function sanitizeHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");

  const blockedTags = [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "link",
    "meta",
  ];
  blockedTags.forEach((tagName) => {
    template.content.querySelectorAll(tagName).forEach((node) => node.remove());
  });

  template.content.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = String(attribute.value || "");
      if (name.startsWith("on")) element.removeAttribute(attribute.name);
      if (name === "srcdoc") element.removeAttribute(attribute.name);
      if (
        (name === "href" || name === "src") &&
        /^\s*javascript:/i.test(value)
      ) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  return template.innerHTML;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function toErrorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error || "Unknown error");
}

function nextId() {
  idCounter += 1;
  return `job-${Date.now()}-${idCounter}`;
}

function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Invalid date";
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function timeAgo(timestamp) {
  const deltaSeconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m ago`;
  if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)}h ago`;
  return `${Math.floor(deltaSeconds / 86400)}d ago`;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function extractTextFromPdfFile(file) {
  const fileName = String(file?.name || "");
  const fileType = String(file?.type || "").toLowerCase();
  const isPdf = fileType === "application/pdf" || /\.pdf$/i.test(fileName);
  if (!isPdf) {
    throw new Error("Please choose a PDF file.");
  }

  const fileBuffer = await file.arrayBuffer();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(fileBuffer),
    isEvalSupported: false,
  });

  const document = await loadingTask.promise;
  const totalPages = Number(document.numPages || 0);
  const extractPages = Math.min(totalPages, MAX_PDF_PAGES);

  const chunks = [];
  let totalChars = 0;
  let truncatedByChars = false;

  for (let pageNumber = 1; pageNumber <= extractPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => String(item.str || "").trim())
      .filter(Boolean)
      .join(" ");

    if (!pageText) continue;

    const remainingChars = MAX_PDF_TEXT_CHARS - totalChars;
    if (remainingChars <= 0) {
      truncatedByChars = true;
      break;
    }

    const clipped = pageText.slice(0, remainingChars);
    if (!clipped) {
      truncatedByChars = true;
      break;
    }

    chunks.push(clipped);
    totalChars += clipped.length;

    if (clipped.length < pageText.length) {
      truncatedByChars = true;
      break;
    }
  }

  const text = chunks.join("\n\n").replace(/\s+\n/g, "\n").trim();
  if (!text) {
    throw new Error(
      "No extractable text was found in this PDF. If this is a scanned PDF, OCR is required.",
    );
  }

  return {
    text,
    extractedPages: extractPages,
    truncated: truncatedByChars || totalPages > extractPages,
  };
}
