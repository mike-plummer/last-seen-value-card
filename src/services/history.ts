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

  const startISO = startTime.toISOString();
  const path =
    `history/period/${encodeURIComponent(startISO)}` +
    `?filter_entity_id=${encodeURIComponent(entityIds.join(','))}` +
    `&minimal_response&no_attributes`;

  const response = await hass.callApi<HistoryState[][]>('GET', path);

  entityIds.forEach((entityId, index) => {
    historyByEntity.set(entityId, response[index] ?? []);
  });

  return historyByEntity;
}
