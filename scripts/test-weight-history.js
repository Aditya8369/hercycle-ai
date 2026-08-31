/**
 * Regression suite for lib/weight-history.js.
 *
 * The bug this is part of fixing: `GET /api/weight` asked for the user's
 * **oldest** year of measurements.
 *
 *     .order('recorded_date', { ascending: true })
 *     .limit(365)
 *
 * `ORDER BY recorded_date ASC LIMIT 365` is "the first 365 days this account
 * ever logged". `WeightTrendChart` then read `chartData.at(-1)` as "now", so
 * past 365 entries the chart stopped moving, the card header reported a weight
 * and a BMI from over a year ago, and a freshly saved measurement — committed,
 * 200 OK, badge showing *Saved* — was simply absent from the refetch, with
 * nothing in the UI able to distinguish that from a broken save.
 *
 * Two more, in the same path: the route rounded BMI to two decimals while the
 * form rounded to one (so 62 kg at 165 cm showed 22.8 and stored 22.77), and
 * both handlers returned `error.message` verbatim, sending the relation and
 * constraint names to the browser as a 500 for what is a bad request.
 *
 *   node scripts/test-weight-history.js
 */

import {
  BMI_BANDS,
  BMI_PRECISION,
  HISTORY_LIMIT,
  MAX_STORABLE_BMI,
  MIN_STORABLE_BMI,
  classifyBmi,
  computeBmi,
  daysBetween,
  describeWeightError,
  isStorableBmi,
  orderForChart,
  readHistoryResponse,
  readSaveResponse,
  summariseHistory,
  toChartPoint,
  toChartSeries,
} from '../lib/weight-history.js'

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

/** A stored row, as PostgREST returns one: NUMERIC columns arrive as strings. */
function row(date, weight, extra = {}) {
  return {
    id: `id-${date}`,
    recorded_date: date,
    weight_kg: String(weight),
    height_cm: '165.00',
    waist_cm: null,
    bmi: String(computeBmi(weight, 165)),
    ...extra,
  }
}

/** `n` consecutive daily rows starting at `startIso`, weight rising by 0.1/day. */
function dailyHistory(startIso, n) {
  const start = Date.parse(`${startIso}T00:00:00Z`)
  const rows = []
  for (let i = 0; i < n; i += 1) {
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10)
    rows.push(row(date, Number((60 + i * 0.1).toFixed(1))))
  }
  return rows
}

// ---------------------------------------------------------------------------
section('BMI — one implementation, one precision')
// ---------------------------------------------------------------------------

check(computeBmi(62, 165), 22.8, '62 kg at 165 cm is 22.8')
check(computeBmi('62', '165'), 22.8, 'string inputs give the same answer')
check(computeBmi(70, 175), 22.9, '70 kg at 175 cm is 22.9')
check(computeBmi(50, 160), 19.5, '50 kg at 160 cm is 19.5')
check(computeBmi(100, 160), 39.1, '100 kg at 160 cm is 39.1')

// The discrepancy this replaces: the form rounded to 1 dp and the route to 2,
// so the number watched while typing was not the number stored.
const twoDecimals = Number((62 / 1.65 / 1.65).toFixed(2))
check(twoDecimals, 22.77, 'the old route produced 22.77')
checkTrue(computeBmi(62, 165) !== twoDecimals, 'which is a different number from the form’s 22.8')
check(String(computeBmi(62, 165)).split('.')[1].length, BMI_PRECISION, 'one decimal place, everywhere')

check(computeBmi(0, 165), null, 'zero weight has no BMI')
check(computeBmi(62, 0), null, 'zero height has no BMI')
check(computeBmi(-62, 165), null, 'negative weight has no BMI')
check(computeBmi(null, 165), null, 'a missing weight has no BMI')
check(computeBmi('', ''), null, 'empty strings have no BMI')
check(computeBmi('abc', 165), null, 'a non-numeric weight has no BMI')
check(computeBmi(Number.NaN, 165), null, 'NaN has no BMI')
check(computeBmi(Infinity, 165), null, 'Infinity has no BMI')

// ---------------------------------------------------------------------------
section('BMI storability — the CHECK the route could trip')
// ---------------------------------------------------------------------------

check(MIN_STORABLE_BMI, 5, 'the lower bound matches the column CHECK')
check(MAX_STORABLE_BMI, 100, 'the upper bound matches the column CHECK')

// Both of these pass the route's own zod ranges (weight 20-350, height 100-250)
// and land outside CHECK (bmi >= 5 AND bmi <= 100).
const tooLight = computeBmi(20, 250)
check(tooLight, 3.2, '20 kg at 250 cm is a BMI of 3.2')
checkFalse(isStorableBmi(tooLight), 'which the column will not accept')
const tooHeavy = computeBmi(350, 100)
check(tooHeavy, 350, '350 kg at 100 cm is a BMI of 350')
checkFalse(isStorableBmi(tooHeavy), 'which the column will not accept either')

