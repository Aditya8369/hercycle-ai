'use client'

/**
 * SectionCard — standardized container for a titled block of content.
 *
 * Fixes inconsistent section styling across Dashboard/Insights/Self-Care
 * (some used `p-4 sm:p-6`, others `padding: 1.5rem`; title sizes drifted
 * between `1.05rem` and `1.4rem`). This owns border radius, glass
 * background, responsive padding, and header typography in one place.
 *
 * `tone` lets different pages keep their own accent colors while the
 * shape (radius, padding, spacing, font sizes) stays identical.
 */

const DEFAULT_TONE = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.14)',
    titleColor: '#ffffff',
}

export function IconBadge({ children, size = 'lg' }) {
    const pad = size === 'lg' ? '12px' : '8px'
    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(233,30,140,0.15)',
                borderRadius: '12px',
                padding: pad,
                marginBottom: size === 'lg' ? '0.6rem' : 0,
            }}
        >
            {children}
        </div>
    )
}

/**
 * @param {object} props
 * @param {import('react').ReactNode} [props.icon]
 * @param {import('react').ReactNode} [props.title]
 * @param {import('react').ReactNode} [props.actions] right-aligned header slot (buttons, badges, links)
 * @param {import('react').ReactNode} props.children
 * @param {object} [props.tone] override background/border/titleColor
 * @param {string} [props.id]
 * @param {string} [props.className] extra classes on the outer card
 * @param {string} [props.bodyClassName] extra classes on the content wrapper
 */
export default function SectionCard({
    icon,
    title,
    actions,
    children,
    tone = DEFAULT_TONE,
    id,
    className = '',
    bodyClassName = '',
}) {
    return (
        <section
            id={id}
            className={`insight-card interactive-card rounded-2xl p-4 sm:p-6 mb-6 ${className}`}
            style={{
                background: tone.background,
                border: tone.border,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
            }}
        >
            {(title || icon || actions) && (
                <div className="flex items-center gap-2 mb-5 flex-wrap">
                    {icon && <IconBadge size="sm">{icon}</IconBadge>}
                    {title && (
                        <h3
                            className="text-[1.05rem] font-semibold m-0 flex-1"
                            style={{ color: tone.titleColor }}
                        >
                            {title}
                        </h3>
                    )}
                    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
                </div>
            )}
            <div className={bodyClassName}>{children}</div>
        </section>
    )
}