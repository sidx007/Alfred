import { marked } from "marked";
import {
	fetchChecklistItems,
	fetchDailyReportTasks,
	fetchFlashcards,
	fetchTopicCounts,
	fetchTopics,
	generateCustomReport,
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

const FALLBACK_FLASHCARDS = [
	{
		id: "fallback-1",
		question: "What does TCP stand for?",
		answer: "Transmission Control Protocol",
	},
	{
		id: "fallback-2",
		question: "What is the time complexity of binary search?",
		answer: "O(log n)",
	},
	{
		id: "fallback-3",
		question: "What does REST stand for?",
		answer: "Representational State Transfer",
	},
];

const MAX_UPLOAD_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 2000;

const state = {
	activeTab: "home",
	topics: [],
	topicCounts: {},
	dailyReports: [],
	checklist: [],
	checklistDone: new Set(),
	flashcards: [],
	flashcardRevealed: false,
	chatMessages: [],
	chatLoading: false,
	selectedTopics: new Set(),
	customLoading: false,
	customReport: "",
	customStats: null,
	jobs: [],
	queueRunning: false,
	uploadDrawerOpen: false,
};

const reportCache = new Map();
let refs = {};
let idCounter = 0;

boot();

async function boot() {
	renderShell();
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
							<p>Upload text, audio, or images to run the same processing pipeline as the app.</p>
						</div>
					</div>

					<div class="home-stats" id="home-stats"></div>

					<div class="home-grid">
						<article class="tile tile-text">
							<h3>Text Capture</h3>
							<textarea id="text-capture" placeholder="Paste notes, ideas, or transcript text..."></textarea>
							<button id="text-submit" class="primary-btn" type="button">Process Text</button>
						</article>

						<article class="tile tile-audio">
							<h3>Audio Capture</h3>
							<input id="audio-file" class="file-input" type="file" accept="audio/*" />
							<button id="audio-submit" class="primary-btn" type="button">Process Audio</button>
						</article>

						<article class="tile tile-image">
							<h3>Image Capture</h3>
							<input id="image-file" class="file-input" type="file" accept="image/*" multiple />
							<button id="image-submit" class="primary-btn" type="button">Process Images</button>
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
			<article class="reader-card glass">
				<header>
					<h3 id="reader-title">Report</h3>
					<button id="reader-close" class="ghost-btn" type="button">Close</button>
				</header>
				<div id="reader-content" class="reader-content md-output"></div>
			</article>
		</div>
	`;

	refs = {
		panels: Array.from(document.querySelectorAll(".panel")),
		dockButtons: Array.from(document.querySelectorAll(".dock-btn")),
		themeToggle: document.getElementById("theme-toggle"),
		uploadPill: document.getElementById("upload-pill"),
		homeStats: document.getElementById("home-stats"),
		textCapture: document.getElementById("text-capture"),
		textSubmit: document.getElementById("text-submit"),
		audioFile: document.getElementById("audio-file"),
		audioSubmit: document.getElementById("audio-submit"),
		imageFile: document.getElementById("image-file"),
		imageSubmit: document.getElementById("image-submit"),
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
		readerTitle: document.getElementById("reader-title"),
		readerContent: document.getElementById("reader-content"),
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
	refs.audioSubmit.addEventListener("click", handleAudioUpload);
	refs.imageSubmit.addEventListener("click", handleImageUpload);

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

	refs.readerClose.addEventListener("click", closeReportReader);
	refs.readerOverlay.addEventListener("click", (event) => {
		if (event.target === refs.readerOverlay) closeReportReader();
	});

	document.addEventListener("keydown", (event) => {
		if (event.key !== "Escape") return;
		closeReportReader();
		setUploadDrawerOpen(false);
	});
}

async function hydrateData() {
	const results = await Promise.allSettled([
		fetchTopics(),
		fetchTopicCounts(),
		fetchDailyReportTasks(),
		fetchChecklistItems(),
		fetchFlashcards(),
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
		state.dailyReports = Array.isArray(results[2].value) ? results[2].value : [];
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
		state.checklist.filter((item) => item.completed).map((item) => String(item.id)),
	);

	if (results[4].status === "fulfilled") {
		const cards = Array.isArray(results[4].value) ? results[4].value : [];
		state.flashcards = cards.length ? cards : [...FALLBACK_FLASHCARDS];
	} else {
		console.error("Failed to load flashcards:", results[4].reason);
		state.flashcards = [...FALLBACK_FLASHCARDS];
	}

	state.flashcardRevealed = false;
}

function renderAll() {
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
	return document.documentElement.getAttribute("data-color-scheme") || "light";
}

function restoreTheme() {
	const saved = localStorage.getItem("alfred-theme") || "light";
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

	refs.customGenerate.disabled = state.selectedTopics.size === 0 || state.customLoading;
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
		<div class="md-output">${safeMarkdown(state.customReport)}</div>
	`;
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
	if (!state.flashcards.length) {
		refs.flashcardStage.innerHTML = `<article class="flashcard empty"><h3>Deck complete</h3><p>Great work. New flashcards will appear after your next pipeline run.</p></article>`;
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

async function handleAudioUpload() {
	const file = refs.audioFile.files?.[0];
	if (!file) return;

	try {
		const audioBase64 = await fileToBase64(file);
		enqueueJob("audio", file.name || "Audio note", {
			type: "audio",
			audioBase64,
			contentType: file.type || "audio/m4a",
			language: "en",
		});
		refs.audioFile.value = "";
	} catch (error) {
		enqueueErrorJob("audio", file.name || "Audio note", toErrorMessage(error));
	}
}

async function handleImageUpload() {
	const files = Array.from(refs.imageFile.files || []);
	if (!files.length) return;

	try {
		const imagesBase64 = await Promise.all(files.map((file) => fileToBase64(file)));
		enqueueJob("image", `${files.length} image${files.length === 1 ? "" : "s"}`, {
			type: "image",
			imagesBase64,
			language: "en",
		});
		refs.imageFile.value = "";
	} catch (error) {
		enqueueErrorJob(
			"image",
			`${files.length} image${files.length === 1 ? "" : "s"}`,
			toErrorMessage(error),
		);
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
		pushJobStep(job, `Processed ${processed} result${processed === 1 ? "" : "s"}`);
		pushJobStep(job, `Detected ${segments} segment${segments === 1 ? "" : "s"}`);

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
	]);

	if (results[0].status === "fulfilled") state.topics = results[0].value;
	if (results[1].status === "fulfilled") state.topicCounts = results[1].value;
	if (results[2].status === "fulfilled") state.dailyReports = results[2].value;
	if (results[3].status === "fulfilled") {
		state.checklist = results[3].value.length ? results[3].value : state.dailyReports;
	}
	if (results[4].status === "fulfilled") {
		const cards = results[4].value;
		state.flashcards = cards.length ? cards : [...FALLBACK_FLASHCARDS];
		state.flashcardRevealed = false;
	}

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
		(job) => job.status === "running" || job.status === "queued" || job.status === "retrying",
	);
	const failedCount = state.jobs.filter((job) => job.status === "failed").length;
	const doneCount = state.jobs.filter((job) => job.status === "completed").length;

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
		button.addEventListener("click", () => dismissJob(button.dataset.dismissId));
	});
}

