// ── Daily Revision Page ─────────────────────────────────────────────
import { marked } from "marked";
import { fetchRevisions } from "../api.js";

const DAY_LABELS = {
    day1: { label: "Yesterday", emoji: "📝", desc: "1 day ago" },
    day3: { label: "3 Days Ago", emoji: "📖", desc: "3 days ago" },
    day5: { label: "5 Days Ago", emoji: "📚", desc: "5 days ago" },
    day7: { label: "1 Week Ago", emoji: "🗓️", desc: "7 days ago" },
};

export function renderRevision(container) {
    const page = document.createElement("div");
    page.className = "page";
    page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">📅 Daily Revision</h1>
      <p class="page-description">
        Review your past learnings with spaced repetition. Content from 1, 3, 5, and 7 days ago — summarized for quick revision.
      </p>
    </div>
    <div class="page-body">
      <div id="revision-content">
        <div class="loading-spinner">
          <div class="spinner"></div>
          <span class="loading-text">Generating your revision summaries...</span>
        </div>
      </div>
    </div>
  `;
    container.appendChild(page);

    loadRevisions(page.querySelector("#revision-content"));
}

async function loadRevisions(contentEl) {
    try {
        const revisions = await fetchRevisions();
        renderRevisionCards(contentEl, revisions);
    } catch (err) {
        contentEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">Failed to load revisions</div>
        <div class="empty-state-subtext">${escapeHtml(err.message)}</div>
      </div>
    `;
    }
}

function renderRevisionCards(contentEl, revisions) {
    const dayOrder = ["day1", "day3", "day5", "day7"];
    const hasAnyContent = dayOrder.some(
        (key) => revisions[key] && revisions[key].count > 0
    );

    if (!hasAnyContent) {
        contentEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">No content to revise today</div>
        <div class="empty-state-subtext">Start capturing notes in Alfred to see revision summaries here.</div>
      </div>
    `;
        return;
    }

    contentEl.innerHTML = `<div class="revision-grid" id="revision-grid"></div>`;
    const grid = contentEl.querySelector("#revision-grid");

    for (const key of dayOrder) {
        const rev = revisions[key];
        const meta = DAY_LABELS[key];
        if (!rev) continue;

        const card = document.createElement("div");
        card.className = "revision-card";

        const topics = rev.topics || [];
        const summaryHtml =
            rev.count > 0
                ? marked.parse(rev.summary)
                : `<div class="revision-empty">No content captured on this day.</div>`;

        card.innerHTML = `
      <div class="revision-card-header">
        <span class="revision-day-label">${meta.emoji} ${meta.label}</span>
        <span class="revision-date">${formatDate(rev.date)}</span>
      </div>
      ${rev.count > 0
                ? `<div class="revision-stats">
              <div class="revision-stat">
                <span class="revision-stat-value">${rev.count}</span>
                <span>segment${rev.count !== 1 ? "s" : ""}</span>
              </div>
              ${topics.length
                    ? `<div class="revision-stat">
                      <span class="revision-stat-value">${topics.length}</span>
                      <span>topic${topics.length !== 1 ? "s" : ""}</span>
                    </div>`
                    : ""
                }
            </div>`
                : ""
            }
      <div class="revision-card-body">${summaryHtml}</div>
    `;

        grid.appendChild(card);
    }
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}
