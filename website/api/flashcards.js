import { fetchFlashcards } from "./_lib/backend.js";
import { withApi } from "./_lib/http.js";

export default withApi(async (req, res) => {
  const flashcards = await fetchFlashcards();
  res.status(200).json({ success: true, flashcards });
});
