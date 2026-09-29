import React from 'react';
import { Button, Dialog, Field, Icon, IconButton, Select } from '../../../../design-system';
import { useStore } from '../../../../core';
import { awardLetter, grantFiles, isPostAward } from '../../domain';
import type { Grant, GrantFile, GrantFileKind } from '../../domain';
import { useToast } from '../../../../app/ToastHost';
import { DialogFields, InlineConfirm, SectionBand } from './parts';
import { describeFile, downloadFile, FileDrop, FilePaper, FileViewerDialog, fileFacts, useUploadedLine } from '../money/files';
import { GRANT_FILE_KINDS, GRANT_KIND_LABEL, guessGrantKind, useRemoveGrantFile, useStoreGrantFile } from './awardShared';
import './award.css';

/** "Stored here" on the Documents tab: the files kept with the grant itself, and a drop to add one. */

const KIND_OPTIONS = GRANT_FILE_KINDS.map(k => ({ value: k, label: GRANT_KIND_LABEL[k] }));

export function StoredFiles({ grant }: { grant: Grant }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const storeFile = useStoreGrantFile();
  const removeFile = useRemoveGrantFile();
  const files = grantFiles(state, grant.id).slice().sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || a.name.localeCompare(b.name));
  const letter = awardLetter(state, grant.id);
  const [viewing, setViewing] = React.useState<GrantFile | null>(null);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<Array<{ file: File; kind: GrantFileKind }> | null>(null);

  const onFiles = (list: File[]) => {
    const ok: File[] = [];
    for (const f of list) {
      const d = describeFile(f);
      if ('error' in d) toast({ tone: 'info', title: 'That file was not stored', message: d.error });
      else ok.push(f);
    }
    if (!ok.length) return;
    let letterTaken = !!letter;
    setPicked(ok.map(file => {
      const kind = guessGrantKind(file.name, letterTaken);
      if (kind === 'award-letter') letterTaken = true;
      return { file, kind };
    }));
  };

  const store = () => {
    if (!picked) return;
    const replacing = picked.some(p => p.kind === 'award-letter') ? letter : undefined;
    let stored = 0;
    for (const p of picked) {
      const result = storeFile(grant.id, p.file, p.kind);
      if ('error' in result) toast({ tone: 'info', title: 'That file was not stored', message: result.error });
      else stored += 1;
    }
    if (replacing) {
      removeFile(replacing);
      const name = picked.find(p => p.kind === 'award-letter')?.file.name ?? '';
      actions.grants.addNote(grant.id, `Award letter replaced: ${name}`);
    }
    if (stored) {
      toast({
        tone: 'success',
        title: stored === 1 ? 'File stored' : `${stored} files stored`,
        message: picked.length === 1 ? picked[0].file.name : `With ${grant.title}`,
      });
    }
    setPicked(null);
  };

  return (
    <>
      <SectionBand title={<>Stored here {files.length > 0 && <span style={{ marginLeft: 6, font: 'var(--weight-medium) var(--text-2xs)/1 var(--font-mono)', color: 'var(--text-muted)' }}>{files.length}</span>}</>} />
      {files.length === 0 && (
        <p style={{ margin: 0, padding: '0 var(--space-6) var(--space-3)', font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {isPostAward(grant.phase)
            ? 'Nothing stored yet. Add the award letter or the signed agreement below and it opens right here, for anyone in the office.'
            : 'Nothing stored yet. Add a file below, such as the final proposal or a letter from the funder, and it opens right here for anyone in the office.'}
        </p>
      )}
      {files.map(f => (
        <StoredRow key={f.id} file={f}
          confirming={confirming === f.id}
          onOpen={() => setViewing(f)}
          onAskRemove={() => setConfirming(f.id)}
          onCancelRemove={() => setConfirming(null)}
          onRemove={() => {
            removeFile(f);
            if (f.kind === 'award-letter') actions.grants.addNote(grant.id, `Award letter removed: ${f.name}`);
            toast({ tone: 'info', title: 'File removed', message: f.name });
            setConfirming(null);
          }} />
      ))}
      <div style={{ padding: 'var(--space-3) var(--space-6) var(--space-5)' }}>
        <FileDrop onFiles={onFiles} hint="PDF, JPG, PNG or HEIC, up to 20 MB each. You pick what each one is next." />
      </div>

      {picked && (
        <Dialog open title={picked.length === 1 ? 'Store this file' : `Store ${picked.length} files`}
          description={`Say what each file is. It is kept with ${grant.title}.`}
          onClose={() => setPicked(null)} width={500}
          footer={<>
            <Button variant="secondary" onClick={() => setPicked(null)}>Cancel</Button>
            <Button variant="primary" disabled={picked.filter(p => p.kind === 'award-letter').length > 1} onClick={store}>
              {picked.length === 1 ? 'Store file' : 'Store files'}
            </Button>
          </>}>
          <DialogFields>
            {picked.map((p, i) => {
              const letters = picked.filter(q => q.kind === 'award-letter').length;
              const hint = p.kind === 'award-letter'
                ? letters > 1 ? undefined : letter ? `Replaces ${letter.name}.` : 'The Award tab reads its pages.'
                : undefined;
              return (
                <Field key={i} label={<span style={{ overflowWrap: 'anywhere' }}>{p.file.name}</span>} hint={hint}
                  error={p.kind === 'award-letter' && letters > 1 ? 'A grant keeps one award letter. Pick another kind for the rest.' : undefined}>
                  <Select value={p.kind} options={KIND_OPTIONS}
                    onChange={e => {
                      const kind = e.target.value as GrantFileKind;
                      setPicked(prev => prev && prev.map((q, j) => (j === i ? { ...q, kind } : q)));
                    }} />
                </Field>
              );
            })}
          </DialogFields>
        </Dialog>
      )}
      {viewing && <FileViewerDialog file={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

/** One stored file: its page, what it is, and Open, Download, Remove. */
function StoredRow({ file, confirming, onOpen, onAskRemove, onCancelRemove, onRemove }: {
  file: GrantFile;
  confirming: boolean;
  onOpen: () => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onRemove: () => void;
}) {
  const uploaded = useUploadedLine(file);
  return (
    <div className="ja-stored">
      <button type="button" className="ja-stored__thumb" aria-label={`Open ${file.name}`} onClick={onOpen}>
        <FilePaper file={file} />
      </button>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span className="ja-file-name" style={{ overflowWrap: 'anywhere' }}>{file.name}</span>
        <span className="ja-file-meta">{GRANT_KIND_LABEL[file.kind]} · {fileFacts(file)}</span>
        <span className="ja-file-meta" style={{ fontSize: 'var(--text-2xs)' }}>{uploaded}</span>
      </div>
      <div className="ja-stored__actions">
        {confirming ? (
          <InlineConfirm question="Delete this file?" onConfirm={onRemove} onCancel={onCancelRemove} />
        ) : (
          <>
            <IconButton label={`Open ${file.name}`} size="sm" variant="ghost" onClick={onOpen}><Icon name="external-link" size={15} /></IconButton>
            <IconButton label={`Download ${file.name}`} size="sm" variant="ghost" onClick={() => downloadFile(file)}><Icon name="download" size={15} /></IconButton>
            <IconButton label={`Remove ${file.name}`} size="sm" variant="ghost" onClick={onAskRemove}><Icon name="trash-2" size={15} /></IconButton>
          </>
        )}
      </div>
    </div>
  );
}
