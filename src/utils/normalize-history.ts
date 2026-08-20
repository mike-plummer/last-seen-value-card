import type { HistoryState } from '../types';

export interface CompressedHistoryState {
  s?: string;
  lu?: number;
  lc?: number;
  entity_id?: string;
  state?: string;
  last_changed?: string | number;
  last_updated?: string | number;
}

function timestampToIso(value: string | number): string {
  if (typeof value === 'string') {
    return value;
  }
  return new Date(value * 1000).toISOString();
}

export function normalizeHistoryEntry(entry: CompressedHistoryState): HistoryState | null {
  if (typeof entry.s === 'string') {
    const timestamp = entry.lc ?? entry.lu;
    if (timestamp === undefined) {
      return null;
    }
    return {
      entity_id: entry.entity_id,
      state: entry.s,
      last_changed: timestampToIso(timestamp),
      last_updated: entry.lu !== undefined ? timestampToIso(entry.lu) : undefined,
    };
  }

  if (typeof entry.state !== 'string') {
    return null;
  }

  if (entry.last_changed === undefined || entry.last_changed === null) {
    return null;
  }

  return {
    entity_id: entry.entity_id,
    state: entry.state,
    last_changed: timestampToIso(entry.last_changed),
    last_updated:
      entry.last_updated !== undefined && entry.last_updated !== null
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
    .filter((entry): entry is HistoryState => entry !== null);
}
