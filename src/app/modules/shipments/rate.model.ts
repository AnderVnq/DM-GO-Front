export interface CourierRate {
  id: string;
  price_per_lb_cents: number;
  min_lb: number;
  volumetric_divisor: number;
  valid_from: string;
  valid_to: string | null;
}
export interface RateInput {
  price_per_lb_cents: number;
  min_lb: number;
  volumetric_divisor: number;
  valid_from?: string;
}
export interface RateMeasurement {
  weight_kg: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
}
export interface FreightQuote {
  rate_id: string;
  real_lb: number;
  volumetric_lb: number;
  billable_lb: number;
  billable_kg: string;
  price_per_lb_cents: number;
  freight_cents: number;
}
