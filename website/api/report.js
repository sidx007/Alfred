import { generatePromptReport } from "./_lib/backend.js";
import { readJsonBody, sendError, withApi } from "./_lib/http.js";

export default withApi(
  async (req, res) => {
    const body = await readJsonBody(req);
    const prompt = String(body.prompt || "");
    const topics = Array.isArray(body.topics) ? body.topics : [];

    if (!prompt.trim() && topics.length === 0) {
      sendError(res, new Error("A prompt or topics array is required"), 400);
      return;
    }

    const result = await generatePromptReport(prompt, topics);
    res.status(200).json({ success: true, ...result });
  },
  { methods: ["POST"] },
);
