import type { RateInput, RateMeasurement } from './rate.model.ts';
export function rateInput(
  value: {
    price_per_lb_cents: number | null;
    min_lb: number;
    volumetric_divisor: number;
    valid_from: string;
  },
  now = Date.now(),
): RateInput | null {
  const cents = value.price_per_lb_cents;
  if (
    cents === null ||
    !Number.isSafeInteger(cents) ||
    cents <= 0 ||
    !Number.isSafeInteger(value.min_lb) ||
    value.min_lb < 1 ||
    !Number.isSafeInteger(value.volumetric_divisor) ||
    value.volumetric_divisor < 1
  )
    return null;
  const input: RateInput = {
    price_per_lb_cents: cents,
    min_lb: value.min_lb,
    volumetric_divisor: value.volumetric_divisor,
  };
  const from = value.valid_from.trim();
  if (from) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(from)) return null;
    const iso = `${from}:00-05:00`,
      time = Date.parse(iso);
    if (
      !Number.isFinite(time) ||
      new Date(time - 5 * 3600000).toISOString().slice(0, 16) !== from ||
      time < now - 60000
    )
      return null;
    input.valid_from = iso;
  }
  return input;
}
export function measurementInput(value: {
  weight_kg: string | null;
  length_mm: number;
  width_mm: number;
  height_mm: number;
}): RateMeasurement | null {
  if (
    !value.weight_kg ||
    ![value.length_mm, value.width_mm, value.height_mm].every(
      (n) => Number.isSafeInteger(n) && n >= 1 && n <= 3000,
    )
  )
    return null;
  return {
    weight_kg: value.weight_kg,
    length_mm: value.length_mm,
    width_mm: value.width_mm,
    height_mm: value.height_mm,
  };
}
