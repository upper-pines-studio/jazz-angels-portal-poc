import { addDays, format, parseISO } from 'date-fns';
import { SEED_TODAY } from '../../../core/seed';
import type {
  AwardTerm,
  BudgetLine,
  Expense,
  GrantFile,
  GrantsState,
  QbAccount,
  QbClass,
  ReminderDefaults,
  ReminderPlan,
  SplitRule,
  Transaction,
} from './types';

/**
 * Demo data for the money side of a grant: the QuickBooks chart of accounts,
 * what QuickBooks has sent, the files kept with each grant, the award terms
 * and the reminder emails. The story is written around 2026-09-13.
 *
 * Payees are the vendors and teaching artists the rest of the demo already
 * names. Amounts, bill numbers and file names are invented.
 */

const HA = 'g-herb-alpert-2026';
const LBCF = 'g-lb-community-foundation-2026';
const LAC = 'g-la-county-2026';

export const ACCOUNTS: QbAccount[] = [
  { code: '6200', name: 'Contract instructors' },
  { code: '6410', name: 'Program supplies' },
  { code: '6420', name: 'Repairs and maintenance' },
  { code: '6500', name: 'Facility rental' },
  { code: '6510', name: 'Event space' },
  { code: '6520', name: 'Utilities' },
  { code: '6530', name: 'Telephone and internet' },
  { code: '6700', name: 'Insurance' },
  { code: '6710', name: 'Office' },
  { code: '6720', name: 'Software' },
  { code: '6800', name: 'Bank fees' },
];

export const CLASS_HA = 'c-herb-alpert';
export const CLASS_LBCF = 'c-lbcf';
export const CLASS_LAC = 'c-la-county';

export const CLASSES: QbClass[] = [
  { id: CLASS_HA, name: 'Herb Alpert GOS' },
  { id: CLASS_LBCF, name: 'LBCF Youth Music' },
  { id: CLASS_LAC, name: 'LA County OGP' },
];

/** The five categories every Jazz Angels budget uses, and the accounts behind each. */
export const CATEGORY_ACCOUNTS: Record<string, string[]> = {
  'Teaching artist stipends': ['6200'],
  'Sheet music and charts': ['6410'],
  'Instrument repair': ['6420'],
  'Venue and performances': ['6500'],
  'Admin and insurance': ['6700', '6710'],
};

const CLASS_FOR_GRANT: Record<string, string> = {
  [HA]: CLASS_HA,
  [LBCF]: CLASS_LBCF,
  [LAC]: CLASS_LAC,
};

/** Give a seeded budget line its QuickBooks accounts and class. */
export function mapLine(line: BudgetLine): BudgetLine {
  return {
    ...line,
    accountCodes: CATEGORY_ACCOUNTS[line.category] ?? [],
    classId: CLASS_FOR_GRANT[line.grantId],
  };
}

// --- LA County: a finished year ---------------------------------------------

export const LAC_BUDGET_LINES: BudgetLine[] = [
  { id: 'bl-lac-stipends', grantId: LAC, category: 'Teaching artist stipends', planned: 12000 },
  { id: 'bl-lac-music', grantId: LAC, category: 'Sheet music and charts', planned: 2000 },
  { id: 'bl-lac-repair', grantId: LAC, category: 'Instrument repair', planned: 3000 },
  { id: 'bl-lac-venue', grantId: LAC, category: 'Venue and performances', planned: 3000 },
  { id: 'bl-lac-admin', grantId: LAC, category: 'Admin and insurance', planned: 2000 },
];

/** Jul 2025 to Jun 2026, as `YYYY-MM`. */
const LAC_MONTHS = [
  '2025-07',
  '2025-08',
  '2025-09',
  '2025-10',
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
];

interface LacPlan {
  lineId: string;
  total: number;
  /** One entry per expense: the month index, the day, the payee, what it was for. */
  entries: Array<[month: number, day: number, payee: string, note: string]>;
}

const ARTISTS = ['Albert Alva', 'Devon Price', 'Renee Cole'];

