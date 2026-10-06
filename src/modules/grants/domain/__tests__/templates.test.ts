import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOCUMENT_REGISTER,
  DEFAULT_TEMPLATES,
  instantiateDocumentRegister,
  instantiateTemplate,
  timingLabel,
} from '../templates';
import type { Grant } from '../types';

const standard = DEFAULT_TEMPLATES[0];

function grant(
  overrides: Partial<Grant> = {},
): Pick<Grant, 'id' | 'loiRequired' | 'dates' | 'ownerId'> {
  return {
    id: 'g-test',
    ownerId: 's-barry',
    loiRequired: false,
    dates: { applicationDue: '2026-10-03' },
    ...overrides,
  };
}

function due(tasks: Array<{ title: string; dueDate?: string }>, title: string) {
  return tasks.find(t => t.title === title)?.dueDate;
}

describe('DEFAULT_TEMPLATES', () => {
  it('ships four templates, standard first', () => {
    expect(DEFAULT_TEMPLATES.map(t => t.name)).toEqual([
      'Foundation grant — standard',
      'Government grant',
      'Corporate sponsorship',
      'Renewal (returning funder)',
    ]);
  });

  it('gives every item a unique id', () => {
    for (const template of DEFAULT_TEMPLATES) {
      const ids = template.items.map(i => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('matches the standard checklist in the spec', () => {
    const applying = standard.items.filter(i => i.phase === 'applying');
    expect(applying.map(i => [i.title, i.offsetDays])).toEqual([
      ['Confirm attachments list with funder', -45],
      ['Update program narrative', -30],
      ['Build project budget', -21],
      ['Gather IRS determination letter and board list', -21],
      ['Update financial statements', -14],
      ['Director review', -7],
      ['Submit application', 0],
    ]);
  });

  it('adds the extra government paperwork', () => {
    const gov = DEFAULT_TEMPLATES[1];
    const titles = gov.items.map(i => i.title);
    expect(titles).toContain('Register in the funder portal');
    expect(titles).toContain('Get DUNS/UEI and SAM.gov confirmation');
    expect(titles).toContain('Board resolution authorising the application');
    expect(titles.filter(t => t === 'File quarterly report')).toHaveLength(3);
  });

  it('keeps the corporate sponsorship template short', () => {
    const corporate = DEFAULT_TEMPLATES[2];
    expect(corporate.items.length).toBeLessThan(standard.items.length / 2);
    const titles = corporate.items.map(i => i.title);
    expect(titles).toContain('Build the pitch deck');
    expect(titles).toContain('Send the sponsorship invoice');
    expect(titles).toContain('Deliver logo and acknowledgement package');
    expect(titles).toContain('Send thank-you with photos');
  });
});

describe('instantiateTemplate', () => {
  it('computes due dates as anchor + offsetDays', () => {
    const tasks = instantiateTemplate(standard, grant());
    expect(due(tasks, 'Submit application')).toBe('2026-10-03');
    expect(due(tasks, 'Director review')).toBe('2026-09-26');
    expect(due(tasks, 'Update financial statements')).toBe('2026-09-19');
    expect(due(tasks, 'Build project budget')).toBe('2026-09-12');
    expect(due(tasks, 'Update program narrative')).toBe('2026-09-03');
    expect(due(tasks, 'Confirm attachments list with funder')).toBe('2026-08-19');
  });

  it('crosses month and year boundaries correctly', () => {
    const tasks = instantiateTemplate(standard, grant({ dates: { applicationDue: '2027-01-10' } }));
    expect(due(tasks, 'Update program narrative')).toBe('2026-12-11');
    expect(due(tasks, 'Confirm attachments list with funder')).toBe('2026-11-26');
  });

  it('leaves dueDate undefined when the anchor date is unknown', () => {
    const tasks = instantiateTemplate(standard, grant({ dates: {} }));
    expect(tasks.every(t => t.dueDate === undefined)).toBe(true);
  });

  it('skips LOI items unless the grant requires an LOI', () => {
    const without = instantiateTemplate(standard, grant());
    expect(without.some(t => t.phase === 'loi')).toBe(false);

    const withLoi = instantiateTemplate(
      standard,
      grant({ loiRequired: true, dates: { loiDue: '2026-09-26' } }),
    );
    expect(due(withLoi, 'Draft LOI')).toBe('2026-09-12');
    expect(due(withLoi, 'Board chair review')).toBe('2026-09-21');
    expect(due(withLoi, 'Submit LOI')).toBe('2026-09-26');
  });

  it('drops excluded items and keeps order contiguous', () => {
    const all = instantiateTemplate(standard, grant());
    const excludeId = standard.items.find(i => i.title === 'Director review')!.id;
    const some = instantiateTemplate(standard, grant(), [excludeId]);
    expect(some).toHaveLength(all.length - 1);
    expect(some.some(t => t.title === 'Director review')).toBe(false);
    expect(some.map(t => t.order)).toEqual(some.map((_, i) => i));
  });

  it('creates every task open and assigned to the grant owner', () => {
    const tasks = instantiateTemplate(standard, grant());
    expect(tasks.every(t => t.done === false)).toBe(true);
    expect(tasks.every(t => t.assigneeId === 's-barry')).toBe(true);
    expect(tasks.every(t => t.grantId === 'g-test')).toBe(true);
  });
});

describe('document register', () => {
  it('is the five standard attachments, all needed', () => {
    expect(DEFAULT_DOCUMENT_REGISTER.map(d => d.kind)).toEqual([
      'narrative',
      'budget',
      'irs-letter',
      'board-list',
      'financials',
    ]);
    const docs = instantiateDocumentRegister('g-test', '2026-09-13');
    expect(docs).toHaveLength(5);
    expect(docs.every(d => d.status === 'needed')).toBe(true);
    expect(docs.every(d => d.grantId === 'g-test')).toBe(true);
  });
});

describe('timingLabel', () => {
  it('reads as plain English', () => {
    expect(timingLabel({ offsetDays: -21, anchor: 'applicationDue' })).toBe(
      '21 days before application due',
    );
    expect(timingLabel({ offsetDays: 0, anchor: 'loiDue' })).toBe('On LOI due');
    expect(timingLabel({ offsetDays: 1, anchor: 'submitted' })).toBe('1 day after submission');
  });
});
