/**
 * event-schedule.js — the calendar's arithmetic, in one place and without a
 * clock of its own.
 *
 * ## Why this module exists
 *
 * `components/calendar/MultiLangCalendar.jsx` offers a timezone picker and then
 * ignores it on the way in. The modal wrote the chosen time against the
 * *browser's* clock:
 *
 *     const combinedDate = new Date(selectedDate)
 *     combinedDate.setHours(hours || 9, minutes || 0, 0, 0)
 *
 * …and the card read it back against the *selected* one:
 *
 *     new Intl.DateTimeFormat(locale, { timeZone: selectedTimeZone, ... }).format(d)
 *
 * so a user in IST who picks Tokyo and types `09:00` is shown `12:30 PM`. The
 * `time_zone` column was written on every insert and read by nothing.
 *
 * Recurrence had the matching problem in the other direction:
 *
 *     if (evt.recurrence_rule === 'monthly' && date >= evtDate && date.getDate() === evtDate.getDate())
 *
 * A monthly reminder anchored on the 31st does not occur in February, April,
 * June, September or November — it simply vanishes for those months rather than
 * landing on the last day, which is what "every month" means to the person who
 * set it. A 29 February anniversary appeared once every four years. And
 * `date >= evtDate` compares a midnight-local cell against the event's real
 * instant, so the anchor day itself failed the test for any event later than
 * midnight; only the `isSameDay` branch above it hid that.
 *
 * ## The approach
 *
 * Every decision here is made on **calendar fields resolved in one chosen time
 * zone**, never on raw millisecond comparisons:
 *
 *   1. {@link zonedFields} converts an instant into `{year, month, day, hour,
 *      minute, weekday}` as that zone sees it, via `Intl.DateTimeFormat`.
 *   2. {@link describeAnchor} does that **once per event**, producing a small
 *      integer record.
 *   3. {@link occursOn} compares two integer records. It is O(1), so a 42-cell
 *      month costs one `Intl` pass per event rather than 43 passes over the
 *      whole list — which is what the old `getEventsForDate` cost on every
 *      keystroke in the modal, because the form state lives in the same
 *      component.
 *   4. {@link wallClockToInstant} goes the other way, so the time the user types
 *      in the selected zone is the instant that gets stored.
 *
 * The module is pure: no fetch, no React, no Supabase, no `Date.now()` except
 * where a caller passes it in. It runs unchanged in a Route Handler, a Client
 * Component and `node scripts/test-event-schedule.js`.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Categories the calendar renders a colour and a badge for. */
export const EVENT_CATEGORIES = Object.freeze(['reminder', 'habit', 'donation', 'health'])

/** Recurrence rules the calendar knows how to expand. */
export const RECURRENCE_RULES = Object.freeze(['none', 'daily', 'weekly', 'monthly', 'yearly'])

/** Default category, used when the caller omits the field entirely. */
export const DEFAULT_CATEGORY = 'reminder'

/** Default recurrence, used when the caller omits the field entirely. */
export const DEFAULT_RECURRENCE = 'none'

/** Fallback zone. Matches the column default in `supabase/08_events.sql`. */
export const DEFAULT_TIME_ZONE = 'UTC'

/** `events.title` is `TEXT`; this is the product limit, enforced before the write. */
export const MAX_TITLE_LENGTH = 120

/** `events.description` is `TEXT`; same reasoning. */
export const MAX_DESCRIPTION_LENGTH = 1000

/**
 * Ceiling on a single `GET /api/events` response.
 *
 * The route had no `.limit()` at all, so an account that had been adding daily
 * reminders for two years shipped its whole history to the browser on every
 * page load to render one month.
 */
export const MAX_EVENTS_RETURNED = 500

/**
 * Longest an event may last.
 *
 * Guards against a mistyped year in `end_time` producing a "6-hour reminder"
 * that the UI would have to describe as lasting until 2099.
 */
export const MAX_DURATION_MS = 365 * 24 * 60 * 60 * 1000

/** Matches a canonical RFC 4122 UUID, which is what `events.id` is. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Matches an ISO 8601 instant.
 *
 * Deliberately stricter than `new Date(...)`, which accepts `"Jan 5 2026"`,
 * `"2026"` and a pile of implementation-defined shapes that would each be
 * interpreted differently by the browser writing them and the Postgres column
 * receiving them.
 */
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?$/

