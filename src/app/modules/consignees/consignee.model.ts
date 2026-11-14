export interface Consignee {
  id: string;
  name: string;
  doc_type: string;
  doc_number: string;
  verified: boolean;
  relationship: string;
  phone: string;
  email: string;
  consent_at?: string;
  created_at: string;
}
export interface ConsigneeInput {
  name: string;
  doc_type: string;
  doc_number: string;
  relationship: string;
  phone: string;
  email: string;
  consent: boolean;
}
export interface ConsigneeUsage {
  year: number;
  doc_type: string;
  doc_number: string;
  locked: number;
  pending: number;
  limit: number;
  remaining: number;
}
