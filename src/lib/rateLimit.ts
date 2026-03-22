type RateLimitOptions = {
  intervalMs: number;
  limit: number;
};

type RateLimitEntry = {
  timestamps: number[];
};

const store = new Map<string, RateLimitEntry>();
const MAX_STORE_SIZE = 10_000;

export function rateLimit(key: string, options: RateLimitOptions): {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
} {
  const now = Date.now();
  const windowStart = now - options.intervalMs;

  // Evict all expired entries when the store grows large (e.g. under a probe attack)
  if (store.size > MAX_STORE_SIZE) {
    for (const [k, v] of store) {
      if (!v.timestamps.some((ts) => ts > windowStart)) store.delete(k);
    }
  }

  const entry = store.get(key) ?? { timestamps: [] };

  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);
  entry.timestamps.push(now);
  store.set(key, entry);

  const remaining = Math.max(0, options.limit - entry.timestamps.length);
  const ok = entry.timestamps.length <= options.limit;
  const oldest = entry.timestamps[0] ?? now;
  const retryAfterMs = Math.max(0, options.intervalMs - (now - oldest));

  return { ok, remaining, retryAfterMs };
}
