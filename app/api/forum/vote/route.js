import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUserId } from '@/lib/clerk-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { crudLimiter } from '@/lib/rateLimiter';
import { logger } from '@/lib/logger';
import {
  describeVoteAction,
  describeVoteError,
  normaliseVoteResult,
  statusForAction,
} from '@/lib/vote-result';
import crypto from 'crypto';

/**
 * Votes are cheap to issue and expensive to trust, so they get a tighter
 * bucket than the general CRUD limit. Enough for a reader working down a busy
 * thread, nowhere near enough to move a post's rank on demand.
 */
const VOTE_LIMIT = 40;

const voteSchema = z.object({
  itemType: z.enum(['post', 'comment']),
  // Unvalidated, this reached a `uuid` RPC parameter directly, so a non-UUID
  // string made Postgres raise 22P02 and the route reported the caller's own
  // bad input as a 500.
  itemId: z.string().uuid('Invalid item id'),
  // `!voteValue` treated 0 as *missing* rather than as *invalid*, so a caller
  // that did send the field was told it had not.
  voteValue: z.union([z.literal(1), z.literal(-1)]),
});

export async function POST(req) {
  try {
    const userId = await getAuthUserId();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Bucketed per user rather than per IP: an authenticated account is the
    // unit that can actually brigade a post.
    try {
      await crudLimiter.check(VOTE_LIMIT, `vote:${userId}`);
    } catch (rateLimitError) {
      logger.warn(`[Rate Limit] Forum vote endpoint: ${rateLimitError.message}`);
      return NextResponse.json(
        { error: 'You are voting too quickly. Please slow down.' },
        { status: 429 }
      );
    }

    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      logger.warn(`Malformed JSON payload in forum vote: ${parseError.message}`);
      return NextResponse.json({ error: 'Bad Request: Invalid JSON payload' }, { status: 400 });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const parsed = voteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid vote payload' },
        { status: 400 }
      );
    }

    const { itemType, itemId, voteValue } = parsed.data;

    // Hash the user ID so we don't store raw clerk IDs directly, but we can uniquely identify them
    const hashedUserId = crypto.createHash('sha256').update(userId).digest('hex');

    const supabase = getSupabaseAdmin();

    // 1. Execute atomic vote operation via Postgres RPC
    const { data, error: rpcError } = await supabase.rpc('handle_vote', {
      p_user_id: hashedUserId,
      p_item_type: itemType,
      p_item_id: itemId,
      p_vote_value: voteValue,
    });

    if (rpcError) {
      const failure = describeVoteError(rpcError);

      // A caller's own bad input is not worth a stack trace on every request.
      if (failure.status >= 500) {
        logger.error(`Vote RPC error (${rpcError.code || 'no code'}): ${rpcError.message}`);
      } else {
        logger.warn(`Vote rejected (${rpcError.code || 'no code'}): ${rpcError.message}`);
      }

      return NextResponse.json(
        { error: failure.error, retryable: failure.retryable },
        { status: failure.status }
      );
    }

    // 2. Read the outcome defensively. A Supabase RPC returns `data: null`
    //    whenever the function yields NULL or is declared `void`, and the old
    //    code dereferenced it unconditionally -- turning a successful no-op
    //    into a TypeError and a 500.
    const result = normaliseVoteResult(data);

    return NextResponse.json(
      {
        message: describeVoteAction(result),
        action: result.action,
        currentVote: result.currentVote,
        // False when the database succeeded but said nothing about what it
        // did, so a client knows to refetch rather than trust its optimistic
        // update.
        resolved: result.resolved,
      },
      { status: statusForAction(result.action) }
    );
  } catch (error) {
    logger.error('Vote Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
