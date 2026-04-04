import { fetchTopics } from "./_lib/backend.js";
import { withApi } from "./_lib/http.js";

export default withApi(async (req, res) => {
  const topics = await fetchTopics();
  res.status(200).json({ success: true, topics });
});
