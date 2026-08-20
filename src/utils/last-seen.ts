import type { HomeAssistant } from 'custom-card-helpers';
import type { HassEntity } from 'home-assistant-js-websocket';

import type { HistoryState, LastSeenResult, ResolvedLastSeen } from '../types';

const INVALID_STATES = new Set(['unavailable', 'unknown', '']);

export function isPopulatedState(state: string | null | undefined): boolean {
  if (state === undefined || state === null) {
    return false;
  }
  return !INVALID_STATES.has(state.trim().toLowerCase());
}

export function buildSyntheticState(
  base: HassEntity | undefined,
  entityId: string,
  state: string,
  lastChanged: Date,
): HassEntity {
  const iso = lastChanged.toISOString();
  const attributes = { ...(base?.attributes ?? {}) };

  return {
    entity_id: entityId,
    state,
    last_changed: iso,
    last_updated: iso,
    attributes,
    context: base?.context ?? { id: '', parent_id: null, user_id: null },
  };
}

function resolveFromHistory(
  entityId: string,
  history: HistoryState[] | undefined,
  startTime: Date,
  baseState: HassEntity | undefined,
): LastSeenResult | null {
  if (!history?.length) {
    return null;
  }

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry.state === undefined || entry.state === null) {
      continue;
    }

    const lastChanged = new Date(entry.last_changed);
    if (lastChanged < startTime) {
      break;
    }

    if (isPopulatedState(entry.state)) {
      return {
        state: entry.state,
        lastChanged,
        stateObj: buildSyntheticState(baseState, entityId, entry.state, lastChanged),
        available: true,
      };
    }
  }

  return null;
}

export function resolveLastSeen(
  hass: HomeAssistant,
  entityId: string,
  history: HistoryState[] | undefined,
  startTime: Date,
): ResolvedLastSeen {
  const baseState = hass.states[entityId];
  const current = baseState;

  if (current && isPopulatedState(current.state)) {
    const lastChanged = new Date(current.last_changed);
    if (lastChanged >= startTime) {
      return {
        state: current.state,
        lastChanged,
        stateObj: current,
        available: true,
      };
    }
  }

  const fromHistory = resolveFromHistory(entityId, history, startTime, baseState);
  if (fromHistory) {
    return fromHistory;
  }

  return { available: false };
}
