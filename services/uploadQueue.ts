/**
 * Upload queue with retry logic, exponential back-off, and observable state.
 * Stores pipeline state so retries resume from the failed step.
 */

import type { PipelineState } from "./api";

export type JobType = "text" | "audio" | "image";

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "retrying";

export interface UploadJob {
  id: string;
  type: JobType;
  status: JobStatus;
  /** Human-readable label shown in the UI */
  label: string;
  /** Current step description */
  progress: string;
  /** Completed step descriptions (for the detail modal) */
  completedSteps: string[];
  /** Number of attempts so far */
  attempts: number;
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Timestamp when job was created */
  createdAt: number;
  /** Last error message */
  error?: string;
  /** The payload (text, base64, etc.) is stored externally – this is an opaque ref */
  _payload: unknown;
  /** Pipeline state preserved across retries so we can resume */
  _pipelineState: PipelineState;
  /** The runner function */
  _run: (
    payload: unknown,
    state: PipelineState,
    onProgress: (step: string) => void,
  ) => Promise<void>;
}

type Listener = (jobs: UploadJob[]) => void;

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 2_000; // 2s → 4s → 8s → …

let _queue: UploadJob[] = [];
let _processing = false;
const _listeners = new Set<Listener>();

// ── Helpers ─────────────────────────────────────────────────────────

function _genId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function _notify() {
  const snapshot = [..._queue];
  _listeners.forEach((fn) => fn(snapshot));
}

function _updateJob(
  id: string,
  patch: Partial<UploadJob> | ((prev: UploadJob) => Partial<UploadJob>),
) {
  _queue = _queue.map((j) => {
    if (j.id !== id) return j;
    const resolved = typeof patch === "function" ? patch(j) : patch;
    return { ...j, ...resolved };
  });
  _notify();
}

async function _sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Processing loop ─────────────────────────────────────────────────

async function _processNext() {
  if (_processing) return;

  const next = _queue.find(
    (j) => j.status === "queued" || j.status === "retrying",
  );
  if (!next) return;

  _processing = true;
  _updateJob(next.id, { status: "running", progress: "Starting…" });
  console.log(
    `[Queue] Running job ${next.id} (${next.type}: "${next.label}") — attempt ${next.attempts + 1}/${next.maxAttempts}`,
  );

  try {
    await next._run(next._payload, next._pipelineState, (step) => {
      console.log(`[Queue] Job ${next.id} progress: ${step}`);
      _updateJob(next.id, (prev) => ({
        progress: step,
        completedSteps: [...prev.completedSteps, step],
      }));
    });
    console.log(`[Queue] Job ${next.id} COMPLETED successfully.`);
    _updateJob(next.id, { status: "completed", progress: "Done" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Queue] Job ${next.id} FAILED:`, message, err);
    const newAttempts = next.attempts + 1;

    if (newAttempts < next.maxAttempts) {
      const delay = BASE_DELAY_MS * Math.pow(2, newAttempts - 1);
      _updateJob(next.id, {
        status: "retrying",
        attempts: newAttempts,
        error: message,
        progress: `Retry ${newAttempts}/${next.maxAttempts} in ${Math.round(delay / 1000)}s…`,
      });
      await _sleep(delay);
      // Re-queue for processing
      _updateJob(next.id, { status: "queued" });
    } else {
      _updateJob(next.id, {
        status: "failed",
        attempts: newAttempts,
        error: message,
        progress: "Failed",
      });
    }
  }

  _processing = false;
  // Continue with next job
  _processNext();
}

// ── Public API ──────────────────────────────────────────────────────

export function enqueueJob(
  type: JobType,
  label: string,
  payload: unknown,
  pipelineState: PipelineState,
  run: UploadJob["_run"],
): string {
  const job: UploadJob = {
    id: _genId(),
    type,
    status: "queued",
    label,
    progress: "Queued",
    completedSteps: [],
    attempts: 0,
    maxAttempts: MAX_RETRIES,
    createdAt: Date.now(),
    _payload: payload,
    _pipelineState: pipelineState,
    _run: run,
  };

  _queue = [..._queue, job];
  _notify();

  // Kick the loop
  _processNext();

  return job.id;
}

/** Manually retry a failed job */
export function retryJob(id: string) {
  const job = _queue.find((j) => j.id === id);
  if (!job || job.status !== "failed") return;
  _updateJob(id, { status: "queued", attempts: 0, error: undefined });
  _processNext();
}

/** Remove a completed or failed job from the queue */
export function dismissJob(id: string) {
  _queue = _queue.filter((j) => j.id !== id);
  _notify();
}

/** Clear all completed/failed jobs */
export function clearFinished() {
  _queue = _queue.filter(
    (j) => j.status !== "completed" && j.status !== "failed",
  );
  _notify();
}

/** Subscribe to queue changes. Returns an unsubscribe function. */
export function subscribeQueue(listener: Listener): () => void {
  _listeners.add(listener);
  listener([..._queue]); // immediate snapshot
  return () => {
    _listeners.delete(listener);
  };
}

/** Get current snapshot */
export function getQueueSnapshot(): UploadJob[] {
  return [..._queue];
}
