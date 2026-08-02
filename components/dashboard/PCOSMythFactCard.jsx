'use client'

import { useTranslations } from 'next-intl'
import { Lightbulb, X, Check } from 'lucide-react'

const TOTAL_PAIRS = 7

function getDailyIndex(total) {
    const now = new Date()
    const startOfYear = new Date(now.getFullYear(), 0, 0)
    const dayOfYear = Math.floor((now - startOfYear) / 86400000)
    return (dayOfYear % total) + 1
}

export default function PCOSMythFactCard() {
    const t = useTranslations('pcosMythFact')
    const index = getDailyIndex(TOTAL_PAIRS)

    return (
        <section className="w-full mb-8">
            <div className="flex items-center gap-2 mb-3 px-1">
                <Lightbulb className="w-5 h-5 text-amber-300" />
                <h2 className="text-xl font-bold text-white tracking-tight">
                    {t('title')}
                </h2>
            </div>

            <div className="w-full rounded-3xl bg-gradient-to-r from-purple-950/40 via-fuchsia-950/30 to-pink-950/40 border border-white/10 p-6 shadow-2xl backdrop-blur-xl">
                <div className="flex items-start gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-400/40 flex items-center justify-center shrink-0">
                        <X className="w-4 h-4 text-red-300" />
                    </div>
                    <div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-red-300">
                            {t('mythLabel')}
                        </span>
                        <p className="text-white text-base leading-relaxed mt-1">
                            {t(`myth${index}`)}
                        </p>
                    </div>
                </div>

                <div className="border-t border-white/10 my-4"></div>

                <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shrink-0">
                        <Check className="w-4 h-4 text-emerald-300" />
                    </div>
                    <div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                            {t('factLabel')}
                        </span>
                        <p className="text-white text-base leading-relaxed mt-1">
                            {t(`fact${index}`)}
                        </p>
                    </div>
                </div>

                <div className="border-t border-white/10 mt-5 pt-4">
                    <p className="text-white/40 text-[11px]">
                        {t('disclaimer')}
                    </p>
                </div>
            </div>
        </section>
    )
}