checkTrue(isStorableBmi(22.8), 'an ordinary BMI is storable')
checkTrue(isStorableBmi(MIN_STORABLE_BMI), 'the lower bound itself is storable')
checkTrue(isStorableBmi(MAX_STORABLE_BMI), 'the upper bound itself is storable')
checkFalse(isStorableBmi(4.9), 'just below the bound is not')
checkFalse(isStorableBmi(100.1), 'just above the bound is not')
checkFalse(isStorableBmi(null), 'null is not storable')
checkFalse(isStorableBmi('abc'), 'free text is not storable')

// ---------------------------------------------------------------------------
section('BMI bands')
// ---------------------------------------------------------------------------

check(classifyBmi(17), 'below', '17 is below range')
check(classifyBmi(18.4), 'below', '18.4 is below range')
check(classifyBmi(18.5), 'healthy', '18.5 is the bottom of healthy')
check(classifyBmi(22.8), 'healthy', '22.8 is healthy')
check(classifyBmi(24.9), 'healthy', '24.9 is still healthy')
check(classifyBmi(25), 'above', '25 is the bottom of above range')
check(classifyBmi(29.9), 'above', '29.9 is above range')
check(classifyBmi(30), 'high', '30 is the bottom of high')
check(classifyBmi(45), 'high', '45 is high')
check(classifyBmi(0), null, 'zero has no band')
check(classifyBmi(null), null, 'null has no band')
check(classifyBmi('abc'), null, 'free text has no band')
checkTrue(Object.isFrozen(BMI_BANDS), 'the band table cannot be mutated at runtime')

// ---------------------------------------------------------------------------
section('Ordering — the window bug')
// ---------------------------------------------------------------------------

// The route now selects newest-first so the LIMIT keeps the recent end; the
// chart wants chronological. These are two decisions, and the old code answered
// the second in a way that silently changed the answer to the first.
const newestFirst = [row('2026-03-01', 62), row('2026-02-01', 61), row('2026-01-01', 60)]
check(orderForChart(newestFirst).map(r => r.recorded_date).join(','), '2026-01-01,2026-02-01,2026-03-01', 'a descending window is presented chronologically')
check(orderForChart(newestFirst)[0].recorded_date, '2026-01-01', 'oldest first')
check(orderForChart(newestFirst).at(-1).recorded_date, '2026-03-01', 'newest last')

const shuffled = [row('2026-02-01', 61), row('2026-03-01', 62), row('2026-01-01', 60)]
check(orderForChart(shuffled).map(r => r.recorded_date).join(','), '2026-01-01,2026-02-01,2026-03-01', 'an arbitrary order is normalised')

check(orderForChart(newestFirst) === newestFirst, false, 'the input array is not mutated')
check(newestFirst[0].recorded_date, '2026-03-01', 'and its order is untouched')

check(orderForChart(null).length, 0, 'a null window is empty')
check(orderForChart([]).length, 0, 'an empty window is empty')
check(orderForChart([{ id: 'x' }, null, row('2026-01-01', 60)]).length, 1, 'rows without a date are dropped')
check(orderForChart([row('2026-01-01', 60), row('2026-01-01', 61)]).length, 2, 'same-day rows are both kept')

// Sorting `YYYY-MM-DD` as strings is a correct calendar sort, including across
// year boundaries and single-digit months.
check(
  orderForChart([row('2026-01-05', 60), row('2025-12-31', 59), row('2026-01-10', 61)])
    .map(r => r.recorded_date).join(','),
  '2025-12-31,2026-01-05,2026-01-10',
  'string ordering is a calendar ordering for ISO dates'
)

// ---------------------------------------------------------------------------
section('The 366th entry — what actually broke')
// ---------------------------------------------------------------------------

// 400 daily entries. The old query took the first 365 (ascending); the new one
// takes the last 365 (descending) and presents them chronologically.
const longHistory = dailyHistory('2025-01-01', 400)
check(longHistory.length, 400, '400 entries on file')

const oldWindow = [...longHistory].sort((a, b) => (a.recorded_date < b.recorded_date ? -1 : 1)).slice(0, HISTORY_LIMIT)
const newWindow = [...longHistory].sort((a, b) => (a.recorded_date > b.recorded_date ? -1 : 1)).slice(0, HISTORY_LIMIT)

const newest = longHistory.at(-1)
checkFalse(oldWindow.some(r => r.recorded_date === newest.recorded_date), 'the old window did not contain the newest entry')
checkTrue(newWindow.some(r => r.recorded_date === newest.recorded_date), 'the new window does')