/** Matches the `HH:mm` a `<input type="time">` produces. */
const WALL_TIME_RE = /^(\d{1,2}):(\d{2})$/

/** Matches a `YYYY-MM-DD` calendar day. */
const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

// ---------------------------------------------------------------------------
// Time zones
// ---------------------------------------------------------------------------

/**
 * `Intl.DateTimeFormat` construction is not free and the calendar asks the same
 * question for every event in a month, so formatters are held per zone.
 */
const formatterCache = new Map()

/**
 * True when the runtime recognises `zone` as an IANA time zone.
 *
 * The route stored whatever string arrived, so `'Mars/Olympus'` reached the
 * column and then threw `RangeError: Invalid time zone specified` inside the
 * component that tried to render it.
 *
 * @param {unknown} zone
 * @returns {boolean}
 */
export function isValidTimeZone(zone) {
  if (typeof zone !== 'string' || zone.trim() === '') return false
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat('en-CA', { timeZone: zone.trim() })
    return true
  } catch {
    return false
  }
}

/**
 * `zone` if the runtime accepts it, otherwise `fallback`, otherwise UTC.
 *
 * @param {unknown} zone
 * @param {string} [fallback]
 * @returns {string}
 */
export function resolveTimeZone(zone, fallback = DEFAULT_TIME_ZONE) {
  if (isValidTimeZone(zone)) return zone.trim()
  if (isValidTimeZone(fallback)) return fallback
  return DEFAULT_TIME_ZONE
}

/**
 * @param {string} timeZone an already-validated zone
 * @returns {Intl.DateTimeFormat}
 */
function partsFormatter(timeZone) {
  let formatter = formatterCache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatterCache.set(timeZone, formatter)
  }
  return formatter
}

// ---------------------------------------------------------------------------
// Instants and calendar fields
// ---------------------------------------------------------------------------

/**
 * Parses an ISO 8601 instant into epoch milliseconds.
 *
 * @param {unknown} value
 * @returns {number|null} `null` when the value is not an instant this app writes
 */
export function parseInstant(value) {
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms : null
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!ISO_INSTANT_RE.test(trimmed)) return null
  const ms = Date.parse(trimmed)
  return Number.isFinite(ms) ? ms : null
}

/**
 * The calendar fields an instant has *in a given zone*.
 *
 * `weekday` is 0-6 with Sunday at 0, matching `Date.prototype.getDay` so the
 * grid and this module can be compared directly.
 *
 * @param {number} instantMs
 * @param {string} timeZone
 * @returns {{year: number, month: number, day: number, hour: number, minute: number, second: number, weekday: number}|null}
 */
export function zonedFields(instantMs, timeZone) {
  if (!Number.isFinite(instantMs)) return null
  const zone = resolveTimeZone(timeZone)

  const parts = partsFormatter(zone).formatToParts(new Date(instantMs))
  const field = {}
  for (const part of parts) {
    if (part.type !== 'literal') field[part.type] = Number(part.value)
  }

  if (!Number.isFinite(field.year) || !Number.isFinite(field.month) || !Number.isFinite(field.day)) {
    return null
  }

  return {
    year: field.year,
    month: field.month,
    day: field.day,
    hour: Number.isFinite(field.hour) ? field.hour % 24 : 0,
    minute: Number.isFinite(field.minute) ? field.minute : 0,
    second: Number.isFinite(field.second) ? field.second : 0,
    weekday: weekdayOf(field.year, field.month, field.day),
  }
}

/**
 * Day of the week for a proleptic Gregorian date, Sunday = 0.
 *
 * Computed from the calendar fields rather than read back out of `Intl`,
 * because the weekday of a `(year, month, day)` triple is a property of the
 * calendar and does not need a second formatter pass.
 *
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} day 1-31
 * @returns {number} 0-6
 */
