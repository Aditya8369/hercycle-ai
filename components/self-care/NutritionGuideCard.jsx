'use client'

import React from 'react';
import { useTranslations } from 'next-intl';
import { Salad, Ban } from 'lucide-react';

export default function NutritionGuideCard({ phaseKey }) {
    const t = useTranslations('SelfCare');

    const activePhase = ['menstrual', 'follicular', 'ovulation', 'luteal'].includes(phaseKey)
        ? phaseKey
        : 'general';

    const phaseLabel = t(`nutritionGuide.${activePhase}.label`);
    const eat1 = t(`nutritionGuide.${activePhase}.eat1`);
    const eat2 = t(`nutritionGuide.${activePhase}.eat2`);
    const eat3 = t(`nutritionGuide.${activePhase}.eat3`);
    const eat4 = t(`nutritionGuide.${activePhase}.eat4`);
    const limit1 = t(`nutritionGuide.${activePhase}.limit1`);
    const limit2 = t(`nutritionGuide.${activePhase}.limit2`);

    return (
        <section className="bg-white/5 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-2">
                <Salad className="w-6 h-6 text-emerald-300" />
                <h2 className="text-2xl font-bold text-white tracking-tight">
                    {t('nutritionGuideTitle')}
                </h2>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                    {t('currentPhase')}
                </span>
                <h3 className="text-lg font-semibold text-white/90">
                    {phaseLabel}
                </h3>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
                    <h4 className="text-sm font-semibold text-emerald-300 uppercase tracking-wide">
                        {t('foodsToEat')}
                    </h4>
                    <ul className="space-y-2 text-white/80 text-sm leading-relaxed list-none pl-0">
                        <li>{eat1}</li>
                        <li>{eat2}</li>
                        <li>{eat3}</li>
                        <li>{eat4}</li>
                    </ul>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
                    <h4 className="text-sm font-semibold text-red-300 uppercase tracking-wide flex items-center gap-1.5">
                        <Ban className="w-4 h-4" />
                        {t('foodsToLimit')}
                    </h4>
                    <ul className="space-y-2 text-white/80 text-sm leading-relaxed list-none pl-0">
                        <li>{limit1}</li>
                        <li>{limit2}</li>
                    </ul>
                </div>
            </div>
        </section>
    );
}