check(summariseHistory(oldWindow).latest.recorded_date, '2025-12-31', 'the old window reported a year-old measurement as latest')
check(summariseHistory(newWindow).latest.recorded_date, newest.recorded_date, 'the new window reports the real latest')
check(summariseHistory(newWindow).count, HISTORY_LIMIT, 'and holds a full year')

// The specific symptom: saving again changes nothing under the old window.
const afterAnotherSave = [...longHistory, row('2026-02-05', 99.9)]
const oldAfter = [...afterAnotherSave].sort((a, b) => (a.recorded_date < b.recorded_date ? -1 : 1)).slice(0, HISTORY_LIMIT)
check(summariseHistory(oldAfter).latest.recorded_date, '2025-12-31', 'a new save did not move the old window at all')
const newAfter = [...afterAnotherSave].sort((a, b) => (a.recorded_date > b.recorded_date ? -1 : 1)).slice(0, HISTORY_LIMIT)
check(summariseHistory(newAfter).latest.weight, 99.9, 'and does move the new one')

// ---------------------------------------------------------------------------
section('Chart points')
// ---------------------------------------------------------------------------

const point = toChartPoint(row('2026-01-01', 62))
check(point.weight, 62, 'a NUMERIC string becomes a number')
check(typeof point.weight, 'number', 'and is typed as one')
check(point.bmi, 22.8, 'the BMI comes through')
check(point.waist, null, 'a null waist stays null')
check(toChartPoint({ ...row('2026-01-01', 62), waist_cm: '78.5' }).waist, 78.5, 'a waist string becomes a number')
check(toChartPoint({ ...row('2026-01-01', 62), waist_cm: '' }).waist, null, 'an empty waist is null, not 0')
check(toChartPoint({ ...row('2026-01-01', 62), bmi: null }).bmi, null, 'a null BMI stays null')

check(toChartPoint(null), null, 'a null row is not a point')
check(toChartPoint({ weight_kg: '62' }), null, 'a row with no date is not a point')
check(toChartPoint({ recorded_date: '2026-01-01', weight_kg: '0' }), null, 'a zero weight is not plottable')
check(toChartPoint({ recorded_date: '2026-01-01', weight_kg: 'abc' }), null, 'a non-numeric weight is not plottable')

check(toChartSeries([row('2026-02-01', 61), null, { id: 'junk' }, row('2026-01-01', 60)]).length, 2, 'the series skips unplottable rows')
check(toChartSeries([row('2026-02-01', 61), row('2026-01-01', 60)])[0].recorded_date, '2026-01-01', 'and is chronological')

// ---------------------------------------------------------------------------
section('Summary')
// ---------------------------------------------------------------------------

const summary = summariseHistory([row('2026-03-01', 64), row('2026-01-01', 60), row('2026-02-01', 62)])
check(summary.count, 3, 'the count is the plottable rows')
check(summary.earliest.recorded_date, '2026-01-01', 'earliest is the oldest date, not the first array element')
check(summary.latest.recorded_date, '2026-03-01', 'latest is the newest date, not the last array element')
check(summary.changeKg, 4, 'the change is latest minus earliest')
check(summary.spanDays, 59, 'the span is in whole days')

const losing = summariseHistory([row('2026-01-01', 70), row('2026-03-01', 66.5)])
check(losing.changeKg, -3.5, 'a loss is reported as negative')

const single = summariseHistory([row('2026-01-01', 60)])
check(single.count, 1, 'one entry counts as one')
check(single.latest.weight, 60, 'and is the latest')
check(single.changeKg, null, 'with no change to report')
check(single.spanDays, null, 'and no span')

const none = summariseHistory([])
check(none.count, 0, 'an empty history counts zero')
check(none.latest, null, 'with no latest')
check(none.changeKg, null, 'and no change')
check(summariseHistory(null).count, 0, 'a null history counts zero')

check(daysBetween('2026-01-01', '2026-01-31'), 30, 'January 1 to 31 is 30 days')
check(daysBetween('2026-02-28', '2026-03-01'), 1, 'across a non-leap February boundary')
check(daysBetween('2028-02-28', '2028-03-01'), 2, 'across a leap February boundary')
check(daysBetween('2026-03-07', '2026-03-09'), 2, 'across a DST weekend, unaffected by local offsets')
check(daysBetween('2026-01-31', '2026-01-01'), -30, 'backwards is negative')
check(daysBetween('nonsense', '2026-01-01'), null, 'an unparseable date has no span')

// ---------------------------------------------------------------------------
section('Database error mapping')
// ---------------------------------------------------------------------------

