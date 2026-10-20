import { describe, expect, it } from 'vitest';
import { ARCHIVE_FIELDS } from '../../../../core/archive';
import { expectNullsLoadMissing, stored } from '../../../../core/__tests__/nulls';
import { makeSeed } from '../seed';
import { grantsSlice } from '../slice';
import type { GrantsState } from '../types';

describe('grants: a null optional field loads as a missing field (decision 0008, 2A)', () => {
  const seed = stored(makeSeed());
  const normalise = (raw: unknown) => grantsSlice.normalise!(raw);
  const contact = ['contactName', 'contactEmail', 'contactPhone', 'website'];
  const assigned = ['classId', 'assignedById', 'assignedAt'];
  const cases: Array<[keyof GrantsState, string[]]> = [
    ['funders', [...contact, 'cycleNotes', 'notes', ...ARCHIVE_FIELDS]],
    [
      'grants',
      [
        'amountRequested',
        'amountAwarded',
        'notes',
        'broughtIn',
        'renewsGrantId',
        // A grant saved before `programs` named its one program here.
        'program',
        ...ARCHIVE_FIELDS,
      ],
    ],
    ['tasks', ['dueDate', 'assigneeId', 'doneAt']],
    ['documents', ['url', 'officeDocumentId']],
    ['payments', ['receivedDate', 'sourcePage']],
    ['budgetLines', ['accountCodes', 'classId']],
    ['expenses', ['note', 'transactionId', 'backupNote']],
    ['reports', ['submittedDate']],
    ['activity', ['whoId', 'who']],
    ['templates', ['description']],
    ['transactions', assigned],
    ['incoming', assigned],
    ['files', ['pages', 'expenseId']],
    ['terms', ['page']],
  ];

  it.each(cases)('%s', (key, fields) => {
    expectNullsLoadMissing(normalise, seed, key, fields);
  });

  it("drops a grant's null dates", () => {
    const grant = seed.grants[0];
    const dates = { ...grant.dates, startBy: null, decided: null, periodEnd: null };
    const raw = { ...seed, grants: [{ ...grant, dates }, ...seed.grants.slice(1)] };
    const { startBy: _s, decided: _d, periodEnd: _p, ...kept } = grant.dates;
    const loaded = normalise(stored(raw))!.grants.find(g => g.id === grant.id)!;
    expect(loaded.dates).toEqual(kept);
    expect(Object.values(loaded.dates)).not.toContain(null);
  });

  it('rejects the slice when a required field is null', () => {
    const first = <K extends keyof GrantsState>(key: K, patch: object) => {
      const rows = seed[key] as unknown as object[];
      return { ...seed, [key]: [{ ...rows[0], ...patch }, ...rows.slice(1)] };
    };
    const rejected = [
      { ...seed, grants: null },
      { ...seed, grantShares: null },
      { ...seed, quickbooks: null },
      { ...seed, reminderDefaults: { ...seed.reminderDefaults, sendHour: null } },
      first('grants', { title: null }),
      first('grants', { dates: null }),
      first('tasks', { done: null }),
      first('expenses', { amount: null }),
      first('activity', { text: null }),
      first('transactions', { status: null }),
    ];
    for (const raw of rejected) expect(normalise(stored(raw))).toBeUndefined();
  });
});
