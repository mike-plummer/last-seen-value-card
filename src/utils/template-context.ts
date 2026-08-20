import { computeName, type HomeAssistant, relativeTime } from 'custom-card-helpers';

import type {
  EntityConfig,
  LastSeenTemplateEntity,
  LastSeenValueCardConfig,
  ResolvedLastSeen,
} from '../types';

export interface TemplateContextVariables {
  config: LastSeenValueCardConfig;
  user: string;
  last_seen: Record<string, LastSeenTemplateEntity>;
  last_seen_list: LastSeenTemplateEntity[];
}

function buildTemplateEntity(
  hass: HomeAssistant,
  entityConfig: EntityConfig,
  resolved: ResolvedLastSeen,
): LastSeenTemplateEntity {
  const entityId = entityConfig.entity;
  const stateObj = hass.states[entityId];
  const name = entityConfig.name ?? (stateObj ? computeName(stateObj) : entityId);
  const unitOfMeasurement = stateObj?.attributes?.unit_of_measurement as string | undefined;

  if (!resolved.available) {
    return {
      entity_id: entityId,
      available: false,
      name,
      unit_of_measurement: unitOfMeasurement,
    };
  }

  return {
    entity_id: entityId,
    available: true,
    state: resolved.state,
    last_changed: resolved.lastChanged.toISOString(),
    last_changed_relative: relativeTime(resolved.lastChanged, hass.locale),
    name,
    unit_of_measurement: unitOfMeasurement,
  };
}

export function buildTemplateContext(
  hass: HomeAssistant,
  config: LastSeenValueCardConfig,
  entityConfigs: EntityConfig[],
  resolved: Map<string, ResolvedLastSeen>,
): TemplateContextVariables {
  const last_seen: Record<string, LastSeenTemplateEntity> = {};
  const last_seen_list: LastSeenTemplateEntity[] = [];

  for (const entityConfig of entityConfigs) {
    const entry = buildTemplateEntity(
      hass,
      entityConfig,
      resolved.get(entityConfig.entity) ?? { available: false },
    );
    last_seen[entityConfig.entity] = entry;
    last_seen_list.push(entry);
  }

  return {
    config,
    user: hass.user?.name ?? '',
    last_seen,
    last_seen_list,
  };
}

export function getTemplateEntityIds(
  config: LastSeenValueCardConfig,
  entityConfigs: EntityConfig[],
): string[] {
  if (config.content_entity_id) {
    return Array.isArray(config.content_entity_id)
      ? config.content_entity_id
      : [config.content_entity_id];
  }
  return entityConfigs.map((entry) => entry.entity);
}
