import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { Tag } from '@contacts/shared';

const POPOVER_WIDTH = 260;
const GAP = 6;

// A button rather than a tooltip so it works on touch and keyboard.
// position: fixed because the table's scroll container would clip it.
export function TagOverflow({ tags, hiddenCount }: { tags: Tag[]; hiddenCount: number }) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // position before paint so it never flashes in the wrong place
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!open || !buttonRef.current || !popover) return;
    const chip = buttonRef.current.getBoundingClientRect();
    const height = popover.offsetHeight;
    const left = Math.max(
      8,
      Math.min(chip.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8),
    );
    const fitsBelow = chip.bottom + GAP + height <= window.innerHeight - 8;
    const top = fitsBelow ? chip.bottom + GAP : Math.max(8, chip.top - GAP - height);
    Object.assign(popover.style, { top: `${top}px`, left: `${left}px` });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    };
    const onScroll = (e: Event) => {
      if (!popoverRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <span className="tag-overflow" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="chip chip-more"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-label={`Show all ${tags.length} tags (${hiddenCount} more)`}
        onClick={() => setOpen((o) => !o)}
      >
        +{hiddenCount}
      </button>
      {open && (
        <div
          ref={popoverRef}
          id={popoverId}
          role="group"
          aria-label={`All ${tags.length} tags`}
          className="tag-popover"
          style={{ width: POPOVER_WIDTH }}
        >
          <div className="tag-popover-title">All tags ({tags.length})</div>
          <ul className="tag-popover-list">
            {tags.map((t) => (
              <li key={t.id} className="chip chip-static">
                {t.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
