/** Error that is safe to show to the admin and maps to an HTTP status. */
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = 'BAD_REQUEST',
  ) {
    super(message)
  }
}

export class NotConfiguredError extends AppError {
  constructor(what: string, how: string) {
    super(`${what} non configuré : ${how}`, 412, 'NOT_CONFIGURED')
  }
}

/** Errors worth retrying (network, 429, 5xx). */
export class TransientError extends Error {
  constructor(
    message: string,
    public retryAfterMs?: number,
  ) {
    super(message)
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
