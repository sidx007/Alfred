import { runUploadPipeline } from "./_lib/backend.js";
import { readJsonBody, sendError, withApi } from "./_lib/http.js";

export default withApi(
  async (req, res) => {
    const payload = await readJsonBody(req);
    const type = String(payload.type || "").trim().toLowerCase();

    if (!["text", "audio", "image"].includes(type)) {
      sendError(res, new Error("type must be one of: text, audio, image"), 400);
      return;
    }

    const result = await runUploadPipeline(payload);
    res.status(200).json({ success: true, ...result });
  },
  { methods: ["POST"] },
);
