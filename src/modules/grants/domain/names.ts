/**
 * The one rule for shortening a funder's name, so a funder reads the same on
 * every screen. The name stays recognisable: only a part that does not name
 * the funder is dropped, and no initials are invented.
 */

/**
 * "Herb Alpert Foundation" → "Herb Alpert"; "LA County Dept. of Arts and
 * Culture" → "LA County"; "Long Beach Community Foundation" stays whole, or
 * "Long Beach CF" with `tight`, for a table cell, a chip or a dashboard row.
 * Any other name is kept as it is. No name gives "Unknown funder".
 */
export function funderShortName(name: string | undefined, tight = false): string {
  const full = name?.trim();
  if (!full) return 'Unknown funder';

  const dept = full.match(/^(.+?)\s+(?:Dept\.?|Department)\s+of\s/i);
  if (dept) return dept[1];

  // "Long Beach" alone is the city, so a community foundation keeps its last words.
  const community = full.match(/^(.+?)\s+Community Foundation$/);
  if (community) return tight ? `${community[1]} CF` : full;

  const foundation = full.match(/^(.+?)\s+Foundation$/);
  if (foundation) return foundation[1];

  return full;
}
