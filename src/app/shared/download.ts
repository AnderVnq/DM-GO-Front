export function openDownload(url: string): void {
  const target = new URL(url, location.origin);
  if (!['https:', 'http:'].includes(target.protocol))
    throw new Error('El enlace de descarga no es válido.');
  window.open(target.href, '_blank', 'noopener,noreferrer');
}

export function savePdf(blob: Blob, name: string): void {
  if (!blob.type.includes('pdf')) throw new Error('La respuesta recibida no es un PDF.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fileError(file: File): string {
  if (!file.size) return 'El archivo está vacío.';
  if (file.size > 15 * 1024 * 1024) return 'El archivo supera los 15 MB.';
  return ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    ? ''
    : 'Adjunta un archivo PDF, JPEG, PNG o WEBP.';
}
