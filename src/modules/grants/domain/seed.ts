import { SEED_TODAY } from '../../../core/seed';
import { PHASE_ORDER } from './phases';
import { DEFAULT_TEMPLATES, DEFAULT_TEMPLATE_ID, instantiateTemplate } from './templates';
import {
  LAC_BUDGET_LINES,
  LAC_EXPENSES,
  PAYMENT_PAGES,
  makeMoneyEmpty,
  makeMoneySeed,
  mapLine,
} from './seed-money';
import type {
  Activity,
  BudgetLine,
  ChecklistTemplate,
  Expense,
  Funder,
  Grant,
  GrantDocument,
  GrantsState,
  Payment,
  Phase,
  Report,
  Task,
} from './types';

/**
 * Demo data for the grants module (SPEC §3). "Today" in the story is 2026-09-13 and
 * FY27 started 2026-07-01.
 *
 * Funder contact names, emails and phone numbers are invented for the demo.
 * They are plausible-looking but none of them is a real person or address.
 */

/** The day the seed story is written around. Tests pin to this. */
export { SEED_TODAY };

// --- Funders ----------------------------------------------------------------

const FUNDERS: Funder[] = [
  {
    id: 'f-herb-alpert',
    name: 'Herb Alpert Foundation',
    type: 'foundation',
    contactName: 'Marisol Reyes',
    contactEmail: 'grants@example-herbalpert.org',
    website: 'https://example-herbalpert.org',
    cycleNotes: 'Invitation only. Renewal request each spring, decision in early July.',
    notes: 'Third year of general operating support. They care about musician hours, not slogans.',
  },
  {
    id: 'f-la-county-arts',
    name: 'LA County Dept. of Arts and Culture',
    type: 'government',
    contactName: 'Trevor Nakamura',
    contactEmail: 'ogp@example-lacountyarts.gov',
    contactPhone: '(213) 555-0148',
    website: 'https://example-lacountyarts.gov',
    cycleNotes: 'Organizational Grant Program. Applications in March, two-year cycle.',
    notes: 'Portal submission. Final report must go through the same portal.',
  },
  {
    id: 'f-lb-community-foundation',
    name: 'Long Beach Community Foundation',
    type: 'foundation',
    contactName: 'Paula Whitfield',
    contactEmail: 'programs@example-lbcf.org',
    contactPhone: '(562) 555-0172',
    cycleNotes: 'Rolling, reviewed quarterly by the grants committee.',
  },
  {
    id: 'f-signal-hill',
    name: 'City of Signal Hill',
    type: 'government',
    contactName: 'Angela Ruiz',
    contactEmail: 'communitygrants@example-signalhill.gov',
    contactPhone: '(562) 555-0119',
    cycleNotes: 'One round a year. Applications due late August, council votes in October.',
  },
  {
    id: 'f-port-of-long-beach',
    name: 'Port of Long Beach',
    type: 'corporate',
    contactName: 'Dean Okafor',
    contactEmail: 'sponsorships@example-polb.com',
    cycleNotes: 'Sponsorship requests accepted through the community giving portal.',
  },
  {
    id: 'f-parsons',
    name: 'Ralph M. Parsons Foundation',
    type: 'foundation',
    contactName: 'Helen Vasquez',
    contactEmail: 'inquiries@example-parsons.org',
    cycleNotes: 'Letter of inquiry first. Full proposal only if invited.',
  },
  {
    id: 'f-california-arts-council',
    name: 'California Arts Council',
    type: 'government',
    contactName: 'Jordan Pike',
    contactEmail: 'artsed@example-cac.ca.gov',
    cycleNotes: 'Arts Education Exposure opens each fall; guidelines posted in September.',
  },
  {
    id: 'f-arts-council-lb',
    name: 'Arts Council for Long Beach',
    type: 'government',
    contactName: 'Simone Bradford',
    contactEmail: 'grants@example-artslb.org',
    contactPhone: '(562) 555-0133',
    cycleNotes: 'Community Project Grants, one round each September.',
  },
  {
    id: 'f-boeing-ecf',
    name: 'Boeing Employees Community Fund',
    type: 'corporate',
    contactName: 'Ray Colton',
    contactEmail: 'ecf@example-boeingfund.org',
    cycleNotes: 'Employee-directed fund. Spring cycle only.',
  },
  {
    id: 'f-wells-fargo',
    name: 'Wells Fargo Foundation',
    type: 'corporate',
    contactName: 'Nia Fletcher',
    contactEmail: 'communitygiving@example-wf.com',
    cycleNotes: 'Annual community giving cycle, applications in November.',
  },
];

