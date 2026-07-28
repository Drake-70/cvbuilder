import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useState, useRef, useEffect } from 'react';
import { setItem } from '../utils/storage';
import logoImg from '../assets/cvboost-logo.png';

const HIDE_HEADER_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

export default function Header() {
  const { t, i18n } = useTranslation('common');
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  if (HIDE_HEADER_PATHS.includes(location.pathname)) return null;

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'fr' : 'en';
    i18n.changeLanguage(newLang);
    setItem('lang', newLang);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
    setMenuOpen(false);
    setDropdownOpen(false);
  };

  const dropdownItems = user ? [
    { to: '/dashboard', label: t('nav.dashboard'), icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
    )},
    { to: '/cvs', label: t('nav.my_cvs'), icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
    )},
    { to: '/settings', label: t('nav.settings'), icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    )},
  ] : [];

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-surface-0/80 dark:bg-surface-900/80 border-b border-surface-200/60 dark:border-surface-700/60" role="banner">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5 no-underline group" aria-label="CVBoost Home">
            <img src={logoImg} alt="CVBoost" className="h-8 w-auto rounded-lg" />
          </Link>

          <nav className="hidden sm:flex items-center gap-1" aria-label="Main navigation">
            <button onClick={toggleLanguage} className="btn-ghost text-sm">
              {i18n.language === 'en' ? 'FR' : 'EN'}
            </button>
            <button
              onClick={toggleTheme}
              className="btn-ghost text-sm p-2"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>

            {user ? (
              <>
                <Link to="/pricing" className="btn-ghost text-sm no-underline">{t('nav.pricing')}</Link>
                <Link to="/about" className="btn-ghost text-sm no-underline">{t('nav.about')}</Link>
                <Link to="/contact" className="btn-ghost text-sm no-underline">{t('nav.contact')}</Link>
                {user.role === 'admin' && (
                  <Link to="/admin" className="btn-ghost text-sm no-underline text-rose-500 hover:text-rose-600">Admin</Link>
                )}
                <div className="w-px h-5 bg-surface-200 dark:bg-surface-700 mx-1" />

                {/* Account Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-2 p-1 pr-2 rounded-full hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors cursor-pointer"
                    aria-expanded={dropdownOpen}
                    aria-haspopup="true"
                  >
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-semibold overflow-hidden flex-shrink-0">
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        user.name?.charAt(0)?.toUpperCase()
                      )}
                    </div>
                    <span className="hidden lg:inline text-sm text-surface-700 dark:text-surface-300 max-w-[100px] truncate">{user.name}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-surface-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}>
                      <polyline points="6,9 12,15 18,9"/>
                    </svg>
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-surface-0 dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 shadow-xl py-1.5 animate-scale-in z-50">
                      <div className="px-3.5 py-2.5 border-b border-surface-100 dark:border-surface-700 mb-1">
                        <p className="text-sm font-semibold text-surface-900 dark:text-white truncate">{user.name}</p>
                        <p className="text-xs text-surface-400 truncate">{user.email}</p>
                      </div>
                      {dropdownItems.map((item) => (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700/50 no-underline transition-colors"
                        >
                          <span className="text-surface-400">{item.icon}</span>
                          {item.label}
                        </Link>
                      ))}
                      <div className="border-t border-surface-100 dark:border-surface-700 mt-1 pt-1">
                        <button
                          onClick={handleLogout}
                          className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 cursor-pointer transition-colors"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/>
                          </svg>
                          {t('logout')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link to="/pricing" className="btn-ghost text-sm no-underline">{t('nav.pricing')}</Link>
                <Link to="/about" className="btn-ghost text-sm no-underline">{t('nav.about')}</Link>
                <Link to="/contact" className="btn-ghost text-sm no-underline">{t('nav.contact')}</Link>
                <Link to="/login" className="btn-ghost text-sm no-underline">{t('login')}</Link>
                <Link to="/register" className="btn-primary text-sm no-underline ml-1 !py-2 !px-4">{t('register')}</Link>
              </>
            )}
          </nav>

          <div className="flex items-center gap-1 sm:hidden">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors cursor-pointer"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors cursor-pointer"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {menuOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </>
                ) : (
                  <>
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <line x1="3" y1="12" x2="21" y2="12"/>
                    <line x1="3" y1="18" x2="21" y2="18"/>
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="sm:hidden pb-4 animate-slide-up border-t border-surface-100 dark:border-surface-700 mt-1 pt-3 space-y-1" aria-label="Mobile navigation">
            <button onClick={toggleLanguage} className="block w-full text-left px-3 py-2 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 cursor-pointer">
              {i18n.language === 'en' ? 'Fran\u00e7ais' : 'English'}
            </button>
            {user ? (
              <>
                <div className="px-3 py-2 flex items-center gap-3 border-b border-surface-100 dark:border-surface-700 mb-1">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-sm font-semibold overflow-hidden flex-shrink-0">
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      user.name?.charAt(0)?.toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-surface-900 dark:text-white truncate">{user.name}</p>
                    <p className="text-xs text-surface-400 truncate">{user.email}</p>
                  </div>
                </div>
                <Link to="/dashboard" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 no-underline">
                  {t('nav.dashboard')}
                </Link>
                <Link to="/cvs" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 no-underline">
                  {t('nav.my_cvs')}
                </Link>
                <Link to="/pricing" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 no-underline">
                  {t('nav.pricing')}
                </Link>
                <Link to="/settings" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 no-underline">
                  {t('nav.settings')}
                </Link>
                {user.role === 'admin' && (
                  <Link to="/admin" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 no-underline">
                    Admin
                  </Link>
                )}
                <button onClick={handleLogout} className="block w-full text-left px-3 py-2 rounded-lg text-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 cursor-pointer">
                  {t('logout')}
                </button>
              </>
            ) : (
              <>
                <Link to="/pricing" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 no-underline">{t('nav.pricing')}</Link>
                <Link to="/about" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 no-underline">{t('nav.about')}</Link>
                <Link to="/contact" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 no-underline">{t('nav.contact')}</Link>
                <Link to="/login" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 no-underline">{t('login')}</Link>
                <Link to="/register" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm font-medium text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 no-underline">{t('register')}</Link>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
