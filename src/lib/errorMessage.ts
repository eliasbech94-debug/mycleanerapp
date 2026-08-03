/**
 * Normalises an unknown thrown value into a user-facing message.
 *
 * Used instead of `catch (e: any)` so error handling stays type-safe without
 * changing behaviour: the message is read when present, otherwise the caller's
 * fallback copy is returned.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}