// --- Grants -----------------------------------------------------------------

const GRANTS: Grant[] = [
  {
    id: 'g-herb-alpert-2026',
    funderId: 'f-herb-alpert',
    title: 'General operating support 2026',
    program: 'general-operating',
    restriction: 'unrestricted',
    ownerId: 's-barry',
    phase: 'active',
    loiRequired: false,
    amountRequested: 50000,
    amountAwarded: 50000,
    dates: {
      applicationDue: '2026-04-30',
      submitted: '2026-04-28',
      decided: '2026-07-06',
      periodStart: '2026-07-01',
      periodEnd: '2027-06-30',
    },
    notes: 'Third year of support. Two installments, reports in January and July.',
    createdAt: '2026-02-10',
  },
  {
    id: 'g-la-county-2026',
    funderId: 'f-la-county-arts',
    title: 'Organizational Grant Program FY26-27',
    program: 'general-operating',
    restriction: 'unrestricted',
    ownerId: 's-barry',
    phase: 'reporting',
    loiRequired: false,
    amountRequested: 25000,
    amountAwarded: 22000,
    dates: {
      applicationDue: '2025-03-12',
      submitted: '2025-03-10',
      decided: '2025-06-20',
      periodStart: '2025-07-01',
      periodEnd: '2026-06-30',
    },
    notes: 'Period is over; the final report closes it out.',
    createdAt: '2025-01-15',
  },
  {
    id: 'g-lb-community-foundation-2026',
    funderId: 'f-lb-community-foundation',
    title: 'Youth Music Access',
    program: 'studio-sessions',
    restriction: 'restricted',
    ownerId: 's-denise',
    phase: 'active',
    loiRequired: false,
    amountRequested: 10000,
    amountAwarded: 8500,
    dates: {
      applicationDue: '2026-01-16',
      submitted: '2026-01-14',
      decided: '2026-07-09',
      periodStart: '2026-03-01',
      periodEnd: '2027-02-28',
    },
    notes:
      'The committee confirmed the award in July and backdated the grant period to March 1, so the award falls in FY27 while the period starts in FY26.',
    createdAt: '2025-11-20',
  },
  {
    id: 'g-signal-hill-2026',
    funderId: 'f-signal-hill',
    title: 'Studio equipment and sheet music',
    program: 'studio-sessions',
    restriction: 'restricted',
    ownerId: 's-denise',
    phase: 'submitted',
    loiRequired: false,
    amountRequested: 6000,
    dates: {
      startBy: '2026-06-15',
      applicationDue: '2026-08-21',
      submitted: '2026-08-20',
      decisionExpected: '2026-10-15',
    },
    notes: 'Council votes at the October 15 meeting.',
    createdAt: '2026-06-01',
  },
  {
    id: 'g-port-of-long-beach-2026',
    funderId: 'f-port-of-long-beach',
    title: 'In-School Program expansion',
    program: 'in-school',
    restriction: 'restricted',
    ownerId: 's-barry',
    phase: 'applying',
    loiRequired: false,
    amountRequested: 15000,
    dates: {
      startBy: '2026-09-01',
      applicationDue: '2026-10-03',
      decisionExpected: '2026-12-15',
    },
    notes: 'Two more Paramount Unified campuses in spring.',
    createdAt: '2026-08-12',
  },
  {
    id: 'g-parsons-2026',
    funderId: 'f-parsons',
    title: 'Jazz Legacy Program',
    program: 'jazz-legacy',
    restriction: 'restricted',
    ownerId: 's-barry',
    phase: 'loi',
    loiRequired: true,
    amountRequested: 30000,
    dates: {
      startBy: '2026-08-17',
      loiDue: '2026-09-26',
    },
    notes: 'Two pages maximum. Full proposal only by invitation.',
    createdAt: '2026-08-05',
  },
  {
    id: 'g-california-arts-council-2026',
    funderId: 'f-california-arts-council',
    title: 'Arts Education Exposure',
    program: 'in-school',
    restriction: 'restricted',
    ownerId: 's-denise',
    phase: 'prospect',
    loiRequired: false,
    amountRequested: 18000,
    dates: {
      startBy: '2026-10-01',
      applicationDue: '2026-12-05',
      decisionExpected: '2027-04-15',
    },
    notes: 'Guidelines post in September; confirm the match requirement before we start.',
    createdAt: '2026-09-02',
  },
  {
    id: 'g-arts-council-lb-2026',
    funderId: 'f-arts-council-lb',
    title: 'Community Project Grant',
    program: 'advanced-workshop',
    restriction: 'restricted',
    ownerId: 's-denise',
    phase: 'applying',
    loiRequired: false,
    amountRequested: 7500,
    dates: {
      startBy: '2026-07-10',
      applicationDue: '2026-09-05',
      decisionExpected: '2026-11-15',
    },
    notes: 'Everything is written. The application still has not gone in.',
    createdAt: '2026-06-25',
  },
  {
    id: 'g-boeing-2026',
    funderId: 'f-boeing-ecf',
    title: 'Instrument repair fund',
    program: 'studio-sessions',
    restriction: 'restricted',
    ownerId: 's-barry',
    phase: 'declined',
    loiRequired: false,
    amountRequested: 5000,
    dates: {
      startBy: '2026-02-20',
      applicationDue: '2026-04-15',
      submitted: '2026-04-10',
      decided: '2026-06-02',
    },
    notes: 'Declined — the fund went to health and human services this cycle. Try again in spring.',
    createdAt: '2026-03-01',
  },
  {
    id: 'g-wells-fargo-2025',
    funderId: 'f-wells-fargo',
    title: 'Homeschool Program 2025',
    program: 'homeschool',
    restriction: 'restricted',
    ownerId: 's-denise',
    phase: 'closed',
    loiRequired: false,
    amountRequested: 12000,
    amountAwarded: 12000,
    dates: {
      startBy: '2024-09-20',
      applicationDue: '2024-11-15',
      submitted: '2024-11-12',
      decided: '2025-01-20',
      periodStart: '2025-02-01',
      periodEnd: '2026-01-31',
    },
    notes: 'Closed May 2026 after the final report was accepted.',
    createdAt: '2024-10-01',
  },
];

