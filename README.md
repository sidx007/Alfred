<div align="center">

# 🦇 Alfred

### _Your AI-Powered Knowledge Butler_

**Capture everything. Forget nothing. Let Alfred handle the rest.**

[![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?style=flat-square&logo=react)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo_SDK-54-000020?style=flat-square&logo=expo)](https://expo.dev/)
[![Appwrite](https://img.shields.io/badge/Appwrite-Cloud_Functions-FD366E?style=flat-square&logo=appwrite)](https://appwrite.io/)
[![Gemini](https://img.shields.io/badge/Google-Gemini-4285F4?style=flat-square&logo=google)](https://deepmind.google/technologies/gemini/)
[![Qdrant](https://img.shields.io/badge/Qdrant-Vector_DB-DC244C?style=flat-square)](https://qdrant.tech/)

[Demo (Mobile)](https://drive.google.com/file/d/1llXXNM2wAyARtf0KYE-kmnjbVP4yal9Z/view?usp=sharing) · [Demo (Web)](https://drive.google.com/file/d/19VW34Dakc0lz4fZeESg9CK2p_8yboZRQ/view?usp=drive_link)

</div>

---

## ✨ What is Alfred?

Alfred is an **AI-powered personal knowledge management and learning assistant**, themed after Alfred Pennyworth — Batman's ever-reliable butler. It captures your daily insights from text, audio, and images, automatically organizes them into a searchable knowledge base, generates spaced-repetition revision reports, and provides a conversational AI chat interface.

> _"I trust you'll find everything in order, sir. Your memories, neatly catalogued and ready for review."_

---

## 🎯 Features

|     | Feature                       | Description                                                                                                                    |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 📝  | **Multi-Modal Capture**       | Type notes, record/upload audio, snap/upload images — all from a gesture-driven mobile app                                     |
| 🧠  | **AI Processing Pipeline**    | Transcription, OCR, semantic clustering, topic classification, web research enrichment, and vector embedding — fully automated |
| 🔁  | **Spaced Repetition Reports** | Daily pipeline retrieves chunks from 1, 3, 5, and 7 days ago, grouped by topic, written in Alfred's signature tone             |
| 🃏  | **Flashcards**                | Anki-style cards with Again / Good / Easy grading, generated from your captured knowledge                                      |
| 💬  | **RAG Chat**                  | Ask Alfred anything — semantic search retrieves relevant memories and knowledge for context-aware answers                      |
| 🎙️  | **Voice & Live Chat**         | Multimodal audio input and real-time bidirectional voice streaming via Gemini                                                  |
| 🌐  | **Web Dashboard**             | Browse topics, view revision summaries, generate custom reports, and chat with your knowledge base                             |
| 🔄  | **Resilient Uploads**         | Exponential backoff, per-step progress tracking, and resumable pipelines — no upload is ever lost                              |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                           │
│                                                                 │
│   📱 Mobile App                    🌐 Web Dashboard             │
│   React Native / Expo              Vanilla JS + Express + Vite  │
│   • Text / Audio / Image capture   • RAG Chat & Voice Chat      │
│   • Flashcards & Checklist         • Topic Browser & Reports    │
│   • Upload Queue with retry        • Live Voice (WebSocket)     │
│                                                                 │
└──────────────────────┬──────────────────────┬───────────────────┘
                       │                      │
                       ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   APPWRITE CLOUD FUNCTIONS                      │
│                        (Python)                                 │
│                                                                 │
│   audioFunction ──► clusteringFunction ──► processSegmentFunction│
│   imageFunction ─┘                         │                    │
│                                            ├─► vectorEmbedFunction
│                                            └─► reportGeneratorFunction
│                                                                 │
│   dailyReportPipelineFunction  ·  customReportFunction          │
│   revisionChunksFunction       ·  vectorRetrieveFunction        │
│                                                                 │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      QDRANT CLOUD                               │
│                  Vector Database (3072-dim)                      │
│                                                                 │
│   memory · knowledge_base · topics · daily report               │
│   previous reports · flashcards                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🤖 Multi-LLM Architecture

Alfred uses the **right model for each task**:

| Task                 | Model                                | Why                                                |
| -------------------- | ------------------------------------ | -------------------------------------------------- |
| Speech-to-Text       | **Deepgram Nova-3**                  | Industry-leading ASR accuracy and speed            |
| Image OCR            | **OCR.space**                        | Reliable OCR with progressive compression fallback |
| Semantic Clustering  | **Groq / Llama 3.3 70B**             | Fast inference for chunking long-form text         |
| Topic Classification | **Groq / Llama 3.1 8B**              | Lightweight, low-latency labeling                  |
| Report Generation    | **Google Gemini 2.5 Flash**          | High-quality long-form writing with personality    |
| Web Research         | **Gemini 2.5 Flash + Google Search** | Grounded answers with real-time web data           |
| Voice Input          | **Gemini 2.5 Flash**                 | Native multimodal audio understanding              |
| Live Voice Streaming | **Gemini 2.0 Flash**                 | Real-time bidirectional WebSocket streaming        |
| Vector Embeddings    | **Gemini Embedding 001**             | 3072-dim embeddings for semantic search            |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- [Python 3.x](https://www.python.org/) (for Appwrite functions)
- API keys for: Deepgram, OCR.space, Google Gemini, Groq, Qdrant Cloud

### Mobile App

```bash
# Install dependencies
npm install

# Start the Expo development server
npx expo start
```

Open on a [development build](https://docs.expo.dev/develop/development-builds/introduction/), [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/), [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/), or [Expo Go](https://expo.dev/go).

### Web Dashboard

```bash
cd website
npm install
node server.js
```

### Appwrite Functions

Each function in the `appwrite/` directory has its own `requirements.txt`. Deploy them to [Appwrite Cloud](https://appwrite.io/) or a self-hosted Appwrite instance.

---

## 📁 Project Structure

```
alfred/
├── app/                          # Expo Router screens
│   ├── index.tsx                 # Home — card carousel + upload
│   ├── checklist.tsx             # Daily task checklist
│   └── _layout.tsx               # Root layout + gesture navigation
├── components/                   # Reusable UI components
│   ├── AudioPickerSheet.tsx      # Audio record/upload bottom sheet
│   ├── ImagePickerSheet.tsx      # Camera/gallery bottom sheet
│   ├── TextInputModal.tsx        # Text note input modal
│   ├── FlashcardsPanel.tsx       # Anki-style flashcard viewer
│   ├── ChecklistPanel.tsx        # Daily revision checklist
│   ├── UploadStatusButton.tsx    # Floating upload progress pill
│   └── UploadDetailModal.tsx     # Per-step upload progress modal
├── services/                     # API & upload logic
│   ├── api.ts                    # Processing pipeline orchestration
│   ├── alfredApi.ts              # Alfred API client
│   ├── appwrite.ts               # Appwrite SDK config
│   └── uploadQueue.ts            # Resilient job queue with retry
├── context/
│   └── UploadContext.tsx          # Global upload state management
├── constants/                    # Theme, layout, item configs
├── website/                      # Web dashboard
│   ├── server.js                 # Express + WebSocket server
│   └── src/                      # Frontend (Vite + vanilla JS)
├── appwrite/                     # Serverless cloud functions
│   ├── audioFunction/            # Deepgram transcription
│   ├── imageFunction/            # OCR.space processing
│   ├── clusteringFunction/       # Semantic text chunking
│   ├── processSegmentFunction/   # Topic + research + embedding
│   ├── vectorEmbedFunction/      # Qdrant vector storage
│   ├── vectorRetrieveFunction/   # Semantic search
│   ├── reportGeneratorFunction/  # Alfred-persona reports
│   ├── dailyReportPipelineFunction/ # Spaced-repetition orchestrator
│   ├── customReportFunction/     # On-demand topic briefings
│   └── revisionChunksFunction/   # Historical chunk retrieval
└── assets/                       # Fonts & images
```

---

## 🧪 How It Works

```
  User captures text / audio / image
           │
           ▼
  Upload enters resilient job queue
  (exponential backoff, resumable state)
           │
           ▼
  ┌────────┴────────┐
  │ Audio?           │ Image?
  │ Deepgram Nova-3  │ OCR.space
  └────────┬────────┘
           │
           ▼
  Semantic clustering (Llama 3.3 70B)
  Text → coherent segments
           │
           ▼
  Per-segment processing:
  ├─ Topic classification (Llama 3.1 8B)
  ├─ Deduplication (deterministic UUID5)
  ├─ Web research (Gemini + Google Search)
  ├─ Embedding (Gemini Embedding 001)
  └─ Store in Qdrant (memory + knowledge_base + topics)
           │
           ▼
  Daily spaced-repetition pipeline:
  Chunks from 1 / 3 / 5 / 7 days ago
  → Grouped by topic → Alfred-persona reports
           │
           ▼
  Flashcards, checklist, RAG chat, voice chat
  All powered by semantic search over Qdrant
```

---

## 🎩 The Alfred Touch

Report generation randomly selects from **8 distinct Alfred Pennyworth personality tones** — from _"witty and eloquent"_ to _"crisp and commanding"_ — ensuring your daily revision never feels stale.

> _"Shall I remind you, sir, that you studied distributed systems three days ago and appear to have retained absolutely none of it? Allow me to refresh your memory."_

---

## 📄 License

This project was built for the [DEV Weekend Challenge: Community](https://dev.to/challenges/weekend-2026-02-28).

---

<div align="center">

_Built with 🦇 by [sidx007](https://github.com/sidx007)_

</div>
