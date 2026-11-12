export interface Quote {
  id: string;
  number: string;
  status: string;
  customer_id?: string;
  prospect_name?: string;
  product_name: string;
  product_url?: string;
  store?: string;
  unit_cents: number;
  quantity: number;
  grams: number;
  currency: string;
  total_cents: number;
  breakdown: { concept: string; cents: number }[];
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
  grams: number;
  delivery_usa_cents: number;
  traveler: boolean;
  discount_cents: number;
  extras: never[];
  notes: string;
}
