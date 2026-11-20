import { describe, expect, it } from 'vitest';
import { makeContact } from '../../test/utils';
import {
  changedByOthers,
  editedFields,
  rebaseOnto,
  toFormValues,
  validateChanges,
} from './formModel';

const original = makeContact({ company: 'Acme', phone: '+91 98765 43210', version: 1 });

describe('three-way merge on conflict', () => {
  it('keeps my edited fields and takes everything else from the latest version', () => {
    const mine = { ...toFormValues(original), company: 'Mine Ltd' };
    const latest = makeContact({ company: 'Theirs Inc', phone: '+91 99999 00000', version: 2 });

    expect(editedFields(mine, original)).toEqual(['company']);
    expect(changedByOthers(original, latest)).toEqual(['phone', 'company']);

    const merged = rebaseOnto(mine, original, latest);
    expect(merged.company).toBe('Mine Ltd');
    expect(merged.phone).toBe('+91 99999 00000'); // their edit isn't reverted

    const result = validateChanges(merged, latest);
    expect(result).toEqual({ ok: true, changes: { company: 'Mine Ltd' } });
  });
});
