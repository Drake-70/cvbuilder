let initialized = false;
let scriptLoaded = false;
let latestCallback = null;

/**
 * Safely initialize Google Identity Services and render a Sign-In button.
 * Handles script loading, double-init guard, container sizing, and stale callbacks.
 *
 * @param {object} options
 * @param {string} options.clientId - Google OAuth client ID
 * @param {(credential: string) => void} options.onCredential - Callback with the ID token
 * @param {React.RefObject} options.buttonRef - Ref to the container div for the button
 */
export function initGoogleSignIn({ clientId, onCredential, buttonRef }) {
  if (!clientId || !buttonRef?.current) return;

  // Always track the latest callback so the initialized handler never goes stale
  latestCallback = onCredential;

  const render = () => {
    if (!window.google?.accounts?.id || !buttonRef.current) return;

    if (!initialized) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => latestCallback?.(response.credential),
        auto_select: false
      });
      initialized = true;
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
  };

  if (window.google?.accounts?.id) {
    render();
    return;
  }

  if (scriptLoaded) {
    // Script already appended but GIS not yet ready — render will fire on load
    // Just re-render if GIS has now loaded
    if (window.google?.accounts?.id) render();
    return;
  }

  scriptLoaded = true;
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.onload = render;
  document.head.appendChild(script);
}
