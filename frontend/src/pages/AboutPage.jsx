import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import logoImg from '../assets/cvboost-logo.png';

export default function AboutPage() {
  const { t } = useTranslation('common');

  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="relative py-16 sm:py-24 px-4 bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-900 text-white overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-10 left-[10%] w-64 h-64 bg-white/5 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-10 right-[10%] w-80 h-80 bg-brand-400/10 rounded-full blur-3xl animate-float-delayed" />
        </div>
        <div className="max-w-4xl mx-auto text-center relative">
          <img src={logoImg} alt="CVBoost" className="h-12 w-auto mx-auto mb-6" />
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight mb-4">
            About CVBoost
          </h1>
          <p className="text-brand-100 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
            Empowering job seekers across Cameroon with AI-driven tools to craft professional, tailored CVs that get results.
          </p>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-16 sm:py-20 px-4" aria-labelledby="story-heading">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-sm font-semibold text-brand-600 uppercase tracking-wider mb-2">Our Story</p>
              <h2 id="story-heading" className="text-2xl sm:text-3xl font-bold text-surface-900 dark:text-white mb-4">
                Built for Cameroon&apos;s job market
              </h2>
              <div className="space-y-4 text-surface-600 dark:text-surface-400 leading-relaxed">
                <p>
                  Job hunting in Cameroon is tough. Generic CV templates don&apos;t capture local conventions,
                  most tools are English-only, and professional CV services cost more than many job seekers can afford.
                </p>
                <p>
                  CVBoost was built to change that. We combine AI technology with an understanding of both
                  Francophone and Anglophone CV conventions to deliver tailored, ATS-friendly documents at a fraction
                  of the cost.
                </p>
                <p>
                  Whether you&apos;re applying to a multinational in Douala, a local startup in Yaoundé, or an
                  international organization, CVBoost helps you present your experience in the best possible light.
                </p>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-brand-500/10 rounded-2xl blur-xl scale-105" />
              <div className="relative bg-surface-0 dark:bg-surface-800 rounded-2xl border border-surface-200 dark:border-surface-700 shadow-xl p-6 text-left">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-sm font-bold">JD</div>
                  <div>
                    <div className="font-bold text-surface-900 dark:text-white">Jean Dupont</div>
                    <div className="text-xs text-surface-400">Marketing Specialist</div>
                  </div>
                  <div className="ml-auto badge badge-emerald text-xs">ATS 94%</div>
                </div>
                <div className="space-y-2">
                  <div className="h-2.5 w-full bg-surface-100 dark:bg-surface-700 rounded-full" />
                  <div className="h-2.5 w-5/6 bg-surface-100 dark:bg-surface-700 rounded-full" />
                  <div className="h-2.5 w-4/5 bg-surface-100 dark:bg-surface-700 rounded-full" />
                </div>
                <div className="mt-4 flex gap-2">
                  <div className="h-6 w-16 bg-brand-50 dark:bg-brand-900/30 rounded-full text-xs flex items-center justify-center text-brand-600 font-medium">Digital</div>
                  <div className="h-6 w-14 bg-brand-50 dark:bg-brand-900/30 rounded-full text-xs flex items-center justify-center text-brand-600 font-medium">SEO</div>
                  <div className="h-6 w-20 bg-brand-50 dark:bg-brand-900/30 rounded-full text-xs flex items-center justify-center text-brand-600 font-medium">Analytics</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 sm:py-20 px-4 bg-surface-0 dark:bg-surface-800 border-y border-surface-100 dark:border-surface-700" aria-labelledby="values-heading">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-brand-600 uppercase tracking-wider mb-2">Our Values</p>
            <h2 id="values-heading" className="text-2xl sm:text-3xl font-bold text-surface-900 dark:text-white">What drives us</h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9,12 11,14 15,10"/>
                  </svg>
                ),
                title: 'Honesty',
                desc: 'AI rewrites your real experience — never fabricates achievements, numbers, or skills you don\'t have.'
              },
              {
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                ),
                title: 'Inclusivity',
                desc: 'Full French and English support with CV conventions that respect local and international standards.'
              },
              {
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                ),
                title: 'Accessibility',
                desc: 'Affordable pricing designed for the Cameroonian market. Professional CV tools shouldn\'t break the bank.'
              }
            ].map((v, i) => (
              <div key={i} className="card p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 mx-auto mb-4">
                  {v.icon}
                </div>
                <h3 className="text-lg font-bold text-surface-900 dark:text-white mb-2">{v.title}</h3>
                <p className="text-sm text-surface-500 dark:text-surface-400 leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-surface-900 dark:text-white mb-4">
            Ready to build your CV?
          </h2>
          <p className="text-surface-500 dark:text-surface-400 mb-8 max-w-md mx-auto">
            Join hundreds of Cameroonian job seekers using AI to land more interviews.
          </p>
          <Link to="/register" className="btn-primary text-base px-8 py-3.5 no-underline inline-block">
            {t('get_started')} &rarr;
          </Link>
        </div>
      </section>
    </div>
  );
}
