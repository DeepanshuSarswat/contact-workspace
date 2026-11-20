import { useId } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { Activity, ActivityListResponse } from '@contacts/shared';
import { contactKeys } from '../../api/contacts';
import { useContactActivity } from '../../hooks/useContact';
import { formatDateTime } from '../../lib/format';
import { IconMinus, IconPencil, IconPlus } from '../Icons';
import { ErrorState, Loading, errorMessage } from '../States';
import { LABELS, type Field } from './formModel';

const show = (v: string | null) => (v === null || v === '' ? '(empty)' : `“${v}”`);

export function describeActivity(a: Activity): string[] {
  const p = a.payload;
  if (a.type === 'CONTACT_UPDATED' && 'changes' in p) {
    return Object.entries(p.changes).map(
      ([field, c]) => `${LABELS[field as Field] ?? field}: ${show(c.from)} → ${show(c.to)}`,
    );
  }
  if ('tagName' in p) {
    const verb = a.type === 'TAG_ADDED' ? 'Added tag' : 'Removed tag';
    return [`${verb} “${p.tagName}”${p.bulk ? ' (bulk)' : ''}`];
  }
  return [a.type];
}

const TITLE: Record<Activity['type'], string> = {
  CONTACT_UPDATED: 'Details updated',
  TAG_ADDED: 'Tag added',
  TAG_REMOVED: 'Tag removed',
};

const ICON: Record<Activity['type'], { Icon: typeof IconPencil; tone: string }> = {
  CONTACT_UPDATED: { Icon: IconPencil, tone: '' },
  TAG_ADDED: { Icon: IconPlus, tone: 'added' },
  TAG_REMOVED: { Icon: IconMinus, tone: 'removed' },
};

export function ActivityFeed({ contactId }: { contactId: number }) {
  const queryClient = useQueryClient();
  const query = useContactActivity(contactId);
  const listId = useId();
  const all = query.data?.pages.flatMap((p) => p.data) ?? [];
  const pageCount = query.data?.pages.length ?? 0;

  // back to page 1, dropping the older pages from the cache
  const showLess = () =>
    queryClient.setQueryData<InfiniteData<ActivityListResponse, string | null>>(
      contactKeys.activity(contactId),
      (d) => d && { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) },
    );

  return (
    <section className="card card-body" aria-labelledby="activity-title">
      <div className="card-header">
        <h2 id="activity-title">Recent activity</h2>
      </div>
      {query.isPending ? (
        <Loading label="Loading activity…" rows={3} />
      ) : query.isError && !query.data ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !all.length ? (
        <p className="muted small" style={{ margin: 0 }}>
          No changes yet. Edits and tag changes will appear here.
        </p>
      ) : (
        <>
          <ol className="activity" id={listId}>
            {all.map((a) => {
              const { Icon, tone } = ICON[a.type];
              return (
                <li key={a.id}>
                  <span className={`activity-icon ${tone}`}>
                    <Icon size={14} />
                  </span>
                  <div>
                    <div className="activity-head">
                      <strong>{TITLE[a.type]}</strong>
                      <time className="muted small" dateTime={a.createdAt}>
                        {formatDateTime(a.createdAt)}
                      </time>
                    </div>
                    {describeActivity(a).map((line) => (
                      <div key={line} className="activity-line">
                        {line}
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
          {query.isFetchNextPageError && (
            <p className="error-text" role="alert">
              Couldn’t load older activity: {errorMessage(query.error)}
            </p>
          )}
          {(query.hasNextPage || pageCount > 1) && (
            <div className="activity-actions">
              {query.hasNextPage && (
                <button
                  type="button"
                  className="ghost"
                  aria-controls={listId}
                  disabled={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                >
                  {query.isFetchingNextPage ? 'Loading…' : 'Show older activity'}
                </button>
              )}
              {pageCount > 1 && (
                <button type="button" className="ghost" aria-controls={listId} onClick={showLess}>
                  Show less
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
