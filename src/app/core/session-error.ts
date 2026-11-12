export class SessionExpiredError extends Error {
  constructor() {
    super('Tu sesión ha terminado. Vuelve a iniciar sesión.');
    this.name = 'SessionExpiredError';
  }
}
export function requiresLogin(error: unknown): boolean {
  return (
    error instanceof SessionExpiredError ||
    (error !== null && typeof error === 'object' && 'status' in error && error.status === 401)
  );
}
