import { fetchActivitySummary } from "./_lib/backend.js";
import { withApi } from "./_lib/http.js";

export default withApi(async (req, res) => {
  const summary = await fetchActivitySummary();
  res.status(200).json({ success: true, ...summary });
});
