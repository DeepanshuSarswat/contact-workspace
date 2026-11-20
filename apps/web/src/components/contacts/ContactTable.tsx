import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import type { Contact, SortField, SortOrder, Tag } from '@contacts/shared';
import { formatDate, fullName } from '../../lib/format';
import { Avatar } from '../Avatar';
import { IconSort } from '../Icons';
import { TagOverflow } from './TagOverflow';

const Empty = () => (
  <span className="empty-value" aria-label="Not set">
    —
  </span>
);

interface Props {
  contacts: Contact[];
  selected: ReadonlyMap<number, string>;
  onToggle: (contact: Contact) => void;
  onTogglePage: (contacts: Contact[], select: boolean) => void;
  busy: boolean;
  sort: SortField;
  order: SortOrder;
  onSort: (sort: SortField, order: SortOrder) => void;
}

export function ContactTable({
  contacts,
  selected,
  onToggle,
  onTogglePage,
  busy,
  sort,
  order,
  onSort,
}: Props) {
  const sortProps = { sort, order, onSort };
  const { search } = useLocation();
  const selectedOnPage = contacts.filter((c) => selected.has(c.id)).length;
  const allOnPage = contacts.length > 0 && selectedOnPage === contacts.length;

  // indeterminate can only be set from JS
  const headerBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerBox.current) {
      headerBox.current.indeterminate = selectedOnPage > 0 && !allOnPage;
    }
  }, [selectedOnPage, allOnPage]);

  return (
    <div className="table-wrap" aria-busy={busy}>
      <table className={`contacts-table ${busy ? 'is-busy' : ''}`}>
        <thead>
          <tr>
            <th className="col-check">
              <input
                ref={headerBox}
                type="checkbox"
                aria-label="Select all contacts on this page"
                checked={allOnPage}
                onChange={(e) => onTogglePage(contacts, e.target.checked)}
              />
            </th>
            <SortHeader field="name" label="Name" {...sortProps} />
            <th>Email</th>
            <th>Phone</th>
            <th>Company</th>
            <th>Tags</th>
            <SortHeader field="createdAt" label="Created" {...sortProps} />
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr key={c.id} className={selected.has(c.id) ? 'is-selected' : undefined}>
              <td className="col-check">
                <input
                  type="checkbox"
                  aria-label={`Select ${fullName(c)}`}
                  checked={selected.has(c.id)}
                  onChange={() => onToggle(c)}
                />
              </td>
              <td className="name-col">
                <div className="name-cell">
                  <Avatar id={c.id} firstName={c.firstName} lastName={c.lastName} />
                  <Link to={`/contacts/${c.id}`} state={{ listSearch: search }}>
                    {fullName(c)}
                  </Link>
                </div>
              </td>
              {/* data-label is used as the field label in the phone layout */}
              <td className="col-email" data-label="Email" data-empty={!c.email}>
                {c.email ?? <Empty />}
              </td>
              <td className="nowrap" data-label="Phone" data-empty={!c.phone}>
                {c.phone ?? <Empty />}
              </td>
              <td className="col-company" data-label="Company" data-empty={!c.company}>
                {c.company ?? <Empty />}
              </td>
              <td className="col-tags" data-label="Tags" data-empty={!c.tags.length}>
                <TagSummary tags={c.tags} />
              </td>
              <td className="col-created" data-label="Created">
                {formatDate(c.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const ROW_TAGS_VISIBLE = 3;

function TagSummary({ tags }: { tags: Tag[] }) {
  const shown = tags.slice(0, ROW_TAGS_VISIBLE);
  const rest = tags.slice(ROW_TAGS_VISIBLE);
  return (
    <>
      {shown.map((t) => (
        <span key={t.id} className="chip chip-static">
          {t.name}
        </span>
      ))}
      {rest.length > 0 && <TagOverflow tags={tags} hiddenCount={rest.length} />}
    </>
  );
}

// first click: A–Z for names, newest first for dates
const FIRST_ORDER: Record<SortField, SortOrder> = { name: 'asc', createdAt: 'desc' };

function SortHeader({
  field,
  label,
  sort,
  order,
  onSort,
}: {
  field: SortField;
  label: string;
  sort: SortField;
  order: SortOrder;
  onSort: (sort: SortField, order: SortOrder) => void;
}) {
  const active = sort === field;
  const next: SortOrder = active ? (order === 'asc' ? 'desc' : 'asc') : FIRST_ORDER[field];
  return (
    <th aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button
        type="button"
        className={`th-sort ${active ? 'is-active' : ''}`}
        onClick={() => onSort(field, next)}
      >
        {label}
        <IconSort dir={active ? order : null} size={14} />
      </button>
    </th>
  );
}
