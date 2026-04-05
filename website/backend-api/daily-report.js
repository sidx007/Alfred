import { fetchDailyReports } from "./_lib/backend.js";
import { withApi } from "./_lib/http.js";

export default withApi(async (req, res) => {
  const reports = await fetchDailyReports();
  res.status(200).json({ success: true, reports });
});
