import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { z } from 'zod';
import { getAuthUserId } from '@/lib/clerk-server';
import { crudLimiter } from '@/lib/rateLimiter';
import { logger } from '@/lib/logger';
import fetchWithTimeout, { TimeoutError } from '@/lib/fetch-with-timeout';
import {
  DEFAULT_FEEDBACK_TYPE,
  FEEDBACK_TYPE_KEYS,
  MAX_MESSAGE_LENGTH,
  WEBHOOK_TIMEOUT_MS,
  buildDiscordPayload,
  describeWebhookFailure,
} from '@/lib/feedback-payload';

const feedbackSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(MAX_MESSAGE_LENGTH, `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`),
  // An unconstrained string here was interpolated straight into the bolded
  // report header, so it could carry markdown of its own.
  type: z.enum(FEEDBACK_TYPE_KEYS).optional().default(DEFAULT_FEEDBACK_TYPE),
});

/**
 * Accepts a support message and relays it to the maintainers' Discord webhook.
 *
 * The relay is the reason this route needs more care than its size suggests:
 * everything it accepts is republished, unattended, into a channel real people
 * read. It previously did so with no auth gate (an unauthenticated caller was
 * relayed as the literal string "Unknown User"), no rate limit, no length cap,
 * no timeout and no mention suppression, which made it the cheapest way to
 * disrupt the project's Discord server.
 */
export async function POST(req) {
  try {
    await crudLimiter.check(req);
  } catch (rateLimitError) {
    logger.warn(`[Rate Limit] Feedback endpoint: ${rateLimitError.message}`);
    return NextResponse.json(
      { success: false, error: 'Too many feedback submissions, please slow down.' },
      { status: 429 }
    );
  }

  try {
    // The old route treated a missing session as a reporter named
    // "Unknown User" and posted anyway.
    const userId = await getAuthUserId();
    if (!userId) {
      logger.warn('Unauthenticated access attempt to Feedback API');
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Bad Request: Invalid JSON payload' },
        { status: 400 }
      );
    }

    const parseResult = feedbackSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: parseResult.error.issues[0]?.message || 'Invalid feedback payload' },
        { status: 400 }
      );
    }

    const { message, type } = parseResult.data;

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      logger.error('DISCORD_WEBHOOK_URL is not configured.');
      return NextResponse.json(
        { success: false, error: 'Feedback is not configured on this deployment' },
        { status: 503 }
      );
    }

    const { payload, truncated } = buildDiscordPayload({
      type,
      message,
      reporter: await resolveReporterEmail(),
    });

    let res;
    try {
      res = await fetchWithTimeout(
        webhookUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        WEBHOOK_TIMEOUT_MS
      );
    } catch (networkError) {
      // A plain fetch() here held the function open for as long as Discord
      // chose to stall.
      const reason = networkError instanceof TimeoutError ? 'timed out' : networkError.message;
      logger.error(`Feedback webhook request failed (${reason})`);
      const failure = describeWebhookFailure(null);
      return NextResponse.json({ success: false, error: failure.error }, { status: failure.status });
    }

    if (!res.ok) {
      logger.error(`Feedback webhook rejected the payload with status ${res.status}`);
      const failure = describeWebhookFailure(res.status);
      return NextResponse.json({ success: false, error: failure.error }, { status: failure.status });
    }

    logger.info(`Feedback (${type}) relayed for user ${userId}`);
    return NextResponse.json({ success: true, truncated }, { status: 200 });
  } catch (error) {
    logger.error('Feedback API error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * Best-effort reporter address for the report header. Resolved separately from
 * the auth check so a Clerk hiccup degrades the label rather than rejecting a
 * request from a user who is demonstrably signed in.
 *
 * @returns {Promise<string>}
 */
async function resolveReporterEmail() {
  try {
    const user = await currentUser();
    return user?.emailAddresses?.[0]?.emailAddress || '';
  } catch (err) {
    logger.warn(`Could not resolve reporter identity for feedback: ${err.message || err}`);
    return '';
  }
}