const LAC_PLANS: LacPlan[] = [
  {
    lineId: 'bl-lac-stipends',
    total: 11900,
    entries: LAC_MONTHS.flatMap((_, m) =>
      [8, 15, 22].map((day, i): [number, number, string, string] => [
        m,
        day,
        ARTISTS[(m + i) % ARTISTS.length],
        ['Studio sessions', 'Sectional coaching', 'Combo rehearsals'][i],
      ]),
    ),
  },
  {
    lineId: 'bl-lac-music',
    total: 1960,
    entries: [
      [1, 12, 'JW Pepper', 'Fall big band charts'],
      [2, 4, 'Sheet Music Plus', 'Combo book, set of eight'],
      [3, 19, 'JW Pepper', 'Holiday concert charts'],
      [4, 6, 'Sam Ash Music', 'Method books'],
      [6, 14, 'JW Pepper', 'Spring big band charts'],
      [7, 9, 'Sheet Music Plus', 'Monk and Mingus charts'],
      [8, 17, 'Sam Ash Music', 'Rhythm section method books'],
      [10, 5, 'JW Pepper', 'Festival set'],
    ],
  },
  {
    lineId: 'bl-lac-repair',
    total: 2900,
    entries: [
      [0, 24, 'Long Beach Band Repair', 'Alto sax pads'],
      [2, 11, 'Signal Hill Music Service', 'Trombone slide alignment'],
      [3, 27, 'Long Beach Band Repair', 'Trumpet valve work'],
      [5, 3, 'Long Beach Band Repair', 'Bari sax neck cork and pads'],
      [6, 21, 'Signal Hill Music Service', 'Upright bass bridge'],
      [8, 10, 'Long Beach Band Repair', 'Clarinet overhaul'],
      [9, 16, 'Signal Hill Music Service', 'Drum kit hardware'],
      [11, 8, 'Long Beach Band Repair', 'Loaner instruments, year-end service'],
    ],
  },
  {
    lineId: 'bl-lac-venue',
    total: 2800,
    entries: [
      [1, 28, 'Signal Hill Community Center', 'Room rental, fall kickoff'],
      [3, 18, 'Expo Arts Center', 'Fall concert'],
      [5, 13, 'Expo Arts Center', 'Holiday concert'],
      [6, 30, 'Signal Hill Community Center', 'Room rental, winter clinic'],
      [8, 21, 'Expo Arts Center', 'Spring concert deposit'],
      [9, 25, 'Expo Arts Center', 'Spring concert balance'],
      [10, 16, 'Signal Hill Community Center', 'Room rental, festival rehearsal'],
      [11, 13, 'Expo Arts Center', 'Year-end showcase'],
    ],
  },
  {
    lineId: 'bl-lac-admin',
    total: 1900,
    entries: LAC_MONTHS.map((_, m): [number, number, string, string] =>
      m % 3 === 0
        ? [m, 10, 'Nonprofits Insurance Alliance', 'Liability insurance, quarterly']
        : [m, 18, 'Staples', 'Office supplies'],
    ),
  },
];

function lacExpenses(): Expense[] {
  const out: Expense[] = [];
  for (const plan of LAC_PLANS) {
    const each = Math.floor(plan.total / plan.entries.length);
    plan.entries.forEach(([m, day, payee, note], i) => {
      const last = i === plan.entries.length - 1;
      out.push({
        id: `ex-lac-${out.length + 1}`,
        grantId: LAC,
        budgetLineId: plan.lineId,
        date: `${LAC_MONTHS[m]}-${String(day).padStart(2, '0')}`,
        payee,
        amount: last ? plan.total - each * (plan.entries.length - 1) : each,
        note,
      });
    });
  }
  return out;
}

/** LA County's 72 expenses. They total exactly 21,460. */
export const LAC_EXPENSES: Expense[] = lacExpenses();

// --- Transactions -----------------------------------------------------------

function plusDays(date: string, days: number): string {
  return format(addDays(parseISO(date), days), 'yyyy-MM-dd');
}

const isPerson = (payee: string) =>
  ARTISTS.includes(payee) || payee === 'Melissa Hasin' || payee === 'Jazz Angels payroll';

