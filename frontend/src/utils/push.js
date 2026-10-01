import api from '../services/api';

function base64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(b64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export function isSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function getVapidPublicKey() {
  // Via the axios instance, not fetch: the request interceptor attaches the CSRF
  // token and the response sets the csrf-token cookie the POST below needs.
  const res = await api.get('/push/public-key');
  return base64ToUint8Array(res.data.publicKey);
}

export async function ensureSubscription() {
  if (!isSupported()) return { supported: false };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { supported: true, permission };

  const registration = await navigator.serviceWorker.ready;
  let sub = await registration.pushManager.getSubscription();
  if (!sub) {
    const applicationServerKey = await getVapidPublicKey();
    sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  }

  const serialized = sub.toJSON();
  await api.post('/push/subscribe', {
    endpoint: serialized.endpoint,
    keys: { p256dh: serialized.keys.p256dh, auth: serialized.keys.auth }
  });
  return { supported: true, permission, active: true };
}

export async function unsubscribe() {
  if (!isSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    if (sub) {
      await api.post('/push/unsubscribe', { endpoint: sub.toJSON().endpoint });
      await sub.unsubscribe();
    }
    return true;
  } catch {
    return false;
  }
}

/** Whether this browser already holds a live subscription. */
export async function currentStatus() {
  if (!isSupported()) return { supported: false, active: false, permission: Notification.permission };
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    return { supported: true, active: Boolean(sub), permission: Notification.permission };
  } catch {
    return { supported: true, active: false, permission: Notification.permission };
  }
}