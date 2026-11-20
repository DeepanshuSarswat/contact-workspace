import { useEffect, type ReactNode } from 'react';

export const SUCCESS_HIDE_MS = 4000;

interface Props {
  kind: 'success' | 'warning' | 'error';
  children: ReactNode;
  onDismiss: () => void;
  // success hides after 4s by default; warnings and errors stay
  autoHideMs?: number | null;
}

export function Banner({ kind, children, onDismiss, autoHideMs }: Props) {
  const hideAfter =
    autoHideMs === undefined ? (kind === 'success' ? SUCCESS_HIDE_MS : null) : autoHideMs;

  useEffect(() => {
    if (hideAfter === null) return;
    const t = setTimeout(onDismiss, hideAfter);
    return () => clearTimeout(t);
  }, [hideAfter, onDismiss, children]);

  return (
    <div className={`banner banner-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      <button
        type="button"
        className="banner-close"
        aria-label="Dismiss message"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
