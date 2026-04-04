import { fetchFlashcards, generateDailyFlashcards } from "./_lib/backend.js";
import { withApi } from "./_lib/http.js";

export default withApi(
  async (req, res) => {
    if (req.method === "GET") {
      const flashcards = await fetchFlashcards();
      res.status(200).json({ success: true, flashcards });
      return;
    }

    const result = await generateDailyFlashcards();
    res.status(200).json({
      success: true,
      flashcards: result.flashcards,
      cached: Boolean(result.cached),
    });
  },
  { methods: ["GET", "POST"] },
);
