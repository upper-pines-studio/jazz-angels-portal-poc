import React from 'react';
import { Badge, Button, DataTable, Dialog, Icon, Select } from '../../../../design-system';
import { useToast } from '../../../../app/ToastHost';
import { activeOnly, classProgramOptions, programName, useCan, useStore } from '../../../../core';
import {
  ensembleById,
  parseStudentsCsv,
  studentsCsvTemplate,
  studentsToImport,
} from '../../domain';
import type { ImportChoice, ImportRow, NewStudent, StudentImport } from '../../domain';
import './import.css';

const TEMPLATE_FILE = 'students-template.csv';

/** Hand the browser a file to save. */
function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Bring a term's roster in from a CSV (decision 0004). Choose a file, check
 * every row with its problems, pick a fix or skip the ones that need it, then
 * add them all at once. Nothing is added until Import.
 */
export default function ImportStudentsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state, actions } = useStore();
  const allowed = useCan();
  const toast = useToast();
  // Everyone who may import may see guardian contacts today; the check keeps it so.
  const showGuardian = allowed('guardian-contacts');

  const input = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  const [fileName, setFileName] = React.useState<string>();
  const [parsed, setParsed] = React.useState<StudentImport>();
  const [choices, setChoices] = React.useState<Record<number, ImportChoice>>({});

  const context = {
    // A row is matched to a current program only, as Enroll offers.
    programs: classProgramOptions(state),
    // A row is matched to a current ensemble only; every student, archived ones
    // included, still counts as already in the portal.
    ensembles: activeOnly(state.teaching.ensembles),
    students: state.teaching.students,
  };

  const read = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setFileName(file.name);
    setParsed(parseStudentsCsv(text, context));
    setChoices({});
  };

  const rows = parsed && parsed.problems.length === 0 ? parsed.rows : undefined;
  const choiceFor = (row: ImportRow) => choices[row.line] ?? row.defaultChoice;
  const toAdd = rows ? studentsToImport(rows, choices) : [];
  const skipped = rows ? rows.length - toAdd.length : 0;

  const submit = () => {
    if (!rows || toAdd.length === 0) return;
    const added = actions.teaching.importStudents(toAdd);
    if (added === undefined) return; // refused; the store has said why
    toast({
      title: `${plural(added, 'student')} added · ${skipped} skipped`,
      message: 'Students with an ensemble are on its roster; the rest are on the waitlist.',
    });
    onClose();
  };

  const startOver = () => {
    setParsed(undefined);
    setFileName(undefined);
    setChoices({});
  };

  const picker = (
    <>
      <button
        type="button"
        className={'ja-import-drop' + (over ? ' is-over' : '')}
        onClick={() => input.current?.click()}
        onDragOver={e => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={e => {
          e.preventDefault();
          setOver(false);
          void read(e.dataTransfer.files[0]);
        }}
      >
        <span className="ja-import-drop__icon">
          <Icon name="upload" size={17} />
        </span>
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              font: 'var(--weight-medium) var(--text-sm)/1.4 var(--font-sans)',
              color: 'var(--text-strong)',
            }}
          >
            Drop a CSV file here or <span style={{ color: 'var(--text-link)' }}>choose one</span>
          </span>
          <span
            style={{
              display: 'block',
              font: 'var(--type-body-sm)',
              fontSize: 'var(--text-2xs)',
              color: 'var(--text-muted)',
            }}
          >
            One student per row. Save a spreadsheet as CSV to get one.
          </span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept=".csv,text/csv"
        aria-label="CSV file"
        onChange={e => {
          void read(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </>
  );

  return (
    <Dialog
      open={open}
      title="Import students"
      description={
        rows
          ? 'Check each row. Rows that need a decision start on Skip; pick a fix to bring them in.'
          : "Bring in a term's roster from a spreadsheet. Nothing is added until you check the rows and choose Import."
      }
      onClose={onClose}
      width={rows ? 980 : 560}
      footer={
        <>
          {rows && (
            <span
              style={{
                marginRight: 'auto',
                alignSelf: 'center',
                font: 'var(--type-body-sm)',
                color: 'var(--text-muted)',
              }}
            >
              {`${toAdd.length} will be added, ${skipped} skipped`}
            </span>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={toAdd.length === 0} onClick={submit}>
            {toAdd.length > 0 ? `Import ${plural(toAdd.length, 'student')}` : 'Import'}
          </Button>
        </>
      }
    >
      {rows ? (
        <Preview
          rows={rows}
          fileName={fileName}
          unknownColumns={parsed?.unknownColumns ?? []}
          showGuardian={showGuardian}
          choiceFor={choiceFor}
          onChoose={(line, choice) => setChoices(c => ({ ...c, [line]: choice }))}
          onStartOver={startOver}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {picker}
          {parsed && (
            <div
              role="alert"
              style={{
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--danger-50)',
                font: 'var(--type-body-sm)',
                color: 'var(--danger-600)',
              }}
            >
              {`${fileName ?? 'That file'}: ${parsed.problems.join(' ')}`}
            </div>
          )}
          <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
            The columns are Name, Instrument, Years in, Guardian name, Guardian phone, Program and
            Ensemble, in any order. A student with an ensemble is enrolled in it; one without goes
            on the program&rsquo;s waitlist. Other columns are left out.
          </div>
          <div>
            <Button
              variant="link"
              iconLeft={<Icon name="download" size={15} />}
              onClick={() => download(TEMPLATE_FILE, studentsCsvTemplate(context))}
            >
              Download a blank template
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// The preview
// ---------------------------------------------------------------------------

const CHOICE_LABEL: Record<ImportChoice, string> = {
  add: 'Add',
  closest: 'Use closest match',
  waitlist: 'Leave on waitlist',
  skip: 'Skip',
};

function Preview({
  rows,
  fileName,
  unknownColumns,
  showGuardian,
  choiceFor,
  onChoose,
  onStartOver,
}: {
  rows: ImportRow[];
  fileName?: string;
  unknownColumns: string[];
  showGuardian: boolean;
  choiceFor: (row: ImportRow) => ImportChoice;
  onChoose: (line: number, choice: ImportChoice) => void;
  onStartOver: () => void;
}) {
  const { state } = useStore();
  const withProblems = rows.filter(r => r.problems.length > 0).length;

  /** Where the row's student lands under its current choice. */
  const placement = (row: ImportRow, student?: NewStudent) => {
    if (!student) {
      const written = [row.ensemble, row.program].filter(Boolean).join(' · ');
      return <span style={{ color: 'var(--text-faint)' }}>{written || 'Not given'}</span>;
    }
    return (
      <span style={{ display: 'block', whiteSpace: 'normal' }}>
        <span style={{ display: 'block', color: 'var(--text-strong)' }}>
          {ensembleById(state, student.ensembleId)?.name ?? 'Waitlist'}
        </span>
        <span style={{ display: 'block', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
          {programName(state, student.programId)}
        </span>
      </span>
    );
  };

  const twoLines = (first: React.ReactNode, second?: React.ReactNode) => (
    <span style={{ display: 'block', whiteSpace: 'normal' }}>
      <span style={{ display: 'block' }}>{first}</span>
      {second && (
        <span style={{ display: 'block', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
          {second}
        </span>
      )}
    </span>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
          font: 'var(--type-body-sm)',
          color: 'var(--text-body)',
        }}
      >
        <Icon name="file-text" size={16} />
        <span style={{ color: 'var(--text-strong)', fontWeight: 'var(--weight-medium)' }}>
          {fileName}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>
          {`${plural(rows.length, 'row')} · ${withProblems} with a problem`}
        </span>
        <Button variant="link" size="sm" onClick={onStartOver} style={{ marginLeft: 'auto' }}>
          Choose another file
        </Button>
      </div>

      {unknownColumns.length > 0 && (
        <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
          {`Ignored columns: ${unknownColumns.join(', ')}`}
        </div>
      )}

      <div className="ja-import-preview">
        <div style={{ minWidth: 900 }}>
          <DataTable
            rows={rows.map(r => ({ ...r, id: `line-${r.line}` }))}
            columns={[
              { key: 'line', label: 'Line', width: '44px', mono: true },
              {
                key: 'name',
                label: 'Student',
                width: '1.3fr',
                strong: true,
                render: (r: ImportRow) =>
                  twoLines(
                    r.name || <span style={{ color: 'var(--text-faint)' }}>No name</span>,
                    [r.instrument, r.instrument && `year ${r.yearsIn}`].filter(Boolean).join(' · '),
                  ),
              },
              ...(showGuardian
                ? [
                    {
                      key: 'guardian',
                      label: 'Guardian',
                      width: '1.3fr',
                      render: (r: ImportRow) => twoLines(r.guardianName || '—', r.guardianPhone),
                    },
                  ]
                : []),
              {
                key: 'placement',
                label: 'Placement',
                width: '1.3fr',
                render: (r: ImportRow) => {
                  const choice = choiceFor(r);
                  return placement(r, choice === 'skip' ? undefined : r.outcomes[choice]);
                },
              },
              {
                key: 'problems',
                label: 'Check',
                width: '2fr',
                wrap: true,
                render: (r: ImportRow) =>
                  r.problems.length === 0 ? (
                    <Badge tone="teal" dot>
                      Ready
                    </Badge>
                  ) : (
                    <ul className="ja-import-problems">
                      {r.problems.map(p => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  ),
              },
              {
                key: 'choice',
                label: 'Action',
                width: '168px',
                render: (r: ImportRow) => {
                  const offered = (Object.keys(r.outcomes) as ImportChoice[]).map(c => ({
                    value: c,
                    // A clean row that starts on Skip is a name we have already.
                    label:
                      c === 'add' && r.defaultChoice === 'skip' ? 'Add anyway' : CHOICE_LABEL[c],
                  }));
                  return (
                    <Select
                      value={choiceFor(r)}
                      onChange={e => onChoose(r.line, e.target.value as ImportChoice)}
                      options={[...offered, { value: 'skip', label: CHOICE_LABEL.skip }]}
                      disabled={offered.length === 0}
                      style={{ width: '100%' }}
                    />
                  );
                },
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
