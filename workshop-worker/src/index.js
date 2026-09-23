import Anthropic from "@anthropic-ai/sdk";

// Model used for every call this Worker makes. claude-opus-5 gives the best
// quality for the interview/critical-challenge steps, but it is also the
// most expensive model. If workshop volume grows and cost becomes a
// concern, "claude-sonnet-5" is a solid, much cheaper alternative for this
// kind of structured, moderate-length text work.
const MODEL = "claude-opus-5";
const MAX_TOKENS_CAP = 8000;

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Workshop-Key",
    "Vary": "Origin",
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/api/chat" || request.method !== "POST") {
      return json({ error: "not_found" }, 404, headers);
    }

    // Shared access code, given out verbally/on-screen at the start of a
    // live workshop. Not real authentication, just a cheap gate so the
    // Anthropic API key behind this Worker can't be drained by a stranger
    // who stumbles on the tool's URL outside a live session.
    const key = request.headers.get("X-Workshop-Key") || "";
    if (!env.WORKSHOP_ACCESS_KEY || key !== env.WORKSHOP_ACCESS_KEY) {
      return json({ error: "invalid_key" }, 401, headers);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400, headers);
    }

    const { system, messages, webSearch, maxTokens } = body || {};
    if (!system || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: "missing_fields" }, 400, headers);
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    const tools = webSearch
      ? [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: 4,
          },
        ]
      : undefined;

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: Math.min(maxTokens || 4096, MAX_TOKENS_CAP),
        system,
        messages,
        ...(tools ? { tools } : {}),
      });

      let text = "";
      const sources = [];
      for (const block of response.content) {
        if (block.type === "text") {
          text += block.text;
        } else if (block.type === "web_search_tool_result") {
          const results = Array.isArray(block.content) ? block.content : [];
          for (const r of results) {
            if (r.url) sources.push({ title: r.title || r.url, url: r.url });
          }
        }
      }

      return json({ text, sources }, 200, headers);
    } catch (err) {
      const status = err && err.status ? err.status : 500;
      return json(
        { error: "anthropic_api_error", message: err && err.message ? err.message : String(err) },
        status,
        headers
      );
    }
  },
};