/** The QuickBooks transaction behind an expense that is already on a line. */
function assignedTransaction(expense: Expense, line: BudgetLine, n: number): Transaction {
  return {
    id: `tx-${expense.id}`,
    date: expense.date,
    payee: expense.payee,
    memo: expense.note ?? '',
    accountCode: line.accountCodes?.[0] ?? '6710',
    classId: line.classId,
    amount: expense.amount,
    ref: isPerson(expense.payee) ? `Check ${2100 + n}` : `Bill ${1000 + n}`,
    status: 'assigned',
    assignedById: 's-denise',
    assignedAt: plusDays(expense.date, 2) > SEED_TODAY ? SEED_TODAY : plusDays(expense.date, 2),
  };
}

/** Fourteen transactions are waiting. Nine of them have a proposal. */
const TO_ASSIGN: Transaction[] = [
  {
    id: 'tx-new-1',
    date: '2026-09-11',
    payee: 'Albert Alva',
    memo: 'Studio sessions, Sep 6',
    accountCode: '6200',
    classId: CLASS_HA,
    amount: 725,
    ref: 'Check 2231',
    status: 'to-assign',
  },
  {
    id: 'tx-new-2',
    date: '2026-09-10',
    payee: 'Signal Hill Properties',
    memo: 'September studio rent',
    accountCode: '6500',
    amount: 2400,
    ref: 'Bill 1112',
    status: 'to-assign',
  },
  {
    id: 'tx-new-3',
    date: '2026-09-10',
    payee: 'Renee Cole',
    memo: 'In-school residency, week 2',
    accountCode: '6200',
    amount: 540,
    ref: 'Check 2230',
    status: 'to-assign',
  },
  {
    id: 'tx-new-4',
    date: '2026-09-09',
    payee: 'Sam Ash Music',
    memo: 'Big band method books',
    accountCode: '6410',
    classId: CLASS_HA,
    amount: 186,
    ref: 'Expense',
    status: 'to-assign',
  },
  {
    id: 'tx-new-5',
    date: '2026-09-08',
    payee: 'Southern California Edison',
    memo: 'Studio electric, August',
    accountCode: '6520',
    amount: 212,
    ref: 'Bill 1111',
    status: 'to-assign',
  },
  {
    id: 'tx-new-6',
    date: '2026-09-08',
    payee: 'Long Beach Band Repair',
    memo: 'Trombone slide repair',
    accountCode: '6420',
    classId: CLASS_HA,
    amount: 145,
    ref: 'Bill 1110',
    status: 'to-assign',
  },
  {
    id: 'tx-new-7',
    date: '2026-09-05',
    payee: 'Intuit QuickBooks',
    memo: 'QuickBooks Online, September',
    accountCode: '6720',
    amount: 99,
    ref: 'Expense',
    status: 'to-assign',
  },
  {
    id: 'tx-new-8',
    date: '2026-09-04',
    payee: 'Devon Price',
    memo: 'Saxophone sectional coaching',
    accountCode: '6200',
    classId: CLASS_HA,
    amount: 300,
    ref: 'Check 2229',
    status: 'to-assign',
  },
  {
    id: 'tx-new-9',
    date: '2026-09-03',
    payee: 'Signal Hill Community Center',
    memo: 'Room rental, Aug 30 concert',
    accountCode: '6510',
    amount: 600,
    ref: 'Bill 1109',
    status: 'to-assign',
  },
  {
    id: 'tx-new-10',
    date: '2026-09-02',
    payee: 'Staples',
    memo: 'Folders and printer paper',
    accountCode: '6710',
    classId: CLASS_HA,
    amount: 64,
    ref: 'Expense',
    status: 'to-assign',
  },
  {
    id: 'tx-new-11',
    date: '2026-08-31',
    payee: 'JW Pepper',
    memo: 'Beginner combo charts, set two',
    accountCode: '6410',
    classId: CLASS_LBCF,
    amount: 128,
    ref: 'Bill 1108',
    status: 'to-assign',
  },
  {
    id: 'tx-new-12',
    date: '2026-08-29',
    payee: 'Renee Cole',
    memo: 'In-school residency, week 1',
    accountCode: '6200',
    classId: CLASS_LBCF,
    amount: 540,
    ref: 'Check 2228',
    status: 'to-assign',
  },
  {
    id: 'tx-new-13',
    date: '2026-08-28',
    payee: 'Melissa Hasin',
    memo: 'Cello and bass clinic',
    accountCode: '6200',
    amount: 450,
    ref: 'Check 2227',
    status: 'to-assign',
  },
  {
    id: 'tx-new-14',
    date: '2026-08-27',
    payee: 'Sam Ash Music',
    memo: 'Reeds and valve oil',
    accountCode: '6410',
    amount: 92,
    ref: 'Expense',
    status: 'to-assign',
  },
];

