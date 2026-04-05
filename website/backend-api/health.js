import { withApi } from "./_lib/http.js";

export default withApi(async (req, res) => {
  res.status(200).json({ success: true, status: "ok" });
});
