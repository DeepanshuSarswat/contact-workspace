import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Tag } from '@contacts/shared';
import { IconPlus, IconTag } from './Icons';

interface Props {
  options: Tag[];
  // all tags, so we don't offer "Create" for one that exists but isn't suggested
  existing?: Tag[];
  // off in the bulk bar, where picking only fills the input
  allowCreate?: boolean;
  value: string;
  onChange: (value: string) => void;
  onSelect: (name: string) => void;
  ariaLabel: string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  placement?: 'bottom' | 'top';
}

type Option = { kind: 'tag'; tag: Tag } | { kind: 'create'; name: string };

const MAX_SUGGESTIONS = 8;

function highlight(label: string, query: string): ReactNode {
  const q = query.trim();
  const i = q ? label.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return label;
  return (
    <>
      {label.slice(0, i)}
      <mark>{label.slice(i, i + q.length)}</mark>
      {label.slice(i + q.length)}
    </>
  );
}

// Replaces <datalist>, which can't be styled or themed. Follows the ARIA combobox pattern:
// focus stays in the input and the active option is exposed via aria-activedescendant.
export function TagCombobox({
  options,
  existing = options,
  allowCreate = true,
  value,
  onChange,
  onSelect,
  ariaLabel,
  placeholder,
  invalid,
  disabled,
  placement = 'bottom',
}: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const query = value.trim().toLowerCase();
  const matches = options
    .filter((t) => t.name.toLowerCase().includes(query))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(query);
      const bStarts = b.name.toLowerCase().startsWith(query);
      return aStarts === bStarts ? a.name.localeCompare(b.name) : aStarts ? -1 : 1;
    })
    .slice(0, MAX_SUGGESTIONS);
  const exactExists = existing.some((t) => t.name.toLowerCase() === query);
  const items: Option[] = [
    ...matches.map((tag) => ({ kind: 'tag' as const, tag })),
    ...(allowCreate && query && !exactExists
      ? [{ kind: 'create' as const, name: value.trim() }]
      : []),
  ];
  const showList = open && !disabled && items.length > 0;
  const optionId = (i: number) => `${listId}-option-${i}`;

  const choose = (item: Option) => {
    onSelect(item.kind === 'tag' ? item.tag.name : item.name);
    setActive(-1);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) =>
        i < 0 && step < 0 ? items.length - 1 : (i + step + items.length) % items.length,
      );
    } else if (e.key === 'Enter' && showList && active >= 0 && items[active]) {
      e.preventDefault(); // pick instead of submitting
      choose(items[active]);
    } else if (e.key === 'Escape' && showList) {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div className={`combobox ${placement === 'top' ? 'combobox-top' : ''}`}>
      <input
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${ariaLabel} suggestions`}
          className="combobox-list"
        >
          {items.map((item, i) => (
            <li
              key={item.kind === 'tag' ? item.tag.id : 'create'}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className={`combobox-option ${i === active ? 'is-active' : ''} ${item.kind === 'create' ? 'is-create' : ''}`}
              // keep focus in the input, otherwise blur closes the list before the click
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(item)}
            >
              {item.kind === 'tag' ? (
                <>
                  <IconTag size={14} />
                  <span>{highlight(item.tag.name, value)}</span>
                </>
              ) : (
                <>
                  <IconPlus size={14} />
                  <span>
                    Create “<strong>{item.name}</strong>”
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