/** Still in QuickBooks. These arrive the next time someone syncs. */
const INCOMING: Transaction[] = [
  {
    id: 'tx-in-1',
    date: '2026-09-13',
    payee: 'JW Pepper',
    memo: 'Fall concert charts',
    accountCode: '6410',
    classId: CLASS_HA,
    amount: 142,
    ref: 'Bill 1114',
    status: 'to-assign',
  },
  {
    id: 'tx-in-2',
    date: '2026-09-12',
    payee: 'Devon Price',
    memo: 'Saxophone sectional coaching',
    accountCode: '6200',
    classId: CLASS_HA,
    amount: 300,
    ref: 'Check 2232',
    status: 'to-assign',
  },
  {
    id: 'tx-in-3',
    date: '2026-09-12',
    payee: 'Verizon Business',
    memo: 'Studio internet, September',
    accountCode: '6530',
    amount: 85,
    ref: 'Bill 1113',
    status: 'to-assign',
  },
];

/** Overhead nobody charges to a grant: 41 transactions over the last twelve months. */
function notGrantFunded(): Transaction[] {
  const months = [
    '2025-09',
    '2025-10',
    '2025-11',
    '2025-12',
    '2026-01',
    '2026-02',
    '2026-03',
    '2026-04',
    '2026-05',
    '2026-06',
    '2026-07',
    '2026-08',
  ];
  const monthly: Array<
    [payee: string, memo: string, account: string, amount: number, day: number]
  > = [
    ['Intuit QuickBooks', 'QuickBooks Online', '6720', 99, 5],
    ['Verizon Business', 'Studio internet', '6530', 85, 12],
    ['Gusto', 'Payroll service', '6720', 64, 1],
  ];
  const out: Transaction[] = [];
  for (const month of months) {
    for (const [payee, memo, accountCode, amount, day] of monthly) {
      out.push({
        id: `tx-ngf-${out.length + 1}`,
        date: `${month}-${String(day).padStart(2, '0')}`,
        payee,
        memo: `${memo}, ${format(parseISO(`${month}-01`), 'MMMM')}`,
        accountCode,
        amount,
        ref: 'Expense',
        status: 'not-grant-funded',
        assignedById: 's-denise',
        assignedAt: `${month}-${String(Math.min(day + 3, 28)).padStart(2, '0')}`,
      });
    }
  }
  // Five bank fees round it out to 41.
  for (const month of months.slice(-5)) {
    out.push({
      id: `tx-ngf-${out.length + 1}`,
      date: `${month}-28`,
      payee: 'Farmers and Merchants Bank',
      memo: 'Monthly account fee',
      accountCode: '6800',
      amount: 15,
      ref: 'Expense',
      status: 'not-grant-funded',
      assignedById: 's-denise',
      assignedAt: `${month}-28`,
    });
  }
  return out;
}

// --- Files ------------------------------------------------------------------

type FileSeed = [
  expenseId: string,
  kind: GrantFile['kind'],
  name: string,
  format: GrantFile['format'],
  sizeKb: number,
  pages: number | undefined,
  by: string,
  daysAfter: number,
];

