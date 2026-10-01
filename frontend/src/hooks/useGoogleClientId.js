import { useEffect, useState } from 'react';
import { getGoogleClientId } from '../utils/runtimeConfig';

/**
 * The Google OAuth client ID, or null while loading / when unconfigured.
 *
 * Resolved at runtime rather than from import.meta.env because VITE_* values are
 * inlined at build time, and on Render's Docker runtime the frontend build runs
 * inside `docker build` where env vars are not present. The build-time value is
 * still used as a fallback for local dev.
 *
 * `ready` distinguishes "still fetching" from "not configured", so callers do
 * not briefly render an empty gap where the button is about to appear.
 */
export default function useGoogleClientId() {
  const [clientId, setClientId] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getGoogleClientId()
      .then((id) => {
        if (cancelled) return;
        setClientId(id);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { clientId, ready, enabled: ready && Boolean(clientId) };
}