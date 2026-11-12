export interface ApiProblem {
  status?: number;
  code?: string;
  detail?: string;
  request_id?: string;
  errors?: Record<string, string>;
}

export function problemMessage(problem: ApiProblem): string {
  const fallback: Record<number, string> = {
    0: 'No se pudo establecer conexión. Comprueba que la API esté disponible.',
    401: 'Tu sesión ha terminado. Vuelve a iniciar sesión.',
    403: 'No tienes permiso para realizar esta acción.',
    404: 'No se encontró el registro solicitado.',
    409: 'El registro cambió. Actualiza los datos antes de volver a intentarlo.',
    413: 'El archivo supera el tamaño permitido de 15 MB.',
  };
  const message =
    problem.detail ||
    fallback[problem.status ?? 500] ||
    'No se pudo completar la operación. Inténtalo de nuevo.';
  return problem.request_id ? `${message} · Referencia: ${problem.request_id}` : message;
}

export function requestMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const value = error as { status?: number; error?: ApiProblem; message?: string };
    if (typeof value.status === 'number')
      return problemMessage({ ...value.error, status: value.status });
    if (value.message) return value.message;
  }
  return problemMessage({ status: 500 });
}
