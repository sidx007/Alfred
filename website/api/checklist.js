import { fetchChecklistItems } from "./_lib/backend.js";
import { withApi } from "./_lib/http.js";

export default withApi(async (req, res) => {
  const items = await fetchChecklistItems();
  res.status(200).json({ success: true, items });
});
