import { getAuthUserId } from './clerk-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

function createLimiter({ interval, maxRequests }) {
  return {
    async check(customLimitOrRequest, identifier) {
      let limit = maxRequests;
      let targetId = 'unknown';

      if (typeof customLimitOrRequest === 'number') {
        // Modern usage: check(limit, identifier)
        limit = customLimitOrRequest;
        targetId = identifier || 'unknown';
      } else if (customLimitOrRequest && typeof customLimitOrRequest.headers === 'object') {
        // Legacy/standard usage: check(request)
        targetId = await getRateLimitIdentifier(customLimitOrRequest);
      } else if (typeof customLimitOrRequest === 'string') {
        targetId = customLimitOrRequest;
      }

      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.rpc('enforce_rate_limit', {
          p_identifier: targetId,
          p_limit: limit,
          p_interval: interval
        });

        if (error) {
          console.error('Rate Limiter DB Error:', error.message || error);
          // Fail-open on DB errors to prevent site-wide outage if the rate table locks
          return;
        }

        if (data && !data.allowed) {
          throw new Error('Rate limit exceeded');
        }
      } catch (err) {
        if (err.message === 'Rate limit exceeded') {
          throw err;
        }
        console.error('Rate Limiter unexpected error:', err.message || err);
      }
    }
  };
}

export const aiLimiter = createLimiter({ interval: 60 * 1000, maxRequests: 5 });
export const crudLimiter = createLimiter({ interval: 60 * 1000, maxRequests: 30 });
export const devLimiter = createLimiter({ interval: 60 * 1000, maxRequests: 10 });

/**
 * Robust client IP extraction across proxy stacks.
 *
 * Order of preference matches how reverse proxies forward the real client:
 *  1. `x-forwarded-for` — standard chain; the left-most entry is the client.
 *  2. `x-real-ip`      — nginx/Vercel commonly set this directly.
 *  3. `cf-connecting-ip` — Cloudflare's direct client header.
 *
 * Returns `null` when no usable address is present so callers can decide how
 * to handle the unidentifiable case (see getRateLimitIdentifier).
 *
 * @param {Request} request
 * @returns {string|null}
 */
export function extractClientIp(request) {
  if (!request?.headers) return null;

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first && first !== 'unknown') return first;
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim() && realIp.trim() !== 'unknown') return realIp.trim();

  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim()) return cfIp.trim();

  return null;
}

export async function getRateLimitIdentifier(request) {
  try {
    const userId = await getAuthUserId();
    if (userId) return `user:${userId}`;
  } catch (error) {
    console.warn('Failed to get user ID for rate limiting:', error.message);
  }

  const ip = extractClientIp(request);
  // No usable identifier at all — issue a unique ephemeral bucket instead of
  // sharing one global `ip:unknown` bucket, which would let every anonymous
  // client bypass the limit by funneling through the same identifier.
  if (!ip) return `anon:${Math.random().toString(36).slice(2, 12)}`;

  return `ip:${ip}`;
}

