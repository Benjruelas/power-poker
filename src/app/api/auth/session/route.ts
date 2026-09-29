export const runtime = "nodejs";

/**
 * Session probe for SessionGuard. The middleware 401s this route when the
 * auth cookie is missing or from an older SESSION_VERSION; reaching the
 * handler means the session is valid.
 */
export function GET() {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