// --- Tasks ------------------------------------------------------------------

/**
 * A seeded task is done when its phase is already behind the grant, or when
 * its due date has passed. That gives every grant a believable mix of done and
 * open work and guarantees the demo has exactly one overdue item — the one
 * forced open below.
 */
interface TaskSeedOptions {
  /** Treat the grant as having reached this phase (declined/withdrawn grants). */
  reachedPhase?: Phase;
  /** Task titles to leave open no matter what. */
  forceOpen?: string[];
}

const TASK_OPTIONS: Record<string, TaskSeedOptions> = {
  'g-boeing-2026': { reachedPhase: 'submitted' },
  'g-arts-council-lb-2026': { forceOpen: ['Submit application'] },
};

function seedTasks(grant: Grant, template: ChecklistTemplate, today: string): Task[] {
  const options = TASK_OPTIONS[grant.id] ?? {};
  const reached = options.reachedPhase ?? grant.phase;
  const reachedIndex = PHASE_ORDER.indexOf(reached);
  const forceOpen = new Set(options.forceOpen ?? []);

  return instantiateTemplate(template, grant).map((task, index) => {
    const taskIndex = PHASE_ORDER.indexOf(task.phase);
    const behind = taskIndex >= 0 && reachedIndex >= 0 && taskIndex < reachedIndex;
    const duePassed = !!task.dueDate && task.dueDate <= today;
    const done = forceOpen.has(task.title) ? false : behind || duePassed;
    return {
      ...task,
      id: `${grant.id}-t${index + 1}`,
      done,
      doneAt: done ? (task.dueDate && task.dueDate <= today ? task.dueDate : today) : undefined,
    };
  });
}

// --- Documents --------------------------------------------------------------

type DocSeed = [name: string, kind: GrantDocument['kind'], status: GrantDocument['status']];

