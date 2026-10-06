import { describe, expect, it } from 'vitest';
import { funderShortName } from '../names';
import { makeSeed } from '../seed';

describe('funderShortName', () => {
  // Every seeded funder: [full name, short, tight].
  const SEEDED: [string, string, string][] = [
    ['Herb Alpert Foundation', 'Herb Alpert', 'Herb Alpert'],
    ['LA County Dept. of Arts and Culture', 'LA County', 'LA County'],
    ['Long Beach Community Foundation', 'Long Beach Community Foundation', 'Long Beach CF'],
    ['City of Signal Hill', 'City of Signal Hill', 'City of Signal Hill'],
    ['Port of Long Beach', 'Port of Long Beach', 'Port of Long Beach'],
    ['Ralph M. Parsons Foundation', 'Ralph M. Parsons', 'Ralph M. Parsons'],
    ['California Arts Council', 'California Arts Council', 'California Arts Council'],
    ['Arts Council for Long Beach', 'Arts Council for Long Beach', 'Arts Council for Long Beach'],
    [
      'Boeing Employees Community Fund',
      'Boeing Employees Community Fund',
      'Boeing Employees Community Fund',
    ],
    ['Wells Fargo Foundation', 'Wells Fargo', 'Wells Fargo'],
  ];

  it('covers every seeded funder', () => {
    expect(makeSeed().funders.map(f => f.name)).toEqual(SEEDED.map(([name]) => name));
  });

  it.each(SEEDED)('shortens %s', (name, short, tight) => {
    expect(funderShortName(name)).toBe(short);
    expect(funderShortName(name, true)).toBe(tight);
  });

  it('spells out a department the long way too', () => {
    expect(funderShortName('Los Angeles County Department of Arts and Culture')).toBe(
      'Los Angeles County',
    );
  });

  it('keeps a name with no known suffix as it is', () => {
    expect(funderShortName('Lance Valt Fund')).toBe('Lance Valt Fund');
    expect(funderShortName('Lance Valt Fund', true)).toBe('Lance Valt Fund');
  });

  it('keeps a name that is only a suffix', () => {
    expect(funderShortName('Foundation')).toBe('Foundation');
  });

  it('says "Unknown funder" when there is no name', () => {
    expect(funderShortName(undefined)).toBe('Unknown funder');
    expect(funderShortName('', true)).toBe('Unknown funder');
    expect(funderShortName('   ')).toBe('Unknown funder');
  });
});
