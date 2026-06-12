/** Drops leading chart entries with no activity (e.g. empty months before the
 *  first loan), but always keeps at least `minPoints` entries so the chart
 *  never looks cramped. */
export function trimLeadingEmpty<T>(data: T[], hasActivity: (d: T) => boolean, minPoints = 3): T[] {
  const first = data.findIndex(hasActivity);
  if (first <= 0) return data;
  return data.slice(Math.min(first, Math.max(0, data.length - minPoints)));
}
