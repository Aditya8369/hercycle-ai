import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'

export default function FeaturesSection({ activeLang }) {
  const t = useTranslations('features')
  const locale = useLocale()

  return (
    <div className="pb-12 md:pb-16">
      <h2 className="sec-head">{t('title')}</h2>
      <div className="grid-3">
        <Link href={`/${locale}/track`} className="feat-card glass-dim">
          <div className="feat-icon">📅</div>
          <h4>{t('feat1Title')}</h4>
          <p>{t('feat1Desc')}</p>
          <span className="feat-arrow">→</span>
        </Link>
        <Link href={`/${locale}#daily-log-section`} className="feat-card glass-dim">
          <div className="feat-icon">🔮</div>
          <h4>{t('feat2Title')}</h4>
          <p>{t('feat2Desc')}</p>
          <span className="feat-arrow">→</span>
        </Link>
        <Link href={`/${locale}#pcod-risk-section`} className="feat-card glass-dim">
          <div className="feat-icon">🩺</div>
          <h4>{t('feat3Title')}</h4>
          <p>{t('feat3Desc')}</p>
          <span className="feat-arrow">→</span>
        </Link>
      </div>
    </div>
  );
}