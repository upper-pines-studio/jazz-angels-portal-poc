# Decisions

Choices made with the client before the portal gets a backend. Each file says what was decided,
why, and what it means for the build. When a decision changes, edit its file and say so in the
change; do not leave a stale one behind.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-roles-and-permissions.md) | Seven roles, one per person, and what each can see and do | Decided |
| [0002](0002-archive-not-delete.md) | Records are archived, never deleted | Decided |
| [0003](0003-no-offline.md) | The portal needs a connection; roll call does not work offline | Decided |
| [0004](0004-switch-over-and-real-data.md) | Each module switches over on its own date; history comes later | Decided, history open |
| [0005](0005-roadmap-items-that-shape-the-schema.md) | Roadmap items to settle before the schema is written | Answered |
| [0006](0006-programs-projects-and-shares.md) | Programs, projects and how a grant's money is shared | Decided, spending by program open |
| [0007](0007-sessions-per-program.md) | Sessions for one program never overlap; each program has its own current session | Decided |
| [0008](0008-backend-repository-contract.md) | How the backend Repository writes rows: the apply payload, cleared fields, import and reset, id format | Decided |
| [0009](0009-backend-on-supabase.md) | The backend is Postgres on Supabase, with Supabase sign-in and file storage | Decided; email service and region open |