/** Backup for the Herb Alpert and Long Beach expenses. Three Herb Alpert expenses have none yet. */
const EXPENSE_FILES: FileSeed[] = [
  ['ex-ha-1', 'invoice', 'NIA renewal invoice 2026.pdf', 'pdf', 188, 2, 's-denise', 2],

  [
    'ex-ha-2',
    'receipt',
    'Receipt, Signal Hill Music Service.jpg',
    'jpg',
    1843,
    undefined,
    's-denise',
    1,
  ],
  ['ex-ha-2', 'invoice', 'Invoice 3318, tenor sax overhaul.pdf', 'pdf', 214, 1, 's-barry', 3],

  ['ex-ha-3', 'invoice', 'Hasin invoice, July sessions.pdf', 'pdf', 96, 1, 's-denise', 2],
  ['ex-ha-3', 'timesheet', 'Hasin timesheet, July.pdf', 'pdf', 74, 1, 's-denise', 2],

  ['ex-ha-4', 'receipt', 'JW Pepper order 88214.pdf', 'pdf', 132, 1, 's-denise', 1],

  ['ex-ha-5', 'invoice', 'Alva invoice, August workshop.pdf', 'pdf', 91, 1, 's-denise', 3],
  ['ex-ha-5', 'timesheet', 'Alva timesheet, August.pdf', 'pdf', 70, 1, 's-denise', 3],

  ['ex-ha-6', 'other', 'Payroll register, summer session.pdf', 'pdf', 342, 4, 's-denise', 2],
  ['ex-ha-6', 'timesheet', 'Teaching artist timesheets, summer.pdf', 'pdf', 518, 9, 's-denise', 2],

  ['ex-ha-7', 'invoice', 'Expo Arts Center deposit invoice.pdf', 'pdf', 156, 1, 's-barry', 1],
  ['ex-ha-7', 'other', 'Expo Arts Center rental agreement.pdf', 'pdf', 604, 5, 's-barry', 1],
  ['ex-ha-7', 'receipt', 'Deposit check, photo.jpg', 'jpg', 1210, undefined, 's-denise', 4],

  ['ex-lbcf-1', 'invoice', 'Hasin invoice, Saturday sessions.pdf', 'pdf', 94, 1, 's-denise', 2],
  ['ex-lbcf-2', 'receipt', 'JW Pepper order 88390.pdf', 'pdf', 128, 1, 's-denise', 1],
  [
    'ex-lbcf-3',
    'receipt',
    'Receipt, Long Beach Band Repair.jpg',
    'jpg',
    1536,
    undefined,
    's-denise',
    2,
  ],
];

const EXPENSE_NOTES: Record<string, string> = {
  'ex-ha-2': 'Quote approved by Barry on Jul 12. Horn is loaner #14 from the instrument library.',
  'ex-ha-7': 'Deposit holds Nov 21 for the fall concert. Balance is due a week before.',
};

const GRANT_FILES: GrantFile[] = [
  {
    id: 'file-ha-award',
    grantId: HA,
    kind: 'award-letter',
    name: 'HAF-award-letter-2026.pdf',
    format: 'pdf',
    sizeKb: 412,
    pages: 3,
    uploadedById: 's-denise',
    uploadedAt: '2026-07-08',
  },
  {
    id: 'file-ha-agreement',
    grantId: HA,
    kind: 'agreement',
    name: 'HAF-grant-agreement-signed.pdf',
    format: 'pdf',
    sizeKb: 1229,
    pages: 6,
    uploadedById: 's-barry',
    uploadedAt: '2026-07-14',
  },
  {
    id: 'file-lbcf-award',
    grantId: LBCF,
    kind: 'award-letter',
    name: 'LBCF-award-letter-youth-music-access.pdf',
    format: 'pdf',
    sizeKb: 286,
    pages: 2,
    uploadedById: 's-denise',
    uploadedAt: '2026-07-10',
  },
  {
    id: 'file-lac-award',
    grantId: LAC,
    kind: 'award-letter',
    name: 'LA-County-OGP-award-notice.pdf',
    format: 'pdf',
    sizeKb: 530,
    pages: 4,
    uploadedById: 's-denise',
    uploadedAt: '2025-06-24',
  },
  {
    id: 'file-lac-agreement',
    grantId: LAC,
    kind: 'agreement',
    name: 'LA-County-OGP-contract-signed.pdf',
    format: 'pdf',
    sizeKb: 1874,
    pages: 14,
    uploadedById: 's-barry',
    uploadedAt: '2025-07-08',
  },
];

