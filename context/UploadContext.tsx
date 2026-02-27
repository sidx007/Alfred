import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";

import {
    createPipelineState,
    runAudioPipeline,
    runImagePipeline,
    runTextPipeline,
    type PipelineState,
} from "../services/api";
import {
    clearFinished,
    dismissJob,
    enqueueJob,
    retryJob,
    subscribeQueue,
    type UploadJob,
} from "../services/uploadQueue";

// ── Context value ───────────────────────────────────────────────────

interface UploadContextValue {
  /** All jobs currently in the queue */
  jobs: UploadJob[];

  /** Aggregate status for the floating pill */
  overallStatus: "idle" | "uploading" | "completed" | "error";

  /** Enqueue a text upload */
  uploadText: (text: string) => void;

  /** Enqueue an audio upload (base64) */
  uploadAudio: (audioBase64: string, contentType?: string) => void;

  /** Enqueue image uploads (base64 array) */
  uploadImages: (imagesBase64: string[]) => void;

  /** Retry a failed job */
  retry: (jobId: string) => void;

  /** Dismiss (remove) a finished job */
  dismiss: (jobId: string) => void;

  /** Clear all finished jobs */
  clearDone: () => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────────────

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);

  useEffect(() => {
    return subscribeQueue(setJobs);
  }, []);

  // Aggregate status
  const overallStatus = React.useMemo<
    UploadContextValue["overallStatus"]
  >(() => {
    if (jobs.length === 0) return "idle";
    if (
      jobs.some(
        (j) =>
          j.status === "running" ||
          j.status === "retrying" ||
          j.status === "queued",
      )
    )
      return "uploading";
    if (jobs.some((j) => j.status === "failed")) return "error";
    return "completed";
  }, [jobs]);

  const uploadText = useCallback((text: string) => {
    enqueueJob(
      "text",
      "Text note",
      text,
      createPipelineState(),
      async (payload, state: PipelineState, onProgress) => {
        await runTextPipeline(payload as string, state, onProgress);
      },
    );
  }, []);

  const uploadAudio = useCallback(
    (audioBase64: string, contentType = "audio/m4a") => {
      enqueueJob(
        "audio",
        "Audio recording",
        { audioBase64, contentType },
        createPipelineState(),
        async (payload, state: PipelineState, onProgress) => {
          const p = payload as { audioBase64: string; contentType: string };
          await runAudioPipeline(
            p.audioBase64,
            state,
            p.contentType,
            "en",
            onProgress,
          );
        },
      );
    },
    [],
  );

  const uploadImages = useCallback((imagesBase64: string[]) => {
    const label =
      imagesBase64.length === 1 ? "1 image" : `${imagesBase64.length} images`;
    enqueueJob(
      "image",
      label,
      imagesBase64,
      createPipelineState(),
      async (payload, state: PipelineState, onProgress) => {
        await runImagePipeline(payload as string[], state, "en", onProgress);
      },
    );
  }, []);

  const value: UploadContextValue = {
    jobs,
    overallStatus,
    uploadText,
    uploadAudio,
    uploadImages,
    retry: retryJob,
    dismiss: dismissJob,
    clearDone: clearFinished,
  };

  return (
    <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────────────

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used within <UploadProvider>");
  return ctx;
}
