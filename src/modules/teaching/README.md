# `src/modules/teaching` — schedule, roll call, roster

The teaching module owns the week the studio actually runs: the terms, the
ensembles, every class meeting, the students on the roster, and one attendance
mark per student per meeting. The people, the programs and the fiscal year come
from `src/core`; see `docs/PLATFORM.md` §2.2 for the spec this was built from.

```ts
import { useStore, dateShort } from '../../../core';
import { rosterForEnsemble, timeLabel } from '../domain';
```

---

## The shape

```ts
state.teaching = { terms, ensembles, meetings, students, attendance };
actions.teaching.setMark(meetingId, studentId, 'present');
```

| Noun | What it is |
| --- | --- |
| `Term` | A session: eight weeks the office plans and reports on. |
| `Ensemble` | A standing group: same students, same place, same hour each week. `venueId` is a core `Venue`; `room` is the space inside it. |
| `ClassMeeting` | One class on one date. `rollSubmittedAt` set means roll is closed. |
| `Student` | On a roster, on the waitlist, or an alum. `ensembleId` is unset while waiting. |
| `AttendanceRecord` | One mark, `present` / `late` / `absent`, for one student at one meeting. |

Dates are ISO `YYYY-MM-DD`; times are 24-hour `HH:MM` and are read back through
`timeLabel('16:00') === '4:00pm'`. **Present and late both count as turning
up** — that is the one rule every rate in here follows.

## Actions

| Action | What it does |
| --- | --- |
| `addMeeting(input)` | Puts one class on the schedule. Returns the new id. |
| `setMark(meetingId, studentId, mark)` | Records a mark. Ignored while the roll is submitted. |
| `submitRollCall(meetingId, notes?)` | Stamps `rollSubmittedAt` and keeps the rehearsal notes. |
| `reopenRollCall(meetingId)` | Clears the stamp so the marks can be edited again. |
| `enrollStudent(input)` | Adds a student to a roster or the waitlist. Returns the new id. |
| `updateStudent(id, patch)` | Patches a student, their placement included. |

## Derived data

`meetingsForWeek`, `todaysMeetings`, `nextMeeting`, `rosterForEnsemble`,
`attendanceForMeeting`, `markCounts`, `meetingRate`, `attendanceRateForStudent`,
`ensembleTrend` (the last five submitted meetings), `unsubmittedRollCalls`
(past and today only), `attendanceSummary`, `enrolledCount`, `ensembleCount`,
plus the display helpers `timeLabel`, `timeRange` and `percent`.

## Public API

Other modules import `src/modules/teaching/index.ts` and nothing deeper:

```ts
import { attendanceSummary, enrolledCount } from '../teaching';

attendanceSummary(state, { programId: 'in-school', from, to });
// { meetings, studentsServed, attendanceRate /* 0–1 */, contactHours }
enrolledCount(state, 'homeschool');
```

Only submitted roll calls count towards a summary, because only those are
evidence a grant report can quote.

## Screens

| Route | Screen |
| --- | --- |
| `/schedule` | Week grid (Sun–Thu) and the term view. `?view=term` opens the second tab. |
| `/roll/:meetingId` | Roll call: roster, marks, notes, trend. Read-only once submitted. |
| `/students` | Roster by program plus the waitlist, with the selected student beside it. |

The dashboard gets two stats (Enrolled, Attendance), one attention row per
unsubmitted roll call, and the **Today's classes** panel.

## The seed story

Today is Sunday 2026-09-13, week 1 of the Fall 2026 session. Eight ensembles,
45 students enrolled and 4 waiting. Combo A met at 3:00pm and its roll is in,
nine present and one late; Combo B at 4:00pm and Big Band at 5:15pm are still
to come and nobody has taken roll, so the rail badge reads 2. Last spring's
session (Mar 1 – Apr 26) is seeded complete at 85–96% so a grant period and the
attendance trend both have history.
