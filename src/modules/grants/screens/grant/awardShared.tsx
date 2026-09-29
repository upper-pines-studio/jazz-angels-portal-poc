import React from 'react';
import { Input, Select } from '../../../../design-system';
import { useStore } from '../../../../core';
import type { GrantFile, GrantFileKind } from '../../domain';
import { describeFile, FILE_KIND_LABEL, forgetFile, rememberFile } from '../money/files';

/**
 * Pieces the Award and Documents tabs share: storing a picked file with the
 * grant, the kinds a grant-level file can be, and the award-letter page picker.
 */

/** The kinds a file kept with the grant itself can be. Receipts belong to expenses. */
export const GRANT_FILE_KINDS: GrantFileKind[] = ['award-letter', 'agreement', 'other'];

export const GRANT_KIND_LABEL: Record<GrantFileKind, string> = {
  ...FILE_KIND_LABEL,
  other: 'Other file',
};

/** A starting guess from the file name: "…award…" is the letter, "…agreement…" or "…contract…" the agreement. */
export function guessGrantKind(name: string, hasLetter: boolean): GrantFileKind {
  const n = name.toLowerCase();
  if (/award|notice/.test(n) && !hasLetter) return 'award-letter';
  if (/agreement|contract|signed/.test(n)) return 'agreement';
  return !hasLetter && /letter/.test(n) ? 'award-letter' : 'other';
}

/** Count the pages of a PDF by its page objects. Good enough for a POC; undefined when unsure. */
async function countPdfPages(file: File): Promise<number | undefined> {
  try {
    const text = await file.text();
    const n = (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
    return n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Store a picked file with a grant: check it, add it to the store, keep its
 * bytes for this session and, for a PDF, count its pages. Returns the new id
 * or the sentence saying why the file was refused.
 */
export function useStoreGrantFile() {
  const { actions } = useStore();
  return React.useCallback((grantId: string, file: File, kind: GrantFileKind): { id: string } | { error: string } => {
    const described = describeFile(file);
    if ('error' in described) return described;
    const id = actions.grants.addFile({
      grantId,
      kind,
      name: described.name,
      format: described.format,
      sizeKb: described.sizeKb,
      pages: described.format === 'pdf' ? undefined : 1,
    });
    rememberFile(id, file);
    if (described.format === 'pdf') {
      void countPdfPages(file).then(pages => { if (pages) actions.grants.updateFile(id, { pages }); });
    }
    return { id };
  }, [actions]);
}

/** Remove a stored file and let go of its bytes. */
export function useRemoveGrantFile() {
  const { actions } = useStore();
  return React.useCallback((file: GrantFile) => {
    actions.grants.deleteFile(file.id);
    forgetFile(file.id);
  }, [actions]);
}

/**
 * The page of the award letter something came from. A select when the letter
 * says how many pages it has, a number otherwise. Empty means "not from the letter".
 */
export function LetterPageField({ value, onChange, pages }: {
  value: string;
  onChange: (next: string) => void;
  pages?: number;
}) {
  if (pages && pages > 0) {
    const options = [{ value: '', label: 'Not from the letter' }];
    for (let p = 1; p <= pages; p += 1) options.push({ value: String(p), label: `Page ${p}` });
    // Keep a page the letter no longer has, so saving does not silently drop it.
    if (value && Number(value) > pages) options.push({ value, label: `Page ${value}` });
    return <Select value={value} options={options} onChange={e => onChange(e.target.value)} />;
  }
  return <Input type="number" mono value={value} placeholder="1" onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ''))} />;
}

/** "3" → 3, "" or "0" → undefined. */
export function pageFrom(value: string): number | undefined {
  const n = Math.round(Number(value));
  return value.trim() && n > 0 ? n : undefined;
}
