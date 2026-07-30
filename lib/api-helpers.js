
// Shared helper: removes duplicate/near-duplicate cycle entries
// (entries less than 20 days apart are treated as the same period)
function dedupeCycles(cycleHistory) {
  if (!cycleHistory || cycleHistory.length === 0) return []

  const validHistory = cycleHistory.filter(c => {
    if (!c || !c.start_date) return false
    const d = new Date(c.start_date)
    return d instanceof Date && !isNaN(d.getTime())
  })

  if (validHistory.length === 0) return []

  const sorted = [...validHistory].sort((a, b) =>
    new Date(a.start_date) - new Date(b.start_date)
  )

  const deduped = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(deduped[deduped.length - 1].start_date)
    const curr = new Date(sorted[i].start_date)
    const gapDays = Math.round((curr - prev) / 86400000)
    if (gapDays >= 20) deduped.push(sorted[i])
  }
  return deduped
}

// Helper: compute the median of a numeric array (assumes length >= 1)
function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

// Helper: filter outliers that deviate > 2.5 standard deviations from the median.
// Returns the filtered array, or the original if filtering would leave < minKeep items.
function filterOutliers(values, minKeep = 2) {
  if (values.length < 3) return values // need at least 3 to meaningfully detect outliers

  const med = median(values)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  const stdDev = Math.sqrt(variance)

  if (stdDev === 0) return values // all identical — nothing to filter

  const filtered = values.filter(v => Math.abs(v - med) <= 2.5 * stdDev)
  return filtered.length >= minKeep ? filtered : values
}

// Helper function to calculate next period date
export function predictNextPeriod(cycleHistory) {
  if (!cycleHistory || cycleHistory.length === 0) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const estimated = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000)
    return {
      nextPeriodDate: `${months[estimated.getMonth()]} ${estimated.getDate()}, ${estimated.getFullYear()}`,
      confidence: '0%',
      averageCycleLength: 28
    }
  }

  const deduped = dedupeCycles(cycleHistory)

  if (deduped.length === 0) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const estimated = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000)
    return {
      nextPeriodDate: `${months[estimated.getMonth()]} ${estimated.getDate()}, ${estimated.getFullYear()}`,
      confidence: '0%',
      averageCycleLength: 28
    }
  }

  // Need at least 2 data points to calculate a meaningful average
  if (deduped.length < 2) {
    const lastPeriod = new Date(deduped[0].start_date)
    let avgLen = parseInt(deduped[0].cycle_length, 10)
    if (isNaN(avgLen) || avgLen < 21 || avgLen > 45) {
      avgLen = 28
    }
    const nextPeriod = new Date(lastPeriod)
    nextPeriod.setDate(nextPeriod.getDate() + avgLen)
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return {
      nextPeriodDate: `${months[nextPeriod.getMonth()]} ${nextPeriod.getDate()}, ${nextPeriod.getFullYear()}`,
      confidence: '75%',
      averageCycleLength: avgLen
    }
  }

  // Calculate gap-based cycle lengths from deduplicated entries
  const gapLengths = []
  for (let i = 1; i < deduped.length; i++) {
    const prevDate = new Date(deduped[i - 1].start_date)
    const currDate = new Date(deduped[i].start_date)
    gapLengths.push(Math.round((currDate - prevDate) / 86400000))
  }

  // Filter outliers: remove cycle gaps that deviate > 2.5σ from the median
  const filteredGaps = filterOutliers(gapLengths)

  // Also factor in explicit cycle_length values where available
  const explicitLengths = deduped
    .filter(c => c.cycle_length && c.cycle_length >= 20 && c.cycle_length <= 45)
    .map(c => c.cycle_length)

  // Apply the same outlier filter to explicit lengths
  const filteredExplicit = filterOutliers(explicitLengths)

  let avgLength
  if (filteredExplicit.length >= 2) {
    const explicitAvg = filteredExplicit.reduce((a, b) => a + b, 0) / filteredExplicit.length
    const gapAvg = filteredGaps.reduce((a, b) => a + b, 0) / filteredGaps.length
    avgLength = Math.round(explicitAvg * 0.6 + gapAvg * 0.4)
  } else {
    avgLength = Math.round(filteredGaps.reduce((a, b) => a + b, 0) / filteredGaps.length)
  }

  avgLength = Math.max(21, Math.min(45, avgLength || 28))

  const lastPeriod = new Date(deduped[deduped.length - 1].start_date)
  const nextPeriod  = new Date(lastPeriod)
  nextPeriod.setDate(nextPeriod.getDate() + avgLength)

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const formattedDate = `${months[nextPeriod.getMonth()]} ${nextPeriod.getDate()}, ${nextPeriod.getFullYear()}`

  // Confidence is based on the filtered gaps (outliers excluded → more stable)
  let variance = 0
  for (let i = 0; i < filteredGaps.length; i++) {
    variance += Math.abs(filteredGaps[i] - avgLength)
  }
  const avgVariance = variance / filteredGaps.length
  const confidence  = Math.max(60, Math.min(95, 95 - avgVariance * 2))

  return {
    nextPeriodDate:    formattedDate,
    confidence:        `${Math.round(confidence)}%`,
    averageCycleLength: avgLength
  }
}



// Helper function to calculate PCOD risk (mock ML model)
export function calculatePCODRisk(cycleHistory, symptoms) {
  if (!cycleHistory || cycleHistory.length === 0) {
    return { score: 0, tier: 'LOW RISK', factors: [] }
  }

  const deduped = dedupeCycles(cycleHistory)

  let riskScore = 0
  let riskFactors = []

  // Factor 1: Cycle irregularity
  if (deduped.length >= 3) {
    let cycleLengths = []
    for (let i = 1; i < deduped.length; i++) {
      const prevDate = new Date(deduped[i - 1].start_date)
      const currDate = new Date(deduped[i].start_date)
      const diff = Math.floor(Math.abs(currDate - prevDate) / (1000 * 60 * 60 * 24))
      cycleLengths.push(diff)
    }

    const avgLength = cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length
    const variance = cycleLengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / cycleLengths.length
    const stdDev = Math.sqrt(variance)

    if (stdDev > 7) {
      riskScore += 20
      riskFactors.push('Irregular cycle patterns detected')
    }

    if (avgLength < 21 || avgLength > 35) {
      riskScore += 15
      riskFactors.push('Cycle length outside normal range')
    }
  }

  // Factor 2: Symptoms analysis
  if (symptoms) {
    const highRiskSymptoms = ['acne', 'fatigue', 'bloating', 'headache']
    const matchedSymptoms = symptoms.filter(s =>
      highRiskSymptoms.includes(s.toLowerCase())
    ).length

    if (matchedSymptoms >= 3) {
      riskScore += 25
      riskFactors.push('Multiple PCOD-related symptoms reported')
    } else if (matchedSymptoms >= 2) {
      riskScore += 15
      riskFactors.push('Some hormonal symptoms present')
    }
  }

  let tier = 'LOW RISK'
  if (riskScore >= 60) {
    tier = 'HIGH RISK'
  } else if (riskScore >= 35) {
    tier = 'MEDIUM RISK'
  }

  if (riskScore < 35 && riskFactors.length === 0) {
    riskFactors = [
      'Regular cycle length maintained',
      'No significant hormonal symptoms'
    ]
  }

  return {
    score: Math.min(riskScore, 85),
    tier,
    factors: riskFactors,
    recommendation: tier === 'HIGH RISK'
      ? 'Consider consulting with a healthcare provider for detailed assessment.'
      : 'Keep tracking your cycle and maintaining healthy habits.'
  }
}