const REGISTER_FOR_PHASE: Record<'prospect' | 'applying' | 'submitted' | 'awarded', DocSeed[]> = {
  prospect: [
    ['Program narrative', 'narrative', 'needed'],
    ['Project budget', 'budget', 'needed'],
    ['IRS determination letter', 'irs-letter', 'needed'],
    ['Board of directors list', 'board-list', 'needed'],
    ['Financial statements', 'financials', 'needed'],
  ],
  applying: [
    ['Program narrative', 'narrative', 'drafting'],
    ['Project budget', 'budget', 'drafting'],
    ['IRS determination letter', 'irs-letter', 'final'],
    ['Board of directors list', 'board-list', 'final'],
    ['Financial statements', 'financials', 'needed'],
  ],
  submitted: [
    ['Program narrative', 'narrative', 'submitted'],
    ['Project budget', 'budget', 'submitted'],
    ['IRS determination letter', 'irs-letter', 'submitted'],
    ['Board of directors list', 'board-list', 'submitted'],
    ['Financial statements', 'financials', 'submitted'],
  ],
  awarded: [
    ['Program narrative', 'narrative', 'submitted'],
    ['Project budget', 'budget', 'submitted'],
    ['IRS determination letter', 'irs-letter', 'submitted'],
    ['Board of directors list', 'board-list', 'submitted'],
    ['Financial statements', 'financials', 'submitted'],
    ['Award letter', 'award-letter', 'final'],
    ['Signed grant agreement', 'agreement', 'final'],
  ],
};

function registerKeyFor(grant: Grant): keyof typeof REGISTER_FOR_PHASE {
  switch (grant.phase) {
    case 'prospect':
      return 'prospect';
    case 'loi':
    case 'applying':
      return 'applying';
    case 'submitted':
    case 'declined':
    case 'withdrawn':
      return 'submitted';
    default:
      return 'awarded';
  }
}

function seedDocuments(grant: Grant): GrantDocument[] {
  const rows = REGISTER_FOR_PHASE[registerKeyFor(grant)];
  const updatedAt = grant.dates.decided ?? grant.dates.submitted ?? grant.createdAt;
  return rows.map((row, index) => ({
    id: `${grant.id}-d${index + 1}`,
    grantId: grant.id,
    name: row[0],
    kind: row[1],
    status: row[2],
    updatedAt,
  }));
}

// --- Money ------------------------------------------------------------------

const PAYMENTS: Payment[] = [
  {
    id: 'pay-ha-1',
    grantId: 'g-herb-alpert-2026',
    label: 'First installment',
    expectedDate: '2026-07-15',
    amount: 25000,
    receivedDate: '2026-07-15',
  },
  {
    id: 'pay-ha-2',
    grantId: 'g-herb-alpert-2026',
    label: 'Second installment',
    expectedDate: '2027-01-15',
    amount: 25000,
  },
  {
    id: 'pay-lac-1',
    grantId: 'g-la-county-2026',
    label: 'First installment',
    expectedDate: '2025-08-15',
    amount: 11000,
    receivedDate: '2025-08-20',
  },
  {
    id: 'pay-lac-2',
    grantId: 'g-la-county-2026',
    label: 'Final installment',
    expectedDate: '2026-02-15',
    amount: 11000,
    receivedDate: '2026-02-19',
  },
  {
    id: 'pay-lbcf-1',
    grantId: 'g-lb-community-foundation-2026',
    label: 'Full award',
    expectedDate: '2026-07-20',
    amount: 8500,
    receivedDate: '2026-07-20',
  },
  {
    id: 'pay-wf-1',
    grantId: 'g-wells-fargo-2025',
    label: 'Full award',
    expectedDate: '2025-02-10',
    amount: 12000,
    receivedDate: '2025-02-12',
  },
];

