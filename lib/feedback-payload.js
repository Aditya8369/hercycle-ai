/**
 * feedback-payload.js — builds the Discord payload for `POST /api/feedback`.
 *
 * ## Why this module exists
 *
 * The feedback route used to interpolate user text straight into a Discord
 * webhook body:
 *
 *     content: `**New ${type} Report from ${userEmail}**\n> ${message}`
 *
 * Discord parses `@everyone`, `@here` and `<@&roleId>` inside `content`, so a
 * one-word message pinged an entire server. Newlines were not handled either,
 * so a message could close the quote block and open a second, fabricated
 * report attributed to somebody else. And `content` is capped at 2000
 * characters, so a long piece of genuine feedback came back to the user as a
 * 500 rather than as a usable message.
 *
 * All three are properties of the *payload*, not of the transport, so they are
 * settled here rather than in the route:
 *
 *  - the user's text goes in an embed **description**, never in `content`;
 *  - `allowed_mentions: { parse: [] }` is sent regardless, so even a mention
 *    that slipped through the text rewrite cannot notify anyone;
 *  - mention syntax is rewritten to an inert bracketed form so it is still
 *    legible to whoever reads the report;
 *  - the message is capped well inside Discord's limits before it is sent.
 *
 * The module has no imports, so the same code path is exercised by the route
 * and by `scripts/test-feedback-payload.js`.
 */

/**
 * Categories the Help & Support form offers. The route rejects anything else
 * rather than interpolating an arbitrary string into a bolded header.
 */
export const FEEDBACK_TYPES = Object.freeze({
  bug: { label: 'Bug Report', colour: 0xe25555 },
  feature: { label: 'Feature Request', colour: 0x7a5cff },
  general: { label: 'General Feedback', colour: 0xf06fa5 },
})

/** Accepted values for the `type` field. */
export const FEEDBACK_TYPE_KEYS = Object.freeze(Object.keys(FEEDBACK_TYPES))

/** Category used when the caller does not name one. */
export const DEFAULT_FEEDBACK_TYPE = 'general'

/**
 * Longest message accepted. Deliberately well under Discord's 4096-character
 * embed description limit so the surrounding formatting can never push the
 * payload over, and generous enough for a real bug report.
 */
export const MAX_MESSAGE_LENGTH = 1500

/** Appended when a message is cut short, so the reader knows it was. */
export const TRUNCATION_MARKER = ' [truncated]'

/** How long to wait on the webhook before giving up, in milliseconds. */
export const WEBHOOK_TIMEOUT_MS = 6000

/** Control characters and DEL, built from escapes to keep this file ASCII. */
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]', 'g')

/** `@everyone` / `@here`, in any casing. */
const BROADCAST_MENTION = /@(everyone|here)/gi