function getOverallUploadStatus() {
	if (!state.jobs.length) return "idle";

	const hasActive = state.jobs.some(
		(job) => job.status === "queued" || job.status === "running" || job.status === "retrying",
	);
	if (hasActive) return "uploading";

	const hasFailed = state.jobs.some((job) => job.status === "failed");
	if (hasFailed) return "error";
	return "completed";
}

function openReportReader(title, reportMarkdown) {
	refs.readerTitle.textContent = title || "Report";
	refs.readerContent.innerHTML = safeMarkdown(reportMarkdown || "No content available.");
	refs.readerOverlay.classList.remove("hidden");
}

function closeReportReader() {
	refs.readerOverlay.classList.add("hidden");
}

function safeMarkdown(markdown) {
	const raw = marked.parse(markdown || "");
	return sanitizeHtml(raw);
}

function sanitizeHtml(html) {
	const template = document.createElement("template");
	template.innerHTML = String(html || "");

	const blockedTags = ["script", "style", "iframe", "object", "embed", "link", "meta"];
	blockedTags.forEach((tagName) => {
		template.content.querySelectorAll(tagName).forEach((node) => node.remove());
	});

	template.content.querySelectorAll("*").forEach((element) => {
		[...element.attributes].forEach((attribute) => {
			const name = attribute.name.toLowerCase();
			const value = String(attribute.value || "");
			if (name.startsWith("on")) element.removeAttribute(attribute.name);
			if (name === "srcdoc") element.removeAttribute(attribute.name);
			if ((name === "href" || name === "src") && /^\s*javascript:/i.test(value)) {
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

function fileToBase64(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const value = String(reader.result || "");
			const parts = value.split(",");
			if (parts.length < 2) {
				reject(new Error("Failed to read file as base64"));
				return;
			}
			resolve(parts[1]);
		};
		reader.onerror = () => {
			reject(new Error("Failed to read selected file"));
		};
		reader.readAsDataURL(file);
	});
}
