const TEMPLATE_PATTERN = /\{%|\{\{/;

export function hasTemplateSyntax(content: string): boolean {
  return TEMPLATE_PATTERN.test(content);
}
