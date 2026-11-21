export interface AddressRecord {
  id: string;
  ubigeo: string;
  line: string;
  reference: string;
  primary: boolean;
  latitude?: number | null;
  longitude?: number | null;
}