/** `<@123>`, `<@!123>`, `<@&123>` and `<#123>` -- user, role and channel pings. */
const ID_MENTION = /<(@[!&]?|#)(\d+)>/g

/** Three or more consecutive newlines, which waste vertical space in Discord. */
const EXCESS_NEWLINES = /\n{3,}/g

/**
 * Rewrites Discord mention syntax into an inert, readable form.
 *
 * The text is *rewritten* rather than stripped so a maintainer reading the
 * report can still see what the user typed. `allowed_mentions` in
 * {@link buildDiscordPayload} is the actual guarantee; this is the half that
 * keeps the report honest.
 *
 * @param {string} value
 * @returns {string}
 */
export function neutraliseMentions(value) {
  if (typeof value !== 'string') return ''

  return value
    .replace(BROADCAST_MENTION, (_match, word) => `[at]${word}`)
    .replace(ID_MENTION, (_match, prefix, id) => {
      if (prefix === '#') return `[channel:${id}]`
      if (prefix === '@&') return `[role:${id}]`
      return `[user:${id}]`
    })
}

/**
 * Normalises a submitted message: control characters removed, runs of blank
 * lines collapsed, mentions neutralised, length capped.
 *
 * Newlines and tabs survive -- a pasted stack trace is exactly the kind of
 * feedback worth keeping readable.
 *
 * @param {unknown} value
 * @param {number} [maxLength]
 * @returns {{ text: string, truncated: boolean }}
 */
export function sanitizeFeedbackMessage(value, maxLength = MAX_MESSAGE_LENGTH) {
  if (typeof value !== 'string') return { text: '', truncated: false }

  const cleaned = neutraliseMentions(
    value.replace(CONTROL_CHARS, '').replace(/\r\n?/g, '\n')
  )
    .replace(EXCESS_NEWLINES, '\n\n')
    .trim()

  if (cleaned.length <= maxLength) {
    return { text: cleaned, truncated: false }
  }

  return {
    text: cleaned.slice(0, maxLength - TRUNCATION_MARKER.length) + TRUNCATION_MARKER,
    truncated: true,
  }
}

/**
 * Renders the reporter for display. An address is shown as-is (the maintainers
 * need to be able to reply) but is stripped of mention syntax and backticks so
 * it cannot break out of the inline-code span it is rendered in.
 *
 * @param {unknown} email
 * @returns {string}
 */
export function formatReporter(email) {
  if (typeof email !== 'string' || !email.trim()) return 'Unknown user'

  return neutraliseMentions(email.replace(CONTROL_CHARS, '').replace(/`/g, "'"))
    .trim()
    .slice(0, 120)
}

/**
 * True when `value` names a category the form actually offers.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isFeedbackType(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(FEEDBACK_TYPES, value)
}

/**
 * Builds the webhook body.
 *
 * `content` is left empty on purpose. Everything the user typed goes into the
 * embed description, which Discord does not scan for mentions, and
 * `allowed_mentions: { parse: [] }` denies every mention class outright so the
 * payload cannot notify anyone even if a future edit reintroduces user text at
 * the top level.
 *
 * @param {{ type: string, message: string, reporter: string, submittedAt?: string }} input
 * @returns {{ payload: object, truncated: boolean }}
 */
export function buildDiscordPayload({ type, message, reporter, submittedAt } = {}) {
  const key = isFeedbackType(type) ? type : DEFAULT_FEEDBACK_TYPE
  const category = FEEDBACK_TYPES[key]
  const { text, truncated } = sanitizeFeedbackMessage(message)

  const payload = {
    content: '',
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `New ${category.label}`,
        description: text || '(no message)',
        color: category.colour,
        timestamp: submittedAt || new Date().toISOString(),
        fields: [
          { name: 'Reported by', value: `\`${formatReporter(reporter)}\``, inline: true },
          { name: 'Category', value: category.label, inline: true },
        ],
        footer: { text: 'HerCycle AI - Help & Support' },
      },
    ],
  }

  if (truncated) {
    payload.embeds[0].fields.push({
      name: 'Note',
      value: `Message exceeded ${MAX_MESSAGE_LENGTH} characters and was truncated.`,
      inline: false,
    })
  }

  return { payload, truncated }
}

/**
 * Maps a webhook outcome onto the status this API should return.
 *
 * The old route threw on any non-2xx, so a Discord 429 or 5xx surfaced as a
 * **500 Internal Server Error** -- blaming this service for an upstream
 * problem, and telling the user nothing about whether retrying would help.
 *
 * @param {number|null} status HTTP status from Discord, or null if the request never completed
 * @returns {{ status: number, error: string, retryable: boolean }}
 */
export function describeWebhookFailure(status) {
  if (status === 504 || status === 'timeout') {
    return {
      status: 504,
      error: 'Feedback delivery timed out. Please try again shortly.',
      retryable: true,
    }
  }

  if (status === 429) {
    return {
      status: 503,
      error: 'Feedback is being sent faster than we can deliver it. Please try again in a minute.',
      retryable: true,
    }
  }

  if (status !== null && status >= 400 && status < 500) {
    return {
      status: 502,
      error: 'We could not deliver your feedback. Please try again later.',
      retryable: false,
    }
  }

  return {
    status: 502,
    error: 'Our feedback service is temporarily unavailable. Please try again shortly.',
    retryable: true,
  }
}
