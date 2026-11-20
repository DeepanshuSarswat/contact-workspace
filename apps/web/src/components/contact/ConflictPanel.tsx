import { useEffect, useRef } from 'react';
import type { Contact } from '@contacts/shared';
import { formatDateTime } from '../../lib/format';
import { LABELS, changedByOthers, editedFields, toFormValues, type FormValues } from './formModel';

interface Props {
  mine: FormValues;
  // version the user started editing from
  original: Contact;
  latest: Contact;
  onUseLatest: () => void;
  onKeepMine: () => void;
}

const show = (v: string) => v || <span className="muted">(empty)</span>;

export function ConflictPanel({ mine, original, latest, onUseLatest, onKeepMine }: Props) {
  const theirs = toFormValues(latest);
  const myEdits = editedFields(mine, original);
  const theirEdits = changedByOthers(original, latest);
  // fields only they changed are kept either way
  const onlyTheirs = theirEdits.filter((f) => !myEdits.includes(f));

  // move focus here so keyboard and screen-reader users notice it
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="conflict"
      role="alert"
      aria-labelledby="conflict-title"
    >
      <strong id="conflict-title">Someone else changed this contact</strong>
      <p className="muted small">
        Saved by another user at {formatDateTime(latest.updatedAt)} (version {latest.version}). Your
        changes were <strong>not</strong> saved.
      </p>

      {myEdits.length > 0 && (
        <table className="conflict-table">
          <thead>
            <tr>
              <th>Field you changed</th>
              <th>Your value</th>
              <th>Saved value now</th>
            </tr>
          </thead>
          <tbody>
            {myEdits.map((f) => (
              <tr key={f}>
                <th scope="row">{LABELS[f]}</th>
                <td>{show(mine[f])}</td>
                <td>{show(theirs[f])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {onlyTheirs.length > 0 && (
        <p className="small">
          They also changed (kept either way):{' '}
          {onlyTheirs.map((f, i) => (
            <span key={f}>
              {i > 0 && ', '}
              <strong>{LABELS[f]}</strong> → {show(theirs[f])}
            </span>
          ))}
        </p>
      )}

      <div className="row">
        <button type="button" onClick={onUseLatest}>
          Discard mine, use saved version
        </button>
        <button type="button" className="primary" onClick={onKeepMine}>
          Keep my changes (review, then save)
        </button>
      </div>
    </div>
  );
}
