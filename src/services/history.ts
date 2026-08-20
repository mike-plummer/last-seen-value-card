import type { HomeAssistant } from 'custom-card-helpers';

import type { HistoryState } from '../types';

export async function fetchHistory(
  hass: HomeAssistant,
  entityIds: string[],
  startTime: Date,
): Promise<Map<string, HistoryState[]>> {
  const historyByEntity = new Map<string, HistoryState[]>();

  if (entityIds.length === 0) {
    return historyByEntity;
  }

  const response = await hass.callWS<Record<string, HistoryState[]>>({
    type: 'history/history_during_period',
    start_time: startTime.toISOString(),
    end_time: new Date().toISOString(),
    entity_ids: entityIds,
    minimal_response: true,
    no_attributes: true,
  });

  for (const entityId of entityIds) {
    historyByEntity.set(entityId, response[entityId] ?? []);
  }

  return historyByEntity;
}