// The exact string that used to reach the browser as a 500.
const bmiViolation = {
  code: '23514',
  message: 'new row for relation "weight_entries" violates check constraint "weight_entries_bmi_check"',
}
const describedBmi = describeWeightError(bmiViolation)
check(describedBmi.status, 400, 'a CHECK violation is a bad request, not a server fault')
check(describedBmi.code, 'BMI_OUT_OF_RANGE', 'and is identified as the BMI one')
checkFalse(describedBmi.message.includes('weight_entries'), 'the relation name does not leak')
checkFalse(describedBmi.message.includes('check constraint'), 'the constraint wording does not leak')
checkFalse(describedBmi.message.includes('_check'), 'the constraint name does not leak')
checkTrue(describedBmi.message.includes('BMI'), 'the user is told which value is wrong')

check(describeWeightError({ code: '23514', constraint: 'weight_entries_bmi_check' }).code, 'BMI_OUT_OF_RANGE', 'the constraint field is read when present')
check(describeWeightError({ code: '23514', message: 'violates check constraint "weight_entries_waist_cm_check"' }).code, 'VALUE_OUT_OF_RANGE', 'a different CHECK gets the general sentence')

check(describeWeightError({ code: '22P02' }).status, 400, 'a malformed number is a 400')
check(describeWeightError({ code: '22003' }).status, 400, 'a numeric overflow is a 400')
check(describeWeightError({ code: '22007' }).status, 400, 'a malformed date is a 400')
check(describeWeightError({ code: '23503' }).status, 409, 'a missing parent user is a 409')
check(describeWeightError({ code: '23505' }).status, 409, 'a unique violation is a 409')
check(describeWeightError({ code: '42P01' }).status, 503, 'a missing table is a 503')
check(describeWeightError({ code: '42703' }).status, 503, 'a missing column is a 503')
check(describeWeightError({ code: '08006' }).status, 500, 'an unrecognised code stays a 500')
check(describeWeightError(null).status, 500, 'a null error is a 500')
check(describeWeightError({}).status, 500, 'an error with no code is a 500')

// Connection faults are the other way this endpoint leaked infrastructure.
const connectionFault = {
  code: '08006',
  message: 'could not connect to server: aws-0-ap-south-1.pooler.supabase.com:6543 (10.0.1.14), user "postgres.abcdefgh"',
}
const describedFault = describeWeightError(connectionFault)
checkFalse(describedFault.message.includes('pooler.supabase.com'), 'the pooler host does not leak')
checkFalse(describedFault.message.includes('10.0.1.14'), 'the internal IP does not leak')
checkFalse(describedFault.message.includes('postgres.'), 'the database user does not leak')

for (const code of ['23514', '22P02', '22003', '22007', '22008', '23503', '23505', '42P01', '42703', 'XX000', '']) {
  const result = describeWeightError({ code })
  checkTrue(
    typeof result.message === 'string' && result.message.length > 0 &&
      Number.isInteger(result.status) && typeof result.code === 'string' && result.code.length > 0,
    `every branch is fully described (${code || 'empty'})`
  )
}

// ---------------------------------------------------------------------------
section('Response readers')
// ---------------------------------------------------------------------------

const history = readHistoryResponse({ ok: true }, { success: true, data: [row('2026-01-01', 60)] })
checkTrue(history.ok, 'a successful history response reads')
check(history.entries.length, 1, 'and carries its entries')
check(history.notice, null, 'with no notice when the window is not full')
check(
  readHistoryResponse({ ok: true }, { success: true, data: [], message: 'Showing your most recent 365 measurements.' }).notice,
  'Showing your most recent 365 measurements.',
  'a truncation notice is surfaced'
)

checkFalse(readHistoryResponse({ ok: false, status: 500 }, { success: false, error: 'boom' }).ok, 'a failed response is a failure')
check(readHistoryResponse({ ok: false }, { success: false, error: 'boom' }).error, 'boom', 'and carries the message')
checkFalse(readHistoryResponse({ ok: true }, { success: false }).ok, 'success:false is a failure even on a 200')
checkFalse(readHistoryResponse({ ok: true }, null).ok, 'a null body is a failure')
checkFalse(readHistoryResponse(null, { success: true, data: [] }).ok, 'a null response is a failure')
check(readHistoryResponse({ ok: true }, { success: true, data: 'nope' }).entries.length, 0, 'a non-array payload yields no entries')
checkTrue(readHistoryResponse({ ok: false }, {}).error.length > 0, 'a failure always has something to show the user')

const save = readSaveResponse({ ok: true }, { success: true, data: row('2026-01-01', 60) })
checkTrue(save.ok, 'a successful save reads')
check(save.entry.recorded_date, '2026-01-01', 'and carries the stored row')
checkFalse(readSaveResponse({ ok: true }, { success: false, error: 'nope' }).ok, 'success:false is a failed save')
checkFalse(readSaveResponse({ ok: false }, { success: true }).ok, 'a non-2xx is a failed save even if the body says success')
check(readSaveResponse({ ok: true }, { success: true, data: null }).entry.recorded_date, undefined, 'a missing payload yields an empty entry, not a crash')

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
