import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import logoImg from '../assets/cvboost-logo.png';

gsap.registerPlugin(ScrollTrigger);

function GsapCounter({ target, suffix = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obj = { val: 0 };
    let ctr = gsap.to(obj, {
      val: target, duration: 2, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 90%' },
      onUpdate: () => { el.textContent = `${Math.floor(obj.val)}${suffix}`; }
    });
    return () => ctr.kill();
  }, [target, suffix]);
  return <span ref={ref}>0{suffix}</span>;
}

const FeatureIcons = {
  bilingual: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  ),
  mobile: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
    </svg>
  ),
  lock: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9,12 11,14 15,10"/>
    </svg>
  ),
  doc: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/>
    </svg>
  ),
  zap: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/>
    </svg>
  ),
  coin: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
};

export default function LandingPage() {
  const { t } = useTranslation('common');
  const { t: tTailor } = useTranslation('tailor');
  const heroRef = useRef(null);
  const stepsRef = useRef(null);
  const featuresRef = useRef(null);
  const statsRef = useRef(null);
  const ctaRef = useRef(null);
  const dashboardRef = useRef(null);
  const particlesRef = useRef(null);

  useEffect(() => {
    ScrollTrigger.refresh();
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('resize', refresh);
    return () => window.removeEventListener('resize', refresh);
  }, []);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from(hero.querySelector('[data-animate="badge"]'), { opacity: 0, y: -20, duration: 0.5 })
      .from(hero.querySelector('[data-animate="heading"]'), { opacity: 0, y: 40, duration: 0.7 }, '-=0.15')
      .from(hero.querySelector('[data-animate="desc"]'), { opacity: 0, y: 30, duration: 0.6 }, '-=0.3')
      .from(hero.querySelector('[data-animate="ctas"]'), { opacity: 0, y: 25, duration: 0.5 }, '-=0.25')
      .from(hero.querySelectorAll('[data-animate="orb"]'), { opacity: 0, scale: 0, duration: 1, stagger: 0.2, ease: 'back.out(2)' }, '-=0.3');
    gsap.from(hero.querySelectorAll('.hero-particle-dot'), {
      opacity: 0, scale: 0, duration: 1, stagger: 0.15, ease: 'back.out(3)',
      scrollTrigger: { trigger: hero, start: 'top 70%' }
    });
  }, []);

  useEffect(() => {
    const db = dashboardRef.current;
    if (!db) return;
    gsap.from(db.querySelector('.dashboard-inner'), {
      opacity: 0, y: 60, rotationX: 15, duration: 1.2, ease: 'power3.out',
      scrollTrigger: { trigger: db, start: 'top 80%' }
    });
    gsap.from(db.querySelectorAll('[data-animate="float-card"]'), {
      opacity: 0, y: 40, scale: 0.85, duration: 0.7, stagger: 0.2, ease: 'back.out(1.7)',
      scrollTrigger: { trigger: db, start: 'top 75%' }
    });
  }, []);

  useEffect(() => {
    const el = stepsRef.current;
    if (!el) return;
    gsap.from(el.querySelectorAll('[data-animate-step]'), {
      opacity: 0, y: 40, duration: 0.7, stagger: 0.15, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 80%' }
    });
  }, []);

  useEffect(() => {
    const el = featuresRef.current;
    if (!el) return;
    gsap.from(el.querySelectorAll('[data-animate-feature]'), {
      opacity: 0, y: 30, scale: 0.95, duration: 0.5, stagger: 0.08, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 85%' }
    });
  }, []);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    gsap.from(el.querySelectorAll('[data-animate-stat]'), {
      opacity: 0, y: 30, duration: 0.5, stagger: 0.12, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 85%' }
    });
  }, []);

  useEffect(() => {
    const el = ctaRef.current;
    if (!el) return;
    gsap.from(el, {
      opacity: 0, scale: 0.85, duration: 1, ease: 'elastic.out(1, 0.5)',
      scrollTrigger: { trigger: el, start: 'top 85%' }
    });
  }, []);

  useEffect(() => {
    gsap.from('.testimonial-card', {
      opacity: 0, y: 30, scale: 0.95, duration: 0.6, stagger: 0.12, ease: 'power2.out',
      scrollTrigger: { trigger: '.testimonial-card', start: 'top 85%' }
    });
  }, []);

  useEffect(() => {
    const el = dashboardRef.current;
    if (!el) return;
    const handleMouse = (e) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      gsap.to(el.querySelector('.dashboard-inner'), {
        rotationY: x * 15, rotationX: -y * 15, transformPerspective: 1200,
        duration: 0.6, ease: 'power2.out'
      });
    };
    const handleLeave = () => {
      gsap.to(el.querySelector('.dashboard-inner'), {
        rotationY: 6, rotationX: -3, duration: 0.8, ease: 'elastic.out(1, 0.3)'
      });
    };
    el.addEventListener('mousemove', handleMouse);
    el.addEventListener('mouseleave', handleLeave);
    return () => {
      el.removeEventListener('mousemove', handleMouse);
      el.removeEventListener('mouseleave', handleLeave);
    };
  }, []);

  return (
    <div className="overflow-hidden">
      {/* Hero Section */}
      <section ref={heroRef} className="relative pt-16 pb-20 sm:pt-24 sm:pb-28 px-4" aria-labelledby="hero-heading">
        <div ref={particlesRef} className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="hero-particle orb absolute -top-40 -right-40 w-80 h-80 bg-brand-200/30 rounded-full blur-3xl dark:bg-brand-900/20" data-animate="orb" />
          <div className="hero-particle orb absolute -bottom-20 -left-20 w-60 h-60 bg-brand-100/40 rounded-full blur-3xl dark:bg-brand-800/10" data-animate="orb" />
          <div className="hero-particle-dot absolute top-32 left-[15%] w-2 h-2 rounded-full bg-brand-400/40" />
          <div className="hero-particle-dot absolute top-48 right-[20%] w-3 h-3 rounded-full bg-brand-300/30" />
          <div className="hero-particle-dot absolute bottom-32 left-[30%] w-2 h-2 rounded-full bg-brand-500/20" />
          <div className="hero-particle-dot absolute top-20 right-[35%] w-1.5 h-1.5 rounded-full bg-brand-400/30" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative">
          <div data-animate="badge" className="inline-flex items-center gap-2 badge badge-brand mb-6" role="status">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" aria-hidden="true" />
            AI-Powered CV Tailoring
          </div>

          <h1 id="hero-heading" data-animate="heading" className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-surface-900 dark:text-white leading-[1.1] tracking-tight mb-6">
            {t('tagline')}
          </h1>

          <p data-animate="desc" className="text-lg sm:text-xl text-surface-500 dark:text-surface-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            {t('description')}
          </p>

          <div data-animate="ctas" className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/register" className="btn-primary text-base px-8 py-3.5 no-underline w-full sm:w-auto text-center">
              {t('get_started')}
              <svg className="inline-block ml-2 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12,5 19,12 12,19"/>
              </svg>
            </Link>
            <Link to="/login" className="btn-secondary text-base no-underline w-full sm:w-auto text-center">
              {t('login')}
            </Link>
          </div>
        </div>
      </section>

      {/* 3D Dashboard Preview */}
      <section ref={dashboardRef} className="py-12 sm:py-16 px-4 relative" aria-label="Dashboard preview">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-sm font-semibold text-brand-600 uppercase tracking-wider mb-2">Your Command Center</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-surface-900 dark:text-white">Everything you need, one dashboard</h2>
          </div>

          <div className="perspective-container">
            <div className="relative">
              {/* Glow orbs behind the dashboard */}
              <div className="absolute -top-20 left-1/4 w-64 h-64 bg-brand-400/20 rounded-full blur-3xl glow-orb pointer-events-none" aria-hidden="true" />
              <div className="absolute -bottom-16 right-1/4 w-48 h-48 bg-indigo-400/15 rounded-full blur-3xl glow-orb-delayed pointer-events-none" aria-hidden="true" />

              {/* Main dashboard frame */}
              <div className="dashboard-3d dashboard-inner shadow-3d rounded-2xl bg-surface-0 dark:bg-surface-800 border border-surface-200/80 dark:border-surface-700/80 overflow-hidden">
                {/* Browser chrome */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-50 dark:bg-surface-800/80 border-b border-surface-200/60 dark:border-surface-700/60">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="h-5 bg-surface-200/80 dark:bg-surface-700/60 rounded-md flex items-center px-3 max-w-xs">
                      <span className="text-[10px] text-surface-400 dark:text-surface-500 font-mono">cvboost.cm/dashboard</span>
                    </div>
                  </div>
                </div>

                {/* Dashboard content */}
                <div className="p-4 sm:p-6 space-y-4">
                  {/* Top row: User greeting + quick actions */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">JD</div>
                    <div>
                      <div className="h-2.5 w-28 bg-surface-200 dark:bg-surface-600 rounded-full" />
                      <div className="h-2 w-20 bg-surface-100 dark:bg-surface-700 rounded-full mt-1.5" />
                    </div>
                  </div>

                  {/* Quick action cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="card-3d p-3 rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-500/5 dark:to-indigo-500/5 border border-blue-200/50 dark:border-blue-800/30">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-2 shadow-sm">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/>
                        </svg>
                      </div>
                      <div className="h-2 w-16 bg-surface-200 dark:bg-surface-600 rounded-full" />
                      <div className="h-1.5 w-24 bg-surface-100 dark:bg-surface-700 rounded-full mt-1.5" />
                    </div>
                    <div className="card-3d p-3 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 dark:from-amber-500/5 dark:to-orange-500/5 border border-amber-200/50 dark:border-amber-800/30">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-2 shadow-sm">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </div>
                      <div className="h-2 w-14 bg-surface-200 dark:bg-surface-600 rounded-full" />
                      <div className="h-1.5 w-20 bg-surface-100 dark:bg-surface-700 rounded-full mt-1.5" />
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { color: 'from-brand-500 to-brand-600', value: '12' },
                      { color: 'from-emerald-400 to-emerald-600', value: '8' },
                      { color: 'from-surface-500 to-surface-600', value: 'Pro' }
                    ].map((s, i) => (
                      <div key={i} className="card-3d-back p-2.5 rounded-xl bg-surface-50 dark:bg-surface-700/50 border border-surface-100 dark:border-surface-700 text-center">
                        <div className={`text-base font-bold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>{s.value}</div>
                        <div className="h-1.5 w-10 bg-surface-200 dark:bg-surface-600 rounded-full mx-auto mt-1" />
                      </div>
                    ))}
                  </div>

                  {/* Document list items */}
                  <div className="space-y-2">
                    {[
                      { title: 'Marketing Manager', badge: 'ATS 94%', color: 'emerald' },
                      { title: 'Software Developer', badge: 'Pending', color: 'amber' },
                      { title: 'Project Coordinator', badge: 'Downloaded', color: 'brand' }
                    ].map((doc, i) => (
                      <div key={i} className={`card-3d-back flex items-center gap-3 p-3 rounded-xl bg-surface-50 dark:bg-surface-700/40 border border-surface-100 dark:border-surface-700/60 ${i === 0 ? '' : 'opacity-70'}`}>
                        <div className="w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand-600">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/>
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="h-2 w-28 bg-surface-200 dark:bg-surface-600 rounded-full" />
                          <div className="h-1.5 w-16 bg-surface-100 dark:bg-surface-700 rounded-full mt-1.5" />
                        </div>
                        <div className={`badge badge-${doc.color} text-[9px]`}>{doc.badge}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Floating 3D elements */}
              <div data-animate="float-card" className="absolute -top-6 -right-4 sm:-right-10 float-3d pointer-events-none" aria-hidden="true">
                <div className="card-3d bg-surface-0 dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 shadow-xl p-3 w-36 sm:w-44">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-brand-400 to-brand-600" />
                    <div className="h-2 w-16 bg-surface-200 dark:bg-surface-600 rounded-full" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-1.5 w-full bg-surface-100 dark:bg-surface-700 rounded-full" />
                    <div className="h-1.5 w-4/5 bg-surface-100 dark:bg-surface-700 rounded-full" />
                    <div className="h-1.5 w-3/5 bg-surface-100 dark:bg-surface-700 rounded-full" />
                  </div>
                  <div className="mt-2 flex gap-1">
                    <div className="h-4 w-10 bg-brand-50 dark:bg-brand-900/30 rounded-full" />
                    <div className="h-4 w-8 bg-brand-50 dark:bg-brand-900/30 rounded-full" />
                  </div>
                  <div className="absolute -top-2 -right-2 badge badge-emerald text-[8px] shadow-lg">ATS 94%</div>
                </div>
              </div>

              <div data-animate="float-card" className="absolute -bottom-4 -left-3 sm:-left-8 float-3d-delayed pointer-events-none" aria-hidden="true">
                <div className="card-3d bg-surface-0 dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 shadow-xl p-3 w-32 sm:w-40">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-4 h-4 rounded bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20,6 9,17 4,12"/></svg>
                    </div>
                    <div className="h-2 w-14 bg-surface-200 dark:bg-surface-600 rounded-full" />
                  </div>
                  <div className="flex gap-1 mt-1">
                    <div className="h-1.5 flex-1 bg-emerald-400 rounded-full" />
                    <div className="h-1.5 flex-1 bg-emerald-400 rounded-full" />
                    <div className="h-1.5 flex-1 bg-emerald-400 rounded-full" />
                    <div className="h-1.5 flex-1 bg-emerald-200 dark:bg-emerald-800 rounded-full" />
                  </div>
                  <div className="h-1.5 w-20 bg-surface-100 dark:bg-surface-700 rounded-full mt-2" />
                </div>
              </div>

              <div data-animate="float-card" className="absolute top-1/2 -right-6 sm:-right-14 float-3d-slow pointer-events-none hidden sm:block" aria-hidden="true">
                <div className="bg-surface-0 dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 shadow-lg p-2.5 w-28">
                  <div className="text-[9px] font-bold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-1">Interview Prep</div>
                  <div className="flex gap-1 mb-1.5">
                    {[1,2,3,4,5].map(s => (
                      <div key={s} className={`w-2.5 h-2.5 rounded-sm ${s <= 4 ? 'bg-brand-400' : 'bg-surface-200 dark:bg-surface-600'}`} />
                    ))}
                  </div>
                  <div className="h-1.5 w-full bg-surface-100 dark:bg-surface-700 rounded-full" />
                  <div className="h-1.5 w-3/4 bg-surface-100 dark:bg-surface-700 rounded-full mt-1" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section ref={stepsRef} className="py-16 sm:py-20 px-4 bg-surface-0 dark:bg-surface-800 border-y border-surface-100 dark:border-surface-700" aria-labelledby="how-it-works-heading">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-brand-600 uppercase tracking-wider mb-2">How it works</p>
            <h2 id="how-it-works-heading" className="text-2xl sm:text-3xl font-bold text-surface-900 dark:text-white">Three steps to your dream job</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-12 left-[20%] right-[20%] h-px bg-gradient-to-r from-brand-200 via-brand-400 to-brand-200 dark:from-brand-800 dark:via-brand-500 dark:to-brand-800" />

            {[
              {
                num: '01',
                title: tTailor('upload_cv'),
                desc: 'Upload your existing CV or build one from scratch with our guided questionnaire.',
                color: 'from-blue-500 to-indigo-600',
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17,8 12,3 7,8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                )
              },
              {
                num: '02',
                title: tTailor('job_description'),
                desc: 'Paste the job posting you want to apply for. AI analyzes the requirements instantly.',
                color: 'from-amber-500 to-orange-600',
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                  </svg>
                )
              },
              {
                num: '03',
                title: tTailor('download_docx'),
                desc: 'Get a polished, ATS-friendly CV and cover letter ready to send to employers.',
                color: 'from-emerald-500 to-green-600',
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22,4 12,14.01 9,11.01"/>
                  </svg>
                )
              }
            ].map((step, i) => (
              <div
                key={i}
                data-animate-step
                className="relative text-center"
              >
                <div className={`relative mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center text-white shadow-lg mb-5 z-10`}>
                  {step.icon}
                </div>
                <div className="text-xs font-bold text-surface-300 dark:text-surface-500 uppercase tracking-widest mb-2">{step.num}</div>
                <h3 className="text-lg font-bold text-surface-900 dark:text-white mb-2">{step.title}</h3>
                <p className="text-sm text-surface-500 dark:text-surface-400 leading-relaxed max-w-xs mx-auto">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section ref={statsRef} className="py-16 sm:py-20 px-4" aria-labelledby="stats-heading">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { value: 500, suffix: '+', label: 'CVs Tailored' },
              { value: 98, suffix: '%', label: 'Satisfaction' },
              { value: 2, suffix: 'min', label: 'Avg. Time' },
              { value: 3, suffix: 'x', label: 'More Interviews' }
            ].map((stat, i) => (
              <div key={i} data-animate-stat className="text-center p-6 rounded-2xl bg-surface-0 dark:bg-surface-800 border border-surface-100 dark:border-surface-700">
                <div className="text-3xl sm:text-4xl font-extrabold text-brand-600 mb-1">
                  <GsapCounter target={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-sm text-surface-500 dark:text-surface-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section ref={featuresRef} className="py-16 sm:py-20 px-4 bg-surface-0 dark:bg-surface-800 border-y border-surface-100 dark:border-surface-700" aria-labelledby="features-heading">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-brand-600 uppercase tracking-wider mb-2">Why CVBoost?</p>
            <h2 id="features-heading" className="text-2xl sm:text-3xl font-bold text-surface-900 dark:text-white">Built for Cameroon&apos;s job market</h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: FeatureIcons.bilingual, title: 'Bilingual', desc: 'Full French and English support. CV conventions respect local expectations.' },
              { icon: FeatureIcons.mobile, title: 'Mobile-first', desc: 'Designed for phones. Works smoothly even on slower connections.' },
              { icon: FeatureIcons.lock, title: 'No fabrication', desc: 'AI rewrites your real experience. Never invents fake achievements.' },
              { icon: FeatureIcons.doc, title: 'ATS-friendly', desc: 'Clean .docx output that passes Applicant Tracking Systems.' },
              { icon: FeatureIcons.zap, title: 'Instant results', desc: 'Tailored CV and cover letter in seconds, not hours.' },
              { icon: FeatureIcons.coin, title: 'Affordable', desc: 'Pay per document or subscribe for unlimited tailoring.' }
            ].map((f, i) => (
              <div key={i} data-animate-feature className="card p-5">
                <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 mb-3">
                  {f.icon}
                </div>
                <h3 className="font-bold text-surface-900 dark:text-white mb-1">{f.title}</h3>
                <p className="text-sm text-surface-500 dark:text-surface-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial / Social Proof */}
      <section className="py-16 sm:py-20 px-4" aria-labelledby="proof-heading">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold text-brand-600 uppercase tracking-wider mb-2">Trusted by job seekers</p>
          <h2 id="proof-heading" className="text-2xl sm:text-3xl font-bold text-surface-900 dark:text-white mb-10">What our users say</h2>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { quote: 'Got 3 interview calls in one week after tailoring my CV with CVBoost!', name: 'Marie N.', role: 'Marketing Manager' },
              { quote: 'The AI actually understood my experience and made it sound professional. Amazing.', name: 'Paul K.', role: 'Software Developer' },
              { quote: 'Finally a CV tool made for Cameroon. The bilingual support is exactly what I needed.', name: 'Aimée T.', role: 'Project Coordinator' }
            ].map((test, i) => (
              <div key={i} className="testimonial-card card p-5 text-left">
                <div className="flex gap-0.5 mb-3">
                  {[1,2,3,4,5].map(s => (
                    <svg key={s} width="14" height="14" viewBox="0 0 24 24" fill="var(--color-brand-400)" stroke="none">
                      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
                    </svg>
                  ))}
                </div>
                <p className="text-sm text-surface-600 dark:text-surface-300 leading-relaxed mb-4">&ldquo;{test.quote}&rdquo;</p>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-semibold">
                    {test.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-surface-900 dark:text-white">{test.name}</div>
                    <div className="text-xs text-surface-400 dark:text-surface-500">{test.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section ref={ctaRef} className="py-16 sm:py-20 px-4" aria-labelledby="cta-heading">
        <div className="max-w-3xl mx-auto">
          <div className="card bg-gradient-to-br from-brand-600 to-brand-800 border-0 p-8 sm:p-12 text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-10" aria-hidden="true">
              <div className="absolute top-0 right-0 w-40 h-40 bg-white rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl animate-float" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-white rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl animate-float-delayed" />
            </div>
            <div className="relative">
              <h2 id="cta-heading" className="text-2xl sm:text-3xl font-bold text-white mb-3">Ready to stand out?</h2>
              <p className="text-brand-100 mb-8 max-w-md mx-auto">
                Join job seekers using AI to craft the perfect CV. Get started in under 2 minutes.
              </p>
              <Link to="/register" className="inline-block bg-white text-brand-700 px-8 py-3.5 rounded-xl font-bold hover:bg-brand-50 transition-all duration-200 no-underline shadow-lg hover:shadow-xl hover:scale-105 active:scale-[0.98]">
                {t('get_started')} &rarr;
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-surface-100 dark:border-surface-700 bg-surface-0 dark:bg-surface-900" role="contentinfo">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-surface-400">
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="CVBoost" className="h-5 w-auto" />
            <span className="font-semibold text-surface-600 dark:text-surface-300">CVBoost</span>
            <span>&copy; {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/pricing" className="hover:text-surface-600 dark:hover:text-surface-300 no-underline text-surface-400">Pricing</Link>
            <Link to="/about" className="hover:text-surface-600 dark:hover:text-surface-300 no-underline text-surface-400">About</Link>
            <Link to="/contact" className="hover:text-surface-600 dark:hover:text-surface-300 no-underline text-surface-400">Contact</Link>
            <Link to="/terms" className="hover:text-surface-600 dark:hover:text-surface-300 no-underline text-surface-400">Terms</Link>
            <Link to="/privacy" className="hover:text-surface-600 dark:hover:text-surface-300 no-underline text-surface-400">Privacy</Link>
            <Link to="/login" className="hover:text-surface-600 dark:hover:text-surface-300 no-underline text-surface-400">Log In</Link>
            <Link to="/register" className="hover:text-surface-600 dark:hover:text-surface-300 no-underline text-surface-400">Sign Up</Link>
          </div>
          <p>Made for job seekers in Cameroon</p>
        </div>
      </footer>
    </div>
  );
}
