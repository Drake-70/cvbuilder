import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function TermsPage() {
  const { t } = useTranslation('common');

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 no-underline mb-8">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15,18 9,12 15,6"/>
          </svg>
          {t('home')}
        </Link>

        <div className="prose-content">
          <h1 className="text-3xl font-bold text-surface-900 mb-2">{t('terms.title')}</h1>
          <p className="text-sm text-surface-400 mb-8">{t('terms.updated')}</p>

          <div className="space-y-8">
            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('terms.s1_h')}</h2>
              <p className="text-surface-600 leading-relaxed">{t('terms.s1_b')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('terms.s2_h')}</h2>
              <p className="text-surface-600 leading-relaxed">{t('terms.s2_b')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('terms.s3_h')}</h2>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li>{t('terms.s3_l1')}</li>
                <li>{t('terms.s3_l2')}</li>
                <li>{t('terms.s3_l3')}</li>
                <li>{t('terms.s3_l4')}</li>
                <li>{t('terms.s3_l5')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('terms.s4_h')}</h2>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li>{t('terms.s4_l1')}</li>
                <li>{t('terms.s4_l2')}</li>
                <li>{t('terms.s4_l3')}</li>
                <li>{t('terms.s4_l4')}</li>
                <li>{t('terms.s4_l5')}</li>
                <li>{t('terms.s4_l6')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('terms.s5_h')}</h2>
              <p className="text-surface-600 leading-relaxed mb-3">{t('terms.s5_b')}</p>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li>{t('terms.s5_l1')}</li>
                <li>{t('terms.s5_l2')}</li>
                <li>{t('terms.s5_l3')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('terms.s6_h')}</h2>
              <p className="text-surface-600 leading-relaxed">{t('terms.s6_b')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('terms.s7_h')}</h2>
              <p className="text-surface-600 leading-relaxed mb-3">{t('terms.s7_b')}</p>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li>{t('terms.s7_l1')}</li>
                <li>{t('terms.s7_l2')}</li>
                <li>{t('terms.s7_l3')}</li>
                <li>{t('terms.s7_l4')}</li>
                <li>{t('terms.s7_l5')}</li>
                <li>{t('terms.s7_l6')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('terms.s8_h')}</h2>
              <p className="text-surface-600 leading-relaxed">{t('terms.s8_b')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('terms.s9_h')}</h2>
              <p className="text-surface-600 leading-relaxed">{t('terms.s9_b')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('terms.s10_h')}</h2>
              <p className="text-surface-600 leading-relaxed">{t('terms.s10_b')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('terms.s11_h')}</h2>
              <p className="text-surface-600 leading-relaxed">{t('terms.s11_b')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('terms.s12_h')}</h2>
              <p className="text-surface-600 leading-relaxed">{t('terms.s12_b')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('terms.s13_h')}</h2>
              <p className="text-surface-600 leading-relaxed">
                {t('terms.s13_b')}{' '}
                <a href="mailto:legal@cvboost.cm" className="text-brand-600 hover:text-brand-700">legal@cvboost.cm</a>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
