import type { HomeAssistant } from 'custom-card-helpers';

import type { HistoryState } from '../types';
import { type CompressedHistoryState, normalizeHistoryEntries } from '../utils/normalize-history';

const HISTORY_FETCH_TIMEOUT_MS = 30_000;

function entityIdHistoryNeedsAttributes(hass: HomeAssistant, entityId: string): boolean {
  const domain = entityId.split('.')[0];
  return (
    !hass.states[entityId] ||
    [
      'climate',
      'humidifier',
      'input_datetime',
      'water_heater',
      'person',
      'device_tracker',
    ].includes(domain)
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

export async function fetchHistory(
  hass: HomeAssistant,
  entityIds: string[],
  startTime: Date,
): Promise<Map<string, HistoryState[]>> {
  const historyByEntity = new Map<string, HistoryState[]>();

  if (entityIds.length === 0) {
    return historyByEntity;
  }

  const response = await withTimeout(
    hass.callWS<Record<string, CompressedHistoryState[]>>({
      type: 'history/history_during_period',
      start_time: startTime.toISOString(),
      end_time: new Date().toISOString(),
      entity_ids: entityIds,
      minimal_response: true,
      no_attributes: !entityIds.some((entityId) => entityIdHistoryNeedsAttributes(hass, entityId)),
    }),
    HISTORY_FETCH_TIMEOUT_MS,
    'Timed out loading entity history.',
  );

  for (const entityId of entityIds) {
    historyByEntity.set(entityId, normalizeHistoryEntries(response?.[entityId]));
  }

  return historyByEntity;
}
