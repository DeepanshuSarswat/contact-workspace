import type { ReactNode } from 'react';
import { ApiError } from '../api/client';
import { IconAlert, IconInbox } from './Icons';

export function Loading({ label = 'Loading…', rows = 6 }: { label?: string; rows?: number }) {
  return (
    <div className="skeleton-list" role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row" aria-hidden="true">
          <span className="skeleton skeleton-circle" />
          <span className="skeleton" style={{ width: `${28 + ((i * 17) % 22)}%` }} />
          <span className="skeleton" style={{ width: `${18 + ((i * 11) % 14)}%` }} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="state state-empty">
      <span className="state-icon">
        <IconInbox size={22} />
      </span>
      <strong>{title}</strong>
      {description && <div className="small">{description}</div>}
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <span className="state-icon">
        <IconAlert size={22} />
      </span>
      <strong>Couldn’t load this.</strong>
      <div className="small">{errorMessage(error)}</div>
      {onRetry && (
        <div className="row">
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
