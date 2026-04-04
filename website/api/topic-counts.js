import { fetchTopicCounts } from "./_lib/backend.js";
import { withApi } from "./_lib/http.js";

export default withApi(async (req, res) => {
  const counts = await fetchTopicCounts();
  res.status(200).json({ success: true, counts });
});
