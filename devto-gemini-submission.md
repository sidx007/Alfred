_This is a submission for the [Built with Google Gemini: Writing Challenge](https://dev.to/challenges/mlh-built-with-google-gemini-02-25-26)_

## What I Built with Google Gemini

**Alfred** is an AI-powered personal knowledge management and learning assistant — themed after Alfred Pennyworth, Batman's ever-reliable butler. The core problem it solves: **we consume and capture information constantly, but almost none of it sticks.** Notes get buried, voice memos are forgotten, and screenshots pile up unread.

Alfred fixes this by combining **multi-modal capture** (text, audio, images) with an **automated AI processing pipeline** that transcribes, extracts, clusters, classifies, enriches, and embeds everything you feed it — then serves it back to you through **spaced-repetition revision reports**, **Anki-style flashcards**, and a **RAG-powered conversational chat**.

### Where Google Gemini Fits In

Gemini is the backbone of Alfred's intelligence layer. The project uses **three distinct Gemini capabilities** across the pipeline:

| Capability            | Gemini Model                                 | Role in Alfred                                                                                                                                                            |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Report Generation** | Gemini 2.5 Flash                             | Writes rich, long-form spaced-repetition reports in Alfred Pennyworth's signature personality — randomly selected from 8 distinct tones so daily reviews never feel stale |
| **Web Research**      | Gemini 2.5 Flash + Google Search (Grounding) | Enriches every captured knowledge segment with real-time web context, sourced facts, and supplementary information                                                        |
| **Vector Embeddings** | Gemini Embedding 001                         | Generates 3072-dimensional embeddings stored in Qdrant for semantic search across all captured memories and knowledge                                                     |

Gemini doesn't just assist — it's the engine that turns raw captures into a living, queryable, reviewable knowledge base.

## Demo

- [Mobile App Demo (Video)](https://drive.google.com/file/d/1llXXNM2wAyARtf0KYE-kmnjbVP4yal9Z/view?usp=sharing)
- [Web Dashboard Demo (Video)](https://drive.google.com/file/d/19VW34Dakc0lz4fZeESg9CK2p_8yboZRQ/view?usp=drive_link)

### How It Works

```
  User captures text / audio / image
              │
              ▼
  Resilient upload queue (exponential backoff, resumable)
              │
              ▼
  Audio → Deepgram Nova-3 │ Image → OCR.space
              │
              ▼
  Semantic clustering (Groq / Llama 3.3 70B)
              │
              ▼
  Per-segment: Topic classification → Web research (Gemini + Google Search)
              → Embedding (Gemini Embedding 001) → Store in Qdrant
              │
              ▼
  Daily pipeline: chunks from 1/3/5/7 days ago
              → Gemini 2.5 Flash writes Alfred-persona reports
              │
              ▼
  Flashcards, checklist, RAG chat
```

### Tech Stack

- **Mobile:** React Native + Expo SDK 54
- **Web Dashboard:** Vanilla JS + Express + Vite
- **Backend:** Appwrite Cloud Functions (Python)
- **Vector DB:** Qdrant Cloud (3072-dim collections for memory, knowledge base, topics, reports, and flashcards)
- **AI Models:** Google Gemini (2.5 Flash, Embedding 001), Deepgram Nova-3, OCR.space, Groq/Llama

## What I Learned

**1. The right model for each task matters more than one model for everything.**
Alfred uses a multi-LLM architecture — Deepgram for transcription, Groq/Llama for fast clustering, and Gemini for the tasks that need its strengths: long-form generation, grounded web search, and embeddings. Trying to force a single model into every role leads to worse results and higher latency. Gemini excels at the creative and retrieval-heavy tasks; pairing it with specialized models elsewhere made the whole pipeline faster and more reliable.

**2. Gemini's Google Search grounding is a superpower for knowledge enrichment.**
Being able to call Gemini with grounding enabled and get back web-sourced, factually enriched content transformed the quality of Alfred's knowledge base. Every captured segment gets context it wouldn't have otherwise.

**3. Personality in AI output keeps users engaged.**
Randomly selecting from 8 Alfred Pennyworth personality tones for report generation was a small touch, but it made the daily revision reports genuinely enjoyable to read. Gemini 2.5 Flash handles the persona prompts remarkably well — the outputs feel natural, not forced.

**4. Building resilient upload pipelines is non-trivial but essential.**
Exponential backoff, per-step progress tracking, and resumable state turned what could be a fragile multi-step AI pipeline into something that survives network drops and function timeouts gracefully.

## Google Gemini Feedback

**What worked well:**

- **Gemini 2.5 Flash for report generation** is excellent. It handles long, structured prompts with personality constraints and produces high-quality, coherent output consistently. The writing quality is noticeably above what I get from comparable models at similar speed.
- **Google Search grounding** is seamless to use and incredibly valuable. Just flipping a flag to get real-time web context in responses is a killer feature for any knowledge-enrichment use case.
- **Gemini Embedding 001** produces high-quality 3072-dim embeddings that work well with Qdrant for semantic retrieval. The embedding quality translates directly into better RAG chat answers.

**Where I hit friction:**

- **Rate limits during development** were the biggest pain point. When iterating on prompt engineering for report generation or testing the daily pipeline end-to-end, hitting rate limits repeatedly slowed down the dev loop significantly.
- **Error messages** from the API could be more descriptive in some edge cases — a few times I got generic errors that took trial-and-error to debug, when a more specific message would have pointed me in the right direction immediately.

Overall, Gemini was the right choice for Alfred's core intelligence. The combination of strong generation quality, grounded search, and embeddings — all from a single provider — made it possible to build a cohesive pipeline without juggling multiple embedding and generation APIs.
