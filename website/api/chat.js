import { runChat } from "./_lib/backend.js";
import { readJsonBody, sendError, withApi } from "./_lib/http.js";

export default withApi(
  async (req, res) => {
    const body = await readJsonBody(req);
    const message = String(body.message || "").trim();
    if (!message) {
      sendError(res, new Error("Message is required"), 400);
      return;
    }

    const result = await runChat(message);
    res.status(200).json({ success: true, ...result });
  },
  { methods: ["POST"] },
);
