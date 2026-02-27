// ── Report Generator Page ────────────────────────────────────────────
import { marked } from "marked";
import { fetchTopics, generateReport } from "../api.js";

let selectedTopics = new Set();
let isGenerating = false;

export function renderReport(container) {
    selectedTopics = new Set();
    isGenerating = false;

    const page = document.createElement("div");
    page.className = "page";
    page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">📊 Report Generator</h1>
      <p class="page-description">
        Select topics from your knowledge base and generate a comprehensive, structured report.
      </p>
    </div>
    <div class="page-body">
      <div class="report-layout">
        <div class="topic-selector" id="topic-selector">
          <div class="topic-selector-title">Select Topics</div>
          <div class="topic-chips" id="topic-chips">
            <div class="loading-spinner" style="padding: 20px 0;">
              <div class="spinner"></div>
              <span class="loading-text">Loading topics...</span>
            </div>
          </div>
          <button class="generate-btn" id="generate-btn" disabled>
            ✨ Generate Report
          </button>
        </div>
        <div id="report-output"></div>
      </div>
    </div>
  `;
    container.appendChild(page);

    const chipsEl = page.querySelector("#topic-chips");
    const generateBtn = page.querySelector("#generate-btn");
    const outputEl = page.querySelector("#report-output");

    // Load topics
    loadTopics(chipsEl, generateBtn);

    // Generate button
    generateBtn.addEventListener("click", () => {
        handleGenerate(outputEl, generateBtn);
    });
}

async function loadTopics(chipsEl, generateBtn) {
    try {
        const topics = await fetchTopics();

        if (topics.length === 0) {
            chipsEl.innerHTML = `
        <div class="empty-state" style="padding: 20px 0;">
          <div class="empty-state-text">No topics found</div>
          <div class="empty-state-subtext">Start adding content to your knowledge base to see topics here.</div>
        </div>
      `;
            return;
        }

        chipsEl.innerHTML = topics
            .map(
                (t) =>
                    `<button class="topic-chip" data-topic="${escapeAttr(t)}">${escapeHtml(t)}</button>`
            )
            .join("");

        // Add select all / clear all
        const actionsHtml = `
      <div style="width: 100%; display: flex; gap: 8px; margin-top: 12px;">
        <button class="report-action-btn" id="select-all-btn">Select All</button>
        <button class="report-action-btn" id="clear-all-btn">Clear All</button>
      </div>
    `;
        chipsEl.insertAdjacentHTML("afterend", actionsHtml);

        // Chip click handlers
        chipsEl.querySelectorAll(".topic-chip").forEach((chip) => {
            chip.addEventListener("click", () => {
                const topic = chip.dataset.topic;
                if (selectedTopics.has(topic)) {
                    selectedTopics.delete(topic);
                    chip.classList.remove("selected");
                } else {
                    selectedTopics.add(topic);
                    chip.classList.add("selected");
                }
                updateGenerateBtn(generateBtn);
            });
        });

        // Select all / clear all
        const container = chipsEl.parentElement;
        container.querySelector("#select-all-btn")?.addEventListener("click", () => {
            chipsEl.querySelectorAll(".topic-chip").forEach((chip) => {
                selectedTopics.add(chip.dataset.topic);
                chip.classList.add("selected");
            });
            updateGenerateBtn(generateBtn);
        });

        container.querySelector("#clear-all-btn")?.addEventListener("click", () => {
            selectedTopics.clear();
            chipsEl.querySelectorAll(".topic-chip").forEach((chip) => {
                chip.classList.remove("selected");
            });
            updateGenerateBtn(generateBtn);
        });
    } catch (err) {
        chipsEl.innerHTML = `
      <div class="empty-state" style="padding: 20px 0;">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">Failed to load topics</div>
        <div class="empty-state-subtext">${escapeHtml(err.message)}</div>
      </div>
    `;
    }
}

function updateGenerateBtn(btn) {
    const count = selectedTopics.size;
    btn.disabled = count === 0 || isGenerating;
    btn.textContent = count > 0 ? `✨ Generate Report (${count} topic${count !== 1 ? "s" : ""})` : "✨ Generate Report";
}

async function handleGenerate(outputEl, generateBtn) {
    if (selectedTopics.size === 0 || isGenerating) return;

    isGenerating = true;
    generateBtn.disabled = true;
    generateBtn.textContent = "⏳ Generating...";

    outputEl.innerHTML = `
    <div class="report-output">
      <div class="loading-spinner" style="padding: 60px 0;">
        <div class="spinner"></div>
        <span class="loading-text">Analyzing your knowledge base and generating report...</span>
      </div>
    </div>
  `;

    try {
        const topics = [...selectedTopics];
        const { report, stats } = await generateReport(topics);

        const reportHtml = marked.parse(report);

        outputEl.innerHTML = `
      <div class="report-output">
        <div class="report-toolbar">
          <span class="report-toolbar-title">Generated Report — ${topics.join(", ")}</span>
          <div class="report-toolbar-actions">
            <button class="report-action-btn" id="copy-report-btn">📋 Copy</button>
          </div>
        </div>
        <div class="report-content">${reportHtml}</div>
        <div class="report-stats">
          <span>Based on <strong>${stats.memoryPoints}</strong> memory entries and <strong>${stats.knowledgePoints}</strong> knowledge base entries</span>
        </div>
      </div>
    `;

        // Copy handler
        outputEl.querySelector("#copy-report-btn")?.addEventListener("click", () => {
            navigator.clipboard.writeText(report).then(() => {
                const btn = outputEl.querySelector("#copy-report-btn");
                btn.textContent = "✅ Copied!";
                setTimeout(() => (btn.textContent = "📋 Copy"), 2000);
            });
        });
    } catch (err) {
        outputEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">Report generation failed</div>
        <div class="empty-state-subtext">${escapeHtml(err.message)}</div>
      </div>
    `;
    } finally {
        isGenerating = false;
        updateGenerateBtn(generateBtn);
    }
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
