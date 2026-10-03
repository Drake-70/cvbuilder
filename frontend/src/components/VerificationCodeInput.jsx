import { useEffect, useRef } from 'react';

// Kept in sync with CODE_LENGTH in backend/services/verificationCode.js. The
// server is authoritative — it rejects anything of the wrong length — but the
// UI should not render six boxes and then have the server disagree about the
// seventh, so the count lives in one place per side and is asserted in the
// backend test that reads this component's contract.
const CODE_LENGTH = 6;

const isDigit = (ch) => ch >= '0' && ch <= '9';

/**
 * Six single-character inputs for a verification code.
 *
 * Split into separate boxes rather than one text field because that is what makes
 * it feel right: the caret advances on its own, a pasted code fills every box at
 * once, and there is no ambiguity about how many digits have been entered. A
 * single field is simpler but makes the user count characters themselves and gives
 * no per-position feedback.
 *
 * The value is held by the parent as one string; this component only reports the
 * whole code. Keeping a second source of truth in local state is what produces
 * the classic bug where the boxes show `123456` while the parent still has
 * `1234`, and the submit button enables against the wrong value.
 *
 * Accessibility notes, since a plain array of inputs is genuinely awkward for
 * assistive tech:
 *
 * - Each box has an accessible name ("Digit 3 of 6") rather than a bare label, so
 *   the group is navigable and the position is announced.
 * - `inputMode="numeric"` brings up the number pad on mobile, and
 *   `autoComplete="one-time-code"` lets iOS and Android offer the code from SMS or
 *   mail directly above the keyboard. Without it the user has to switch apps.
 * - Only the first box is in the tab order. Six separate tab stops for one value is
 *   the wrong number of stops; the group is navigated with the arrow keys, which
 *   is what the handler below sets up.
 * - A wrong code moves focus back to the first box so a retry does not require
 *   reaching for the mouse.
 */
export default function VerificationCodeInput({
  value,
  onChange,
  disabled = false,
  invalid = false,
  autoFocus = true,
  id = 'verification-code'
}) {
  const refs = useRef([]);

  // Keep focus on the first empty box as the code grows, so the user can keep
  // typing without clicking. Only relevant while the user is actively typing —
  // stealing focus on mount from a disabled box, or from a page that has just
  // changed state, would be hostile.
  useEffect(() => {
    if (disabled || !autoFocus) return;
    const focused = document.activeElement;
    const insideGroup = refs.current.some((el) => el && el === focused);
    if (insideGroup) return;
    const nextEmpty = refs.current.find((el) => el && !el.value);
    if (nextEmpty) nextEmpty.focus();
  }, [value, disabled, autoFocus]);

  const setAt = (index, digits) => {
    let next = value.padEnd(CODE_LENGTH, ' ').split('');
    // Writing into every box from index 0 is what makes a paste land correctly.
    for (let i = 0; i < digits.length && index + i < CODE_LENGTH; i += 1) {
      next[index + i] = digits[i];
    }
    onChange(next.join('').replace(/\s/g, '').slice(0, CODE_LENGTH));
  };

  const handleChange = (index, raw) => {
    const digits = String(raw).replace(/\D/g, '');
    if (!digits) {
      // Clearing a box. Splicing rather than padEnd-to-'' so deleting the last
      // digit shortens the code instead of leaving trailing spaces to normalise.
      onChange(value.slice(0, index) + value.slice(index + 1));
      return;
    }
    setAt(index, digits);

    // A digit typed into a box that is not the last jumps forward. Without this
    // the user has to click each remaining box by hand, which is the whole reason
    // people copy a code into the last box and get nothing.
    if (index < CODE_LENGTH - 1) {
      const target = refs.current[index + digits.length];
      if (target) target.focus();
    }
  };

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace') {
      // Only consume the key when this box is already empty and there is something
      // to step back to. Otherwise the browser's own clear-and-hold behaviour is
      // correct and intercepting it leaves the caret in the wrong box.
      if (!refs.current[index]?.value && index > 0) {
        event.preventDefault();
        const previous = refs.current[index - 1];
        if (previous) {
          onChange(value.slice(0, index - 1) + value.slice(index));
          previous.focus();
        }
      }
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      refs.current[index - 1]?.focus();
      return;
    }

    if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      event.preventDefault();
      refs.current[index + 1]?.focus();
      return;
    }

    // Typing into a full box replaces its digit rather than being rejected. This
    // is the "I mistyped the third digit" case, and blocking the keystroke there
    // is maddening — the box just refuses to change.
    if (isDigit(event.key) && refs.current[index]?.value) {
      event.preventDefault();
      setAt(index, event.key);
    }
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const digits = (event.clipboardData?.getData('text') || '').replace(/\D/g, '');
    if (!digits) return;
    setAt(0, digits);
    const landing = Math.min(digits.length, CODE_LENGTH - 1);
    refs.current[landing]?.focus();
    refs.current[landing]?.select();
  };

  return (
    <div
      className="flex justify-center gap-2 my-6"
      role="group"
      aria-label="Verification code"
      onPaste={handlePaste}
    >
      {Array.from({ length: CODE_LENGTH }).map((_, index) => {
        const char = value[index] || '';
        return (
          <input
            key={index}
            ref={(el) => { refs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            // one-time-code on the first box only: it is a hint to the platform,
            // and repeating it per box makes some keyboards offer it six times.
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={CODE_LENGTH}
            value={char}
            disabled={disabled}
            aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
            aria-invalid={invalid || undefined}
            aria-describedby={`${id}-hint`}
            id={index === 0 ? id : undefined}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onFocus={(event) => event.target.select()}
            className={`w-11 h-14 sm:w-12 sm:h-16 text-center text-2xl font-semibold rounded-xl border bg-white dark:bg-surface-800 text-surface-900 dark:text-white transition-colors focus:outline-none focus:ring-2 disabled:opacity-60 ${
              invalid
                ? 'border-rose-400 focus:ring-rose-400'
                : 'border-surface-300 dark:border-surface-700 focus:border-brand-500 focus:ring-brand-500'
            }`}
          />
        );
      })}
    </div>
  );
}