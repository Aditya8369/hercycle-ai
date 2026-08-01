import { getAuthUserId } from './clerk-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { AsyncLocalStorage } from 'node:async_hooks';
import { NextResponse } from 'next/server';

const rateLimitStorage = new AsyncLocalStorage();

// Patch NextResponse.json to automatically append rate limit headers if present in context
if (NextResponse.json) {
  const originalJson = NextResponse.json;
  NextResponse.json = function (body, init) {
    const response = originalJson.call(this, body, init);
    const headersData = rateLimitStorage.getStore();
    if (headersData) {
      for (const [key, value] of Object.entries(headersData)) {
        response.headers.set(key, String(value));
      }
    }
    return response;
  };
}

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

      let count = 1;
      let resetAt = null;
      let allowed = true;
      let dbError = false;

      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.rpc('enforce_rate_limit', {
          p_identifier: targetId,
          p_limit: limit,
          p_interval: interval
        });

        if (error) {
          console.error('Rate Limiter DB Error:', error.message || error);
          dbError = true;
        } else if (data) {
          allowed = data.allowed;
          count = data.count || 1;
          resetAt = data.reset_at;
        }
      } catch (err) {
        console.error('Rate Limiter unexpected error:', err.message || err);
        dbError = true;
      }

      // Compute headers
      const remaining = dbError ? limit : Math.max(0, limit - count);
      const reset = resetAt 
        ? Math.ceil(new Date(resetAt).getTime() / 1000)
        : Math.ceil((Date.now() + interval) / 1000);

      const rateLimitHeaders = {
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': String(remaining),
        'X-RateLimit-Reset': String(reset)
      };

      // Transition context
      rateLimitStorage.enterWith(rateLimitHeaders);

      if (!allowed) {
        throw new Error('Rate limit exceeded');
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

