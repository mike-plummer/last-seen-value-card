import type { HomeAssistant } from 'custom-card-helpers';

import type { TemplateContextVariables } from '../utils/template-context';

export interface TemplateContentCallbacks {
  onResult: (result: string) => void;
  onError: (error: string) => void;
}

interface RenderTemplateEvent {
  result?: string;
  error?: string;
  level?: 'ERROR' | 'WARNING';
}

export function subscribeTemplateContent(
  hass: HomeAssistant,
  content: string,
  variables: TemplateContextVariables,
  callbacks: TemplateContentCallbacks,
  entityIds?: string[],
): Promise<() => Promise<void>> {
  return hass.connection.subscribeMessage<RenderTemplateEvent>(
    (event) => {
      if ('error' in event && event.error) {
        callbacks.onError(event.error);
        return;
      }
      if (event.result !== undefined) {
        callbacks.onResult(event.result ?? '');
      }
    },
    {
      type: 'render_template',
      template: content,
      variables,
      strict: true,
      report_errors: true,
      ...(entityIds?.length ? { entity_ids: entityIds } : {}),
    },
  );
}
