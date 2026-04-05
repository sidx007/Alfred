import { generateCustomReport } from "./_lib/backend.js";
import { readJsonBody, sendError, withApi } from "./_lib/http.js";

export default withApi(
  async (req, res) => {
    const body = await readJsonBody(req);
    const topics = Array.isArray(body.topics) ? body.topics : [];

    if (!topics.length) {
      sendError(res, new Error("A non-empty topics array is required"), 400);
      return;
    }

    const result = await generateCustomReport(topics);
    res.status(200).json({ success: true, ...result });
  },
  { methods: ["POST"] },
);