function expenseFiles(expenses: Expense[]): GrantFile[] {
  const byId = new Map(expenses.map(e => [e.id, e]));
  const out: GrantFile[] = [];

  EXPENSE_FILES.forEach(([expenseId, kind, name, fmt, sizeKb, pages, by, daysAfter], i) => {
    const expense = byId.get(expenseId);
    if (!expense) return;
    out.push({
      id: `file-${i + 1}`,
      grantId: expense.grantId,
      expenseId,
      kind,
      name,
      format: fmt,
      sizeKb,
      pages,
      uploadedById: by,
      uploadedAt: plusDays(expense.date, daysAfter),
    });
  });

  // LA County is ready for its final report: every expense has its backup.
  for (const expense of expenses) {
    if (expense.grantId !== LAC) continue;
    const person = isPerson(expense.payee);
    out.push({
      id: `file-${expense.id}`,
      grantId: LAC,
      expenseId: expense.id,
      kind: person ? 'invoice' : 'receipt',
      name: `${person ? 'Invoice' : 'Receipt'}, ${expense.payee}, ${format(parseISO(expense.date), 'MMM d')}.pdf`,
      format: 'pdf',
      sizeKb: 80 + ((expense.amount * 7) % 240),
      pages: 1,
      uploadedById: 's-denise',
      uploadedAt: plusDays(expense.date, 3),
    });
  }
  return out;
}

// --- Award terms ------------------------------------------------------------

type TermSeed = [grantId: string, label: string, text: string, page: number];

const TERMS: TermSeed[] = [
  [HA, 'Allowed uses', 'Any program or operating cost, including salaries, rent and insurance.', 1],
  [
    HA,
    'Capital purchases',
    'No single equipment purchase over $5,000 without written approval.',
    2,
  ],
  [HA, 'Lobbying', 'None of the grant may pay for lobbying or political campaigns.', 2],
  [
    HA,
    'Budget changes',
    'Moving more than 10% of the budget between lines needs written approval.',
    2,
  ],
  [
    HA,
    'Unspent funds',
    'Money unspent on Jun 30, 2027 is returned unless a carryover is approved in writing.',
    2,
  ],
  [
    HA,
    'Acknowledgement',
    'Name the Herb Alpert Foundation in concert programs and on the website.',
    3,
  ],
  [
    HA,
    'Reports',
    'Interim report by Jan 31, 2027 and final by Jul 31, 2027, with student numbers.',
    3,
  ],

  [
    LBCF,
    'Allowed uses',
    'Direct costs of the youth music program only: instruction, music, instruments and venues.',
    1,
  ],
  [LBCF, 'Admin costs', 'No more than 10% of the award may go to administration and insurance.', 1],
  [
    LBCF,
    'Unspent funds',
    'Carrying funds past Feb 28, 2027 needs written approval from the foundation.',
    2,
  ],
  [LBCF, 'Students served', 'Serve at least 40 Long Beach students, counted by enrollment.', 2],
  [
    LBCF,
    'Reports',
    'Final report by Mar 15, 2027, with attendance and a budget against actual.',
    2,
  ],

  [LAC, 'Allowed uses', 'Operating costs of the organization within Los Angeles County.', 1],
  [LAC, 'Matching funds', 'A one-to-one match from other sources, shown in the final report.', 2],
  [
    LAC,
    'Unspent funds',
    'Report any unspent balance in the final report. The county decides whether it is returned.',
    3,
  ],
  [
    LAC,
    'Records',
    'Keep receipts and backup for every expense for four years after the grant ends.',
    3,
  ],
  [LAC, 'Reports', 'Final report through the county portal by Sep 30, 2026.', 4],
];

