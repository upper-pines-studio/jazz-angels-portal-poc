import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, Dialog, Icon, Switch } from '../../design-system';
import { dateLong, staffById, useStore } from '../../core';
import type { Archivable } from '../../core';

/**
 * The archive controls every list and record page shares (decision 0002), so
 * the seven record types look and read the same way:
 *
 * - `ShowArchivedSwitch`: the quiet "Show archived" switch at the right of a
 *   list's filter bar or card header, off by default, shown once there is
 *   something archived to show.
 * - `ArchivedBadge`: the neutral badge on an archived row.
 * - `ArchiveButton` and `ArchiveDialog`: the secondary Archive action and its
 *   one-line confirmation, saying what hides and what stays.
 * - `ArchivedNotice`: the banner on an archived record, "Archived on Oct 7,
 *   2026 by Keisha Monroe", with Restore.
 */

/**
 * Show archived, held in the URL as `?archived=1` so it survives a reload and
 * a link. For a list whose page has other URL state (Grants, Funders,
 * Students, the Schedule's term view).
 */
export function useArchivedParam(): [boolean, (next: boolean) => void] {
  const [params, setParams] = useSearchParams();
  const on = params.get('archived') === '1';
  const set = React.useCallback(
    (next: boolean) => {
      setParams(
        current => {
          const q = new URLSearchParams(current);
          if (next) q.set('archived', '1');
          else q.delete('archived');
          return q;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return [on, set];
}

/**
 * "Show archived (2)". Renders nothing while there is nothing archived and the
 * switch is off, so a list with no archived records carries no extra control.
 */
export function ShowArchivedSwitch({
  count,
  checked,
  onChange,
}: {
  /** How many archived records the list would add. */
  count: number;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  if (count === 0 && !checked) return null;
  return (
    <span style={{ marginLeft: 'auto', flex: '0 0 auto' }}>
      <Switch
        checked={checked}
        label={count > 0 ? `Show archived (${count})` : 'Show archived'}
        onChange={onChange}
      />
    </span>
  );
}

/** The neutral marker on an archived row. */
export function ArchivedBadge() {
  return <Badge tone="neutral">Archived</Badge>;
}

/**
 * A row's name, with the Archived badge after it when the record is archived.
 * In a narrow column the badge drops under the name rather than being cut off.
 */
export function ArchivedName({ name, record }: { name: React.ReactNode; record: Archivable }) {
  if (!record.archivedAt) return <>{name}</>;
  return (
    <span
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 'var(--space-2)',
        rowGap: 'var(--space-1)',
        minWidth: 0,
      }}
    >
      <span style={{ minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {name}
      </span>
      <ArchivedBadge />
    </span>
  );
}

/** The secondary Archive action in a page header or a record's card. */
export function ArchiveButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      iconLeft={<Icon name="archive" size={15} />}
      onClick={onClick}
    >
      Archive
    </Button>
  );
}

/**
 * The one-line confirmation: "Archive this grant?" and what hides and what
 * stays. Nothing is deleted, so the confirm button is not the danger colour.
 */
export function ArchiveDialog({
  title,
  message,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      width={460}
      title={title}
      description={message}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            iconLeft={<Icon name="archive" size={15} />}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            Archive
          </Button>
        </>
      }
    />
  );
}

/** "Archived on Oct 7, 2026 by Keisha Monroe", naming them even if they are archived too. */
export function archivedLine(
  record: Archivable,
  name: (id: string | undefined) => string | undefined,
): string {
  const who = name(record.archivedById);
  return `Archived on ${dateLong(record.archivedAt)}${who ? ` by ${who}` : ''}`;
}

/**
 * The banner on an archived record: when and by whom, what that means, and
 * Restore for whoever may edit it. Renders nothing for a current record.
 */
export function ArchivedNotice({
  record,
  detail,
  onRestore,
  style,
}: {
  record: Archivable;
  /** One sentence on what being archived means for this record. */
  detail?: string;
  /** Unset for a role that may not restore it. */
  onRestore?: () => void;
  style?: React.CSSProperties;
}) {
  const { state } = useStore();
  if (!record.archivedAt) return null;
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--surface-sunken)',
        border: 'var(--border-width) solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        ...style,
      }}
    >
      <Icon name="archive" size={18} color="var(--text-muted)" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            font: 'var(--weight-semibold) var(--text-sm)/1.4 var(--font-sans)',
            color: 'var(--text-strong)',
          }}
        >
          {archivedLine(record, id => staffById(state, id)?.name)}
        </div>
        {detail && (
          <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>{detail}</div>
        )}
      </div>
      {onRestore && (
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Icon name="archive-restore" size={15} />}
          onClick={onRestore}
        >
          Restore
        </Button>
      )}
    </div>
  );
}
