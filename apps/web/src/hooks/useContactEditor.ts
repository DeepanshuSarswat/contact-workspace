import { useCallback, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Contact, FieldErrors } from '@contacts/shared';
import { ApiError } from '../api/client';
import { contactKeys, contactsApi } from '../api/contacts';
import {
  LABELS,
  editedFields,
  isDirty,
  rebaseOnto,
  toFormValues,
  validateChanges,
  type Field,
  type FormValues,
} from '../components/contact/formModel';

interface Draft {
  base: Contact;
  values: FormValues;
}

export interface Notice {
  kind: 'success' | 'warning';
  text: string;
}

// No draft: the form shows server data directly, so background refreshes just appear.
// Draft: starts on the first keystroke; draft.base is the version the edit started from.
export function useContactEditor(contact: Contact) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [conflict, setConflict] = useState<Contact | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // stable, or the banner timer restarts every render
  const dismissNotice = useCallback(() => setNotice(null), []);

  const activeDraft = draft && isDirty(draft.values, draft.base) ? draft : null;
  const base = activeDraft?.base ?? contact;
  const values = activeDraft?.values ?? toFormValues(contact);
  const dirty = activeDraft !== null;
  const changedElsewhere = dirty && contact.version > base.version;

  const save = useMutation({
    mutationFn: (input: Parameters<typeof contactsApi.update>[1]) =>
      contactsApi.update(contact.id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(contactKeys.detail(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: contactKeys.activity(updated.id) });
      setDraft(null);
      setNotice({ kind: 'success', text: 'Saved.' });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        const latest = (err.details as { current: Contact }).current;
        queryClient.setQueryData(contactKeys.detail(latest.id), latest);
        void queryClient.invalidateQueries({ queryKey: contactKeys.activity(latest.id) });
        setConflict(latest);
      } else if (
        err instanceof ApiError &&
        (err.code === 'EMAIL_TAKEN' || err.code === 'VALIDATION_ERROR')
      ) {
        setFieldErrors(err.fieldErrors);
      }
    },
  });

  const setField = (field: Field, value: string) => {
    setDraft((prev) => {
      const current = prev && isDirty(prev.values, prev.base) ? prev : null;
      return {
        base: current?.base ?? contact,
        values: { ...(current?.values ?? toFormValues(contact)), [field]: value },
      };
    });
    setFieldErrors(({ [field]: _removed, ...rest }) => rest);
    setNotice(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (save.isPending) return; // never send the same save twice
    setNotice(null);
    const result = validateChanges(values, base);
    if (!result.ok) {
      setFieldErrors(result.errors);
      return;
    }
    setFieldErrors({});
    if (!Object.keys(result.changes).length) {
      setDraft(null); // only whitespace/case changed
      return;
    }
    save.mutate({ ...result.changes, version: base.version });
  };

  const discard = () => {
    setDraft(null);
    setConflict(null);
    setFieldErrors({});
    setNotice(null);
    save.reset();
  };

  // Keep only the fields this user edited and take the rest from latest, so saving doesn't
  // undo the other person's changes.
  const keepMine = (latest: Contact) => {
    const edited = editedFields(values, base);
    setDraft({ base: latest, values: rebaseOnto(values, base, latest) });
    setConflict(null);
    setNotice({
      kind: 'warning',
      text: `Your ${edited.map((f) => LABELS[f].toLowerCase()).join(', ')} change is kept on top of their latest version. Saving will replace their value for ${edited.length === 1 ? 'that field' : 'those fields'} only.`,
    });
  };

  const generalError =
    save.isError &&
    !(
      save.error instanceof ApiError &&
      ['VERSION_CONFLICT', 'EMAIL_TAKEN', 'VALIDATION_ERROR'].includes(save.error.code)
    );

  return {
    values,
    base,
    dirty,
    changedElsewhere,
    fieldErrors,
    conflict,
    notice,
    dismissNotice,
    saving: save.isPending,
    saveError: generalError ? save.error : null,
    clearSaveError: save.reset,
    setField,
    submit,
    discard,
    keepMine,
    reviewLatest: () => setConflict(contact),
  };
}