function terms(): AwardTerm[] {
  const order = new Map<string, number>();
  return TERMS.map(([grantId, label, text, page], i) => {
    const n = (order.get(grantId) ?? 0) + 1;
    order.set(grantId, n);
    return { id: `term-${i + 1}`, grantId, label, text, page, order: n };
  });
}

// --- Reminders --------------------------------------------------------------

const REMINDER_PLANS: ReminderPlan[] = [
  {
    reportId: 'rep-lac-final',
    offsets: [30, 14, 3, 0],
    recipientIds: ['s-barry', 's-denise'],
    keepReminding: true,
  },
];

const REMINDER_DEFAULTS: ReminderDefaults = {
  offsets: [30, 14, 3],
  alsoNotifyIds: ['s-denise'],
  keepReminding: false,
  repeatEveryDays: 3,
  sendHour: 8,
};

/**
 * The office has saved one rule: the studio rent is three quarters Herb Alpert,
 * a quarter Long Beach, so its split panel opens at 75/25 (`usualShares`).
 */
const SPLIT_RULES: SplitRule[] = [
  {
    id: 'rule-signal-hill-rent',
    payee: 'Signal Hill Properties',
    parts: [
      { grantId: HA, budgetLineId: 'bl-ha-venue', percent: 75 },
      { grantId: LBCF, budgetLineId: 'bl-lbcf-venue', percent: 25 },
    ],
  },
];

/** Which page of the award letter promises each seeded installment. */
export const PAYMENT_PAGES: Record<string, number> = {
  'pay-ha-1': 1,
  'pay-ha-2': 1,
  'pay-lac-1': 2,
  'pay-lac-2': 2,
  'pay-lbcf-1': 1,
};

// --- Assembly ---------------------------------------------------------------

type MoneySeed = Pick<
  GrantsState,
  | 'quickbooks'
  | 'accounts'
  | 'classes'
  | 'transactions'
  | 'incoming'
  | 'splitRules'
  | 'files'
  | 'terms'
  | 'reminderPlans'
  | 'reminderDefaults'
> & { expenses: Expense[] };

/**
 * The money side of the seed. Takes the budget lines and the expenses already
 * on them, and gives every expense the QuickBooks transaction it came from.
 */
export function makeMoneySeed(lines: BudgetLine[], expenses: Expense[]): MoneySeed {
  const lineById = new Map(lines.map(l => [l.id, l]));

  const linked: Expense[] = [];
  const assigned: Transaction[] = [];
  expenses.forEach((expense, i) => {
    const line = lineById.get(expense.budgetLineId);
    if (!line) {
      linked.push(expense);
      return;
    }
    const tx = assignedTransaction(expense, line, i + 1);
    assigned.push(tx);
    linked.push({ ...expense, transactionId: tx.id, backupNote: EXPENSE_NOTES[expense.id] });
  });

  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

  return {
    quickbooks: {
      connected: true,
      company: 'Jazz Angels Inc.',
      lastSyncedAt: `${SEED_TODAY}T08:40`,
    },
    accounts: clone(ACCOUNTS),
    classes: clone(CLASSES),
    transactions: [...clone(TO_ASSIGN), ...assigned, ...notGrantFunded()],
    incoming: clone(INCOMING),
    splitRules: clone(SPLIT_RULES),
    files: [...clone(GRANT_FILES), ...expenseFiles(linked)],
    terms: terms(),
    reminderPlans: clone(REMINDER_PLANS),
    reminderDefaults: clone(REMINDER_DEFAULTS),
    expenses: linked,
  };
}

/**
 * The money side as a new office starts it (decision 0004): QuickBooks not
 * connected, nothing synced, the default reminder schedule with nobody extra.
 */
export function makeMoneyEmpty(): MoneySeed {
  return {
    quickbooks: { connected: false, company: '', lastSyncedAt: '' },
    accounts: [],
    classes: [],
    transactions: [],
    incoming: [],
    splitRules: [],
    files: [],
    terms: [],
    reminderPlans: [],
    reminderDefaults: {
      ...REMINDER_DEFAULTS,
      offsets: [...REMINDER_DEFAULTS.offsets],
      alsoNotifyIds: [],
    },
    expenses: [],
  };
}
