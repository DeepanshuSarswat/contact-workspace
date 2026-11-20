import { useCallback, type ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Contact, ContactListResponse } from '@contacts/shared';
import { ApiError } from '../api/client';
import { BulkTagBar } from '../components/contacts/BulkTagBar';
import { ContactTable } from '../components/contacts/ContactTable';
import {
  CompanyFilter,
  SearchBox,
  SortSelect,
  TagFilter,
} from '../components/contacts/ListToolbar';
import { Pagination } from '../components/contacts/Pagination';
import { IconAlert } from '../components/Icons';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { useContactList } from '../hooks/useContactList';
import { useContactListParams } from '../hooks/useContactListParams';
import { useSelection } from '../hooks/useSelection';
import { useTags } from '../hooks/useTags';
import { fullName, pageTitle } from '../lib/format';

export function ContactsPage() {
  const { params, update, reset, hasFilters } = useContactListParams();
  const tagsQuery = useTags();
  const { query, prefetchNext } = useContactList(params);
  const selection = useSelection<Contact>(fullName);
  const onSearch = useCallback((q: string) => update({ q }), [update]);
  // read out by screen readers once the new results arrive
  const announcement =
    query.data && !query.isPlaceholderData ? resultSummary(query.data.total) : '';

  return (
    <section>
      <title>{pageTitle('Contacts')}</title>
      <header className="page-header">
        <div>
          <h1>Contacts</h1>
          <p className="muted small">Search, filter and tag the people in your workspace.</p>
        </div>
      </header>

      <div className="card filters">
        <div className="toolbar">
          <SearchBox value={params.q} onChange={onSearch} />
          {/* key resets the input when the URL changes from outside (back, Clear filters) */}
          <CompanyFilter
            key={params.company ?? ''}
            value={params.company}
            onChange={(company) => update({ company })}
          />
          <SortSelect
            sort={params.sort}
            order={params.order}
            onChange={(sort, order) => update({ sort, order })}
          />
          {hasFilters && (
            <button type="button" className="ghost" onClick={reset}>
              Clear filters
            </button>
          )}
        </div>

        <TagFilter
          tags={tagsQuery.data ?? []}
          selected={params.tag ?? []}
          onChange={(tag) => update({ tag })}
        />
      </div>

      <div className="card">
        <ListBody
          query={query}
          hasFilters={hasFilters}
          onReset={reset}
          onFirstPage={() => update({ cursor: undefined })}
          renderList={(data) => (
            <>
              <ContactTable
                contacts={data.data}
                selected={selection.selected}
                onToggle={selection.toggle}
                onTogglePage={selection.setMany}
                busy={query.isFetching}
                sort={params.sort}
                order={params.order}
                onSort={(sort, order) => update({ sort, order })}
              />
              <Pagination
                pageInfo={data.pageInfo}
                total={data.total}
                shown={data.data.length}
                limit={params.limit}
                onCursor={(cursor) => update({ cursor })}
                onFirst={() => update({ cursor: undefined })}
                onLimit={(limit) => update({ limit })}
                onNextIntent={prefetchNext}
              />
            </>
          )}
        />
      </div>

      <p role="status" className="visually-hidden">
        {announcement}
      </p>

      <div className="bulk-dock">
        <BulkTagBar
          selectedIds={selection.ids}
          tags={tagsQuery.data ?? []}
          onClear={selection.clear}
        />
      </div>
    </section>
  );
}

function resultSummary({ count, capped }: ContactListResponse['total']): string {
  if (capped) return `More than ${count.toLocaleString()} contacts found.`;
  return count === 1 ? '1 contact found.' : `${count.toLocaleString()} contacts found.`;
}

function ListBody({
  query,
  hasFilters,
  onReset,
  onFirstPage,
  renderList,
}: {
  query: UseQueryResult<ContactListResponse>;
  hasFilters: boolean;
  onReset: () => void;
  onFirstPage: () => void;
  renderList: (data: ContactListResponse) => ReactNode;
}) {
  if (query.isPending) return <Loading label="Loading contacts…" />;

  if (query.isError) {
    const err = query.error;
    // e.g. a hand-edited cursor in the URL
    if (
      err instanceof ApiError &&
      (err.code === 'BAD_REQUEST' || err.code === 'VALIDATION_ERROR')
    ) {
      return (
        <div className="state state-error" role="alert">
          <span className="state-icon">
            <IconAlert size={22} />
          </span>
          <strong>These filters aren’t valid.</strong>
          <div className="small">{err.message}</div>
          <div className="row">
            <button type="button" onClick={onFirstPage}>
              Go to first page
            </button>
            <button type="button" onClick={onReset}>
              Reset all filters
            </button>
          </div>
        </div>
      );
    }
    return <ErrorState error={err} onRetry={() => query.refetch()} />;
  }

  if (!query.data.data.length) {
    return hasFilters ? (
      <EmptyState
        title="No contacts match these filters."
        description="Try a different search, or remove a tag or company filter."
      >
        <button type="button" onClick={onReset}>
          Clear filters
        </button>
      </EmptyState>
    ) : (
      <EmptyState title="No contacts yet." description="Contacts you add will show up here." />
    );
  }

  return renderList(query.data);
}
