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
| `Term` | A session (the screens' word): eight weeks or so the office plans and reports on, with `meetingsPlanned`, how many times each ensemble meets ("week 1 of 8"). `programId` set means it is one program's (an in-school term); unset, it is for all programs (the studio sessions). That is its line (below). Archived when entered by mistake or no longer wanted: it leaves the session list, is no longer a current session (`termForProgram`) and counts toward no overlap; its classes and roll calls stay. |
| `Ensemble` | A standing group: same students, same place, same hour each week. `venueId` is a core `Venue`; `room` is the space inside it. Archived when it stops meeting: its classes on and after `archivedAt` leave the schedule (`isScheduled`); the ones before stay, roll calls and all. |
| `ClassMeeting` | One class on one date. `rollSubmittedAt` set means roll is closed. |
| `Student` | On a roster, on the waitlist, or an alum. `ensembleId` is unset while waiting. `guardianName` is needed; `guardianPhone`, `guardianEmail` and `guardianAddress` (core's `Address`, all four parts or none) are optional (below). `photoRelease` is the guardian's answer on photos (below). |
| `AttendanceRecord` | One mark, `present` / `late` / `absent`, for one student at one meeting. |

**Archived is not alumni.** `status` says where a student is with Jazz Angels: enrolled, on the
waitlist, or alumni who finished their years here. Archived (decision 0002) is a separate pair of
fields, `archivedAt` and `archivedById`: a student who left mid-term, or was entered twice, is
archived whatever their status. Archiving leaves `status` and `ensembleId` as they were; the
student leaves the roster, the roll call and every count, and their past attendance stays in the
rates and the grant figures. Restoring brings them back as they were.

**Photo releases** (decisions 0005 and 0001). `Student.photoRelease` is `{ status, date?,
recordedById? }`: `given`, `not-given` or `not-asked` ("Given", "Not given", "Not asked yet" on
screen, `PHOTO_RELEASE_LABEL`). Given and Not given carry the date the guardian answered and the
staff id of whoever recorded it; Not asked yet carries neither. A new student starts on Not asked
yet, and `normalise` loads a student saved before releases (or with an answer it does not know)
as Not asked yet. Only Given lets a student be in photos: `hasNoPhotoRelease` is true for the
other two. Setting a release back to Not asked yet clears the date and the
recorder; who did it will belong in the activity log once there is one. The release is guardian data: it reaches the same people as the guardian's name and
phone (`maySeePhotoRelease`), and `asSeenBy` leaves all three off the record for anyone else.

**Guardian email and address** (decisions 0004 and 0001, #82). Both optional, and guardian
contact details like the phone: `asSeenBy` leaves them off with it. `guardian.ts` checks them for
the screens and the store alike: `guardianEmailRefusal` (blank is fine; otherwise it must read
like name@example.com), `guardianAddressRefusal` (all four parts or none, naming the missing
ones), `tidyAddress` (trimmed, and no address when every part is blank), and `readAddressLine`
(one line, "8500 Contreras St, Paramount, CA 90723", back into its four parts, for the import).

Dates are ISO `YYYY-MM-DD`; times are 24-hour `HH:MM` and are read back through
`timeLabel('16:00') === '4:00pm'`. **Present and late both count as turning
up** — that is the one rule every rate in here follows.

**As rows** (`domain/tables.ts`, #121). `teachingTables` writes `terms`, `ensembles`,
`class_meetings` (`start` and `end` as `start_time` and `end_time`), `students`,
`student_private` and `attendance`. A student is two rows: the roster on `students`, and the
guardian's name, phone, email and address (four columns) with the photo release on
`student_private`, so the database can keep them from whoever `asSeenBy` keeps them from today.
A student read back without a private row has no guardian on file and the release Not asked yet.

## Actions

| Action | What it does |
| --- | --- |
| `addMeeting(input)` | Puts one class on the schedule. Returns the new id. |
| `setMark(meetingId, studentId, mark)` | Records a mark. Ignored while the roll is submitted. |
| `submitRollCall(meetingId, notes?)` | Marks everyone on the roster not yet marked as present, stamps `rollSubmittedAt` and keeps the rehearsal notes. |
| `reopenRollCall(meetingId)` | Clears the stamp so the marks can be edited again. |
| `enrollStudent(input)` | Adds a student to a roster or the waitlist, with an optional `photoRelease` answer (`{ status, date? }`; Not asked yet when unset). Returns the new id. Refused, saying why, with a guardian email that is not an email or half an address (`guardianRefusal`). |
| `updateStudent(id, patch)` | Patches a student, their placement and guardian included. Never the photo release. Refused like Enroll for a bad guardian email or address; an address of four blanks is saved as none. |
| `setPhotoRelease(id, { status, date? })` | Records the guardian's answer: Given or Not given on a date (today when unset), or back to Not asked yet. The store stamps `recordedById` from the signed-in person; a screen never sends it. Needs Students: Edit, and is refused with what is wrong (`photoReleaseRefusal`): an answer that is not one of the three, or a date that is not a date. |
| `importStudents(inputs)` | Adds many students in one change, as the CSV import does, each release stamped like Enroll's. Returns how many. |
| `archiveStudent(id)` / `restoreStudent(id)` | Archives a student (off the roster, the roll call and the counts; status untouched) or restores them. Needs Students: Edit. |
| `archiveEnsemble(id)` / `restoreEnsemble(id)` | Archives an ensemble from today (its classes from then on leave the schedule; its students stay placed) or restores it. Needs Schedule: Edit. |
| `addTerm(input)` / `updateTerm(id, patch)` | Adds a session (name, `programId` or none for all programs, start, end, `meetingsPlanned`) or changes one. Returns the new id. Needs Schedule: Edit, and is refused with what is wrong (`termRefusal`): no name, no dates, an end on or before the start, fewer than one class, a program that does not exist, or dates that overlap another current session on its line, naming that session. An edit back to All programs clears `programId`. |
| `archiveTerm(id)` / `restoreTerm(id)` | Archives a session or restores it. Needs Schedule: Edit. Restoring one that would overlap a current session on its line is refused, naming it (`restoreTermRefusal`). |
| `addEnsemble(input)` / `updateEnsemble(id, patch)` | Adds an ensemble (name, program, lead, venue, room, tone) or changes one. Needs Schedule: Edit, and is refused with what is wrong (`ensembleRefusal`): no name or one a current ensemble has, or a program, lead or venue that does not exist. A new venue or room moves its classes from today on that met at the old place and have no roll in, in the same change; past ones keep theirs. |

## Derived data

**Sessions per program** (decision 0007, #83). A session's *line* is its program, or all
programs when it has none (`lineOf`). Two current sessions on one line never overlap, both ends
counting (`termClash`); sessions on different lines may. A program follows its own line once it
has a current session of its own, and the line for all programs until then (`lineForProgram`).
`termForProgram(state, programId, date)` is a program's current session: the one on its line the
day falls in, or between sessions the next one to start; `undefined` asks for the line for all
programs. `termForEnsemble` is the same for an ensemble's classes. `currentSessions(state, date)`
is every line's current or next session, all programs first, for the screens that show every
line at once; `lineLabel` names a line on screen ("All programs", "In-school"), and with more
than one line each heading uses it. `sessionWeekLabel` (the dashboard's "Fall session week 1")
names each line when more than one is running. The roll calls due do not read a session.

`termForProgram`, `currentSessions`, `sessionWeekLabel` and `recentAttendance`'s last finished
session (for all programs, since it covers every program) leave out archived sessions;
`termsList` lists them earliest first, archived ones only with `includeArchived`. For the
session and ensemble dialogs: `termProblems` and
`ensembleProblems` (what is wrong, field by field, in the words the dialog shows),
`weeksBetween` (the classes a new session plans until typed), `leadOptions` (the current staff
who teach, plus the lead already chosen) and `nextTone` (the first colour no current ensemble
uses).

`meetingsForWeek`, `todaysMeetings`, `nextMeeting` and `unsubmittedRollCalls` leave out an
archived ensemble's classes from its archive date (`isScheduled`); `rosterForEnsemble`,
`enrolledCount`, `ensembleCount`, `waitlistCount` and `rosterFor` (unless `includeArchived`) leave
out archived students; `ensembleOptions`, `classesAtVenue` and `ensemblesList` (unless
`includeArchived`) leave out archived ensembles. `rollCallStudents(state, meeting)` is an open
roll's roster, or for a submitted roll everyone marked at it; `rollCallStudentsFor(state, user,
meeting)` is the same list `asSeenBy` the person, which is what the Roll call screen reads, so a
student who has moved out of a teacher's class since keeps their guardian details and photo
release only for someone who may still see them. The attendance figures read every
mark, archived or not.

`meetingsForWeek`, `todaysMeetings`, `nextMeeting`, `rosterForEnsemble`,
`attendanceForMeeting`, `markCounts`, `meetingRate`, `attendanceRateForStudent`,
`ensembleTrend` (the last five submitted meetings), `unsubmittedRollCalls`
(past and today only), `attendanceSummary`, `enrolledCount`, `ensembleCount`,
plus the display helpers `timeLabel`, `timeRange` and `percent`.

## Importing a roster

`import.ts` turns a roster CSV into rows to check: `parseStudentsCsv(text, { programs,
ensembles, students, today })` matches columns by header in any order and case, lists the ones
it ignores, and gives each row its problems in plain sentences, the closest program or ensemble
where one is near, and the student each choice would add (`add`, `closest`, `waitlist`). The
optional Photo release column (also "Photo consent" or "Photos") reads yes as Given and no as
Not given, both dated the import day (`today`); blank, or no column, is Not asked yet, and any
other value is too, with a note on the row. The optional Guardian email column (also "Email")
and the address, as Street, City, State and ZIP or as one Address column, are read onto the row
and its student; a bad email, half an address or an Address line that is not street, city, state
and ZIP is left off with a note on the row, which still goes in. `importStudents` checks each
release and guardian as Enroll does and refuses the whole import, saying why, if one is not sound.
`studentsToImport(rows, choices)` is what Import hands `importStudents`;
`studentsCsvTemplate` writes the blank template. `readCsv` and `writeCsv` are the small CSV
reader and writer behind them.

## Public API

Other modules import `src/modules/teaching/index.ts` and nothing deeper:

```ts
import { attendanceSummary, enrolledCount } from '../teaching';

attendanceSummary(state, { programId: 'in-school', from, to });
attendanceSummary(state, { programIds: ['in-school', 'homeschool'], from, to }); // a grant naming two
// { meetings, studentsServed, attendanceRate /* 0–1 */, contactHours }
enrolledCount(state, 'homeschool');
```

Only submitted roll calls count towards a summary, because only those are
evidence a grant report can quote.

## Screens

| Route | Screen |
| --- | --- |
| `/schedule` | Week grid (Sun–Thu) and the term view. `?view=term` opens the second tab: the current session of each line (decision 0007), the Sessions list and the Ensembles list, with Add session and Add ensemble (`screens/schedule/TermDialog.tsx`, `EnsembleDialog.tsx`) next to Add class. |
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

Most students' photo releases were given at registration (Sep 6, or Mar 1 for returning students),
recorded by Keisha. Omar Haddad (Big Band) and Ruby Castellanos (Combo A) are Not given; Beatriz
Pena (Big Band), Elena Petrova (Paramount MS), Theo Bennett, Wren Callahan and two on the waitlist
are Not asked yet, so Devon's roll calls show the "No photos" marker.
