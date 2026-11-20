import type { ContactListResponse } from '@contacts/shared';
import { PAGE_SIZES } from '../../hooks/useContactListParams';

interface Props {
  pageInfo: ContactListResponse['pageInfo'];
  total: ContactListResponse['total'];
  shown: number;
  limit: number;
  onCursor: (cursor: string) => void;
  onFirst: () => void;
  onLimit: (limit: number) => void;
  // hover/focus on Next: prefetch the next page
  onNextIntent?: () => void;
}

// No page numbers: jumping to page N would need OFFSET, which is slow at scale.
export function Pagination({
  pageInfo,
  total,
  shown,
  limit,
  onCursor,
  onFirst,
  onLimit,
  onNextIntent,
}: Props) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="muted">
        Showing {shown} of {total.count.toLocaleString()}
        {total.capped ? '+' : ''}
      </span>
      <div className="pagination-controls">
        <label className="muted small">
          Per page{' '}
          <select value={limit} onChange={(e) => onLimit(Number(e.target.value))}>
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={onFirst} disabled={!pageInfo.prevCursor}>
          « First
        </button>
        <button
          type="button"
          onClick={() => pageInfo.prevCursor && onCursor(pageInfo.prevCursor)}
          disabled={!pageInfo.prevCursor}
        >
          ‹ Previous
        </button>
        <button
          type="button"
          onClick={() => pageInfo.nextCursor && onCursor(pageInfo.nextCursor)}
          onMouseEnter={onNextIntent}
          onFocus={onNextIntent}
          disabled={!pageInfo.nextCursor}
        >
          Next ›
        </button>
      </div>
    </nav>
  );
}
