// Mostrar únicamente los campos del formulario; el backend conserva la validación del negocio.
export function customerFieldErrors(error: unknown): Record<string, string> {
  if (!error || typeof error !== 'object' || !('error' in error)) return {};
  const problem = error.error;
  if (!problem || typeof problem !== 'object' || !('errors' in problem)) return {};
  const fields = problem.errors;
  if (!fields || typeof fields !== 'object') return {};
  const allowed = new Set(['doc_type', 'doc_number', 'name', 'email', 'phone']);
  const result: Record<string, string> = {};
  for (const [key, message] of Object.entries(fields)) {
    const field = key === 'document' ? 'doc_number' : key;
    if (allowed.has(field) && typeof message === 'string') result[field] = message;
  }
  return result;
}
