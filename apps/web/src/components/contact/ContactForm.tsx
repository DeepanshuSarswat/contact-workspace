import type { Contact } from '@contacts/shared';
import { useContactEditor } from '../../hooks/useContactEditor';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { Banner } from '../Banner';
import { ConfirmDialog } from '../ConfirmDialog';
import { errorMessage } from '../States';
import { ConflictPanel } from './ConflictPanel';
import { FIELDS, LABELS, type Field } from './formModel';

const INPUT_TYPE: Record<Field, string> = {
  firstName: 'text',
  lastName: 'text',
  email: 'email',
  phone: 'tel',
  company: 'text',
};

export function ContactForm({ contact }: { contact: Contact }) {
  const editor = useContactEditor(contact);
  const blocker = useUnsavedChangesGuard(editor.dirty);

  return (
    <form
      className="card card-body contact-form"
      onSubmit={editor.submit}
      noValidate
      aria-label="Edit contact"
    >
      <div className="card-header">
        <h2>Details</h2>
        <span className="version-badge" title="Increases with every saved change">
          Version {editor.base.version}
        </span>
      </div>

      {editor.conflict && (
        <ConflictPanel
          mine={editor.values}
          original={editor.base}
          latest={editor.conflict}
          onUseLatest={editor.discard}
          onKeepMine={() => editor.conflict && editor.keepMine(editor.conflict)}
        />
      )}

      {!editor.conflict && editor.changedElsewhere && (
        <div className="banner banner-warning banner-action" role="status">
          <span>Someone else just changed this contact. Saving now would conflict.</span>
          <button type="button" onClick={editor.reviewLatest}>
            Review their changes
          </button>
        </div>
      )}

      {editor.notice && (
        <Banner kind={editor.notice.kind} onDismiss={editor.dismissNotice}>
          {editor.notice.text}
        </Banner>
      )}

      {editor.saveError && (
        <Banner kind="error" onDismiss={editor.clearSaveError}>
          Couldn’t save: {errorMessage(editor.saveError)} Your changes are still here; try again.
        </Banner>
      )}

      <div className="form-grid">
        {FIELDS.map((f) => {
          const errors = editor.fieldErrors[f];
          const inputId = `contact-${f}`;
          const errorId = `${inputId}-error`;
          const required = f === 'firstName';
          // error outside the label so the accessible name stays just "Email"
          return (
            <div key={f} className={`field ${f === 'company' ? 'field-wide' : ''}`}>
              <label htmlFor={inputId} className={required ? 'required' : undefined}>
                {LABELS[f]}
              </label>
              <input
                id={inputId}
                name={f}
                type={INPUT_TYPE[f]}
                value={editor.values[f]}
                onChange={(e) => editor.setField(f, e.target.value)}
                aria-required={required || undefined}
                aria-invalid={Boolean(errors)}
                aria-describedby={errors ? errorId : undefined}
                disabled={editor.saving}
              />
              {errors && (
                <span id={errorId} className="error-text">
                  {errors[0]}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="form-actions">
        <button type="submit" className="primary" disabled={!editor.dirty || editor.saving}>
          {editor.saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={!editor.dirty || editor.saving}
          onClick={editor.discard}
        >
          Cancel
        </button>
        {editor.dirty && <span className="muted small">Unsaved changes</span>}
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Discard unsaved changes?"
        description="You have edits to this contact that haven't been saved. If you leave now, they will be lost."
        cancelLabel="Keep editing"
        confirmLabel="Discard and leave"
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />
    </form>
  );
}
