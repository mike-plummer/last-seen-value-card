import type {
  ActionConfig,
  LovelaceCard,
  LovelaceCardConfig,
  LovelaceCardEditor,
} from 'custom-card-helpers';
import type { HassEntity } from 'home-assistant-js-websocket';

declare global {
  interface HTMLElementTagNameMap {
    'last-seen-value-card-editor': LovelaceCardEditor;
    'hui-error-card': LovelaceCard;
  }
}

export interface HistoryState {
  entity_id?: string;
  state: string;
  last_changed: string;
  last_updated?: string;
}

export interface EntityConfig {
  entity: string;
  name?: string;
  icon?: string;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}

export interface LastSeenTemplateEntity {
  entity_id: string;
  available: boolean;
  state?: string;
  last_changed?: string;
  last_changed_relative?: string;
  name?: string;
  unit_of_measurement?: string;
}

export interface LastSeenValueCardConfig extends LovelaceCardConfig {
  type: string;
  title?: string;
  lookback: string;
  show_last_updated?: boolean;
  refresh_interval?: number;
  entities: (string | EntityConfig)[];
  show_entities?: boolean;
  show_content?: boolean;
  content?: string;
  content_entity_id?: string | string[];
  card_size?: number;
  show_empty?: boolean;
  text_only?: boolean;
}

export interface LastSeenResult {
  state: string;
  lastChanged: Date;
  stateObj: HassEntity;
  available: true;
}

export interface LastSeenUnavailable {
  available: false;
}

export type ResolvedLastSeen = LastSeenResult | LastSeenUnavailable;

export function parseEntityConfigs(entities: (string | EntityConfig)[]): EntityConfig[] {
  return entities.map((entry) => (typeof entry === 'string' ? { entity: entry } : entry));
}

export function getEntityId(entry: string | EntityConfig): string {
  return typeof entry === 'string' ? entry : entry.entity;
}
