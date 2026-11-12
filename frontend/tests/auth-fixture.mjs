import http from "node:http";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "staff@example.org",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const events = [];
const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && origin !== "http://127.0.0.1:5175") {
    response.writeHead(403).end();
    return;
  }
  response.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:5175");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  );
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "OPTIONS") return response.writeHead(204).end();
  const url = new URL(request.url, "http://127.0.0.1:5182");
  const reply = (status, data) =>
    response.writeHead(status).end(JSON.stringify(data));
  if (url.pathname === "/_test/events") return reply(200, events);
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  if (url.pathname === "/auth/v1/recover") {
    events.push({
      kind: "recover",
      redirect: url.searchParams.get("redirect_to"),
    });
    return body.email === "limited@example.org"
      ? reply(429, { code: "over_email_send_rate_limit", msg: "Rate limited" })
      : reply(200, {});
  }
  const signature = request.headers.authorization?.split(".").at(-1);
  if (url.pathname === "/auth/v1/user") {
    if (signature !== "fictional-recovery")
      return reply(401, { code: "bad_jwt", msg: "Invalid token" });
    if (request.method === "PUT") {
      events.push({
        kind: "update",
        hasPassword: typeof body.password === "string",
      });
      if (body.password === "RejectedPassword123!")
        return reply(422, {
          code: "weak_password",
          msg: "Password rejected",
          weak_password: { reasons: ["pwned"] },
        });
    }
    return reply(200, user);
  }
  if (url.pathname === "/auth/v1/logout") {
    events.push({ kind: "logout", scope: url.searchParams.get("scope") });
    return reply(200, {});
  }
  return reply(404, { code: "not_found" });
});
server.listen(5182, "127.0.0.1", () => {
  console.log("Fictional Auth fixture listening on http://127.0.0.1:5182");
});
