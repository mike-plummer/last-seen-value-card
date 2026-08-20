import type { HomeAssistant } from 'custom-card-helpers';

import type { TemplateContextVariables } from '../utils/template-context';

export type RenderCardContentResult =
  | { result: string; error?: undefined }
  | { result?: undefined; error: string };

interface RenderTemplateEvent {
  result?: string;
  error?: string;
  level?: 'ERROR' | 'WARNING';
}

export async function renderCardContent(
  hass: HomeAssistant,
  content: string,
  variables: TemplateContextVariables,
  entityIds?: string[],
): Promise<RenderCardContentResult> {
  try {
    const result = await new Promise<string>((resolve, reject) => {
      let unsubscribe: (() => Promise<void>) | undefined;
      let settled = false;

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        void unsubscribe?.();
        callback();
      };

      hass.connection
        .subscribeMessage<RenderTemplateEvent>(
          (event) => {
            if ('error' in event && event.error) {
              finish(() => reject(new Error(event.error)));
              return;
            }
            if (event.result !== undefined) {
              finish(() => resolve(event.result ?? ''));
            }
          },
          {
            type: 'render_template',
            template: content,
            variables,
            entity_ids: entityIds,
            strict: true,
          },
        )
        .then((unsub) => {
          unsubscribe = unsub;
        })
        .catch((error: unknown) => {
          finish(() =>
            reject(error instanceof Error ? error : new Error('Failed to render template')),
          );
        });
    });

    return { result };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to render template',
    };
  }
}
