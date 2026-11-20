import { useEffect, useState } from 'react';
import { IconCheck, IconCopy } from './Icons';

// clipboard can be missing (non-HTTPS) or denied, so failures are shown
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
        onClick={() => void copy()}
      >
        {state === 'copied' ? <IconCheck size={14} /> : <IconCopy size={14} />}
      </button>
      <span role="status" className={`copy-feedback ${state === 'failed' ? 'is-error' : ''}`}>
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Couldn’t copy' : ''}
      </span>
    </>
  );
}
