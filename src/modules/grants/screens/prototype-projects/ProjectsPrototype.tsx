/**
 * PROTOTYPE — throwaway. Three ways to manage projects funded from several
 * grants, switchable with `?variant=A|B|C` on /prototype/projects (dev only).
 * Projects and their allocations live in memory; a reload starts over.
 */
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../../../../core';
import type { PortalState } from '../../../../core';
import { usePageHeader } from '../../../../app/Shell';
import { PrototypeSwitcher } from '../../../../app/components/PrototypeSwitcher';
import { SEED, sources } from './model';
import type { ProtoState, Source } from './model';
import { NAME_A, VariantA } from './VariantA';
import { NAME_B, VariantB } from './VariantB';
import { NAME_C, VariantC } from './VariantC';
import './prototype.css';

export interface VariantProps {
  state: PortalState;
  proto: ProtoState;
  setProto: React.Dispatch<React.SetStateAction<ProtoState>>;
  srcs: Source[];
}

const VARIANTS = [
  { key: 'A', name: NAME_A, Component: VariantA },
  { key: 'B', name: NAME_B, Component: VariantB },
  { key: 'C', name: NAME_C, Component: VariantC },
];

export default function ProjectsPrototype() {
  const { state } = useStore();
  const [params] = useSearchParams();
  const [proto, setProto] = React.useState<ProtoState>(SEED);
  const srcs = React.useMemo(() => sources(state), [state]);
  const v = VARIANTS.find(x => x.key === params.get('variant')) ?? VARIANTS[0];

  usePageHeader({
    title: 'Projects',
    subtitle: 'Prototype: money from several grants, set aside for one piece of work',
  });

  return (
    <>
      <div className="pp-note">
        Prototype, nothing is saved. Hatched bars and “If awarded” are grants still pending. Red
        marks money a grant may not be able to pay: restricted to another program, or outside the
        grant period.
      </div>
      <v.Component state={state} proto={proto} setProto={setProto} srcs={srcs} />
      <details className="pp-state">
        <summary>Prototype state</summary>
        <pre>{JSON.stringify(proto, null, 2)}</pre>
      </details>
      <PrototypeSwitcher variants={VARIANTS} />
    </>
  );
}