const BUDGET_LINES: BudgetLine[] = [
  // Herb Alpert — 50,000 planned, matching the award.
  {
    id: 'bl-ha-stipends',
    grantId: 'g-herb-alpert-2026',
    category: 'Teaching artist stipends',
    planned: 22000,
  },
  {
    id: 'bl-ha-music',
    grantId: 'g-herb-alpert-2026',
    category: 'Sheet music and charts',
    planned: 3000,
  },
  {
    id: 'bl-ha-repair',
    grantId: 'g-herb-alpert-2026',
    category: 'Instrument repair',
    planned: 5000,
  },
  {
    id: 'bl-ha-venue',
    grantId: 'g-herb-alpert-2026',
    category: 'Venue and performances',
    planned: 12000,
  },
  {
    id: 'bl-ha-admin',
    grantId: 'g-herb-alpert-2026',
    category: 'Admin and insurance',
    planned: 8000,
  },

  // Long Beach Community Foundation — 8,500 planned.
  {
    id: 'bl-lbcf-stipends',
    grantId: 'g-lb-community-foundation-2026',
    category: 'Teaching artist stipends',
    planned: 4500,
  },
  {
    id: 'bl-lbcf-music',
    grantId: 'g-lb-community-foundation-2026',
    category: 'Sheet music and charts',
    planned: 800,
  },
  {
    id: 'bl-lbcf-repair',
    grantId: 'g-lb-community-foundation-2026',
    category: 'Instrument repair',
    planned: 1200,
  },
  {
    id: 'bl-lbcf-venue',
    grantId: 'g-lb-community-foundation-2026',
    category: 'Venue and performances',
    planned: 1200,
  },
  {
    id: 'bl-lbcf-admin',
    grantId: 'g-lb-community-foundation-2026',
    category: 'Admin and insurance',
    planned: 800,
  },
];

/** Herb Alpert expenses total exactly 18,240. */
const EXPENSES: Expense[] = [
  {
    id: 'ex-ha-1',
    grantId: 'g-herb-alpert-2026',
    budgetLineId: 'bl-ha-admin',
    date: '2026-07-10',
    payee: 'Nonprofits Insurance Alliance',
    amount: 1090,
    note: 'General liability renewal',
  },
  {
    id: 'ex-ha-2',
    grantId: 'g-herb-alpert-2026',
    budgetLineId: 'bl-ha-repair',
    date: '2026-07-18',
    payee: 'Signal Hill Music Service',
    amount: 1240,
    note: 'Tenor sax overhaul',
  },
  {
    id: 'ex-ha-3',
    grantId: 'g-herb-alpert-2026',
    budgetLineId: 'bl-ha-stipends',
    date: '2026-07-24',
    payee: 'Melissa Hasin',
    amount: 1450,
    note: 'July studio sessions',
  },
  {
    id: 'ex-ha-4',
    grantId: 'g-herb-alpert-2026',
    budgetLineId: 'bl-ha-music',
    date: '2026-08-05',
    payee: 'JW Pepper',
    amount: 268,
    note: 'Big band charts',
  },
  {
    id: 'ex-ha-5',
    grantId: 'g-herb-alpert-2026',
    budgetLineId: 'bl-ha-stipends',
    date: '2026-08-08',
    payee: 'Albert Alva',
    amount: 1600,
    note: 'August workshop sessions',
  },
  {
    id: 'ex-ha-6',
    grantId: 'g-herb-alpert-2026',
    budgetLineId: 'bl-ha-stipends',
    date: '2026-08-15',
    payee: 'Jazz Angels payroll',
    amount: 8000,
    note: 'Summer teaching artist payroll',
  },
  {
    id: 'ex-ha-7',
    grantId: 'g-herb-alpert-2026',
    budgetLineId: 'bl-ha-venue',
    date: '2026-08-22',
    payee: 'Expo Arts Center',
    amount: 1800,
    note: 'Fall concert deposit',
  },
  {
    id: 'ex-ha-8',
    grantId: 'g-herb-alpert-2026',
    budgetLineId: 'bl-ha-repair',
    date: '2026-08-30',
    payee: 'Long Beach Band Repair',
    amount: 780,
    note: 'Trumpet valve work and two clarinet pads',
  },
  {
    id: 'ex-ha-9',
    grantId: 'g-herb-alpert-2026',
    budgetLineId: 'bl-ha-music',
    date: '2026-09-02',
    payee: 'Sheet Music Plus',
    amount: 412,
    note: 'Ellington and Basie charts',
  },
  {
    id: 'ex-ha-10',
    grantId: 'g-herb-alpert-2026',
    budgetLineId: 'bl-ha-stipends',
    date: '2026-09-08',
    payee: 'Albert Alva',
    amount: 1600,
    note: 'September workshop sessions',
  },

  {
    id: 'ex-lbcf-1',
    grantId: 'g-lb-community-foundation-2026',
    budgetLineId: 'bl-lbcf-stipends',
    date: '2026-07-28',
    payee: 'Melissa Hasin',
    amount: 900,
    note: 'Saturday studio sessions',
  },
  {
    id: 'ex-lbcf-2',
    grantId: 'g-lb-community-foundation-2026',
    budgetLineId: 'bl-lbcf-music',
    date: '2026-08-12',
    payee: 'JW Pepper',
    amount: 240,
    note: 'Beginner combo charts',
  },
  {
    id: 'ex-lbcf-3',
    grantId: 'g-lb-community-foundation-2026',
    budgetLineId: 'bl-lbcf-repair',
    date: '2026-08-26',
    payee: 'Long Beach Band Repair',
    amount: 385,
    note: 'Loaner trombone slide',
  },
  {
    id: 'ex-lbcf-4',
    grantId: 'g-lb-community-foundation-2026',
    budgetLineId: 'bl-lbcf-stipends',
    date: '2026-09-04',
    payee: 'Albert Alva',
    amount: 900,
    note: 'September studio sessions',
  },
];