export function weekdayOf(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/**
 * Days in a month, leap years included.
 *
 * @param {number} year
 * @param {number} month 1-12
 * @returns {number}
 */
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * `YYYY-MM-DD` for a calendar-field record.
 *
 * @param {{year: number, month: number, day: number}} fields
 * @returns {string}
 */
export function dayKeyOf(fields) {
  const mm = String(fields.month).padStart(2, '0')
  const dd = String(fields.day).padStart(2, '0')
  return `${fields.year}-${mm}-${dd}`
}

/**
 * The reverse: `YYYY-MM-DD` into calendar fields, with a weekday attached.
 *
 * @param {string} dayKey
 * @returns {{year: number, month: number, day: number, weekday: number}|null}
 */
export function parseDayKey(dayKey) {
  if (typeof dayKey !== 'string') return null
  const match = DAY_KEY_RE.exec(dayKey.trim())
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null

  return { year, month, day, weekday: weekdayOf(year, month, day) }
}

/**
 * Orders two calendar-field records. Negative when `a` is earlier.
 *
 * @param {{year: number, month: number, day: number}} a
 * @param {{year: number, month: number, day: number}} b
 * @returns {number}
 */
export function compareDays(a, b) {
  if (a.year !== b.year) return a.year - b.year
  if (a.month !== b.month) return a.month - b.month
  return a.day - b.day
}

/**
 * The zone's UTC offset at an instant, in milliseconds.
 *
 * @param {number} instantMs
 * @param {string} timeZone
 * @returns {number}
 */
function offsetAt(instantMs, timeZone) {
  const fields = zonedFields(instantMs, timeZone)
  if (!fields) return 0
  const asUtc = Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, fields.second)
  // `instantMs` may carry milliseconds the formatter dropped; round to the
  // second on both sides so the difference is a clean offset.
  return asUtc - Math.floor(instantMs / 1000) * 1000
}

/**
 * Turns a wall-clock reading in a zone into the instant it names.
 *
 * This is the half of the timezone fix the modal was missing. `setHours()`
 * resolves against the browser's zone, which is the one place the user did not
 * choose.
 *
 * The offset is applied twice because the offset itself depends on the instant:
 * the first pass lands within an hour of the answer, and the second resolves
 * that hour correctly across a DST boundary. On a spring-forward gap (a wall
 * time that does not exist) this settles on the instant immediately after the
 * jump, which is the conventional resolution and the one `Temporal`'s
 * `'compatible'` disambiguation also picks.
 *
 * @param {{year: number, month: number, day: number, hour?: number, minute?: number}} wall
 * @param {string} timeZone
 * @returns {number|null} epoch milliseconds
 */
export function wallClockToInstant(wall, timeZone) {
  if (!wall || !Number.isFinite(wall.year) || !Number.isFinite(wall.month) || !Number.isFinite(wall.day)) {
    return null
  }
  const zone = resolveTimeZone(timeZone)
  const hour = Number.isFinite(wall.hour) ? wall.hour : 0
  const minute = Number.isFinite(wall.minute) ? wall.minute : 0

  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, hour, minute, 0, 0)
  const firstPass = naive - offsetAt(naive, zone)
  const secondPass = naive - offsetAt(firstPass, zone)
  return Number.isFinite(secondPass) ? secondPass : null
}

/**
 * Parses the `HH:mm` from a `<input type="time">`.
 *
 * @param {unknown} value
 * @returns {{hour: number, minute: number}|null}
 */
