/**
 * Regression suite for lib/event-schedule.js.
 *
 * The bugs this is part of fixing, in `components/calendar/MultiLangCalendar.jsx`
 * and `app/api/events/route.js`:
 *
 *  1. The timezone picker was decorative. The modal wrote the chosen time with
 *     `setHours()` (the browser's zone) and the card read it back with
 *     `Intl.DateTimeFormat({ timeZone: selectedTimeZone })`, so picking Tokyo
 *     in IST and typing 09:00 produced a card reading 12:30 PM.
 *
 *  2. Monthly and yearly recurrences vanished in short months:
 *
 *         if (evt.recurrence_rule === 'monthly' && date >= evtDate &&
 *             date.getDate() === evtDate.getDate()) return true
 *
 *     A reminder anchored on the 31st does not exist in February, April, June,
 *     September or November.
 *
 *  3. The API accepted `end_time` before `start_time`, silently rewrote an
 *     unknown `category` to `reminder`, stored any string as a `time_zone`, and
 *     reported `500` for a non-UUID id and `Event deleted successfully` for a
 *     delete that matched no row.
 *
 *   node scripts/test-event-schedule.js
 */

import {
  DEFAULT_TIME_ZONE,
  EVENT_CATEGORIES,
  MAX_DESCRIPTION_LENGTH,
  MAX_EVENTS_RETURNED,
  MAX_TITLE_LENGTH,
  RECURRENCE_RULES,
  buildOccurrenceIndex,
  clampDayToMonth,
  compareDays,
  composeStartTime,
  dayKeyOf,
  daysInMonth,
  describeAnchor,
  describeEventError,
  isUuid,
  isValidTimeZone,
  monthDayKeys,
  occursOn,
  parseDayKey,
  parseInstant,
  parseWallTime,
  readDeleteResult,
  resolveTimeZone,
  validateEventInput,
  wallClockToInstant,
  weekdayOf,
  zonedFields,
} from '../lib/event-schedule.js'

let passed = 0
let failed = 0

function check(actual, expected, label) {
  if (Object.is(actual, expected)) {
    passed += 1
    return
  }
  failed += 1
  console.error(`FAIL ${label}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`)
}

function checkTrue(value, label) {
  check(value === true, true, label)
}

function checkFalse(value, label) {
  check(value === false, true, label)
}

function section(name) {
  console.log(`\n— ${name}`)
}

const IST = 'Asia/Kolkata'
const TOKYO = 'Asia/Tokyo'
const NEW_YORK = 'America/New_York'

/** A calendar cell, the way the grid produces one. */
function cell(dayKey) {
  return parseDayKey(dayKey)
}

