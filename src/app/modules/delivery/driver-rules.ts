export interface DeliveryPoint {
  latitude: number;
  longitude: number;
}
export function validPoint(point: DeliveryPoint | null): boolean {
  return (
    !!point &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}
export function evidenceError(file: { type: string; size: number }): string {
  const video = ['video/mp4', 'video/quicktime'].includes(file.type),
    photo = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (!video && !photo) return 'Adjunta fotos JPG, PNG o WebP, o videos MP4/MOV.';
  if (!file.size) return 'El archivo está vacío.';
  return file.size > (video ? 200 : 15) * 1024 * 1024
    ? `El archivo supera los ${video ? 200 : 15} MB permitidos.`
    : '';
}
export function validReceiver(name: string, type: string, number: string): boolean {
  const normalized = name.trim().replace(/\s+/g, ' ');
  if (!normalized || [...normalized].length > 200) return false;
  const n = number.trim().toUpperCase();
  if (type === 'dni') return /^\d{8}$/.test(n);
  if (type === 'ce') return /^[0-9A-Z]{9,12}$/.test(n);
  if (type === 'passport') return /^[0-9A-Z]{6,12}$/.test(n);
  if (type === 'ruc' && /^(10|15|16|17|20)\d{9}$/.test(n)) {
    const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2],
      sum = weights.reduce((sum, w, i) => sum + w * Number(n[i]), 0);
    const raw = 11 - (sum % 11);
    return Number(n[10]) === (raw === 10 ? 0 : raw === 11 ? 1 : raw);
  }
  return false;
}
