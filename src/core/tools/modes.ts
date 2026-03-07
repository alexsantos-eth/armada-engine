/**
 * Helper to build default counts from templates
 */
export function buildDefaultCounts<T extends { id?: string; defaultCount: number }>(
  templates: T[]
): Record<string, number> {
  return Object.fromEntries(
    templates
      .filter(t => t.id !== undefined)
      .map(t => [t.id!, t.defaultCount])
  );
}
