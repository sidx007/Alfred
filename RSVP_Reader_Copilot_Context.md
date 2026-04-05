# RSVP Speed Reader — Copilot Build Context

## Project Overview
Build a web-based **RSVP (Rapid Serial Visual Presentation) Speed Reader** that lets users upload a PDF, select a starting page, and read using the scientifically-backed RSVP + ORP technique. Words flash one at a time at a user-defined WPM, with the **Optimal Recognition Point (ORP)** letter highlighted in a focal accent color. The design should be glassmorphic, minimal, and immersive.

---

## Tech Stack
- **Frontend:** Vanilla HTML + CSS + JavaScript (no frameworks for speed), OR React (Vite) if modularity is preferred
- **PDF Parsing:** [PDF.js](https://mozilla.github.io/pdf.js/) by Mozilla — extract text per page
- **Font:** `Inter` or `DM Sans` from Google Fonts
- **No backend required** — fully client-side

---

## Core Concept: RSVP + ORP

### What is RSVP?
Rapid Serial Visual Presentation eliminates **saccades** — the involuntary eye jumps that happen during normal reading. By fixing the eye at one point and flashing words sequentially, the brain processes text with minimal visual energy expenditure.

### What is ORP?
The **Optimal Recognition Point** is the specific letter in a word where the brain most efficiently triggers word recognition. Research (Brysbaert & Nazir, 2005; Spritz Inc. Patent US20140016867A1) shows:
- It is NOT the center letter — it is slightly left of center
- It lies at approximately **30–33% from the left** of the word

**ORP Character Position by Word Length:**
| Word Length | ORP Letter Position (1-indexed) |
|-------------|----------------------------------|
| 1           | 1                                |
| 2           | 1                                |
| 3           | 1                                |
| 4           | 2                                |
| 5           | 2                                |
| 6           | 2                                |
| 7           | 3                                |
| 8           | 3                                |
| 9           | 3                                |
| 10          | 4                                |
| 11          | 4                                |
| 12          | 4                                |
| 13+         | 4                                |

Every word must be split into three segments:
1. **Left part** — letters before ORP (dimmed/translucent)
2. **ORP letter** — single accented character (vivid accent color)
3. **Right part** — letters after ORP (dimmed/translucent)

The ORP letter must be **vertically and horizontally anchored** to the same pixel position on screen for every word — this is the key innovation. The eye never moves; only the word changes around the fixed focal point.

---

## Algorithm: Smart Timing

Do NOT display every word for the same duration. Use **intelligent pacing**:

```js
function getWordDuration(word, baseWPM) {
  const baseDuration = 60000 / baseWPM; // ms per word
  let multiplier = 1.0;

  // Long words get more time
  if (word.length > 8) multiplier += 0.3;
  if (word.length > 12) multiplier += 0.2;

  // Punctuation pauses
  if (/[.!?]$/.test(word)) multiplier += 0.8;       // end of sentence
  if (/[,;:]$/.test(word)) multiplier += 0.4;        // mid-sentence pause
  if (/^[A-Z]/.test(word) && word.length > 1) multiplier += 0.1; // capitalized/proper nouns

  return baseDuration * multiplier;
}
```

---

## UI Structure

### 1. Upload Screen (`/`)
- **Centered glassmorphic card** on a deep gradient background
- Drag-and-drop zone or click to upload PDF
- After PDF is loaded, show a page preview panel:
  - Thumbnail strip of all pages (using PDF.js canvas render)
  - Input: "Start from page __"
  - Input: "End at page __ (optional)"
- **WPM Slider** with live label: `300 WPM`
  - Range: 100 – 1000 WPM
  - Default: 300 WPM
- **Chunk Size Toggle**: `1 word | 2 words | 3 words`
- CTA: `[▶ Start Reading]` — a glass button with glow hover

### 2. Reader Screen (`/reader`)

#### Layout (full viewport):
```
┌──────────────────────────────────────────────────────────┐
│  [← Back]                    📖 Page 4 / 12    [⚙ Settings] │
│                                                            │
│  ████████████████████████░░░░░░░░░░░░  62% — 1,204 words  │
│                                                            │
│  ┌──────────────────────────────────────────────┐         │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │         │
│  │                                               │         │
│  │        beau  T  iful                         │  ← ORP  │
│  │                                               │         │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │         │
│  └──────────────────────────────────────────────┘         │
│                                                            │
│   [◀◀ -10]  [◀ -1]  [⏸ Space]  [▶ +1]  [▶▶ +10]         │
│                                                            │
│   ⚡ 300 WPM    ────●──────────── 1000                     │
│                                                            │
│   Words read: 1,204    Session: 4m 02s    Est. left: 6m    │
└──────────────────────────────────────────────────────────┘
```

#### The Word Display Box (Core Element):
- Glassmorphic frosted card — `backdrop-filter: blur(24px)` on a semi-transparent dark panel
- Three text spans inside, all using **monospace or fixed-width font** so ORP anchor never shifts
- Use CSS `ch` units to anchor ORP letter position precisely:
  ```html
  <div class="word-display">
    <span class="left">beau</span>
    <span class="orp">T</span>
    <span class="right">iful</span>
  </div>
  ```
  ```css
  .word-display {
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: 3.5rem;
    letter-spacing: 0.05em;
  }
  .left  { color: rgba(255,255,255,0.35); }
  .orp   { color: #FF4C6A; font-weight: 700; }
  .right { color: rgba(255,255,255,0.35); }
  ```
- Two faint horizontal guide lines (top + bottom of word height) like Spritz's "Redicle" — `1px solid rgba(255,68,106,0.25)`
- A subtle vertical center guide line marking the ORP column

#### Context Peek (optional toggle):
- Below the word box, show the current **sentence** in small dimmed text
- Current word is highlighted in the sentence, giving contextual awareness
- This helps comprehension without breaking the RSVP focus

---

## Keyboard Controls

| Key | Action |
|-----|--------|
| `Space` | Pause / Resume |
| `J` | Go back 10 words |
| `L` | Go forward 10 words |
| `A` | Decrease WPM by 25 |
| `D` | Increase WPM by 25 |
| `R` | Restart from beginning of current chapter |
| `Esc` | Back to upload screen |
| `C` | Toggle context sentence below |
| `F` | Toggle fullscreen |
| `,` | Go back 1 sentence |
| `.` | Go forward 1 sentence |

---

## Features Checklist

### Core
- [x] PDF upload (PDF.js) with page selection
- [x] Full text extraction per page, concatenation
- [x] ORP calculation per word
- [x] Anchored ORP display (word wraps around fixed pivot)
- [x] WPM-controlled interval timing
- [x] Smart pacing (punctuation + word-length aware)
- [x] Spacebar pause/resume
- [x] J/L navigation (±10 words)
- [x] Progress bar (words + percentage)
- [x] Session stats (words read, time, estimated remaining)

### Enhanced Features (Research-backed)
- [x] **Sentence Pause Mode**: Auto-pause for 300ms at sentence ends to allow comprehension consolidation
- [x] **Chunk Mode**: Display 1, 2, or 3 words at a time (research shows 2-word chunks improve comprehension at high WPM)
- [x] **Context Line**: Show current sentence in dimmed text below with current word highlighted
- [x] **Speed Ramp**: Starts 20% slower, accelerates to target WPM over 10 seconds (reduces cognitive shock)
- [x] **Vocabulary Pause**: If a word matches a "complex word list" or has 10+ chars, add 0.3s bonus display time
- [x] **Reading History**: LocalStorage-based bookmarking per PDF (resume where you left off)
- [x] **WPM Live Adjust**: Drag slider mid-session without losing position
- [x] **Font Size Control**: 2rem – 6rem
- [x] **Focus Mode**: Dim everything except the word display box on the reader screen
- [x] **Sentence Preview Panel**: Before reader starts, shows a preview of 5 sentences from start page
- [x] **Word Count Badge**: Shows document word count after PDF parse

### Accessibility
- [x] High contrast mode toggle
- [x] Dyslexia-friendly font option (OpenDyslexic)
- [x] Keyboard-first design

---

## Design Language: Glassmorphic Dark Minimal

### Color Palette
```css
:root {
  --bg-primary:    #0A0A0F;          /* near-black deep space */
  --bg-secondary:  #12121A;          /* card backgrounds */
  --glass-bg:      rgba(255,255,255,0.04);
  --glass-border:  rgba(255,255,255,0.10);
  --glass-blur:    blur(24px);
  --accent:        #FF4C6A;          /* ORP letter / primary CTA */
  --accent-glow:   rgba(255,76,106,0.3);
  --text-primary:  rgba(255,255,255,0.92);
  --text-dim:      rgba(255,255,255,0.30);
  --text-muted:    rgba(255,255,255,0.15);
  --progress-fill: linear-gradient(90deg, #FF4C6A, #FF8A65);
  --success:       #4CFFA0;
}
```

### Glassmorphism Rules
```css
.glass-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: 0 8px 32px rgba(0,0,0,0.4),
              inset 0 1px 0 rgba(255,255,255,0.06);
}
```

### Buttons (Glass Icons Style)
```css
.glass-btn {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 12px;
  backdrop-filter: blur(12px);
  color: var(--text-primary);
  transition: all 0.2s ease;
}
.glass-btn:hover {
  background: rgba(255,255,255,0.10);
  border-color: var(--accent);
  box-shadow: 0 0 20px var(--accent-glow);
}
```

### Animated Background
- Subtle animated gradient mesh (CSS `@keyframes` — slow-moving colored blobs, very low opacity)
- Background blobs: one `#FF4C6A` blob top-right, one `#6C63FF` blob bottom-left, opacity 0.08
- This gives depth without distraction

```css
.bg-blob {
  position: fixed;
  border-radius: 50%;
  filter: blur(120px);
  animation: blobDrift 20s ease-in-out infinite alternate;
  pointer-events: none;
  z-index: 0;
}
@keyframes blobDrift {
  0%   { transform: translate(0, 0) scale(1); }
  100% { transform: translate(40px, 30px) scale(1.1); }
}
```

### Typography Scale
- Logo/Hero: `3rem`, weight 700, tracking `-0.02em`
- Word Display: `3.5rem` monospace
- Subheadings: `1.1rem`, weight 600, uppercase, `0.1em` tracking, dim color
- Body/Labels: `0.875rem`, weight 400
- Stats: `tabular-nums` feature enabled

---

## PDF Parsing Logic (PDF.js)

```js
async function extractTextFromPDF(file, startPage, endPage) {
  const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
  const totalPages = pdf.numPages;
  const end = endPage || totalPages;
  let fullText = '';

  for (let i = startPage; i <= end; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + ' ';
  }

  return fullText.trim();
}
```

**Text Cleaning:**
```js
function cleanText(raw) {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width chars
    .replace(/([a-z])([A-Z])/g, '$1 $2')       // fix merged words from PDF
    .trim();
}
```

---

## ORP Split Function

```js
function getORPIndex(wordLength) {
  if (wordLength <= 1) return 0;
  if (wordLength <= 3) return 0;
  if (wordLength <= 5) return 1;
  if (wordLength <= 9) return 2;
  return 3;
}

function splitWordAtORP(word) {
  const cleanWord = word.replace(/[^a-zA-Z0-9]/g, match => match); // preserve punct
  const orpIdx = getORPIndex(cleanWord.length);
  return {
    left:  cleanWord.slice(0, orpIdx),
    orp:   cleanWord[orpIdx] || cleanWord[0],
    right: cleanWord.slice(orpIdx + 1),
  };
}
```

---

## State Management

```js
const readerState = {
  words: [],           // tokenized word array
  currentIndex: 0,
  isPlaying: false,
  wpm: 300,
  chunkSize: 1,        // 1 | 2 | 3
  timer: null,
  sessionStart: null,
  pdfName: '',
  totalWords: 0,
};
```

---

## Animations & Micro-interactions

- Word transition: `opacity 0 → 1` in `80ms` — instant but smooth
- No word sliding — purely opacity fade for zero distraction
- Progress bar: CSS transition `width 0.3s ease`
- WPM slider: live label updates with `requestAnimationFrame`
- Pause state: word display gets a subtle `scale(0.97)` + opacity dimming
- Resume: brief `scale(1.03) → 1.0` bounce with 150ms ease-out

```css
.word-display {
  transition: opacity 0.08s ease;
}
.paused .word-display {
  opacity: 0.4;
  transform: scale(0.97);
}
```

---

## Settings Panel (Slide-in Drawer)

Accessible via `[⚙]` icon or pressing `S`:
- WPM (100–1000 with snap points at 100, 200, 300, 400, 500, 600, 800, 1000)
- Chunk Size (1 / 2 / 3)
- Font Size (slider)
- Font Family (Inter / DM Sans / JetBrains Mono / OpenDyslexic)
- ORP Color picker (default red, allow customization)
- Context Line toggle
- Sentence Pause toggle + pause duration (0–500ms)
- Speed Ramp toggle
- Dark/Light theme toggle (dark default)

---

## Stats & Session Tracking

Shown in HUD bar at bottom:
- **Words read** — live count
- **Session time** — mm:ss stopwatch
- **Current WPM** — actual measured WPM (words / elapsed time)
- **Estimated time remaining** — `(totalWords - currentIndex) / wpm * 60` in minutes
- **Comprehension hint**: At sentence boundaries, show a brief `"💡 Understood?"` micro-prompt (dismissible, non-blocking)

LocalStorage schema:
```json
{
  "rsvp_sessions": [
    {
      "pdfName": "book.pdf",
      "lastWordIndex": 4234,
      "totalWords": 12000,
      "lastWPM": 350,
      "savedAt": "2026-03-20T00:00:00Z"
    }
  ]
}
```

---

## File Structure

```
rsvp-reader/
├── index.html          # upload screen
├── reader.html         # reader screen
├── css/
│   ├── base.css        # reset, variables, typography
│   ├── glass.css       # glassmorphic component library
│   ├── upload.css      # upload screen styles
│   └── reader.css      # reader screen styles
├── js/
│   ├── pdf-parser.js   # PDF.js integration + text cleaning
│   ├── orp.js          # ORP algorithm + word splitter
│   ├── reader.js       # state machine, timing, keyboard
│   ├── settings.js     # settings panel logic
│   └── storage.js      # LocalStorage session manager
├── assets/
│   └── fonts/          # OpenDyslexic (self-hosted)
└── lib/
    └── pdf.min.js      # PDF.js (bundled or CDN)
```

---

## Stretch Goals (Nice to Have)
1. **Comprehension Quiz Mode**: After each chapter/page range, pop 3 AI-style multiple-choice questions (using stored sentences)
2. **Export Stats**: Download session report as PDF
3. **EPUB Support**: Use epub.js to extend beyond PDFs
4. **Text-to-Speech Sync**: Optionally speak the word as it displays (Web Speech API)
5. **Speed Challenge Mode**: Gradually auto-increases WPM every 2 minutes
6. **Peripheral Vision Training**: Occasionally flash 2–3 word chunks to widen reading span
7. **PWA**: Make it installable as a Progressive Web App with offline support

---

## Accessibility Notes
- All interactive elements must have `aria-label`
- Pause/play state announced via `aria-live="polite"`
- Keyboard navigation must work without mouse
- `prefers-reduced-motion`: disable all CSS animations

---

## Performance Notes
- Parse full PDF text on upload, store in memory — do NOT re-parse during reading
- Use `setTimeout` chaining (not `setInterval`) for precise per-word timing
- Use `requestAnimationFrame` for any visual updates to stay on the render thread
- PDF.js worker must run in a separate thread via `pdfjsLib.GlobalWorkerOptions.workerSrc`
