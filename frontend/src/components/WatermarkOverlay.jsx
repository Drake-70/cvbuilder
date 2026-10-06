/**
 * The free-preview overlay: the diagonal label plus the upgrade hint.
 *
 * Extracted from CVPreview because the cover letter is a document too, and it
 * was rendering with none of this. The CV beside it carried the overlay while
 * the letter showed plain readable text, so an out-of-credits preview looked
 * fully paid for right up until the download came back watermarked. Two
 * documents, one treatment -- and one place to define it, so the label, the
 * hint, and the `aria-hidden` cannot drift apart between them again.
 *
 * `pointer-events: none` keeps the text underneath selectable, which matches
 * what the CV preview already did; this is an upsell, not a lock.
 *
 * The label and hint default to the same strings the backend stamps into the
 * downloaded file, so an untranslated caller still says the same thing the
 * document says. See the drift guards in backend/tests/documentController.test.js.
 *
 * Requires its positioned ancestor: `.cv-watermark` is `position: absolute;
 * inset: 0`, so it fills whatever `position: relative` container it sits in.
 */
export default function WatermarkOverlay({ language = 'en', label = '', hint = '' }) {
  const isFr = language === 'fr';

  return (
    <div className="cv-watermark" aria-hidden="true">
      <div className="cv-watermark-label">
        {label || (isFr ? 'APERÇU GRATUIT' : 'FREE PREVIEW')}
      </div>
      <div className="cv-watermark-hint">
        {hint || (isFr
          ? 'Passez à Pro pour télécharger la version finale'
          : 'Upgrade to Pro to download the clean version')}
      </div>
    </div>
  );
}
