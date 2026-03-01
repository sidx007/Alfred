_This is a submission for the [DEV Weekend Challenge: Community](https://dev.to/challenges/weekend-2026-02-28)_

## The Community

Alfred is built for **students, lifelong learners, and knowledge workers** — anyone who constantly absorbs information from lectures, podcasts, articles, and conversations but struggles to retain it all. Inspired by the "capture once, revise forever" philosophy, Alfred serves the community of people who believe learning doesn't stop after the first encounter with an idea. Whether you're a university student juggling multiple subjects, a developer keeping up with new technologies, or a curious mind exploring diverse topics, Alfred ensures nothing you learn is ever forgotten.

## What I Built

**Alfred** is an AI-powered personal knowledge management and learning assistant, themed after Alfred Pennyworth (Batman's butler). It captures daily insights from text, audio, and images, automatically organizes them into a searchable knowledge base, generates spaced-repetition revision reports, and provides a conversational AI chat interface — all to help users retain and deepen what they learn.

Key features include:

- **Multi-Modal Capture** — Type notes, record/upload audio, snap/upload images from a gesture-driven mobile app
- **AI Processing Pipeline** — Audio transcription (Deepgram Nova-3), image OCR (OCR.space), semantic clustering, topic classification, web research enrichment, and vector embedding
- **Spaced Repetition Reports** — A daily pipeline retrieves chunks from 1, 3, 5, and 7 days ago, groups them by topic, and generates revision reports in a randomized "Alfred Pennyworth" personality tone
- **Flashcards** — Anki-style cards with Again/Good/Easy grading, generated from your captured knowledge
- **RAG Chat** — Ask Alfred anything — your question is embedded, relevant memories and knowledge are retrieved via semantic search, and a context-aware answer is generated
- **Voice & Live Chat** — Multimodal audio input and real-time bidirectional voice streaming via Gemini
- **Web Dashboard** — Browse topics, view revision summaries, generate custom reports, and chat with your knowledge base
- **Resilient Upload Queue** — Exponential backoff, per-step progress tracking, and resumable pipelines so no upload is ever lost

## Demo

[Mobile App](https://drive.google.com/file/d/1llXXNM2wAyARtf0KYE-kmnjbVP4yal9Z/view?usp=sharing)
[Web Dashboard](https://drive.google.com/file/d/19VW34Dakc0lz4fZeESg9CK2p_8yboZRQ/view?usp=drive_link)

## Code
{% github sidx007/Alfred %}

## How I Built It
Alfred is a **three-tier application** spanning a mobile app, a web dashboard, and a serverless AI backend:

**Mobile App (React Native / Expo)** — React Native 0.81 with Expo SDK 54 and Expo Router. React Native Reanimated 4 and Gesture Handler power a 3-page vertical swipe UI (Flashcards ↑ Home ↓ Checklist) with a horizontal card carousel. expo-av for audio, expo-image-picker for camera/gallery, expo-document-picker for file uploads. A custom upload queue manages jobs with exponential backoff and resumable pipeline state.

**Web Dashboard (Vanilla JS + Express)** — Vite 6 for bundling, Express.js 4 as the API server, WebSocket (ws) for real-time bidirectional voice streaming with Gemini 2.0 Flash Live API, multer for file uploads, and marked for Markdown rendering.

**Serverless Backend (Appwrite Cloud Functions)** — 10 Python cloud functions handle the AI processing pipeline: audio transcription (Deepgram Nova-3), image OCR (OCR.space), semantic clustering (Groq/Llama 3.3 70B), topic classification + web research + embedding (Groq/Llama 3.1 8B + Gemini 2.5 Flash + Gemini Embedding 001), vector storage and retrieval (Qdrant Cloud), report generation (Gemini 2.5 Flash), and spaced-repetition pipeline orchestration.

**Vector Database (Qdrant Cloud)** — All knowledge is stored as 3072-dimensional Gemini embeddings across collections: `memory`, `knowledge_base`, `topics`, `daily report`, `previous reports`, and `flashcards`.

**Multi-LLM Architecture** — Groq/Llama 3.3 70B for fast clustering, Groq/Llama 3.1 8B for topic classification, Google Gemini 2.5 Flash for generation/search/audio, Gemini 2.0 Flash for live voice streaming, Gemini Embedding 001 for semantic search, and Deepgram Nova-3 for speech-to-text.
