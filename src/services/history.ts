import type { HomeAssistant } from 'custom-card-helpers';

import type { HistoryState } from '../types';
import { type CompressedHistoryState, normalizeHistoryEntries } from '../utils/normalize-history';

export async function fetchHistory(
  hass: HomeAssistant,
  entityIds: string[],
  startTime: Date,
): Promise<Map<string, HistoryState[]>> {
  const historyByEntity = new Map<string, HistoryState[]>();

  if (entityIds.length === 0) {
    return historyByEntity;
  }

  const response = await hass.callWS<Record<string, CompressedHistoryState[]>>({
    type: 'history/history_during_period',
    start_time: startTime.toISOString(),
    end_time: new Date().toISOString(),
    entity_ids: entityIds,
    minimal_response: true,
    no_attributes: true,
    include_start_time_state: true,
  });

  for (const entityId of entityIds) {
    historyByEntity.set(entityId, normalizeHistoryEntries(response[entityId]));
  }

  return historyByEntity;
}
