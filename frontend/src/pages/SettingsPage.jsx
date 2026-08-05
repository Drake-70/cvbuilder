import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';

export default function SettingsPage() {
  const { t } = useTranslation('common');
  const { t: tAuth } = useTranslation('auth');
  const { user, fetchUser } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef();

  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [location, setLocation] = useState(user?.location || '');
  const [jobTitle, setJobTitle] = useState(user?.jobTitle || '');
  const [company, setCompany] = useState(user?.company || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || '');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNew, setConfirmNew] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [language, setLanguage] = useState(user?.preferredLanguage || 'en');

  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const hasProfileChanges = name !== (user?.name || '') || bio !== (user?.bio || '') ||
    phone !== (user?.phone || '') || location !== (user?.location || '') ||
    jobTitle !== (user?.jobTitle || '') || company !== (user?.company || '');

  const handleAvatarUpload = async (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Too Large', 'Image must be under 2MB.');
      return;
    }
    setUploadingAvatar(true);
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const res = await api.post('/auth/avatar', formData);
      setAvatarPreview(res.data.avatar);
      await fetchUser();
      toast.success('Updated', 'Profile photo updated.');
    } catch (err) {
      toast.error('Upload Failed', err.response?.data?.error || 'Could not upload image.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSavingProfile(true);
    try {
      await api.patch('/auth/me', { name: name.trim(), bio, phone, location, jobTitle, company });
      await fetchUser();
      toast.success('Saved', 'Profile updated.');
    } catch (err) {
      toast.error('Error', err.response?.data?.error || 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmNew) {
      toast.error('Mismatch', tAuth('passwords_mismatch'));
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Too Short', tAuth('password_too_short'));
      return;
    }
    setSavingPassword(true);
    try {
      await api.patch('/auth/me', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNew('');
      toast.success('Updated', 'Password changed.');
    } catch (err) {
      toast.error('Error', err.response?.data?.error || 'Failed to change password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSaveLanguage = async (val) => {
    setLanguage(val);
    setSavingLang(true);
    try {
      await api.patch('/auth/me', { preferredLanguage: val });
      await fetchUser();
      toast.success('Saved', 'Language updated.');
    } catch { /* silent */ } finally {
      setSavingLang(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await api.delete('/auth/account', { data: { password: deletePassword } });
      toast.success('Deleted', 'Your account has been permanently deleted.');
      window.location.href = '/';
    } catch (err) {
      toast.error('Error', err.response?.data?.error || 'Failed to delete account.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12 animate-slide-up" role="main">
      <p className="kicker mb-2">{t('settings')}</p>
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-surface-900 dark:text-white mb-2">Settings</h1>
      <p className="text-sm text-surface-500 dark:text-surface-400 mb-8">{t('settings_desc')}</p>

      {/* Profile Photo + Info */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-5 mb-6">
          <button
            onClick={() => fileRef.current?.click()}
            className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-2xl shadow-md overflow-hidden cursor-pointer group flex-shrink-0"
            title="Click to upload photo"
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => handleAvatarUpload(e.target.files[0])}
            />
            {avatarPreview ? (
              <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              user?.name?.charAt(0)?.toUpperCase() || '?'
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {uploadingAvatar ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              )}
            </div>
          </button>
          <div className="min-w-0">
            <p className="font-semibold text-surface-900 dark:text-white truncate">{user?.name}</p>
            <p className="text-sm text-surface-500 dark:text-surface-400 truncate">{user?.email}</p>
            <p className="text-xs text-surface-400 mt-1">JPEG, PNG, or WebP. Max 2MB.</p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="settings-name" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{tAuth('name')}</label>
              <input id="settings-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="Full name" />
            </div>
            <div>
              <label htmlFor="settings-jobTitle" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('job_title')}</label>
              <input id="settings-jobTitle" type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="input-field" placeholder="e.g. Software Engineer" />
            </div>
            <div>
              <label htmlFor="settings-company" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('company')}</label>
              <input id="settings-company" type="text" value={company} onChange={(e) => setCompany(e.target.value)} className="input-field" placeholder="e.g. MTN Cameroon" />
            </div>
            <div>
              <label htmlFor="settings-phone" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('phone')}</label>
              <input id="settings-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field" placeholder="+237 6XX XXX XXX" />
            </div>
            <div>
              <label htmlFor="settings-location" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('location')}</label>
              <input id="settings-location" type="text" value={location} onChange={(e) => setLocation(e.target.value)} className="input-field" placeholder="e.g. Douala, Cameroon" />
            </div>
          </div>
          <div>
            <label htmlFor="settings-bio" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('bio')}</label>
            <textarea id="settings-bio" value={bio} onChange={(e) => setBio(e.target.value)} className="input-field resize-none" rows={3} placeholder="A short bio about yourself..." maxLength={500} />
            <p className="text-xs text-surface-400 mt-1 text-right">{bio.length}/500</p>
          </div>
          <button type="submit" disabled={savingProfile || !name.trim() || !hasProfileChanges} className="btn-primary text-sm">
            {savingProfile ? t('loading') : t('save')}
          </button>
        </form>
      </div>

      {/* Password */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-bold text-surface-900 dark:text-white mb-4">{t('change_password')}</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label htmlFor="settings-currentPassword" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('current_password')}</label>
            <input id="settings-currentPassword" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="input-field" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" autoComplete="current-password" />
          </div>
          <div>
            <label htmlFor="settings-newPassword" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{tAuth('new_password')}</label>
            <input id="settings-newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input-field" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" autoComplete="new-password" />
          </div>
          <div>
            <label htmlFor="settings-confirmNew" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{tAuth('confirm_new_password')}</label>
            <input id="settings-confirmNew" type="password" value={confirmNew} onChange={(e) => setConfirmNew(e.target.value)} className="input-field" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" autoComplete="new-password" />
          </div>
          <button type="submit" disabled={savingPassword || !currentPassword || !newPassword || !confirmNew} className="btn-primary text-sm">
            {savingPassword ? t('loading') : t('save')}
          </button>
        </form>
      </div>

      {/* Language */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-bold text-surface-900 dark:text-white mb-4">{t('preferred_language')}</h2>
        <div className="flex gap-3">
          {['en', 'fr'].map(lang => (
            <button
              key={lang}
              onClick={() => handleSaveLanguage(lang)}
              className={`flex-1 py-3 rounded-xl text-sm font-medium cursor-pointer transition-all border ${
                language === lang
                  ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300'
                  : 'bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:border-surface-300'
              }`}
            >
              {lang === 'en' ? 'English' : 'Fran\u00e7ais'}
            </button>
          ))}
        </div>
      </div>

      {/* Subscription */}
      <div className="card p-6">
        <h2 className="text-lg font-bold text-surface-900 dark:text-white mb-2">{t('subscription')}</h2>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${user?.subscriptionStatus === 'active' ? 'bg-emerald-500' : 'bg-surface-300'}`} />
          <p className="text-sm text-surface-600 dark:text-surface-400">
            {user?.subscriptionStatus === 'active' ? t('active_subscription') : t('free_plan')}
          </p>
        </div>
        {user?.subscriptionStatus !== 'active' && (
          <a href="/pricing" className="btn-primary text-sm mt-4 inline-flex items-center gap-2 no-underline">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/>
            </svg>
            {t('upgrade_to_pro')}
          </a>
        )}
      </div>

      {/* Danger Zone */}
      <div className="card p-6 mt-6 border border-rose-200 dark:border-rose-800/30">
        <h2 className="text-lg font-bold text-rose-600 dark:text-rose-400 mb-2">{t('danger_zone', 'Danger Zone')}</h2>
        <p className="text-sm text-surface-500 dark:text-surface-400 mb-4">{t('delete_account_desc', 'Permanently delete your account and all data. This cannot be undone.')}</p>
        {!showDeleteConfirm ? (
          <button onClick={() => setShowDeleteConfirm(true)} className="px-4 py-2 rounded-xl text-sm font-medium text-rose-600 border border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-900/20 cursor-pointer transition-colors">
            {t('delete_account', 'Delete Account')}
          </button>
        ) : (
          <div className="space-y-3 animate-fade-in">
            {user?.hasPassword ? (
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="input-field border-rose-200 dark:border-rose-800"
                placeholder="Enter your password to confirm"
                autoComplete="current-password"
              />
            ) : (
              <p className="text-sm text-amber-600 dark:text-amber-400">Type your email to confirm: <strong>{user?.email}</strong></p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={deleting || (user?.passwordHash && !deletePassword)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 cursor-pointer transition-colors"
              >
                {deleting ? t('loading') : t('confirm_delete', 'Yes, Delete My Account')}
              </button>
              <button onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); }} className="btn-ghost text-sm">
                {t('cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
