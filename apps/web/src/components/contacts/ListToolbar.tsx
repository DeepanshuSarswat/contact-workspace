import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SortField, SortOrder, Tag } from '@contacts/shared';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { IconSearch } from '../Icons';

const SEARCH_MAX = 100;

// Local text so typing is instant; pushed to the URL after 300ms.
// Uses an effect (not a key like CompanyFilter) because remounting would steal focus mid-typing.
export function SearchBox({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (q: string) => void;
}) {
  const [text, setText] = useState(value ?? '');
  const debounced = useDebouncedValue(text, 300);
  const lastPushed = useRef(value ?? '');

  useEffect(() => {
    const q = debounced.trim();
    if (q !== lastPushed.current) {
      lastPushed.current = q;
      onChange(q);
    }
  }, [debounced, onChange]);

  useEffect(() => {
    const external = value ?? '';
    if (external !== lastPushed.current) {
      lastPushed.current = external;
      setText(external);
    }
  }, [value]);

  return (
    <div className="search-field">
      <IconSearch />
      <input
        type="search"
        placeholder="Search name, email or phone"
        aria-label="Search contacts by name, email or phone"
        value={text}
        maxLength={SEARCH_MAX}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}

export function CompanyFilter({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (company: string) => void;
}) {
  const [text, setText] = useState(value ?? '');

  const apply = (e?: FormEvent) => {
    e?.preventDefault();
    if (text.trim() !== (value ?? '')) onChange(text.trim());
  };

  return (
    <form onSubmit={apply} className="company-filter">
      <input
        placeholder="Company (exact)"
        aria-label="Filter by company"
        value={text}
        maxLength={200}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => apply()}
      />
    </form>
  );
}

export const FILTER_TAGS_VISIBLE = 12;

export function TagFilter({
  tags,
  selected,
  onChange,
}: {
  tags: Tag[];
  selected: string[];
  onChange: (tags: string[]) => void;
}) {
  const isOn = (name: string) => selected.some((s) => s.toLowerCase() === name.toLowerCase());
  const toggle = (name: string) =>
    onChange(
      isOn(name)
        ? selected.filter((s) => s.toLowerCase() !== name.toLowerCase())
        : [...selected, name],
    );

  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? tags : tags.filter((t, i) => i < FILTER_TAGS_VISIBLE || isOn(t.name));
  const hidden = tags.length - shown.length;

  if (!tags.length) return null;
  return (
    <div className="tag-filter" role="group" aria-label="Filter by tags (matches all selected)">
      <span className="tag-filter-label">Tags</span>
      {shown.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`chip ${isOn(t.name) ? 'chip-on' : ''}`}
          aria-pressed={isOn(t.name)}
          onClick={() => toggle(t.name)}
        >
          {t.name}
        </button>
      ))}
      {(showAll ? tags.length > FILTER_TAGS_VISIBLE : hidden > 0) && (
        <button
          type="button"
          className="chip chip-more"
          aria-expanded={showAll}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? 'Show fewer' : `+${hidden} more`}
        </button>
      )}
      {selected.length > 1 && <span className="muted small">(must have all)</span>}
    </div>
  );
}

const SORT_OPTIONS: { value: `${SortField}:${SortOrder}`; label: string }[] = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'name:desc', label: 'Name Z–A' },
];

export function SortSelect({
  sort,
  order,
  onChange,
}: {
  sort: SortField;
  order: SortOrder;
  onChange: (sort: SortField, order: SortOrder) => void;
}) {
  return (
    <select
      aria-label="Sort contacts"
      value={`${sort}:${order}`}
      onChange={(e) => {
        const [s, o] = e.target.value.split(':') as [SortField, SortOrder];
        onChange(s, o);
      }}
    >
      {SORT_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
