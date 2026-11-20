import { useCallback, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BULK_TAG_MAX_CONTACTS,
  tagNameSchema,
  type BulkTagResponse,
  type Tag,
} from '@contacts/shared';
import { contactKeys, contactsApi, tagKeys } from '../../api/contacts';
import { Banner } from '../Banner';
import { IconTag } from '../Icons';
import { TagCombobox } from '../TagCombobox';
import { errorMessage } from '../States';

interface Props {
  selectedIds: number[];
  tags: Tag[];
  onClear: () => void;
}

function summary(r: BulkTagResponse): string {
  const plural = (n: number) => `${n} contact${n === 1 ? '' : 's'}`;
  if (r.tagged === 0 && r.alreadyTagged > 0 && !r.notFound.length) {
    return `Nothing to change: ${r.alreadyTagged === 1 ? 'the selected contact' : `all ${plural(r.alreadyTagged)}`} already had “${r.tag.name}”.`;
  }
  const parts = [`Tagged ${plural(r.tagged)} with “${r.tag.name}”.`];
  if (r.alreadyTagged) parts.push(`${r.alreadyTagged} already had it.`);
  if (r.notFound.length) parts.push(`${r.notFound.length} no longer exist.`);
  return parts.join(' ');
}

export function BulkTagBar({ selectedIds, tags, onClear }: Props) {
  const queryClient = useQueryClient();
  const [tagName, setTagName] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  // stable, or the banner timer restarts every render
  const dismissResult = useCallback(() => setResult(null), []);

  const mutation = useMutation({
    mutationFn: (name: string) => contactsApi.bulkTag(selectedIds, name),
    onSuccess: (res) => {
      setResult(summary(res));
      setTagName('');
      onClear();
      void queryClient.invalidateQueries({ queryKey: contactKeys.all });
      void queryClient.invalidateQueries({ queryKey: tagKeys.all });
    },
  });

  const tooMany = selectedIds.length > BULK_TAG_MAX_CONTACTS;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setResult(null);
    const parsed = tagNameSchema.safeParse(tagName);
    if (!parsed.success) {
      setInputError(parsed.error.issues[0]?.message ?? 'Invalid tag name');
      return;
    }
    setInputError(null);
    mutation.mutate(parsed.data);
  };

  if (!selectedIds.length) {
    return result ? (
      <Banner kind="success" onDismiss={dismissResult}>
        {result}
      </Banner>
    ) : null;
  }

  return (
    <form className="bulk-bar" onSubmit={submit} aria-label="Bulk tag selected contacts">
      <strong className="bulk-count">
        <IconTag />
        {selectedIds.length.toLocaleString()} selected
      </strong>
      <TagCombobox
        options={tags}
        allowCreate={false}
        value={tagName}
        onChange={(v) => {
          setTagName(v);
          setInputError(null);
        }}
        onSelect={(name) => {
          setTagName(name);
          setInputError(null);
        }}
        ariaLabel="Tag to add to selected contacts"
        placeholder="Tag name (new or existing)"
        invalid={Boolean(inputError)}
        disabled={mutation.isPending}
        placement="top"
      />
      <button type="submit" className="primary" disabled={mutation.isPending || tooMany}>
        {mutation.isPending ? 'Tagging…' : 'Add tag'}
      </button>
      <button type="button" className="ghost" onClick={onClear} disabled={mutation.isPending}>
        Clear selection
      </button>
      {tooMany && (
        <span className="error-text">
          Select at most {BULK_TAG_MAX_CONTACTS.toLocaleString()} contacts at a time.
        </span>
      )}
      {inputError && <span className="error-text">{inputError}</span>}
      {mutation.isError && (
        <span className="error-text" role="alert">
          {errorMessage(mutation.error)}
        </span>
      )}
    </form>
  );
}
