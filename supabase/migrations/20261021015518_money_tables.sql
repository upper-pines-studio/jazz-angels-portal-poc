-- docs/SCHEMA.md, "Diagrams" > "Money: budgets, expenses, QuickBooks, files": qb_accounts,
-- qb_classes, quickbooks_connection, transactions, budget_versions, budget_lines,
-- budget_line_amounts, budget_line_accounts, expenses, split_rules, split_rule_parts,
-- grant_files.
--
-- The same conventions as the core migration: text ids, int dollars, enums as text checks
-- from the type's string unions, `not null` unless the diagram says `null`, every foreign key
-- `on delete restrict` (decision 0002), row level security on with no policies yet (#154).
-- QuickBooks is read-only: the sync writes transactions, accounts and classes, and nothing is
-- written back.

-- What the QuickBooks sync brings ---------------------------------------------------------------

create table public.qb_accounts (
  -- The account's number in the office's chart, "6200".
  code text primary key,
  name text not null
);
alter table public.qb_accounts enable row level security;

create table public.qb_classes (
  id text primary key,
  name text not null
);
alter table public.qb_classes enable row level security;

-- One row.
create table public.quickbooks_connection (
  id integer primary key check (id = 1),
  connected boolean not null,
  -- Null until connected.
  company text,
  -- Null until the first sync.
  last_synced_at timestamptz
);
alter table public.quickbooks_connection enable row level security;

create table public.transactions (
  -- QuickBooks' own id.
  id text primary key,
  date date not null,
  payee text not null,
  memo text not null,
  account_code text not null references public.qb_accounts (code) on delete restrict,
  class_id text references public.qb_classes (id) on delete restrict,
  amount integer not null,
  -- "Bill 1047".
  ref text not null,
  status text not null check (status in ('to-assign', 'assigned', 'not-grant-funded')),
  assigned_by text references public.staff (id) on delete restrict,
  assigned_at date
);
create index on public.transactions (account_code);
create index on public.transactions (class_id);
create index on public.transactions (assigned_by);
alter table public.transactions enable row level security;

-- Budgets: the lines stay, each version sets their planned amounts (decision 0005) --------------

create table public.budget_versions (
  id text primary key,
  grant_id text not null references public.grants (id) on delete restrict,
  -- 1 is the first budget; the highest is current.
  number integer not null,
  approved_on date,
  note text,
  added_by text not null references public.staff (id) on delete restrict,
  -- Set by the database (SCHEMA.md, "When"): no insert needs to send it.
  added_at date not null default current_date,
  constraint budget_versions_number_key unique (grant_id, number)
);
create index on public.budget_versions (added_by);
alter table public.budget_versions enable row level security;

create table public.budget_lines (
  id text primary key,
  grant_id text not null references public.grants (id) on delete restrict,
  category text not null,
  class_id text references public.qb_classes (id) on delete restrict
);
create index on public.budget_lines (grant_id);
create index on public.budget_lines (class_id);
alter table public.budget_lines enable row level security;

create table public.budget_line_amounts (
  budget_version_id text not null references public.budget_versions (id) on delete restrict,
  budget_line_id text not null references public.budget_lines (id) on delete restrict,
  planned integer not null,
  primary key (budget_version_id, budget_line_id)
);
create index on public.budget_line_amounts (budget_line_id);
alter table public.budget_line_amounts enable row level security;

create table public.budget_line_accounts (
  budget_line_id text not null references public.budget_lines (id) on delete restrict,
  account_code text not null references public.qb_accounts (code) on delete restrict,
  primary key (budget_line_id, account_code)
);
create index on public.budget_line_accounts (account_code);
alter table public.budget_line_accounts enable row level security;

-- Expenses: a transaction's parts, or typed in by hand -------------------------------------------

create table public.expenses (
  id text primary key,
  grant_id text not null references public.grants (id) on delete restrict,
  budget_line_id text not null references public.budget_lines (id) on delete restrict,
  date date not null,
  payee text not null,
  amount integer not null,
  note text,
  -- Null is typed in by hand.
  transaction_id text references public.transactions (id) on delete restrict,
  backup_note text
);
create index on public.expenses (grant_id);
create index on public.expenses (budget_line_id);
create index on public.expenses (transaction_id);
alter table public.expenses enable row level security;

-- Split rules: how a payee's transactions are split across grants -------------------------------

create table public.split_rules (
  id text primary key,
  payee text not null
);
alter table public.split_rules enable row level security;

create table public.split_rule_parts (
  split_rule_id text not null references public.split_rules (id) on delete restrict,
  -- The part's place in the rule.
  part integer not null,
  grant_id text not null references public.grants (id) on delete restrict,
  budget_line_id text not null references public.budget_lines (id) on delete restrict,
  percent numeric not null,
  primary key (split_rule_id, part)
);
create index on public.split_rule_parts (grant_id);
create index on public.split_rule_parts (budget_line_id);
alter table public.split_rule_parts enable row level security;

-- Files: the facts only; the contents live in Storage, keyed by the row's id (#158) -------------

create table public.grant_files (
  -- Also the key of the file's object in Storage.
  id text primary key,
  grant_id text not null references public.grants (id) on delete restrict,
  -- Set when it backs up one expense.
  expense_id text references public.expenses (id) on delete restrict,
  kind text not null
    check (kind in ('award-letter', 'agreement', 'receipt', 'invoice', 'timesheet', 'other')),
  name text not null,
  format text not null check (format in ('pdf', 'jpg', 'png', 'heic')),
  size_kb integer not null,
  pages integer,
  uploaded_by text not null references public.staff (id) on delete restrict,
  uploaded_at date not null
);
create index on public.grant_files (grant_id);
create index on public.grant_files (expense_id);
create index on public.grant_files (uploaded_by);
alter table public.grant_files enable row level security;
