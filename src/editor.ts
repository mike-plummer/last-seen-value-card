import {
  type ActionConfig,
  fireEvent,
  type HomeAssistant,
  type LovelaceCardEditor,
} from 'custom-card-helpers';
import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { CUSTOM_CARD_TYPE, DEFAULT_REFRESH_INTERVAL } from './const';
import { type EntityConfig, type LastSeenValueCardConfig, parseEntityConfigs } from './types';
import { describeLookback, parseLookback } from './utils/parse-lookback';

@customElement('last-seen-value-card-editor')
export class LastSeenValueCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config?: LastSeenValueCardConfig;
  @state() private _lookbackPreview = '';
  @state() private _lookbackError = '';
  @state() private _expandedEntity?: string;
  @state() private _pickerEntity = '';

  public setConfig(config: LastSeenValueCardConfig): void {
    const cloned = structuredClone(config);
    this._config = {
      ...cloned,
      type: CUSTOM_CARD_TYPE,
      entities: cloned.entities ?? [],
      show_last_updated: cloned.show_last_updated ?? false,
      refresh_interval: cloned.refresh_interval ?? DEFAULT_REFRESH_INTERVAL,
      lookback: cloned.lookback ?? '7d',
      show_entities: cloned.show_entities ?? true,
      show_content: cloned.show_content ?? false,
      show_empty: cloned.show_empty ?? true,
      text_only: cloned.text_only ?? false,
    };
    this._updateLookbackPreview(this._config.lookback);
    this.requestUpdate();
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) {
      return html`<div>Loading...</div>`;
    }

    const entities = parseEntityConfigs(this._config.entities);

    return html`
      <div class="card-config">
        ${this._renderGeneralSection()}
        ${this._renderDisplaySection()}
        ${this._renderEntitiesSection(entities)}
      </div>
    `;
  }

  private _renderGeneralSection(): TemplateResult {
    return html`
      <div class="section">
        <div class="section-title">General</div>
        <ha-input
          label="Title (optional)"
          .value=${this._config?.title ?? ''}
          .configValue=${'title'}
          @input=${this._valueChanged}
        ></ha-input>
        <ha-input
          label="Lookback"
          .value=${this._config?.lookback ?? '7d'}
          .configValue=${'lookback'}
          @input=${this._valueChanged}
          hint="Examples: 48h, 7d, 2w, or 168"
          .invalid=${Boolean(this._lookbackError)}
          .validationMessage=${this._lookbackError}
        ></ha-input>
        ${
          this._lookbackError
            ? html`<div class="field-error">${this._lookbackError}</div>`
            : this._lookbackPreview
              ? html`<div class="field-help">= ${this._lookbackPreview}</div>`
              : nothing
        }
        <ha-formfield label="Show last updated">
          <ha-switch
            .checked=${this._config?.show_last_updated ?? false}
            .configValue=${'show_last_updated'}
            @change=${this._valueChanged}
          ></ha-switch>
        </ha-formfield>
        <ha-input
          label="Refresh interval (seconds)"
          type="number"
          min="0"
          .value=${String(this._config?.refresh_interval ?? DEFAULT_REFRESH_INTERVAL)}
          .configValue=${'refresh_interval'}
          @input=${this._valueChanged}
          hint="How often to reload history. Use 0 to refresh only on config changes."
        ></ha-input>
      </div>
    `;
  }

  private _renderDisplaySection(): TemplateResult {
    const showContent = this._config?.show_content ?? false;

    return html`
      <div class="section">
        <div class="section-title">Display</div>
        <ha-formfield label="Show entity rows">
          <ha-switch
            .checked=${this._config?.show_entities ?? true}
            .configValue=${'show_entities'}
            @change=${this._valueChanged}
          ></ha-switch>
        </ha-formfield>
        <ha-formfield label="Show templated content">
          <ha-switch
            .checked=${showContent}
            .configValue=${'show_content'}
            @change=${this._valueChanged}
          ></ha-switch>
        </ha-formfield>
        ${
          showContent
            ? html`
              <label class="content-label" for="content-editor">Content</label>
              <textarea
                id="content-editor"
                class="content-editor"
                .value=${this._config?.content ?? ''}
                @input=${this._contentChanged}
                rows="8"
                placeholder="Jinja2 template rendered as markdown"
              ></textarea>
              <div class="field-help">
                Use <code>last_seen</code> or <code>last_seen_list</code> for history-resolved values.
                Example: {{ last_seen['sensor.example'].state }}
              </div>
              <ha-input
                label="Content entity IDs (optional, comma-separated)"
                .value=${this._formatContentEntityIds()}
                .configValue=${'content_entity_id'}
                @input=${this._contentEntityIdsChanged}
                hint="Limit which entities trigger template re-renders."
              ></ha-input>
              <ha-input
                label="Card size (optional)"
                type="number"
                min="0"
                .value=${this._config?.card_size !== undefined ? String(this._config.card_size) : ''}
                .configValue=${'card_size'}
                @input=${this._valueChanged}
              ></ha-input>
              <ha-formfield label="Show empty content">
                <ha-switch
                  .checked=${this._config?.show_empty ?? true}
                  .configValue=${'show_empty'}
                  @change=${this._valueChanged}
                ></ha-switch>
              </ha-formfield>
              <ha-formfield label="Text only (no card chrome for content)">
                <ha-switch
                  .checked=${this._config?.text_only ?? false}
                  .configValue=${'text_only'}
                  @change=${this._valueChanged}
                ></ha-switch>
              </ha-formfield>
            `
            : nothing
        }
      </div>
    `;
  }

  private _formatContentEntityIds(): string {
    const value = this._config?.content_entity_id;
    if (!value) {
      return '';
    }
    return Array.isArray(value) ? value.join(', ') : value;
  }

  private _contentChanged(ev: Event): void {
    if (!this._config) {
      return;
    }

    const target = ev.target as HTMLTextAreaElement;
    const value = target.value;
    if (!value) {
      const next = { ...this._config };
      delete next.content;
      this._config = next;
    } else {
      this._config = { ...this._config, content: value };
    }
    this._emitConfigChanged();
  }

  private _contentEntityIdsChanged(ev: Event): void {
    if (!this._config) {
      return;
    }

    const target = ev.target as HTMLInputElement;
    const raw = target.value.trim();
    if (!raw) {
      const next = { ...this._config };
      delete next.content_entity_id;
      this._config = next;
      this._emitConfigChanged();
      return;
    }

    const ids = raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    this._config = {
      ...this._config,
      content_entity_id: ids.length === 1 ? ids[0] : ids,
    };
    this._emitConfigChanged();
  }

  private _renderEntitiesSection(entities: EntityConfig[]): TemplateResult {
    return html`
      <div class="section">
        <div class="section-title">Entities</div>
        <ha-entity-picker
          .hass=${this.hass}
          .value=${this._pickerEntity}
          @value-changed=${this._addEntity}
        ></ha-entity-picker>
        ${
          entities.length === 0
            ? html`<div class="field-help">Add at least one entity.</div>`
            : entities.map((entityConfig, index) =>
                this._renderEntityEditor(entityConfig, index, entities.length),
              )
        }
      </div>
    `;
  }

  private _renderEntityEditor(
    entityConfig: EntityConfig,
    index: number,
    total: number,
  ): TemplateResult {
    const expanded = this._expandedEntity === entityConfig.entity;
    const stateObj = this.hass.states[entityConfig.entity];
    const label = stateObj?.attributes?.friendly_name ?? entityConfig.entity;

    return html`
      <div class="entity-item">
        <div class="entity-header">
          <button
            class="entity-toggle"
            @click=${() => this._toggleEntity(entityConfig.entity)}
          >
            ${expanded ? '▼' : '▶'} ${label}
          </button>
          <div class="entity-actions">
            <ha-icon-button
              .disabled=${index === 0}
              @click=${() => this._moveEntity(index, -1)}
              .label=${'Move up'}
            >
              <ha-icon icon="mdi:arrow-up"></ha-icon>
            </ha-icon-button>
            <ha-icon-button
              .disabled=${index === total - 1}
              @click=${() => this._moveEntity(index, 1)}
              .label=${'Move down'}
            >
              <ha-icon icon="mdi:arrow-down"></ha-icon>
            </ha-icon-button>
            <ha-icon-button
              @click=${() => this._removeEntity(index)}
              .label=${'Remove'}
            >
              <ha-icon icon="mdi:delete"></ha-icon>
            </ha-icon-button>
          </div>
        </div>
        ${
          expanded
            ? html`
              <div class="entity-body">
                <ha-input
                  label="Entity"
                  .value=${entityConfig.entity}
                  disabled
                ></ha-input>
                <ha-input
                  label="Name override"
                  .value=${entityConfig.name ?? ''}
                  .entityIndex=${index}
                  .configValue=${'name'}
                  @input=${this._entityValueChanged}
                ></ha-input>
                <ha-icon-picker
                  label="Icon override"
                  .value=${entityConfig.icon ?? ''}
                  .entityIndex=${index}
                  .configValue=${'icon'}
                  @value-changed=${this._entityValueChanged}
                ></ha-icon-picker>
                <div class="action-label">Tap action</div>
                <hui-action-editor
                  .hass=${this.hass}
                  .label=${'Tap action'}
                  .configValue=${'tap_action'}
                  .entityIndex=${index}
                  .actions=${['more-info', 'toggle', 'navigate', 'url', 'call-service', 'none']}
                  .config=${entityConfig.tap_action ?? { action: 'more-info' }}
                  @value-changed=${this._entityActionChanged}
                ></hui-action-editor>
                <div class="action-label">Hold action</div>
                <hui-action-editor
                  .hass=${this.hass}
                  .label=${'Hold action'}
                  .configValue=${'hold_action'}
                  .entityIndex=${index}
                  .actions=${['more-info', 'toggle', 'navigate', 'url', 'call-service', 'none']}
                  .config=${entityConfig.hold_action ?? { action: 'more-info' }}
                  @value-changed=${this._entityActionChanged}
                ></hui-action-editor>
                <div class="action-label">Double tap action</div>
                <hui-action-editor
                  .hass=${this.hass}
                  .label=${'Double tap action'}
                  .configValue=${'double_tap_action'}
                  .entityIndex=${index}
                  .actions=${['more-info', 'toggle', 'navigate', 'url', 'call-service', 'none']}
                  .config=${entityConfig.double_tap_action ?? { action: 'none' }}
                  @value-changed=${this._entityActionChanged}
                ></hui-action-editor>
              </div>
            `
            : nothing
        }
      </div>
    `;
  }

  private _toggleEntity(entityId: string): void {
    this._expandedEntity = this._expandedEntity === entityId ? undefined : entityId;
  }

  private _addEntity(ev: CustomEvent): void {
    if (!this._config) {
      return;
    }

    const entityId = ev.detail.value as string;
    if (!entityId) {
      return;
    }

    const entities = parseEntityConfigs(this._config.entities);
    if (entities.some((entry) => entry.entity === entityId)) {
      this._pickerEntity = '';
      return;
    }

    entities.push({ entity: entityId });
    this._config = { ...this._config, entities };
    this._pickerEntity = '';
    this._emitConfigChanged();
  }

  private _removeEntity(index: number): void {
    if (!this._config) {
      return;
    }

    const entities = parseEntityConfigs(this._config.entities);
    entities.splice(index, 1);
    this._config = { ...this._config, entities };
    this._emitConfigChanged();
  }

  private _moveEntity(index: number, direction: -1 | 1): void {
    if (!this._config) {
      return;
    }

    const entities = parseEntityConfigs(this._config.entities);
    const target = index + direction;
    if (target < 0 || target >= entities.length) {
      return;
    }

    [entities[index], entities[target]] = [entities[target], entities[index]];
    this._config = { ...this._config, entities };
    this._emitConfigChanged();
  }

  private _valueChanged(ev: Event): void {
    if (!this._config) {
      return;
    }

    const target = ev.target as HTMLInputElement & {
      configValue?: keyof LastSeenValueCardConfig;
      checked?: boolean;
    };
    if (!target.configValue) {
      return;
    }

    const key = target.configValue;
    let value: unknown = target.checked !== undefined ? target.checked : target.value;

    if (key === 'refresh_interval' || key === 'card_size') {
      if (target.value === '') {
        const next = { ...this._config };
        delete next[key];
        this._config = next;
        this._emitConfigChanged();
        return;
      }
      value = Number(target.value);
      if (!Number.isFinite(value as number) || (value as number) < 0) {
        return;
      }
    }

    if (key === 'lookback') {
      this._config = { ...this._config, lookback: String(value) };
      this._updateLookbackPreview(String(value));
      if (this._lookbackError) {
        this.requestUpdate();
        return;
      }
      this._emitConfigChanged();
      return;
    }

    if (value === '' && key !== 'lookback' && key !== 'content') {
      const next = { ...this._config };
      delete next[key];
      this._config = next;
    } else {
      this._config = {
        ...this._config,
        [key]: value,
      };
    }

    this._emitConfigChanged();
  }

  private _entityValueChanged(ev: Event): void {
    if (!this._config) {
      return;
    }

    const target = ev.target as HTMLElement & {
      configValue?: keyof EntityConfig;
      entityIndex?: number;
      value?: string;
    };
    const index = target.entityIndex;
    const key = target.configValue;
    if (index === undefined || !key) {
      return;
    }

    const entities = parseEntityConfigs(this._config.entities);
    const value =
      'detail' in ev ? (ev as CustomEvent).detail.value : (target as HTMLInputElement).value;

    if (value === '') {
      delete entities[index][key];
    } else {
      entities[index] = { ...entities[index], [key]: value };
    }

    this._config = { ...this._config, entities };
    this._emitConfigChanged();
  }

  private _entityActionChanged(ev: CustomEvent): void {
    if (!this._config) {
      return;
    }

    const target = ev.target as HTMLElement & {
      configValue?: keyof EntityConfig;
      entityIndex?: number;
    };
    const index = target.entityIndex;
    const key = target.configValue;
    if (index === undefined || !key) {
      return;
    }

    const entities = parseEntityConfigs(this._config.entities);
    const action = ev.detail.value as ActionConfig;
    entities[index] = {
      ...entities[index],
      [key]: action?.action ? action : { action: 'none' },
    };
    this._config = { ...this._config, entities };
    this._emitConfigChanged();
  }

  private _updateLookbackPreview(value: string): void {
    try {
      parseLookback(value);
      this._lookbackPreview = describeLookback(value);
      this._lookbackError = '';
    } catch (error) {
      this._lookbackPreview = '';
      this._lookbackError = error instanceof Error ? error.message : 'Invalid lookback value';
    }
  }

  private _emitConfigChanged(): void {
    if (!this._config) {
      return;
    }
    fireEvent(this, 'config-changed', {
      config: { ...this._config, type: CUSTOM_CARD_TYPE },
    });
    this.requestUpdate();
  }

  static get styles() {
    return css`
      .card-config {
        padding: 8px 0;
      }

      .section {
        margin-bottom: 16px;
      }

      .section-title {
        font-size: 14px;
        font-weight: 500;
        margin-bottom: 12px;
        color: var(--primary-text-color);
      }

      ha-input,
      ha-formfield,
      ha-entity-picker,
      ha-icon-picker {
        display: block;
        margin-bottom: 16px;
      }

      ha-formfield {
        padding-bottom: 8px;
      }

      .field-help,
      .field-error {
        margin: -8px 0 16px;
        font-size: 12px;
      }

      .field-help {
        color: var(--secondary-text-color);
      }

      .field-error {
        color: var(--error-color);
      }

      .entity-item {
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        margin-bottom: 8px;
        overflow: hidden;
      }

      .entity-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 8px 8px 12px;
        background: var(--secondary-background-color);
      }

      .entity-toggle {
        flex: 1 1 auto;
        border: none;
        background: transparent;
        text-align: left;
        cursor: pointer;
        color: var(--primary-text-color);
        font: inherit;
        padding: 0;
      }

      .entity-actions {
        display: flex;
        flex: 0 0 auto;
      }

      .entity-body {
        padding: 16px;
      }

      .action-label {
        font-size: 12px;
        font-weight: 500;
        color: var(--secondary-text-color);
        margin: 8px 0;
      }

      .content-label {
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: var(--secondary-text-color);
        margin-bottom: 8px;
      }

      .content-editor {
        width: 100%;
        box-sizing: border-box;
        margin-bottom: 8px;
        padding: 8px;
        border: 1px solid var(--divider-color);
        border-radius: 4px;
        background: var(--card-background-color, var(--ha-card-background));
        color: var(--primary-text-color);
        font-family: var(--code-font-family, monospace);
        font-size: 13px;
        resize: vertical;
      }
    `;
  }
}

if (!customElements.get('last-seen-value-card-editor')) {
  customElements.define('last-seen-value-card-editor', LastSeenValueCardEditor);
}