const REPORTS: Report[] = [
  {
    id: 'rep-ha-interim',
    grantId: 'g-herb-alpert-2026',
    kind: 'interim',
    dueDate: '2027-01-31',
    status: 'upcoming',
  },
  {
    id: 'rep-ha-final',
    grantId: 'g-herb-alpert-2026',
    kind: 'final',
    dueDate: '2027-07-31',
    status: 'upcoming',
  },
  {
    id: 'rep-lac-final',
    grantId: 'g-la-county-2026',
    kind: 'final',
    dueDate: '2026-09-30',
    status: 'drafting',
  },
  {
    id: 'rep-lbcf-final',
    grantId: 'g-lb-community-foundation-2026',
    kind: 'final',
    dueDate: '2027-03-15',
    status: 'upcoming',
  },
  {
    id: 'rep-wf-final',
    grantId: 'g-wells-fargo-2025',
    kind: 'final',
    dueDate: '2026-04-30',
    submittedDate: '2026-04-22',
    status: 'accepted',
  },
];

// --- Activity ---------------------------------------------------------------

type ActivitySeed = [grantId: string, date: string, whoId: string, text: string];

const ACTIVITY_SEED: ActivitySeed[] = [
  ['g-herb-alpert-2026', '2026-02-10', 's-barry', 'Grant added'],
  ['g-herb-alpert-2026', '2026-03-02', 's-barry', 'Phase changed to Applying'],
  ['g-herb-alpert-2026', '2026-04-28', 's-barry', 'Marked submitted'],
  [
    'g-herb-alpert-2026',
    '2026-07-06',
    's-barry',
    'Award recorded: $50,000 for Jul 1, 2026 – Jun 30, 2027',
  ],
  ['g-herb-alpert-2026', '2026-07-14', 's-denise', 'Agreement signed'],
  ['g-herb-alpert-2026', '2026-07-15', 's-denise', 'Payment received: $25,000 (First installment)'],
  ['g-herb-alpert-2026', '2026-08-15', 's-denise', 'Logged $8,000 to Teaching artist stipends'],

  ['g-la-county-2026', '2025-01-15', 's-barry', 'Grant added'],
  ['g-la-county-2026', '2025-03-10', 's-barry', 'Marked submitted'],
  [
    'g-la-county-2026',
    '2025-06-20',
    's-barry',
    'Award recorded: $22,000 for Jul 1, 2025 – Jun 30, 2026',
  ],
  ['g-la-county-2026', '2025-07-08', 's-denise', 'Agreement signed'],
  ['g-la-county-2026', '2026-08-24', 's-barry', 'Started the final report'],

  ['g-lb-community-foundation-2026', '2025-11-20', 's-denise', 'Grant added'],
  ['g-lb-community-foundation-2026', '2026-01-14', 's-denise', 'Marked submitted'],
  [
    'g-lb-community-foundation-2026',
    '2026-07-09',
    's-denise',
    'Award recorded: $8,500 for Mar 1, 2026 – Feb 28, 2027',
  ],
  [
    'g-lb-community-foundation-2026',
    '2026-07-20',
    's-denise',
    'Payment received: $8,500 (Full award)',
  ],

  ['g-signal-hill-2026', '2026-06-01', 's-denise', 'Grant added'],
  ['g-signal-hill-2026', '2026-07-06', 's-denise', 'Phase changed to Applying'],
  ['g-signal-hill-2026', '2026-08-20', 's-denise', 'Marked submitted'],

  ['g-port-of-long-beach-2026', '2026-08-12', 's-barry', 'Grant added'],
  ['g-port-of-long-beach-2026', '2026-09-01', 's-barry', 'Phase changed to Applying'],

  ['g-parsons-2026', '2026-08-05', 's-barry', 'Grant added'],
  ['g-parsons-2026', '2026-08-17', 's-barry', 'Phase changed to LOI'],
  ['g-parsons-2026', '2026-09-12', 's-barry', 'Note: draft LOI is with Albert for a read'],

  ['g-california-arts-council-2026', '2026-09-02', 's-denise', 'Grant added'],

  ['g-arts-council-lb-2026', '2026-06-25', 's-denise', 'Grant added'],
  ['g-arts-council-lb-2026', '2026-07-10', 's-denise', 'Phase changed to Applying'],
  [
    'g-arts-council-lb-2026',
    '2026-09-04',
    's-barry',
    'Note: narrative approved, waiting on the portal login',
  ],

  ['g-boeing-2026', '2026-03-01', 's-barry', 'Grant added'],
  ['g-boeing-2026', '2026-04-10', 's-barry', 'Marked submitted'],
  [
    'g-boeing-2026',
    '2026-06-02',
    's-barry',
    'Decline recorded: fund directed to health and human services this cycle',
  ],

  ['g-wells-fargo-2025', '2024-10-01', 's-denise', 'Grant added'],
  ['g-wells-fargo-2025', '2024-11-12', 's-denise', 'Marked submitted'],
  [
    'g-wells-fargo-2025',
    '2025-01-20',
    's-denise',
    'Award recorded: $12,000 for Feb 1, 2025 – Jan 31, 2026',
  ],
  ['g-wells-fargo-2025', '2025-02-12', 's-denise', 'Payment received: $12,000 (Full award)'],
  ['g-wells-fargo-2025', '2026-04-22', 's-denise', 'Final report submitted'],
  ['g-wells-fargo-2025', '2026-05-14', 's-barry', 'Grant closed'],
];

