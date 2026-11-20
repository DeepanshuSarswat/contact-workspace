import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tagNameSchema, type Contact, type Tag } from '@contacts/shared';
import { contactKeys, contactsApi, tagKeys } from '../../api/contacts';
import { useTags } from '../../hooks/useTags';
import { IconX } from '../Icons';
import { TagCombobox } from '../TagCombobox';
import { errorMessage } from '../States';

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const byName = (a: Tag, b: Tag) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());

export const TAGS_COLLAPSED = 12;

// temporary ids for tags the server hasn't created yet
let nextTempId = -1;
const isPending = (t: Tag) => t.id < 0;

// Optimistic: update the cached contact right away and undo just that change on error.
// Restoring a whole snapshot would wipe other changes still in flight.
export function TagEditor({ contact }: { contact: Contact }) {
  const queryClient = useQueryClient();
  const allTags = useTags();
  const [name, setName] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // shown even if it sorts into the collapsed part
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const tagListId = useId();

  const detailKey = contactKeys.detail(contact.id);
  const mutationKey = ['contact-tags', contact.id];

  const setTags = (update: (tags: Tag[]) => Tag[]) =>
    queryClient.setQueryData<Contact>(detailKey, (old) =>
      old ? { ...old, tags: update(old.tags) } : old,
    );

  const startChange = async () => {
    setFailure(null);
    // a refetch landing now would overwrite the optimistic change
    await queryClient.cancelQueries({ queryKey: detailKey });
  };

  // refetch only after the last pending change (1 = this one), or chips would flicker
  const syncWhenIdle = () => {
    if (queryClient.isMutating({ mutationKey }) === 1) {
      void queryClient.invalidateQueries({ queryKey: detailKey });
      void queryClient.invalidateQueries({ queryKey: contactKeys.activity(contact.id) });
      void queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: tagKeys.all });
    }
  };

  const add = useMutation({
    mutationKey,
    mutationFn: (tagName: string) => contactsApi.addTag(contact.id, tagName),
    onMutate: async (tagName) => {
      await startChange();
      const current = queryClient.getQueryData<Contact>(detailKey)?.tags ?? [];
      const alreadyHad = current.some((t) => sameName(t.name, tagName));
      if (!alreadyHad) {
        // use the known tag if there is one ("vip" -> "VIP")
        const known = allTags.data?.find((t) => sameName(t.name, tagName));
        const optimistic: Tag = known ?? { id: nextTempId--, name: tagName };
        setTags((tags) => [...tags, optimistic].sort(byName));
      }
      return { alreadyHad };
    },
    onSuccess: (updated, tagName) => {
      const real = updated.tags.find((t) => sameName(t.name, tagName));
      if (real) setTags((tags) => tags.map((t) => (sameName(t.name, tagName) ? real : t)));
    },
    onError: (err, tagName, ctx) => {
      if (!ctx?.alreadyHad) setTags((tags) => tags.filter((t) => !sameName(t.name, tagName)));
      setName((typed) => typed || tagName); // give the text back so they can retry
      setFailure(`Couldn’t add “${tagName}”: ${errorMessage(err)}`);
    },
    onSettled: syncWhenIdle,
  });

  const remove = useMutation({
    mutationKey,
    mutationFn: (tag: Tag) => contactsApi.removeTag(contact.id, tag.id),
    onMutate: async (tag) => {
      await startChange();
      setTags((tags) => tags.filter((t) => t.id !== tag.id));
    },
    onError: (err, tag) => {
      setTags((tags) => (tags.some((t) => t.id === tag.id) ? tags : [...tags, tag].sort(byName)));
      setFailure(`Couldn’t remove “${tag.name}”: ${errorMessage(err)}`);
    },
    onSettled: syncWhenIdle,
  });

  const addTag = (raw: string) => {
    const parsed = tagNameSchema.safeParse(raw);
    if (!parsed.success) {
      setName(raw);
      setInputError(parsed.error.issues[0]?.message ?? 'Invalid tag name');
      return;
    }
    setInputError(null);
    setJustAdded(parsed.data);
    setName('');
    add.mutate(parsed.data);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    addTag(name);
  };

  const shownTags = showAll
    ? contact.tags
    : contact.tags.filter(
        (t, i) => i < TAGS_COLLAPSED || (justAdded !== null && sameName(t.name, justAdded)),
      );
  const hiddenCount = contact.tags.length - shownTags.length;

  const suggestions = (allTags.data ?? []).filter(
    (t) => !contact.tags.some((ct) => sameName(ct.name, t.name)),
  );

  return (
    <section className="card card-body" aria-labelledby="tags-title">
      <div className="card-header">
        <h2 id="tags-title">Tags</h2>
      </div>

      {contact.tags.length ? (
        <ul className="tag-list" id={tagListId}>
          {shownTags.map((t) => (
            <li
              key={t.id}
              className={`chip ${isPending(t) ? 'chip-pending' : ''}`}
              aria-busy={isPending(t) || undefined}
            >
              {t.name}
              <button
                type="button"
                className="chip-remove"
                aria-label={`Remove tag ${t.name}`}
                disabled={isPending(t)}
                title={isPending(t) ? 'Saving…' : undefined}
                onClick={() => remove.mutate(t)}
              >
                <IconX size={12} />
              </button>
            </li>
          ))}
          {(showAll ? contact.tags.length > TAGS_COLLAPSED : hiddenCount > 0) && (
            <li>
              <button
                type="button"
                className="chip chip-more"
                aria-expanded={showAll}
                aria-controls={tagListId}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? 'Show fewer' : `+${hiddenCount} more`}
              </button>
            </li>
          )}
        </ul>
      ) : (
        <p className="muted">No tags yet.</p>
      )}

      <form className="row tag-form" onSubmit={submit}>
        <TagCombobox
          options={suggestions}
          existing={allTags.data ?? []}
          value={name}
          onChange={(v) => {
            setName(v);
            setInputError(null);
          }}
          onSelect={addTag}
          ariaLabel="New tag"
          placeholder="Add or create a tag"
          invalid={Boolean(inputError)}
        />
        <button type="submit" disabled={!name.trim()}>
          Add
        </button>
      </form>
      {inputError && <p className="error-text">{inputError}</p>}
      {failure && (
        <p className="error-text" role="alert">
          {failure}
        </p>
      )}
    </section>
  );
}
