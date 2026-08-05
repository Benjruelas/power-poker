/** In-memory fixed-window rate limiter for anonymous tile/parcel endpoints. */

type Entry = { count: number; reset: number };

const memory = new Map<string, Entry>();

export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

export function rateLimit(opts: {
  key: string;
  limit: number;
  windowSec: number;
}): { allowed: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  const windowMs = opts.windowSec * 1000;
  const bucketKey = `ratelimit:${opts.key}`;
  const entry = memory.get(bucketKey);
  if (!entry || entry.reset <= now) {
    memory.set(bucketKey, { count: 1, reset: now + windowMs });
    return { allowed: true, remaining: opts.limit - 1, retryAfter: 0 };
  }
  entry.count += 1;
  const allowed = entry.count <= opts.limit;
  return {
    allowed,
    remaining: Math.max(0, opts.limit - entry.count),
    retryAfter: allowed ? 0 : Math.ceil((entry.reset - now) / 1000),
  };
}

/** Returns a 429 Response if limited, otherwise null. */
export function enforceIpRateLimit(
  request: Request,
  name: string,
  limit: number,
  windowSec: number
): Response | null {
  const ip = clientIp(request);
  const rl = rateLimit({ key: `ip:${name}:${ip}`, limit, windowSec });
  if (!rl.allowed) {
    return Response.json(
      { error: "Rate limit exceeded. Please slow down.", retryAfter: rl.retryAfter },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfter) },
      }
    );
  }
  return null;
}
