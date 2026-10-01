let initializedClientId = null;
let scriptPromise = null;

/**
 * The most recent render target. Kept at module scope because the GIS script is
 * loaded once but Login and Register mount/unmount independently: if the user
 * navigates while the script is still loading, the button must bind to the page
 * that is actually on screen, not to a detached node from the previous one.
 */
let latest = { clientId: null, onCredential: null, onError: null, buttonRef: null };

function paint() {
  const { clientId, buttonRef, onError } = latest;
  if (!clientId || !window.google?.accounts?.id || !buttonRef?.current) return false;

  if (initializedClientId !== clientId) {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response?.error) {
          latest.onError?.(response.error);
          return;
        }
        latest.onCredential?.(response.credential);
      },
      auto_select: false,
      ux_mode: 'redirect',
      login_uri: `${window.location.origin}/api/auth/google-redirect`
    });
    initializedClientId = clientId;
  }

  // Clear any existing button to prevent duplicates
  buttonRef.current.innerHTML = '';

  window.google.accounts.id.renderButton(buttonRef.current, {
    theme: 'outline',
    size: 'large',
    width: 320,
    text: 'continue_with',
    shape: 'rectangular'
  });

  // GIS reports most failures (unauthorised origin, blocked storage, consent
  // errors) asynchronously and leaves an empty container. Report that rather
  // than showing a silent gap where the button should be.
  setTimeout(() => {
    if (buttonRef.current && !buttonRef.current.hasChildNodes()) {
      onError?.('gsi_button_not_rendered');
      console.warn(
        '[google] The Sign-In button did not render. The OAuth client may not ' +
        'authorize this origin, or the Google Identity Services script was blocked.'
      );
    }
  }, 2000);

  return true;
}

/**
 * Safely initialize Google Identity Services and render a Sign-In button.
 * Handles script loading, double-init guard, container sizing, stale callbacks,
 * and navigation between the login and register pages.
 *
 * @param {object} options
 * @param {string} options.clientId - Google OAuth client ID
 * @param {(credential: string) => void} options.onCredential - Callback with the ID token
 * @param {(error: string) => void} [options.onError] - Callback with a GIS error string
 * @param {React.RefObject} options.buttonRef - Ref to the container div for the button
 */
export function initGoogleSignIn({ clientId, onCredential, onError, buttonRef }) {
  if (!clientId || !buttonRef?.current) return;

  latest = { clientId, onCredential, onError, buttonRef };

  if (window.google?.accounts?.id) {
    paint();
    return;
  }

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('gsi_script_load_failed'));
      document.head.appendChild(script);
    }).catch((err) => {
      scriptPromise = null; // allow a later retry (e.g. after the ad blocker is off)
      latest.onError?.(err.message);
      console.warn(
        '[google] Failed to load Google Identity Services. It may be blocked ' +
        'by an ad blocker, tracking prevention, or a network filter.'
      );
      throw err;
    });
  }

  scriptPromise.then(() => paint()).catch(() => {});
}