export function parseWallTime(value) {
  if (typeof value !== 'string') return null
  const match = WALL_TIME_RE.exec(value.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

/**
 * Combines a calendar day and a `HH:mm` into an ISO instant, read in `timeZone`.
 *
 * @param {string} dayKey `YYYY-MM-DD`
 * @param {string} wallTime `HH:mm`
 * @param {string} timeZone
 * @returns {string|null} an ISO 8601 string, or `null` if either part is unusable
 */
export function composeStartTime(dayKey, wallTime, timeZone) {
  const day = parseDayKey(dayKey)
  const time = parseWallTime(wallTime)
  if (!day || !time) return null

  const instant = wallClockToInstant({ ...day, hour: time.hour, minute: time.minute }, timeZone)
  if (instant === null) return null
  return new Date(instant).toISOString()
}

// ---------------------------------------------------------------------------
// Recurrence
// ---------------------------------------------------------------------------

/**
 * The integer record {@link occursOn} compares against, computed once per event.
 *
 * @param {{start_time?: string, end_time?: string|null, recurrence_rule?: string, time_zone?: string}} event
 * @param {string} viewerTimeZone the zone the grid is being drawn in
 * @returns {{startMs: number, endMs: number|null, rule: string, year: number, month: number, day: number, weekday: number, hour: number, minute: number}|null}
 */
export function describeAnchor(event, viewerTimeZone) {
  if (!event) return null

  const startMs = parseInstant(event.start_time)
  if (startMs === null) return null

  const zone = resolveTimeZone(viewerTimeZone)
  const fields = zonedFields(startMs, zone)
  if (!fields) return null

  const endMs = parseInstant(event.end_time)
  const rule = RECURRENCE_RULES.includes(event.recurrence_rule) ? event.recurrence_rule : DEFAULT_RECURRENCE

  return {
    startMs,
    endMs: endMs !== null && endMs > startMs ? endMs : null,
    rule,
    year: fields.year,
    month: fields.month,
    day: fields.day,
    weekday: fields.weekday,
    hour: fields.hour,
    minute: fields.minute,
  }
}

/**
 * Whether an event lands on a calendar day.
 *
 * The rules, in the anchor's own calendar:
 *
 * - **`none`** — only the anchor day.
 * - **`daily`** — the anchor day and every day after it.
 * - **`weekly`** — the same weekday, on or after the anchor day.
 * - **`monthly`** — the same day-of-month, **clamped to the end of shorter
 *   months**. An event anchored on the 31st falls on 28 (or 29) February and on
 *   30 April. Clamping is always computed from the anchor's own day-of-month, so
 *   February does not drag the series down to the 28th permanently.
 * - **`yearly`** — the same month and day, with 29 February clamped to 28
 *   February in common years for the same reason.
 *
 * The comparison is by calendar day, not by instant. The previous
 * `date >= evtDate` compared a midnight-local `Date` against the event's real
 * time, so a 09:00 daily reminder was "not yet recurring" on its own start day.
 *
 * @param {ReturnType<typeof describeAnchor>} anchor
 * @param {{year: number, month: number, day: number, weekday: number}} cell
 * @returns {boolean}
 */
export function occursOn(anchor, cell) {
  if (!anchor || !cell) return false

  const order = compareDays(cell, anchor)
  if (order < 0) return false
  if (order === 0) return true
  if (anchor.rule === DEFAULT_RECURRENCE) return false

  switch (anchor.rule) {
    case 'daily':
      return true
    case 'weekly':
      return cell.weekday === anchor.weekday
    case 'monthly':
      return cell.day === clampDayToMonth(anchor.day, cell.year, cell.month)
    case 'yearly':
      return (
        cell.month === anchor.month &&
        cell.day === clampDayToMonth(anchor.day, cell.year, cell.month)
      )
    default:
      return false
  }
}

/**
 * The anchor's day-of-month, or the last day of the target month when the
 * target month is too short to contain it.
 *
 * @param {number} anchorDay 1-31
 * @param {number} year
 * @param {number} month 1-12
 * @returns {number}
 */
export function clampDayToMonth(anchorDay, year, month) {
  const last = daysInMonth(year, month)
  return anchorDay > last ? last : anchorDay
}

/**
 * Groups events by the day they occur on, in one pass.
 *
 * `getEventsForDate` was called once per grid cell and once for the side panel —
 * 43 full scans of the event list per render, each re-parsing every
 * `start_time`. Here each event is parsed once and each `(event, cell)` pair
 * costs an integer comparison.
 *
 * @param {object[]} events
 * @param {string[]} dayKeys the days being rendered, `YYYY-MM-DD`
 * @param {string} viewerTimeZone
 * @returns {Map<string, object[]>} keyed by day; days with no events are present and empty
 */
export function buildOccurrenceIndex(events, dayKeys, viewerTimeZone) {
  const zone = resolveTimeZone(viewerTimeZone)
  const index = new Map()

  const cells = []
  for (const key of dayKeys || []) {
    const cell = parseDayKey(key)
    if (!cell) continue
    index.set(key, [])
    cells.push({ key, cell })
  }

  for (const event of events || []) {
    const anchor = describeAnchor(event, zone)
    if (!anchor) continue
    for (const { key, cell } of cells) {
      if (occursOn(anchor, cell)) index.get(key).push(event)
    }
  }

  for (const list of index.values()) {
    list.sort((a, b) => (parseInstant(a.start_time) ?? 0) - (parseInstant(b.start_time) ?? 0))
  }

  return index
}

/**
 * The `YYYY-MM-DD` keys of every cell in a month grid, including the leading
 * blanks' worth of nothing — blanks are simply absent from the list.
 *
 * @param {number} year
 * @param {number} month 1-12
 * @returns {string[]}
 */
export function monthDayKeys(year, month) {
  const total = daysInMonth(year, month)
  const keys = []
  for (let day = 1; day <= total; day += 1) {
    keys.push(dayKeyOf({ year, month, day }))
  }
  return keys
}

// ---------------------------------------------------------------------------
// Write validation
// ---------------------------------------------------------------------------

/**
 * A rejection, shaped so a route can hand it straight to `jsonError`.
 *
 * @param {string} message
 * @param {string} field
 * @returns {{ok: false, error: {message: string, field: string, status: number}}}
 */
function reject(message, field) {
  return { ok: false, error: { message, field, status: 400 } }
}

/**
 * Trims and length-checks a free-text field.
 *
 * @param {unknown} value
 * @param {number} max
 * @returns {{ok: true, value: string}|{ok: false}}
 */
function readText(value, max) {
  if (typeof value !== 'string') return { ok: false }
  const trimmed = value.trim()
  if (trimmed.length > max) return { ok: false }
  return { ok: true, value: trimmed }
}

/**
 * True when `value` is a canonical UUID.
 *
 * `events.id` is `UUID`. Passing anything else made Postgres raise `22P02`,
 * which the route reported as `500 Failed to update event` — a server fault for
 * what is squarely a bad request.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim())
}

/**
 * Validates a create or update payload.
 *
 * Unknown enum values are **refused**, not silently rewritten. The route used
 * to fold an unrecognised `category` into `'reminder'`, so a client sending the
 * wrong constant got a stored event that quietly disagreed with what the user
 * chose, and nothing anywhere reported it.
 *
 * @param {object} body the parsed request body
 * @param {{partial?: boolean}} [options] `partial: true` for `PUT`, where every
 *   field except `id` is optional and absent keys must not be written
 * @returns {{ok: true, value: object}|{ok: false, error: {message: string, field: string, status: number}}}
 */
export function validateEventInput(body, options = {}) {
  const partial = options.partial === true
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return reject('A JSON object is required', 'body')
  }

  const value = {}

  if (!partial || body.title !== undefined) {
    const title = readText(body.title, MAX_TITLE_LENGTH)
    if (!title.ok) {
      return reject(`Event title is required and must be ${MAX_TITLE_LENGTH} characters or fewer`, 'title')
    }
    if (title.value === '') return reject('Event title is required', 'title')
    value.title = title.value
  }

  if (body.description !== undefined) {
    if (body.description === null) {
      value.description = ''
    } else {
      const description = readText(body.description, MAX_DESCRIPTION_LENGTH)
      if (!description.ok) {
        return reject(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`, 'description')
      }
      value.description = description.value
    }
  } else if (!partial) {
    value.description = ''
  }

  if (!partial || body.start_time !== undefined) {
    const startMs = parseInstant(body.start_time)
    if (startMs === null) return reject('A valid ISO 8601 start time is required', 'start_time')
    value.start_time = new Date(startMs).toISOString()
  }

  if (body.end_time !== undefined) {
    if (body.end_time === null || body.end_time === '') {
      value.end_time = null
    } else {
      const endMs = parseInstant(body.end_time)
      if (endMs === null) return reject('End time must be a valid ISO 8601 timestamp', 'end_time')
      value.end_time = new Date(endMs).toISOString()
    }
  } else if (!partial) {
    value.end_time = null
  }

  if (body.recurrence_rule !== undefined) {
    if (!RECURRENCE_RULES.includes(body.recurrence_rule)) {
      return reject(`Recurrence must be one of: ${RECURRENCE_RULES.join(', ')}`, 'recurrence_rule')
    }
    value.recurrence_rule = body.recurrence_rule
  } else if (!partial) {
    value.recurrence_rule = DEFAULT_RECURRENCE
  }

  if (body.category !== undefined) {
    if (!EVENT_CATEGORIES.includes(body.category)) {
      return reject(`Category must be one of: ${EVENT_CATEGORIES.join(', ')}`, 'category')
    }
    value.category = body.category
  } else if (!partial) {
    value.category = DEFAULT_CATEGORY
  }

  if (body.time_zone !== undefined) {
    if (!isValidTimeZone(body.time_zone)) {
      return reject('Time zone must be a valid IANA identifier, e.g. Asia/Kolkata', 'time_zone')
    }
    value.time_zone = body.time_zone.trim()
  } else if (!partial) {
    value.time_zone = DEFAULT_TIME_ZONE
  }

  const intervalError = checkInterval(value, body, partial)
  if (intervalError) return intervalError

  if (partial && Object.keys(value).length === 0) {
    // PostgREST rejects an empty patch, which the route surfaced as a 500. An
    // update that names nothing is a client mistake, and saying so is cheaper
    // than a round trip that cannot succeed.
    return reject('No updatable fields were provided', 'body')
  }

  return { ok: true, value }
}

/**
 * Checks `start_time`/`end_time` against each other.
 *
 * On a partial update only one of the two may be present in the payload, so the
 * caller may supply the other from the stored row via `body.__currentStartTime`
 * / `body.__currentEndTime`. When neither side can be resolved the check is
 * skipped rather than guessed at.
 *
 * @param {object} value the validated payload so far
 * @param {object} body the raw body, for the stored-row hints
 * @param {boolean} partial
 * @returns {{ok: false, error: object}|null}
 */
function checkInterval(value, body, partial) {
  const startMs =
    value.start_time !== undefined
      ? parseInstant(value.start_time)
      : partial
        ? parseInstant(body.__currentStartTime)
        : null

  const endMs =
    value.end_time !== undefined
      ? parseInstant(value.end_time)
      : partial
        ? parseInstant(body.__currentEndTime)
        : null

  if (startMs === null || endMs === null) return null

  if (endMs <= startMs) {
    return reject('End time must be after the start time', 'end_time')
  }
  if (endMs - startMs > MAX_DURATION_MS) {
    return reject('An event cannot last longer than a year', 'end_time')
  }
  return null
}

// ---------------------------------------------------------------------------
// Database errors
// ---------------------------------------------------------------------------

/**
 * Maps a Supabase/Postgres error onto something a caller can act on.
 *
 * Nothing from the driver reaches the client: `error.message` on this table
 * names the relation, the constraint and, on a connection fault, the pooler
 * host.
 *
 * @param {{code?: string}|null} error
 * @returns {{message: string, status: number, code: string}}
 */
export function describeEventError(error) {
  const code = error && typeof error.code === 'string' ? error.code : ''

  switch (code) {
    case 'PGRST116':
      // "JSON object requested, multiple (or no) rows returned" — with
      // `.eq('user_id', ...)` in the query this means the event is not this
      // user's, or is already gone.
      return { message: 'Event not found', status: 404, code: 'EVENT_NOT_FOUND' }
    case '22P02':
      return { message: 'Event ID is not a valid identifier', status: 400, code: 'INVALID_EVENT_ID' }
    case '22007':
    case '22008':
      return { message: 'Event times must be valid timestamps', status: 400, code: 'INVALID_TIMESTAMP' }
    case '22001':
      return { message: 'Event title or description is too long', status: 400, code: 'VALUE_TOO_LONG' }
    case '23503':
      return { message: 'This account is not set up yet, please reload and try again', status: 409, code: 'MISSING_USER' }
    case '23514':
      return { message: 'The calendar has not been migrated on this deployment yet', status: 503, code: 'SCHEMA_DRIFT' }
    case '42P01':
      return { message: 'The calendar is not available on this deployment yet', status: 503, code: 'MISSING_TABLE' }
    default:
      return { message: 'Could not save the calendar event', status: 500, code: 'EVENT_WRITE_FAILED' }
  }
}

/**
 * Reads the row count Supabase reports for a delete.
 *
 * `DELETE` answered `Event deleted successfully` whether or not a row matched,
 * so deleting an id that was already gone — or somebody else's — looked
 * identical to a real deletion and the calendar refetched into the same state
 * without explanation.
 *
 * @param {{count?: number|null}} result
 * @returns {{deleted: boolean, count: number}}
 */
export function readDeleteResult(result) {
  const count = Number(result?.count)
  const deleted = Number.isFinite(count) && count > 0
  return { deleted, count: Number.isFinite(count) ? count : 0 }
}
