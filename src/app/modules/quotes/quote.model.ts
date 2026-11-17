export interface Quote {
  id: string;
  number: string;
  status: string;
  customer_id?: string;
  prospect_name?: string;
  prospect_email?: string;
  prospect_phone?: string;
  traveler?: boolean;
  traveler_percent_bp?: number;
  supplements?: boolean;
  supplement_units?: number;
  peru_tax_mode?: PeruTaxMode;
  delivery_lima_cents?: number;
  agency_dispatch_cents?: number;
  extras?: QuoteExtra[];
  email_sent?: boolean;
  email_error?: string;
  product_name: string;
  product_url?: string;
  store?: string;
  unit_cents: number;
  quantity: number;
  weight_kg: string;
  currency: string;
  total_cents: number;
  breakdown: { concept: string; cents: number; quantity?: number }[];
  notes?: string;
  created_at: string;
  expires_at: string;
}
export interface QuoteInput {
  customer_id?: string;
  prospect_name: string;
  prospect_email: string;
  prospect_phone: string;
  product_name: string;
  product_url: string;
  store: string;
  unit_cents: number;
  quantity: number;
  weight_kg: string;
  delivery_usa_cents: number;
  traveler: boolean;
  discount_cents: number;
  extras: QuoteExtraInput[];
  tax_usa_bp?: number;
  assisted_bp?: number;
  rate_per_kg_cents?: number;
  peru_tax_mode: PeruTaxMode;
  traveler_percent_bp?: number;
  supplements: boolean;
  supplement_units: number;
  delivery_lima_cents: number;
  agency_dispatch_cents: number;
  valid_until?: string;
  send_email: boolean;
  notes: string;
}

export interface QuoteExtraInput {
  code: string;
  quantity: number;
  unit_cents?: number;
}
export interface QuoteChargeType {
  code: string;
  name: string;
  active: boolean;
  default_cents: number | null;
  quote_price_editable: boolean;
}

export type PeruTaxMode = 'auto' | 'yes' | 'no';
export interface QuoteExtra extends QuoteExtraInput {
  name: string;
  unit_cents: number;
}
export interface QuoteEmailResult {
  email_sent: boolean;
  email_error?: string;
}
