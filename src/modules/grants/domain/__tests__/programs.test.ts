import { describe, expect, it } from 'vitest';
import { makeCoreSeed } from '../../../../core/seed';
import type { PortalState } from '../../../../core/types';
import { coversWholeStudio, grantsForProgram, programNames } from '../derive';
import { makeSeed } from '../seed';
import { grantsSlice, withPrograms } from '../slice';
import type { Grant } from '../types';

const state = { core: makeCoreSeed(), grants: makeSeed() } as unknown as PortalState;
const port = state.grants.grants.find(g => g.funderId === 'f-port-of-long-beach')!;

/** A grant as it was saved before a grant named several programs. */
const savedWithOne = (program: string): Grant => {
  const { programs: _programs, ...rest } = port;
  return { ...rest, program } as unknown as Grant;
};

describe('a grant names several programs (decision 0006)', () => {
  it('has the Port of Long Beach grant on In-School and Homeschool', () => {
    expect(port.programs).toEqual(['in-school', 'homeschool']);
  });

  it('turns a saved single program into a list of one', () => {
    const loaded = withPrograms(savedWithOne('studio-sessions'));
    expect(loaded.programs).toEqual(['studio-sessions']);
    expect('program' in loaded).toBe(false);
  });

  it('keeps a saved list as it is', () => {
    expect(withPrograms(port).programs).toEqual(['in-school', 'homeschool']);
    const reordered: Grant = { ...port, programs: ['homeschool', 'in-school'] };
    expect(withPrograms(reordered).programs).toEqual(['homeschool', 'in-school']);
  });

  it('migrates every grant when the slice loads, and leaves the rest of the grant alone', () => {
    const saved = JSON.parse(JSON.stringify(makeSeed()));
    saved.grants = saved.grants.map((g: Grant) => {
      const { programs, ...rest } = g;
      return { ...rest, program: programs[0] };
    });
    const loaded = grantsSlice.normalise!(saved)!;
    expect(loaded.grants.map(g => g.programs)).toEqual(makeSeed().grants.map(g => [g.programs[0]]));
    expect(loaded.grants[0].title).toBe(makeSeed().grants[0].title);
  });

  it('loads a saved list unchanged', () => {
    const loaded = grantsSlice.normalise!(JSON.parse(JSON.stringify(makeSeed())))!;
    expect(loaded.grants.map(g => g.programs)).toEqual(makeSeed().grants.map(g => g.programs));
  });

  it('finds a grant under each of its programs', () => {
    expect(grantsForProgram(state, 'in-school').map(g => g.id)).toContain(port.id);
    expect(grantsForProgram(state, 'homeschool').map(g => g.id)).toContain(port.id);
    expect(grantsForProgram(state, 'jazz-legacy').map(g => g.id)).not.toContain(port.id);
  });

  it('reads the programs in words', () => {
    expect(programNames(state, { programs: ['in-school'] })).toBe('In-School Program');
    expect(programNames(state, port)).toBe('In-School Program and Homeschool Program');
    expect(programNames(state, { programs: ['studio-sessions', 'in-school', 'homeschool'] })).toBe(
      'Studio Semester Sessions, In-School Program and Homeschool Program',
    );
  });

  it('uses the short names for a narrow column', () => {
    expect(programNames(state, port, true)).toBe('In-school and Homeschool');
  });

  it('counts a grant on General operating as the whole studio, among others too', () => {
    expect(coversWholeStudio({ programs: ['general-operating'] })).toBe(true);
    expect(coversWholeStudio({ programs: ['in-school', 'general-operating'] })).toBe(true);
    expect(coversWholeStudio(port)).toBe(false);
  });
});
