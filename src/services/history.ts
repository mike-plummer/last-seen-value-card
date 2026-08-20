import type { HomeAssistant } from 'custom-card-helpers';

import type { HistoryState } from '../types';
import { type CompressedHistoryState, normalizeHistoryEntries } from '../utils/normalize-history';

const HISTORY_FETCH_TIMEOUT_MS = 30_000;

const ATTRIBUTE_DOMAINS = new Set([
  'climate',
  'humidifier',
  'input_datetime',
  'water_heater',
  'person',
  'device_tracker',
]);

function entityIdHistoryNeedsAttributes(hass: HomeAssistant, entityId: string): boolean {
  const domain = entityId.split('.')[0];
  return !hass.states[entityId] || ATTRIBUTE_DOMAINS.has(domain);
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

function buildHistoryParams(
  hass: HomeAssistant,
  entityIds: string[],
  startTime: Date,
  endTime: Date,
): Record<string, unknown> {
  return {
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    entity_ids: entityIds,
    minimal_response: true,
    include_start_time_state: true,
    no_attributes: !entityIds.some((entityId) => entityIdHistoryNeedsAttributes(hass, entityId)),
  };
}

async function fetchHistoryViaWebSocket(
  hass: HomeAssistant,
  entityIds: string[],
  startTime: Date,
  endTime: Date,
): Promise<Record<string, CompressedHistoryState[]>> {
  return withTimeout(
    hass.callWS<Record<string, CompressedHistoryState[]>>({
      type: 'history/history_during_period',
      ...buildHistoryParams(hass, entityIds, startTime, endTime),
    }),
    HISTORY_FETCH_TIMEOUT_MS,
    'Timed out loading entity history.',
  );
}

async function fetchHistoryViaRest(
  hass: HomeAssistant,
  entityIds: string[],
  startTime: Date,
  endTime: Date,
): Promise<Record<string, CompressedHistoryState[]>> {
  const params = new URLSearchParams({
    filter_entity_id: entityIds.join(','),
    end_time: endTime.toISOString(),
    minimal_response: '',
    no_attributes: '',
  });

  const path = `history/period/${encodeURIComponent(startTime.toISOString())}?${params.toString()}`;
  const response = await hass.callApi<CompressedHistoryState[][]>('GET', path);
  const historyByEntity: Record<string, CompressedHistoryState[]> = {};

  entityIds.forEach((entityId, index) => {
    historyByEntity[entityId] = response[index] ?? [];
  });

  return historyByEntity;
}

function hasHistoryData(
  historyByEntity: Map<string, HistoryState[]>,
  entityIds: string[],
): boolean {
  return entityIds.some((entityId) => (historyByEntity.get(entityId)?.length ?? 0) > 0);
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

  const endTime = new Date();
  let response: Record<string, CompressedHistoryState[]> = {};

  try {
    response = await fetchHistoryViaWebSocket(hass, entityIds, startTime, endTime);
  } catch {
    response = {};
  }

  for (const entityId of entityIds) {
    historyByEntity.set(entityId, normalizeHistoryEntries(response[entityId]));
  }

  if (hasHistoryData(historyByEntity, entityIds)) {
    return historyByEntity;
  }

  try {
    response = await fetchHistoryViaRest(hass, entityIds, startTime, endTime);
  } catch {
    return historyByEntity;
  }

  for (const entityId of entityIds) {
    historyByEntity.set(entityId, normalizeHistoryEntries(response[entityId]));
  }

  return historyByEntity;
}
