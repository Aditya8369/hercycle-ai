/**
 * CycleCalendarSkeleton — pulse placeholder shown while `dataLoaded` is false.
 *
 * Reuses the exact same classes as CycleCalendar (`cycle-card`, `mini-cal`,
 * `cal-d`, `cal-legend`, `stat-row`, `stat-tile`) so the skeleton takes up
 * pixel-identical space to the real card. Swapping one for the other causes
 * zero layout shift. The shimmer treatment reuses `.risk-skeleton-row`,
 * already defined in globals.css for PCODRiskCard's skeleton.
 */
export default function CycleCalendarSkeleton() {
    const headers = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
    const cells = Array.from({ length: 35 }) // 5 header-less rows, matches a typical month grid

    return (
        <div className="cycle-card glass" aria-hidden="true">
            <div className="cycle-card-header">
                <div className="risk-skeleton-row" style={{ width: 140, height: '1.25rem', borderRadius: 6 }} />
                <div className="month-nav">
                    <div className="risk-skeleton-row" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                    <div className="risk-skeleton-row" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                </div>
            </div>

            <div className="mini-cal">
                {headers.map((_, i) => (
                    <div key={`h-${i}`} className="cal-d header" />
                ))}
                {cells.map((_, i) => (
                    <div
                        key={i}
                        className="risk-skeleton-row"
                        style={{ aspectRatio: '1', borderRadius: '50%' }}
                    />
                ))}
            </div>

            <div className="cal-legend">
                <div className="risk-skeleton-row" style={{ width: 70, height: 12, borderRadius: 50 }} />
                <div className="risk-skeleton-row" style={{ width: 80, height: 12, borderRadius: 50 }} />
                <div className="risk-skeleton-row" style={{ width: 75, height: 12, borderRadius: 50 }} />
            </div>

            <div className="stat-row">
                <div className="stat-tile">
                    <div className="risk-skeleton-row" style={{ width: '60%', height: '0.7rem', marginBottom: 8 }} />
                    <div className="risk-skeleton-row" style={{ width: '40%', height: '1.5rem' }} />
                </div>
                <div className="stat-tile">
                    <div className="risk-skeleton-row" style={{ width: '60%', height: '0.7rem', marginBottom: 8 }} />
                    <div className="risk-skeleton-row" style={{ width: '40%', height: '1.5rem' }} />
                </div>
            </div>
        </div>
    )
}