/** A stored event row. */
function event(overrides = {}) {
  return {
    id: '3f7c1b2e-9a44-4a1e-8b2d-0c6f5d3e2a11',
    title: 'Iron supplement',
    description: '',
    start_time: '2026-01-31T03:30:00.000Z',
    end_time: null,
    recurrence_rule: 'none',
    category: 'reminder',
    time_zone: IST,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
section('Calendar primitives')
// ---------------------------------------------------------------------------

check(daysInMonth(2026, 1), 31, 'January has 31 days')
check(daysInMonth(2026, 2), 28, 'February 2026 has 28 days')
check(daysInMonth(2028, 2), 29, 'February 2028 has 29 days (leap)')
check(daysInMonth(2100, 2), 28, 'February 2100 has 28 days (century, not leap)')
check(daysInMonth(2000, 2), 29, 'February 2000 has 29 days (400-year rule)')
check(daysInMonth(2026, 4), 30, 'April has 30 days')

check(weekdayOf(2026, 8, 29), 6, '29 August 2026 is a Saturday')
check(weekdayOf(2026, 1, 1), 4, '1 January 2026 is a Thursday')

check(dayKeyOf({ year: 2026, month: 3, day: 7 }), '2026-03-07', 'day key zero-pads')
check(parseDayKey('2026-02-30'), null, 'parseDayKey rejects 30 February')
check(parseDayKey('2026-13-01'), null, 'parseDayKey rejects month 13')
check(parseDayKey('not-a-date'), null, 'parseDayKey rejects free text')
check(parseDayKey('2028-02-29').day, 29, 'parseDayKey accepts 29 February in a leap year')
check(parseDayKey('2026-02-29'), null, 'parseDayKey rejects 29 February in a common year')

check(compareDays({ year: 2026, month: 1, day: 5 }, { year: 2026, month: 1, day: 5 }), 0, 'compareDays equal')
checkTrue(compareDays({ year: 2025, month: 12, day: 31 }, { year: 2026, month: 1, day: 1 }) < 0, 'compareDays across a year boundary')
checkTrue(compareDays({ year: 2026, month: 3, day: 1 }, { year: 2026, month: 2, day: 28 }) > 0, 'compareDays across a month boundary')

check(monthDayKeys(2026, 2).length, 28, 'February 2026 yields 28 keys')
check(monthDayKeys(2028, 2).at(-1), '2028-02-29', 'leap February ends on the 29th')

// ---------------------------------------------------------------------------
section('Time zones')
// ---------------------------------------------------------------------------

checkTrue(isValidTimeZone(IST), 'Asia/Kolkata is a real zone')
checkTrue(isValidTimeZone('UTC'), 'UTC is a real zone')
checkFalse(isValidTimeZone('Mars/Olympus'), 'an invented zone is refused')
checkFalse(isValidTimeZone(''), 'the empty string is not a zone')
checkFalse(isValidTimeZone(null), 'null is not a zone')
checkFalse(isValidTimeZone(42), 'a number is not a zone')

check(resolveTimeZone('Mars/Olympus', IST), IST, 'an invalid zone falls back')
check(resolveTimeZone('Mars/Olympus', 'Also/Invalid'), DEFAULT_TIME_ZONE, 'a bad fallback lands on UTC')
check(resolveTimeZone(`  ${TOKYO}  `), TOKYO, 'a valid zone is trimmed and kept')

// 2026-01-31T03:30:00Z is 09:00 on 31 January in IST (+05:30) and 12:30 in Tokyo.
const probe = Date.parse('2026-01-31T03:30:00.000Z')
check(dayKeyOf(zonedFields(probe, IST)), '2026-01-31', 'IST sees 31 January')
check(zonedFields(probe, IST).hour, 9, 'IST sees 09:00')
check(zonedFields(probe, TOKYO).hour, 12, 'Tokyo sees 12:00')
check(zonedFields(probe, TOKYO).minute, 30, 'Tokyo sees :30')
check(zonedFields(probe, 'UTC').hour, 3, 'UTC sees 03:00')

// A late-evening instant in IST is still the previous day in UTC — the day a
// cell belongs to has to come from the zone, not from the raw instant.
const lateIst = Date.parse('2026-01-31T19:30:00.000Z') // 01:00 on 1 Feb in IST
check(dayKeyOf(zonedFields(lateIst, IST)), '2026-02-01', 'IST has already rolled over')
check(dayKeyOf(zonedFields(lateIst, 'UTC')), '2026-01-31', 'UTC has not')

check(zonedFields(Number.NaN, IST), null, 'a non-finite instant has no fields')

// ---------------------------------------------------------------------------
section('Wall clock to instant — the timezone-picker fix')
// ---------------------------------------------------------------------------

// This is the assertion the old `setHours()` could not satisfy: the same wall
// clock in two zones is two different instants, five and a half hours apart
// minus the four-hour IST/JST gap.
const nineAmIst = wallClockToInstant({ year: 2026, month: 1, day: 31, hour: 9, minute: 0 }, IST)
const nineAmTokyo = wallClockToInstant({ year: 2026, month: 1, day: 31, hour: 9, minute: 0 }, TOKYO)
check(new Date(nineAmIst).toISOString(), '2026-01-31T03:30:00.000Z', '09:00 IST is 03:30Z')
check(new Date(nineAmTokyo).toISOString(), '2026-01-31T00:00:00.000Z', '09:00 JST is 00:00Z')
checkTrue(nineAmIst !== nineAmTokyo, 'the same wall clock in two zones is two instants')

// And the round trip closes: what was typed is what is displayed.
check(zonedFields(nineAmTokyo, TOKYO).hour, 9, 'Tokyo reads back the 9 that was typed')
check(zonedFields(nineAmIst, IST).hour, 9, 'IST reads back the 9 that was typed')
check(dayKeyOf(zonedFields(nineAmTokyo, TOKYO)), '2026-01-31', 'Tokyo reads back the day that was typed')

// DST. New York is UTC-5 in January and UTC-4 in July; a fixed-offset
// implementation gets exactly one of these right.
const janNy = wallClockToInstant({ year: 2026, month: 1, day: 15, hour: 9, minute: 0 }, NEW_YORK)
const julNy = wallClockToInstant({ year: 2026, month: 7, day: 15, hour: 9, minute: 0 }, NEW_YORK)
check(new Date(janNy).toISOString(), '2026-01-15T14:00:00.000Z', '09:00 EST is 14:00Z')
check(new Date(julNy).toISOString(), '2026-07-15T13:00:00.000Z', '09:00 EDT is 13:00Z')
check(zonedFields(julNy, NEW_YORK).hour, 9, 'the July round trip closes across DST')

// The hour after a spring-forward gap: 02:30 on 8 March 2026 does not exist in
// New York. Landing on the instant just after the jump is the conventional
// resolution; what matters is that it is finite and inside that day.
const gap = wallClockToInstant({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, NEW_YORK)
checkTrue(Number.isFinite(gap), 'a non-existent wall time still resolves to an instant')
check(dayKeyOf(zonedFields(gap, NEW_YORK)), '2026-03-08', 'and stays on the intended day')

check(wallClockToInstant(null, IST), null, 'a missing wall clock has no instant')
check(wallClockToInstant({ year: Number.NaN, month: 1, day: 1 }, IST), null, 'a non-finite year has no instant')

// ---------------------------------------------------------------------------
section('Parsing')
// ---------------------------------------------------------------------------

check(parseInstant('2026-01-31T03:30:00.000Z'), Date.parse('2026-01-31T03:30:00.000Z'), 'a full ISO instant parses')
check(parseInstant('2026-01-31T03:30'), Date.parse('2026-01-31T03:30'), 'a local ISO instant parses')
check(parseInstant('2026-01-31T09:00:00+05:30'), Date.parse('2026-01-31T09:00:00+05:30'), 'an offset instant parses')
check(parseInstant('Jan 5 2026'), null, 'a loose date string is refused')
check(parseInstant('2026'), null, 'a bare year is refused')
check(parseInstant('2026-01-31'), null, 'a bare day is not an instant')
check(parseInstant('tomorrow'), null, 'free text is refused')
check(parseInstant(null), null, 'null is refused')
check(parseInstant(1738294200000), null, 'a raw number is refused')
check(parseInstant(new Date('2026-01-31T03:30:00Z')), Date.parse('2026-01-31T03:30:00Z'), 'a Date is accepted')
check(parseInstant(new Date('nope')), null, 'an Invalid Date is refused')

check(parseWallTime('09:00').hour, 9, 'HH:mm parses the hour')
check(parseWallTime('9:05').minute, 5, 'H:mm parses the minute')
check(parseWallTime('24:00'), null, 'hour 24 is refused')
check(parseWallTime('09:60'), null, 'minute 60 is refused')
check(parseWallTime('0900'), null, 'a missing colon is refused')
check(parseWallTime(null), null, 'null is not a time')

check(composeStartTime('2026-01-31', '09:00', TOKYO), '2026-01-31T00:00:00.000Z', 'compose uses the given zone')
check(composeStartTime('2026-02-30', '09:00', IST), null, 'compose refuses an impossible day')
check(composeStartTime('2026-01-31', '25:00', IST), null, 'compose refuses an impossible time')

check(isUuid('3f7c1b2e-9a44-4a1e-8b2d-0c6f5d3e2a11'), true, 'a v4 UUID is a UUID')
check(isUuid('  3f7c1b2e-9a44-4a1e-8b2d-0c6f5d3e2a11  '), true, 'surrounding space is tolerated')
check(isUuid('not-a-uuid'), false, 'free text is not a UUID')
check(isUuid('3f7c1b2e9a444a1e8b2d0c6f5d3e2a11'), false, 'an unhyphenated string is not accepted')
check(isUuid("1' OR '1'='1"), false, 'an injection attempt is not a UUID')
check(isUuid(null), false, 'null is not a UUID')

// ---------------------------------------------------------------------------
section('Recurrence — the month-length bug')
// ---------------------------------------------------------------------------

check(clampDayToMonth(31, 2026, 2), 28, '31 clamps to 28 in February 2026')
check(clampDayToMonth(31, 2028, 2), 29, '31 clamps to 29 in February 2028')
check(clampDayToMonth(31, 2026, 4), 30, '31 clamps to 30 in April')
check(clampDayToMonth(31, 2026, 3), 31, '31 stays 31 in March')
check(clampDayToMonth(15, 2026, 2), 15, 'a mid-month day never clamps')

// Anchored 09:00 IST on 31 January 2026, repeating monthly.
const monthly = describeAnchor(event({ recurrence_rule: 'monthly' }), IST)
check(monthly.day, 31, 'the anchor day is read in the viewer zone')
check(monthly.hour, 9, 'the anchor hour is read in the viewer zone')

checkTrue(occursOn(monthly, cell('2026-01-31')), 'monthly occurs on its own anchor day')
checkFalse(occursOn(monthly, cell('2026-01-30')), 'monthly does not occur before the anchor')
checkTrue(occursOn(monthly, cell('2026-02-28')), 'monthly falls on the last day of February — the old code skipped it')
checkFalse(occursOn(monthly, cell('2026-02-27')), 'and not on the 27th')
checkTrue(occursOn(monthly, cell('2026-03-31')), 'March still gets the 31st')
checkFalse(occursOn(monthly, cell('2026-03-28')), 'March does not also get the 28th — no drift after a clamp')
checkTrue(occursOn(monthly, cell('2026-04-30')), 'April falls on the 30th')
checkTrue(occursOn(monthly, cell('2028-02-29')), 'a leap February gets the 29th')
checkFalse(occursOn(monthly, cell('2028-02-28')), 'and not the 28th as well')

// The pre-fix behaviour, spelled out: over a year, a 31st-of-the-month reminder
// used to exist in 7 months out of 12.
const twelveMonths = [
  '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30',
  '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31',
]
check(twelveMonths.filter((d) => occursOn(monthly, cell(d))).length, 12, 'a monthly reminder occurs in all twelve months')

// Yearly on 29 February.
const yearly = describeAnchor(
  event({ recurrence_rule: 'yearly', start_time: '2028-02-29T03:30:00.000Z' }),
  IST
)
checkTrue(occursOn(yearly, cell('2028-02-29')), 'the leap-day anchor occurs')
checkTrue(occursOn(yearly, cell('2029-02-28')), 'and lands on 28 February the following year')
checkFalse(occursOn(yearly, cell('2029-03-01')), 'not on 1 March')
checkTrue(occursOn(yearly, cell('2032-02-29')), 'and back on the 29th four years later')
checkFalse(occursOn(yearly, cell('2029-01-28')), 'the month still has to match')

// Daily and weekly.
const daily = describeAnchor(event({ recurrence_rule: 'daily' }), IST)
checkTrue(occursOn(daily, cell('2026-01-31')), 'daily occurs on its anchor day')
checkTrue(occursOn(daily, cell('2026-02-01')), 'daily occurs the next day')
checkTrue(occursOn(daily, cell('2027-06-14')), 'daily keeps going')
checkFalse(occursOn(daily, cell('2026-01-30')), 'daily does not occur before the anchor')

const weekly = describeAnchor(event({ recurrence_rule: 'weekly' }), IST)
check(weekly.weekday, weekdayOf(2026, 1, 31), 'weekly remembers its weekday')
checkTrue(occursOn(weekly, cell('2026-02-07')), 'weekly repeats seven days later')
checkFalse(occursOn(weekly, cell('2026-02-06')), 'and not six days later')

const once = describeAnchor(event(), IST)
checkTrue(occursOn(once, cell('2026-01-31')), 'a one-off occurs on its day')
checkFalse(occursOn(once, cell('2026-02-28')), 'and never again')

// The anchor-day comparison. `date >= evtDate` compared a midnight cell against
// the event's real time, so a 09:00 event failed its own day.
const evening = describeAnchor(
  event({ recurrence_rule: 'daily', start_time: '2026-01-31T18:00:00.000Z' }),
  'UTC'
)
checkTrue(occursOn(evening, cell('2026-01-31')), 'an 18:00 event occurs on its own day')

// Zone-sensitivity: the same instant anchors on different days in different zones.
const rollover = event({ recurrence_rule: 'none', start_time: '2026-01-31T19:30:00.000Z' })
check(dayKeyOf(describeAnchor(rollover, IST)), '2026-02-01', 'IST anchors on 1 February')
check(dayKeyOf(describeAnchor(rollover, 'UTC')), '2026-01-31', 'UTC anchors on 31 January')

check(describeAnchor(event({ start_time: 'nonsense' }), IST), null, 'an unparseable start has no anchor')
check(describeAnchor(null, IST), null, 'a missing event has no anchor')
check(describeAnchor(event({ recurrence_rule: 'fortnightly' }), IST).rule, 'none', 'an unknown rule degrades to one-off')
checkFalse(occursOn(null, cell('2026-01-31')), 'a null anchor never occurs')
checkFalse(occursOn(monthly, null), 'a null cell never matches')

// `end_time` only counts when it is actually after `start_time`.
check(describeAnchor(event({ end_time: '2026-01-31T04:30:00.000Z' }), IST).endMs, Date.parse('2026-01-31T04:30:00.000Z'), 'a later end time is kept')
check(describeAnchor(event({ end_time: '2026-01-30T00:00:00.000Z' }), IST).endMs, null, 'an end time before the start is discarded')

// ---------------------------------------------------------------------------
section('Occurrence index')
// ---------------------------------------------------------------------------

const feb = monthDayKeys(2026, 2)
const index = buildOccurrenceIndex(
  [
    event({ id: 'a', recurrence_rule: 'monthly' }),
    event({ id: 'b', recurrence_rule: 'daily', start_time: '2026-02-10T03:30:00.000Z' }),
    event({ id: 'c', recurrence_rule: 'none', start_time: '2026-02-14T03:30:00.000Z' }),
    event({ id: 'd', start_time: 'garbage' }),
    null,
  ],
  feb,
  IST
)

check(index.size, 28, 'every day of the month is present in the index')
check(index.get('2026-02-01').length, 0, 'a quiet day is present and empty')
check(index.get('2026-02-28').map((e) => e.id).join(','), 'a,b', 'the clamped monthly and the daily both land on the 28th')
check(index.get('2026-02-14').map((e) => e.id).join(','), 'b,c', 'the one-off shares its day with the daily')
check(index.get('2026-02-09').length, 0, 'the daily has not started on the 9th')
checkFalse(feb.some((d) => index.get(d).some((e) => e.id === 'd')), 'an event with an unparseable start is skipped everywhere')

// Ordering within a day is by start time, not by insertion.
const ordered = buildOccurrenceIndex(
  [
    event({ id: 'late', start_time: '2026-02-14T18:00:00.000Z' }),
    event({ id: 'early', start_time: '2026-02-14T01:00:00.000Z' }),
  ],
  ['2026-02-14'],
  IST
)
check(ordered.get('2026-02-14').map((e) => e.id).join(','), 'early,late', 'a day’s events come back in time order')

const empty = buildOccurrenceIndex(null, ['2026-02-14'], IST)
check(empty.get('2026-02-14').length, 0, 'a null event list yields empty days')
check(buildOccurrenceIndex([event()], ['not-a-day'], IST).size, 0, 'an unparseable day key is dropped from the index')

// ---------------------------------------------------------------------------
section('Write validation')
// ---------------------------------------------------------------------------

const good = validateEventInput({
  title: '  Iron supplement  ',
  description: '  with food  ',
  start_time: '2026-01-31T03:30:00.000Z',
  end_time: '2026-01-31T04:00:00.000Z',
  recurrence_rule: 'monthly',
  category: 'health',
  time_zone: IST,
})
checkTrue(good.ok, 'a complete payload is accepted')
check(good.value.title, 'Iron supplement', 'the title is trimmed')
check(good.value.description, 'with food', 'the description is trimmed')
check(good.value.start_time, '2026-01-31T03:30:00.000Z', 'the start time is normalised to ISO')
check(good.value.category, 'health', 'the category is preserved')

// The interval check the route never had.
const backwards = validateEventInput({
  title: 'Backwards',
  start_time: '2026-01-31T04:00:00.000Z',
  end_time: '2026-01-31T03:00:00.000Z',
})
checkFalse(backwards.ok, 'an event that ends before it starts is refused')
check(backwards.error.field, 'end_time', 'and the offending field is named')
check(backwards.error.status, 400, 'as a 400, not a 500')

const identical = validateEventInput({
  title: 'Zero length',
  start_time: '2026-01-31T04:00:00.000Z',
  end_time: '2026-01-31T04:00:00.000Z',
})
checkFalse(identical.ok, 'a zero-length event is refused')

const tooLong = validateEventInput({
  title: 'Forever',
  start_time: '2026-01-31T04:00:00.000Z',
  end_time: '2030-01-31T04:00:00.000Z',
})
checkFalse(tooLong.ok, 'an event lasting four years is refused')

// Enums are refused, not silently rewritten. The route folded an unknown
// category into `reminder`, so a client bug became stored data.
const badCategory = validateEventInput({ title: 'x', start_time: '2026-01-31T04:00:00.000Z', category: 'urgent' })
checkFalse(badCategory.ok, 'an unknown category is refused rather than rewritten')
check(badCategory.error.field, 'category', 'and named')

const badRule = validateEventInput({ title: 'x', start_time: '2026-01-31T04:00:00.000Z', recurrence_rule: 'fortnightly' })
checkFalse(badRule.ok, 'an unknown recurrence is refused rather than rewritten')

const badZone = validateEventInput({ title: 'x', start_time: '2026-01-31T04:00:00.000Z', time_zone: 'Mars/Olympus' })
checkFalse(badZone.ok, 'an invented time zone is refused')
check(badZone.error.field, 'time_zone', 'and named')

checkFalse(validateEventInput({ title: '   ', start_time: '2026-01-31T04:00:00.000Z' }).ok, 'a whitespace title is refused')
checkFalse(validateEventInput({ start_time: '2026-01-31T04:00:00.000Z' }).ok, 'a missing title is refused')
checkFalse(validateEventInput({ title: 'x' }).ok, 'a missing start time is refused')
checkFalse(validateEventInput({ title: 'x', start_time: 'tomorrow' }).ok, 'a loose start time is refused')
checkFalse(validateEventInput({ title: 'x'.repeat(MAX_TITLE_LENGTH + 1), start_time: '2026-01-31T04:00:00.000Z' }).ok, 'an over-long title is refused')
checkFalse(validateEventInput({ title: 'x', description: 'y'.repeat(MAX_DESCRIPTION_LENGTH + 1), start_time: '2026-01-31T04:00:00.000Z' }).ok, 'an over-long description is refused')
checkFalse(validateEventInput(null).ok, 'a null body is refused')
checkFalse(validateEventInput([]).ok, 'an array body is refused')
checkFalse(validateEventInput('string').ok, 'a string body is refused')

// Defaults only apply on create.
const defaults = validateEventInput({ title: 'x', start_time: '2026-01-31T04:00:00.000Z' })
check(defaults.value.category, 'reminder', 'create defaults the category')
check(defaults.value.recurrence_rule, 'none', 'create defaults the recurrence')
check(defaults.value.time_zone, DEFAULT_TIME_ZONE, 'create defaults the zone')
check(defaults.value.end_time, null, 'create defaults the end time to null')
check(defaults.value.description, '', 'create defaults the description to empty')

// ---------------------------------------------------------------------------
section('Partial updates')
// ---------------------------------------------------------------------------

const patch = validateEventInput({ id: 'x', title: 'Renamed' }, { partial: true })
checkTrue(patch.ok, 'a one-field patch is accepted')
check(Object.keys(patch.value).join(','), 'title', 'and touches only that field')
check(patch.value.start_time, undefined, 'an absent start time is not written')
check(patch.value.category, undefined, 'an absent category is not defaulted over')
check(patch.value.time_zone, undefined, 'an absent zone is not defaulted over')

// PostgREST rejects an empty patch; the route surfaced that as a 500.
const nothing = validateEventInput({ id: 'x' }, { partial: true })
checkFalse(nothing.ok, 'a patch naming no fields is refused')
check(nothing.error.status, 400, 'as a 400')

// The interval is still enforced when only one side is in the payload.
const halfPatch = validateEventInput(
  { id: 'x', end_time: '2026-01-31T02:00:00.000Z', __currentStartTime: '2026-01-31T04:00:00.000Z' },
  { partial: true }
)
checkFalse(halfPatch.ok, 'a new end time before the stored start is refused')

const okPatch = validateEventInput(
  { id: 'x', end_time: '2026-01-31T05:00:00.000Z', __currentStartTime: '2026-01-31T04:00:00.000Z' },
  { partial: true }
)
checkTrue(okPatch.ok, 'a new end time after the stored start is accepted')
check(okPatch.value.__currentStartTime, undefined, 'the stored-row hint never reaches the write payload')

const clearEnd = validateEventInput({ id: 'x', end_time: null }, { partial: true })
checkTrue(clearEnd.ok, 'clearing the end time is expressible')
check(clearEnd.value.end_time, null, 'and writes null')

// ---------------------------------------------------------------------------
section('Database error mapping')
// ---------------------------------------------------------------------------

check(describeEventError({ code: 'PGRST116' }).status, 404, 'a missing row is a 404, not a 500')
check(describeEventError({ code: '22P02' }).status, 400, 'a malformed UUID is a 400')
check(describeEventError({ code: '22007' }).status, 400, 'a malformed timestamp is a 400')
check(describeEventError({ code: '22001' }).status, 400, 'an over-long value is a 400')
check(describeEventError({ code: '23503' }).status, 409, 'a missing parent user is a 409')
check(describeEventError({ code: '42P01' }).status, 503, 'a missing table is a 503')
check(describeEventError({ code: '08006' }).status, 500, 'an unrecognised code stays a 500')
check(describeEventError(null).status, 500, 'a null error is a 500')

// Nothing from the driver may reach the client.
const leaky = {
  code: '08006',
  message: 'could not connect to server: db.abcdefgh.supabase.co:6543 relation "public.events" constraint "events_pkey"',
}
const described = describeEventError(leaky)
checkFalse(described.message.includes('supabase.co'), 'the pooler host does not leak')
checkFalse(described.message.includes('public.events'), 'the relation name does not leak')
checkFalse(described.message.includes('events_pkey'), 'the constraint name does not leak')

for (const code of ['PGRST116', '22P02', '22007', '22008', '22001', '23503', '23514', '42P01', 'XX000', '']) {
  const result = describeEventError({ code })
  checkTrue(
    typeof result.message === 'string' && result.message.length > 0 &&
      Number.isInteger(result.status) && typeof result.code === 'string' && result.code.length > 0,
    `every branch is fully described (${code || 'empty'})`
  )
}

// ---------------------------------------------------------------------------
section('Delete results')
// ---------------------------------------------------------------------------

// `DELETE` answered "Event deleted successfully" whether or not a row matched,
// so removing an id that was already gone looked identical to a real deletion.
check(readDeleteResult({ count: 1 }).deleted, true, 'one deleted row is a deletion')
check(readDeleteResult({ count: 0 }).deleted, false, 'zero rows is not a deletion')
check(readDeleteResult({ count: null }).deleted, false, 'a null count is not a deletion')
check(readDeleteResult({}).deleted, false, 'a missing count is not a deletion')
check(readDeleteResult(null).deleted, false, 'a null result is not a deletion')
check(readDeleteResult({ count: 0 }).count, 0, 'the count is reported')

// ---------------------------------------------------------------------------
section('Contract constants')
// ---------------------------------------------------------------------------

check(EVENT_CATEGORIES.join(','), 'reminder,habit,donation,health', 'the categories match supabase/08_events.sql')
check(RECURRENCE_RULES.join(','), 'none,daily,weekly,monthly,yearly', 'the recurrence rules match the column comment')
checkTrue(Object.isFrozen(EVENT_CATEGORIES), 'the category list cannot be mutated at runtime')
checkTrue(Object.isFrozen(RECURRENCE_RULES), 'the recurrence list cannot be mutated at runtime')
checkTrue(MAX_EVENTS_RETURNED > 0 && Number.isInteger(MAX_EVENTS_RETURNED), 'the GET ceiling is a positive integer')

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
