const ALLOW_ORIGIN = process.env.WEB_API_ALLOW_ORIGIN || "*";

export function applyCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

export function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  res.status(405).json({
    success: false,
    error: `Method not allowed. Use: ${allowed.join(", ")}`,
  });
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) return {};

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

export function sendError(res, err, status = 500) {
  const message = err instanceof Error ? err.message : "Unknown server error";
  res.status(status).json({ success: false, error: message });
}

export function withApi(handler, options = {}) {
  const { methods = ["GET"] } = options;

  return async function wrapped(req, res) {
    if (applyCors(req, res)) return;

    if (methods.length && !methods.includes(req.method)) {
      methodNotAllowed(res, methods);
      return;
    }

    try {
      await handler(req, res);
    } catch (err) {
      console.error("[api] unhandled error:", err);
      sendError(res, err, 500);
    }
  };
}
