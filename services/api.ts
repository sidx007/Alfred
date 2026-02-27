import { invokeFunction } from "./appwrite";

// ── Function IDs from environment (EXPO_PUBLIC_ prefix required) ────
const AUDIO_FN = process.env.EXPO_PUBLIC_AUDIOFUNCTION_ID ?? "";
const IMAGE_FN = process.env.EXPO_PUBLIC_IMAGEFUNCTION_ID ?? "";
const CLUSTERING_FN = process.env.EXPO_PUBLIC_CLUSTERINGFUNCTION_ID ?? "";
const PROCESS_SEGMENT_FN =
  process.env.EXPO_PUBLIC_PROCESSSEGMENTFUNCTION_ID ?? "";

// ── Response types ──────────────────────────────────────────────────
export interface AudioResponse {
  success: boolean;
  text: string;
  error?: string;
}

export interface ImageResponse {
  success: boolean;
  text: string;
  error?: string;
}

export interface ClusterSegment {
  content: string;
}

export interface ClusteringResponse {
  success: boolean;
  segments: ClusterSegment[];
  error?: string;
}

export interface ProcessSegmentResponse {
  success: boolean;
  topics?: { topic: string; isNew: boolean }[];
  searchResult?: string;
  memoryStored?: number;
  knowledgeBaseStored?: number;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

// ── API wrappers ────────────────────────────────────────────────────

export async function processAudio(
  audioBase64: string,
  contentType = "audio/m4a",
  language = "en",
): Promise<AudioResponse> {
  const res = await invokeFunction<AudioResponse>(AUDIO_FN, {
    audioBase64,
    contentType,
    language,
  });
  if (!res.success) throw new Error(res.error ?? "Audio processing failed");
  return res;
}

export async function processImage(
  imageBase64: string,
  language = "en",
): Promise<ImageResponse> {
  console.log(
    `[API] processImage — base64 length: ${imageBase64.length}, language: ${language}, IMAGE_FN: "${IMAGE_FN}"`,
  );
  const res = await invokeFunction<ImageResponse>(IMAGE_FN, {
    imageBase64,
    language,
  });
  console.log(
    `[API] processImage response — success: ${res.success}, text length: ${res.text?.length ?? 0}`,
    res.error ? `error: ${res.error}` : "",
  );
  if (!res.success) throw new Error(res.error ?? "Image processing failed");
  return res;
}

export async function clusterText(
  paragraph: string,
): Promise<ClusteringResponse> {
  const res = await invokeFunction<ClusteringResponse>(CLUSTERING_FN, {
    paragraph,
  });
  if (!res.success) throw new Error(res.error ?? "Clustering failed");
  return res;
}

export async function processSegment(
  segment: string,
): Promise<ProcessSegmentResponse> {
  const res = await invokeFunction<ProcessSegmentResponse>(PROCESS_SEGMENT_FN, {
    segment,
  });
  if (!res.success) throw new Error(res.error ?? "Segment processing failed");
  return res;
}

// ── Step-based pipeline state (persisted across retries) ────────────

export interface PipelineState {
  /** Extracted / input text — set after transcription/OCR completes */
  extractedText?: string;
  /** Segments from clustering */
  segments?: string[];
  /** Index of next segment to process (0-based) */
  nextSegmentIdx: number;
  /** Results from processed segments so far */
  segmentResults: ProcessSegmentResponse[];
}

export function createPipelineState(): PipelineState {
  return { nextSegmentIdx: 0, segmentResults: [] };
}

// ── Resumable pipelines ─────────────────────────────────────────────

/**
 * Text pipeline: cluster → process each segment.
 * Resumes from wherever it left off in `state`.
 */
export async function runTextPipeline(
  text: string,
  state: PipelineState,
  onProgress?: (step: string) => void,
): Promise<ProcessSegmentResponse[]> {
  // Step 1: Cluster (skip if already done)
  if (!state.segments) {
    onProgress?.("Clustering text…");
    const { segments } = await clusterText(text);
    state.segments = segments.map((s) => s.content);
  }

  // Step 2: Process remaining segments in parallel
  const total = state.segments.length;
  const remaining = state.segments.slice(state.nextSegmentIdx);

  if (remaining.length > 0) {
    onProgress?.(
      `Processing ${remaining.length} segment${remaining.length !== 1 ? "s" : ""} in parallel…`,
    );
    const results = await Promise.all(
      remaining.map((seg) => processSegment(seg)),
    );
    state.segmentResults.push(...results);
    state.nextSegmentIdx = total;
    onProgress?.(`All ${total} segments processed`);
  }

  return state.segmentResults;
}

/**
 * Audio pipeline: transcribe → cluster → process each segment.
 * Resumes from wherever it left off.
 */
export async function runAudioPipeline(
  audioBase64: string,
  state: PipelineState,
  contentType = "audio/m4a",
  language = "en",
  onProgress?: (step: string) => void,
): Promise<ProcessSegmentResponse[]> {
  // Step 1: Transcribe (skip if already done)
  if (!state.extractedText) {
    onProgress?.("Transcribing audio…");
    const { text } = await processAudio(audioBase64, contentType, language);
    if (!text.trim()) throw new Error("Transcription returned empty text");
    state.extractedText = text;
  }

  onProgress?.("Transcription complete, clustering…");
  return runTextPipeline(state.extractedText, state, onProgress);
}

/**
 * Image pipeline: OCR each image → cluster → process each segment.
 * Resumes from wherever it left off.
 */
export async function runImagePipeline(
  imagesBase64: string[],
  state: PipelineState,
  language = "en",
  onProgress?: (step: string) => void,
): Promise<ProcessSegmentResponse[]> {
  console.log(
    `[API] runImagePipeline — ${imagesBase64.length} image(s), b64 sizes: [${imagesBase64.map((b) => b.length).join(", ")}]`,
  );

  // Step 1: OCR (skip if already done)
  if (!state.extractedText) {
    const texts: string[] = [];
    for (let i = 0; i < imagesBase64.length; i++) {
      console.log(`[API] Processing image ${i + 1}/${imagesBase64.length}…`);
      onProgress?.(
        `Extracting text from image ${i + 1}/${imagesBase64.length}…`,
      );
      const { text } = await processImage(imagesBase64[i], language);
      console.log(
        `[API] Image ${i + 1} extracted text (${text.length} chars): "${text.slice(0, 200)}"`,
      );
      if (text.trim()) texts.push(text);
    }

    const combinedText = texts.join("\n\n");
    console.log(
      `[API] Combined text from all images (${combinedText.length} chars): "${combinedText.slice(0, 300)}"`,
    );
    if (!combinedText.trim()) {
      throw new Error("No text extracted from images");
    }
    state.extractedText = combinedText;
  }

  onProgress?.("Text extracted, clustering…");
  return runTextPipeline(state.extractedText, state, onProgress);
}
