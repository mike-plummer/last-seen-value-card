import type { HistoryState } from '../types';

export interface CompressedHistoryState {
  s?: string | number;
  lu?: number;
  lc?: number;
  entity_id?: string;
  state?: string | number;
  last_changed?: string | number;
  last_updated?: string | number;
}

function timestampToMs(value: string | number): number {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.NaN : parsed;
  }

  // HA history uses Unix seconds; values above ~1e11 are already milliseconds.
  return value > 1e11 ? value : value * 1000;
}

function timestampToIso(value: string | number): string {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
    return value;
  }

  return new Date(timestampToMs(value)).toISOString();
}

function stateToString(value: string | number | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function normalizeHistoryEntry(entry: CompressedHistoryState): HistoryState | null {
  const state = stateToString(entry.s ?? entry.state);
  if (!state) {
    return null;
  }

  const timestampSource = entry.lc ?? entry.lu ?? entry.last_changed ?? entry.last_updated;
  if (timestampSource === undefined || timestampSource === null) {
    return null;
  }

  const lastChanged = timestampToIso(timestampSource);
  if (Number.isNaN(Date.parse(lastChanged))) {
    return null;
  }

  return {
    entity_id: entry.entity_id,
    state,
    last_changed: lastChanged,
    last_updated:
      entry.lu !== undefined
        ? timestampToIso(entry.lu)
        : entry.last_updated !== undefined && entry.last_updated !== null
          ? timestampToIso(entry.last_updated)
          : undefined,
  };
}

export function normalizeHistoryEntries(
  entries: CompressedHistoryState[] | undefined,
): HistoryState[] {
  if (!entries?.length) {
    return [];
  }

  return entries
    .map((entry) => normalizeHistoryEntry(entry))
    .filter((entry): entry is HistoryState => entry !== null)
    .sort((left, right) => Date.parse(left.last_changed) - Date.parse(right.last_changed));
}
