export interface Invoice {
  id: string;
  code: string;
  type: string;
  note_id: string;
  note_number: string;
  customer_name: string;
  currency: string;
  issued_at: string;
  total_cents: number;
  igv_cents: number;
  status: string;
  observations?: string;
  has_pdf: boolean;
  has_xml: boolean;
  has_cdr: boolean;
  credited: boolean;
  ref_code?: string;
  reason?: string;
  lines: {
    description: string;
    total_cents: number;
    value_cents: number;
    igv_cents: number;
    affectation: string;
  }[];
}
export type InvoiceFileKind = 'pdf' | 'xml' | 'cdr';