function seedActivity(): Activity[] {
  return ACTIVITY_SEED.map((row, index) => ({
    id: `act-${index + 1}`,
    grantId: row[0],
    at: `${row[1]}T09:00:00.000Z`,
    whoId: row[2],
    text: row[3],
  }));
}

// --- Assembly ---------------------------------------------------------------

/** A fresh copy of the demo data set. Never mutate the result in place. */
export function makeSeed(): GrantsState {
  const templates: ChecklistTemplate[] = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
  const standard = templates.find(t => t.id === DEFAULT_TEMPLATE_ID) ?? templates[0];

  const grants: Grant[] = JSON.parse(JSON.stringify(GRANTS));

  const tasks: Task[] = grants.flatMap(grant => seedTasks(grant, standard, SEED_TODAY));
  const documents: GrantDocument[] = grants.flatMap(seedDocuments);

  // Every budget line is mapped to QuickBooks, and every expense came from it.
  const budgetLines: BudgetLine[] = [...BUDGET_LINES, ...LAC_BUDGET_LINES].map(mapLine);
  const moneySeed = makeMoneySeed(
    budgetLines,
    JSON.parse(JSON.stringify([...EXPENSES, ...LAC_EXPENSES])),
  );
  const payments: Payment[] = PAYMENTS.map(p => ({ ...p, sourcePage: PAYMENT_PAGES[p.id] }));

  return {
    funders: JSON.parse(JSON.stringify(FUNDERS)),
    grants,
    tasks,
    documents,
    payments,
    budgetLines,
    reports: JSON.parse(JSON.stringify(REPORTS)),
    activity: seedActivity(),
    templates,
    ...moneySeed,
  };
}

/**
 * What a new office starts with when the demo is off (decision 0004): no
 * funders, grants or money, no checklist templates, the default reminders.
 */
export function makeEmpty(): GrantsState {
  return {
    funders: [],
    grants: [],
    tasks: [],
    documents: [],
    payments: [],
    budgetLines: [],
    reports: [],
    activity: [],
    templates: [],
    ...makeMoneyEmpty(),
  };
}
