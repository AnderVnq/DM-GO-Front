export interface ReceptionScan {
  code: string;
  package_id?: string;
  pieces: number;
  scanned_at: string;
  note?: string;
}
// El cuadre conserva las claves exportadas por las estructuras Go del contrato.
export interface ExpectedPiece {
  PackageID: string;
  Guide: string;
  WR: string;
  Status: string;
}
export interface ReceptionResult {
  complete: ExpectedPiece[];
  different: (ExpectedPiece & { received: number })[];
  missing: ExpectedPiece[];
  extra: { Code: string; PackageID: string; Pieces: number; ScannedAt: string; Note: string }[];
}
export interface Reception {
  id: string;
  mawb_id: string;
  mawb_number: string;
  warehouse_code: string;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
  scans: ReceptionScan[];
  result: ReceptionResult | null;
}
export interface ScanInput {
  code: string;
  pieces: number;
  note: string;
  replace: boolean;
}
export interface ScanResult {
  code: string;
  pieces: number;
  in_mawb: boolean;
  known_package: boolean;
  guide?: string;
  wr?: string;
  package_id?: string;
}
export interface ReceptionMawb {
  id: string;
  number: string;
  status: 'open' | 'closed';
  flight_number: string;
  origin: string;
  destination: string;
}
