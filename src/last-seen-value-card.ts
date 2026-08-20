import {
  type ActionHandlerEvent,
  computeIcon,
  computeName,
  type HomeAssistant,
  handleAction,
  hasAction,
  type LovelaceCard,
  type LovelaceCardEditor,
  relativeTime,
} from 'custom-card-helpers';
import { css, html, LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { actionHandler } from './action-handler-directive';
import { CARD_TYPE, CARD_VERSION, CUSTOM_CARD_TYPE, DEFAULT_REFRESH_INTERVAL } from './const';
import { fetchHistory } from './services/history';
import { subscribeTemplateContent } from './services/template';
import {
  type EntityConfig,
  type LastSeenValueCardConfig,
  parseEntityConfigs,
  type ResolvedLastSeen,
} from './types';
import { resolveLastSeen } from './utils/last-seen';
import { parseLookback } from './utils/parse-lookback';
import { buildTemplateContext, getTemplateEntityIds } from './utils/template-context';

interface WindowWithCustomCards extends Window {
  customCards?: Array<{ type: string; name: string; description: string; preview?: boolean }>;
}

const CONTENT_RENDER_DEBOUNCE_MS = 100;

(window as unknown as WindowWithCustomCards).customCards =
  (window as unknown as WindowWithCustomCards).customCards ?? [];
(window as unknown as WindowWithCustomCards).customCards?.push({
  type: CARD_TYPE,
  name: 'Last Seen Value Card',
  description: 'Display the last known value for infrequently updating sensors',
});

console.info(
  `%c LAST-SEEN-VALUE-CARD %c ${CARD_VERSION} `,
  'color: white; font-weight: bold; background: #03a9f4',
  'color: white; font-weight: bold; background: #546e7a',
);

@customElement(CARD_TYPE)
export class LastSeenValueCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import('./editor');
    return document.createElement('last-seen-value-card-editor');
  }

  public static getStubConfig(): Record<string, unknown> {
    return {
      lookback: '7d',
      entities: ['sun.sun'],
    };
  }

  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private config!: LastSeenValueCardConfig;
  @state() private entityConfigs: EntityConfig[] = [];
  @state() private resolved = new Map<string, ResolvedLastSeen>();
  @state() private historyError?: string;
  @state() private historyLoading = false;
  @state() private renderedContent = '';
  @state() private contentError?: string;

  private historyByEntity = new Map<string, import('./types').HistoryState[]>();
  private startTime = new Date();
  private lastHistoryFetch = 0;
  private refreshTimer?: number;
  private fetchInFlight = false;
  private pendingHistoryFetch = false;
  private contentRenderTimer?: number;
  private contentUnsubscribe?: Promise<() => Promise<void>>;
  private contentContextKey = '';
  private resolvedSignature = '';

  public setConfig(config: LastSeenValueCardConfig): void {
    if (!config?.entities?.length) {
      throw new Error('You must provide at least one entity.');
    }
    if (!config.lookback) {
      throw new Error('You must provide a lookback duration (e.g. 7d, 48h).');
    }

    const showEntities = config.show_entities ?? true;
    const showContent = config.show_content ?? false;
    if (!showEntities && !showContent) {
      throw new Error('At least one of show_entities or show_content must be enabled.');
    }
    if (showContent && !config.content?.trim()) {
      throw new Error('You must provide content when show_content is enabled.');
    }

    parseLookback(config.lookback);

    this.config = {
      show_last_updated: false,
      refresh_interval: DEFAULT_REFRESH_INTERVAL,
      show_entities: true,
      show_content: false,
      show_empty: true,
      text_only: false,
      ...config,
      type: CUSTOM_CARD_TYPE,
    };
    this.entityConfigs = parseEntityConfigs(this.config.entities);
    this.resolved = new Map();
    this.resolvedSignature = '';
    this.contentContextKey = '';
    this.lastHistoryFetch = 0;
    this._updateStartTime();
    this._setupRefreshTimer();
    this._scheduleHistoryFetch(true);
    this._scheduleContentRender(true);
  }

  public getCardSize(): number {
    if (!this.config) {
      return 1;
    }

    let size = this.config.title ? 1 : 0;

    if (this.config.show_content) {
      if (this.config.card_size !== undefined) {
        size += this.config.card_size;
      } else {
        const lines = (this.config.content ?? '').split('\n').length;
        size += Math.max(1, Math.round(lines / 2));
      }
    }

    if (this.config.show_entities !== false) {
      size += this.entityConfigs.length || 1;
    }

    return size || 1;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._scheduleHistoryFetch(true);
    this._setupRefreshTimer();
    this._scheduleContentRender();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.refreshTimer) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    if (this.contentRenderTimer) {
      window.clearTimeout(this.contentRenderTimer);
      this.contentRenderTimer = undefined;
    }
    this.contentContextKey = '';
    this._unsubscribeContent();
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has('hass') && this.hass) {
      this._resolveEntities();
      if (this.lastHistoryFetch === 0) {
        this._scheduleHistoryFetch(true);
      } else {
        this._maybeRefreshHistory();
      }
      this._scheduleContentRender();
    }

    if (changed.has('resolved')) {
      this._scheduleContentRender();
    }
  }

  protected render(): TemplateResult {
    if (!this.config || !this.hass) {
      return html``;
    }

    const showContent = this.config.show_content === true;
    const showEntities = this.config.show_entities !== false;
    const hideEmptyContent =
      showContent &&
      this.config.show_empty === false &&
      this.renderedContent.length === 0 &&
      !this.contentError;

    if (hideEmptyContent && !showEntities && !this.historyError) {
      return html``;
    }

    return html`
      ${
        this.config.title && !this.config.text_only
          ? html`<div class="card-header">${this.config.title}</div>`
          : nothing
      }
      ${this.historyError ? html`<div class="error">${this.historyError}</div>` : nothing}
      ${this.contentError ? html`<div class="error">${this.contentError}</div>` : nothing}
      ${this.historyLoading ? html`<div class="loading">Loading history...</div>` : nothing}
      ${
        showContent && !hideEmptyContent
          ? html`
            <div class="content ${this.config.text_only ? 'text-only' : ''}">
              <ha-markdown .content=${this.renderedContent} breaks></ha-markdown>
            </div>
          `
          : nothing
      }
      ${
        showEntities
          ? html`
            <div class="entities">
              ${this.entityConfigs.map((entityConfig) => this._renderEntityRow(entityConfig))}
            </div>
          `
          : nothing
      }
    `;
  }

  private _renderEntityRow(entityConfig: EntityConfig): TemplateResult {
    const entityId = entityConfig.entity;
    const resolved = this.resolved.get(entityId) ?? { available: false };
    const stateObj = this.hass.states[entityId];
    const name = entityConfig.name ?? (stateObj ? computeName(stateObj) : entityId);
    const icon = entityConfig.icon ?? (stateObj ? computeIcon(stateObj) : 'mdi:help-circle');
    const holdAction = entityConfig.hold_action ?? { action: 'more-info' as const };
    const doubleTapAction = entityConfig.double_tap_action ?? { action: 'none' as const };

    return html`
      <div
        class="entity-row"
        ${actionHandler({
          hasHold: hasAction(holdAction),
          hasDoubleClick: hasAction(doubleTapAction),
        })}
        @action=${(ev: ActionHandlerEvent) => this._handleAction(ev, entityId, entityConfig)}
        tabindex="0"
        role="button"
      >
        <div class="icon">
          <ha-icon .icon=${icon}></ha-icon>
        </div>
        <div class="info">
          <div class="primary">${name}</div>
          ${
            this.config.show_last_updated && resolved.available && this.hass
              ? html`<div class="secondary">
                ${relativeTime(resolved.lastChanged, this.hass.locale)}
              </div>`
              : nothing
          }
        </div>
        <div class="state">
          ${
            resolved.available
              ? html`<state-display
                .hass=${this.hass}
                .stateObj=${resolved.stateObj}
              ></state-display>`
              : this._unavailableLabel()
          }
        </div>
      </div>
    `;
  }

  private _unavailableLabel(): TemplateResult {
    const label = this.hass.localize('state.default.unavailable');
    return html`<span class="state-unavailable">${label}</span>`;
  }

  private _handleAction(
    ev: ActionHandlerEvent,
    entityId: string,
    entityConfig: EntityConfig,
  ): void {
    handleAction(
      this,
      this.hass,
      {
        entity: entityId,
        tap_action: entityConfig.tap_action ?? { action: 'more-info' },
        hold_action: entityConfig.hold_action ?? { action: 'more-info' },
        double_tap_action: entityConfig.double_tap_action ?? { action: 'none' },
      },
      ev.detail.action,
    );
  }

  private _updateStartTime(): void {
    const lookbackMs = parseLookback(this.config.lookback);
    this.startTime = new Date(Date.now() - lookbackMs);
  }

  private _setupRefreshTimer(): void {
    if (this.refreshTimer) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }

    const intervalSeconds = this.config?.refresh_interval ?? DEFAULT_REFRESH_INTERVAL;
    if (!intervalSeconds || intervalSeconds <= 0) {
      return;
    }

    this.refreshTimer = window.setInterval(() => {
      this._scheduleHistoryFetch(true);
    }, intervalSeconds * 1000);
  }

  private _maybeRefreshHistory(): void {
    const intervalSeconds = this.config?.refresh_interval ?? DEFAULT_REFRESH_INTERVAL;
    if (!intervalSeconds || intervalSeconds <= 0) {
      return;
    }

    const elapsed = Date.now() - this.lastHistoryFetch;
    if (elapsed >= intervalSeconds * 1000) {
      this._scheduleHistoryFetch(true);
    }
  }

  private _scheduleHistoryFetch(force = false): void {
    if (!this.hass || !this.config) {
      return;
    }

    if (!force && this.lastHistoryFetch > 0) {
      return;
    }

    if (this.fetchInFlight) {
      if (force) {
        this.pendingHistoryFetch = true;
      }
      return;
    }

    void this._fetchHistory();
  }

  private _scheduleContentRender(immediate = false): void {
    if (!this.config?.show_content || !this.config.content || !this.hass) {
      this.contentContextKey = '';
      this._unsubscribeContent();
      return;
    }

    const contextKey = this._getContentContextKey();
    if (contextKey === this.contentContextKey && this.contentUnsubscribe) {
      return;
    }

    if (this.contentRenderTimer) {
      window.clearTimeout(this.contentRenderTimer);
      this.contentRenderTimer = undefined;
    }

    if (immediate) {
      void this._subscribeContent();
      return;
    }

    this.contentRenderTimer = window.setTimeout(() => {
      this.contentRenderTimer = undefined;
      void this._subscribeContent();
    }, CONTENT_RENDER_DEBOUNCE_MS);
  }

  private _unsubscribeContent(): void {
    if (!this.contentUnsubscribe) {
      return;
    }

    void this.contentUnsubscribe.then((unsub) => unsub()).catch(() => undefined);
    this.contentUnsubscribe = undefined;
  }

  private _getContentContextKey(): string {
    const entityIds = getTemplateEntityIds(this.config, this.entityConfigs).join(',');
    return `${this.config.content ?? ''}|${entityIds}|${this.resolvedSignature}`;
  }

  private _computeResolvedSignature(resolved: Map<string, ResolvedLastSeen>): string {
    return [...resolved.entries()]
      .map(([entityId, value]) =>
        value.available
          ? `${entityId}:${value.state}:${value.lastChanged.getTime()}`
          : `${entityId}:unavailable`,
      )
      .join('|');
  }

  private async _subscribeContent(): Promise<void> {
    if (!this.config?.show_content || !this.config.content || !this.hass) {
      return;
    }

    const contextKey = this._getContentContextKey();
    if (contextKey === this.contentContextKey && this.contentUnsubscribe) {
      return;
    }

    this._unsubscribeContent();
    this.contentContextKey = contextKey;

    const variables = buildTemplateContext(
      this.hass,
      this.config,
      this.entityConfigs,
      this.resolved,
    );
    const entityIds = getTemplateEntityIds(this.config, this.entityConfigs);
    const content = this.config.content;

    try {
      this.contentUnsubscribe = subscribeTemplateContent(
        this.hass,
        content,
        variables,
        {
          onResult: (result) => {
            this.contentError = undefined;
            this.renderedContent = result;
          },
          onError: (error) => {
            this.contentError = error;
            this.renderedContent = '';
          },
        },
        entityIds,
      );
      await this.contentUnsubscribe;
    } catch (error) {
      this.contentError = error instanceof Error ? error.message : 'Failed to render template';
      this.renderedContent = '';
      this.contentUnsubscribe = undefined;
      this.contentContextKey = '';
    }
  }

  private async _fetchHistory(): Promise<void> {
    if (!this.hass || !this.config) {
      return;
    }

    const isInitialLoad = this.lastHistoryFetch === 0;
    this.fetchInFlight = true;
    if (isInitialLoad) {
      this.historyLoading = true;
    }
    this._updateStartTime();

    try {
      const entityIds = this.entityConfigs.map((entry) => entry.entity);
      this.historyByEntity = await fetchHistory(this.hass, entityIds, this.startTime);
      this.historyError = undefined;
    } catch (error) {
      this.historyError = error instanceof Error ? error.message : 'Failed to load entity history.';
    } finally {
      this.fetchInFlight = false;
      this.historyLoading = false;
      if (this.lastHistoryFetch === 0) {
        this.lastHistoryFetch = Date.now();
      }
      this._resolveEntities();

      if (this.pendingHistoryFetch) {
        this.pendingHistoryFetch = false;
        void this._fetchHistory();
      }
    }
  }

  private _resolveEntities(): void {
    if (!this.hass || !this.config) {
      return;
    }

    const next = new Map<string, ResolvedLastSeen>();
    for (const entityConfig of this.entityConfigs) {
      const entityId = entityConfig.entity;
      next.set(
        entityId,
        resolveLastSeen(this.hass, entityId, this.historyByEntity.get(entityId), this.startTime),
      );
    }

    const signature = this._computeResolvedSignature(next);
    if (signature === this.resolvedSignature) {
      return;
    }

    this.resolvedSignature = signature;
    this.resolved = next;
  }

  static get styles() {
    return css`
      :host {
        display: block;
      }

      .card-header {
        padding: 12px 16px 0;
        font-size: var(--ha-card-header-font-size, 16px);
        font-weight: var(--ha-card-header-font-weight, 500);
        line-height: 1.2;
        color: var(--primary-text-color);
      }

      .error {
        margin: 8px 16px 0;
        color: var(--error-color);
        font-size: 14px;
      }

      .loading {
        padding: 8px 16px;
        color: var(--secondary-text-color);
        font-size: 14px;
      }

      .content ha-markdown {
        display: block;
        padding: 16px;
        word-wrap: break-word;
      }

      .content.text-only ha-markdown {
        padding: 2px 4px;
      }

      .entities {
        padding: 8px 0;
      }

      .entity-row {
        display: flex;
        align-items: center;
        min-height: 48px;
        padding: 4px 16px;
        cursor: pointer;
        outline: none;
      }

      .entity-row:focus-visible {
        background: rgba(var(--rgb-primary-color), 0.08);
      }

      .entity-row:hover {
        background: rgba(var(--rgb-primary-color), 0.04);
      }

      .icon {
        flex: 0 0 40px;
        color: var(--state-icon-color, var(--primary-text-color));
      }

      .info {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
      }

      .primary {
        font-size: 16px;
        color: var(--primary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .secondary {
        font-size: 12px;
        color: var(--secondary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .state {
        flex: 0 0 auto;
        margin-left: 8px;
        text-align: right;
        color: var(--primary-text-color);
        font-size: 16px;
      }

      .state-unavailable {
        color: var(--state-unavailable-color, var(--disabled-text-color));
      }
    `;
  }
}
