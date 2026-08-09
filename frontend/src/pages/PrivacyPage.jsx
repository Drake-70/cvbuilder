import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-bold text-surface-900 mb-2">{t('privacy.title')}</h1>
          <p className="text-sm text-surface-400 mb-8">{t('privacy.updated')}</p>

          <div className="space-y-8">
            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('privacy.s1_h')}</h2>
              <p className="text-surface-600 leading-relaxed">{t('privacy.s1_b')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('privacy.s2_h')}</h2>

              <h3 className="text-lg font-semibold text-surface-800 mb-2 mt-4">{t('privacy.s21_h')}</h3>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li>{t('privacy.s21_l1')}</li>
                <li>{t('privacy.s21_l2')}</li>
                <li>{t('privacy.s21_l3')}</li>
                <li>{t('privacy.s21_l4')}</li>
                <li>{t('privacy.s21_l5')}</li>
              </ul>

              <h3 className="text-lg font-semibold text-surface-800 mb-2 mt-4">{t('privacy.s22_h')}</h3>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li>{t('privacy.s22_l1')}</li>
                <li>{t('privacy.s22_l2')}</li>
                <li>{t('privacy.s22_l3')}</li>
                <li>{t('privacy.s22_l4')}</li>
                <li>{t('privacy.s22_l5')}</li>
              </ul>

              <h3 className="text-lg font-semibold text-surface-800 mb-2 mt-4">{t('privacy.s23_h')}</h3>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li>{t('privacy.s23_l1')}</li>
                <li>{t('privacy.s23_l2')}</li>
                <li>{t('privacy.s23_l3')}</li>
                <li>{t('privacy.s23_l4')}</li>
                <li>{t('privacy.s23_l5')}</li>
              </ul>

              <h3 className="text-lg font-semibold text-surface-800 mb-2 mt-4">{t('privacy.s24_h')}</h3>
              <p className="text-surface-600 leading-relaxed">{t('privacy.s24_b')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('privacy.s3_h')}</h2>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li><strong>{t('privacy.s3_l1_label')}</strong> {t('privacy.s3_l1_text')}</li>
                <li><strong>{t('privacy.s3_l2_label')}</strong> {t('privacy.s3_l2_text')}</li>
                <li><strong>{t('privacy.s3_l3_label')}</strong> {t('privacy.s3_l3_text')}</li>
                <li><strong>{t('privacy.s3_l4_label')}</strong> {t('privacy.s3_l4_text')}</li>
                <li><strong>{t('privacy.s3_l5_label')}</strong> {t('privacy.s3_l5_text')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('privacy.s4_h')}</h2>
              <p className="text-surface-600 leading-relaxed mb-3">{t('privacy.s4_b1')}</p>
              <p className="text-surface-600 leading-relaxed">{t('privacy.s4_b2')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('privacy.s5_h')}</h2>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li>{t('privacy.s5_l1')}</li>
                <li>{t('privacy.s5_l2')}</li>
                <li>{t('privacy.s5_l3')}</li>
                <li>{t('privacy.s5_l4')}</li>
                <li>{t('privacy.s5_l5')}</li>
                <li>{t('privacy.s5_l6')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('privacy.s6_h')}</h2>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li><strong>{t('privacy.s6_l1_label')}</strong> {t('privacy.s6_l1_text')}</li>
                <li><strong>{t('privacy.s6_l2_label')}</strong> {t('privacy.s6_l2_text')}</li>
                <li><strong>{t('privacy.s6_l3_label')}</strong> {t('privacy.s6_l3_text')}</li>
                <li><strong>{t('privacy.s6_l4_label')}</strong> {t('privacy.s6_l4_text')}</li>
                <li><strong>{t('privacy.s6_l5_label')}</strong> {t('privacy.s6_l5_text')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('privacy.s7_h')}</h2>
              <p className="text-surface-600 leading-relaxed mb-3">{t('privacy.s7_b')}</p>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li><strong>{t('privacy.s7_l1_label')}</strong> {t('privacy.s7_l1_text')}</li>
                <li><strong>{t('privacy.s7_l2_label')}</strong> {t('privacy.s7_l2_text')}</li>
                <li><strong>{t('privacy.s7_l3_label')}</strong> {t('privacy.s7_l3_text')}</li>
                <li><strong>{t('privacy.s7_l4_label')}</strong> {t('privacy.s7_l4_text')}</li>
                <li><strong>{t('privacy.s7_l5_label')}</strong> {t('privacy.s7_l5_text')}</li>
              </ul>
              <p className="text-surface-600 leading-relaxed mt-3">
                {t('privacy.s7_contact_b')}{' '}
                <a href="mailto:privacy@cvboost.cm" className="text-brand-600 hover:text-brand-700">privacy@cvboost.cm</a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('privacy.s8_h')}</h2>
              <p className="text-surface-600 leading-relaxed mb-3">{t('privacy.s8_b')}</p>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li><strong>{t('privacy.s8_l1_label')}</strong>{t('privacy.s8_l1_text')}</li>
                <li><strong>{t('privacy.s8_l2_label')}</strong>{t('privacy.s8_l2_text')}</li>
                <li><strong>{t('privacy.s8_l3_label')}</strong>{t('privacy.s8_l3_text')}</li>
              </ul>
              <p className="text-surface-600 leading-relaxed mt-3">{t('privacy.s8_b2')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('privacy.s9_h')}</h2>
              <p className="text-surface-600 leading-relaxed">{t('privacy.s9_b')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('privacy.s10_h')}</h2>
              <p className="text-surface-600 leading-relaxed">{t('privacy.s10_b')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('privacy.s11_h')}</h2>
              <p className="text-surface-600 leading-relaxed">{t('privacy.s11_b')}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">{t('privacy.s12_h')}</h2>
              <p className="text-surface-600 leading-relaxed">
                {t('privacy.s12_b')}{' '}
                <a href="mailto:privacy@cvboost.cm" className="text-brand-600 hover:text-brand-700">privacy@cvboost.cm</a>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
