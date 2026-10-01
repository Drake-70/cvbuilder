import { useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { ensureSubscription, unsubscribe, currentStatus, isSupported } from '../utils/push';
import api from '../services/api';

/**
 * Push opt-in control.
 *
 * The permission prompt is only ever raised from this explicit toggle, never on
 * page load: browsers ignore (and penalise sites for) prompts that appear
 * without a user gesture, so asking eagerly means never being able to ask again.
 */
export default function PushNotificationCard() {
  const { toast } = useToast();
  const [supported, setSupported] = useState(true);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupported()) {
      setSupported(false);
      return;
    }
    currentStatus().then((s) => setActive(s.active));
  }, []);

  const handleEnable = async () => {
    setBusy(true);
    try {
      const result = await ensureSubscription();
      if (!result.supported) {
        setSupported(false);
      } else if (result.permission !== 'granted') {
        toast.error(
          'Notifications blocked',
          'Your browser is blocking notifications for this site. Allow them in your browser settings, then try again.'
        );
      } else {
        setActive(true);
        toast.success('Push notifications on', 'You will be notified when new jobs match your alerts.');
        // Confirms the whole path end to end: VAPID auth and push service
        // reachability, without waiting for a real scrape to match something.
        api.post('/push/test', {}).catch(() => {});
      }
    } catch (err) {
      const message = err.response?.data?.error || 'Could not enable notifications.';
      toast.error('Setup failed', message);
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    try {
      await unsubscribe();
      setActive(false);
      toast.success('Push notifications off');
    } finally {
      setBusy(false);
    }
  };

  if (!supported) return null;

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-surface-900 dark:text-white">Push notifications</p>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
            Get alerted on this device when new jobs match your alerts, even when the
            app is closed. You can still manage alerts by email.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label="Toggle push notifications"
          onClick={active ? handleDisable : handleEnable}
          disabled={busy}
          className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 cursor-pointer disabled:opacity-60 ${
            active ? 'bg-brand-600' : 'bg-surface-300 dark:bg-surface-700'
          }`}
        >
          <span
            className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
              active ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}