/**
 * Normalises an unknown thrown value into a human-readable message.
 *
 * `catch` clauses receive `unknown`, so callers cannot assume an `Error`
 * instance. Centralising the narrowing keeps logging consistent.
 */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
