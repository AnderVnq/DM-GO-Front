export interface AgencyBranch {
  id: string;
  name: string;
  ubigeo: string;
  address: string;
  active: boolean;
}
export interface TransitAgency {
  id: string;
  code: string;
  name: string;
  dropoff_ubigeo: string;
  dropoff_address: string;
  active: boolean;
  branches: AgencyBranch[];
}
export interface AgencyInput {
  code: string;
  name: string;
  dropoff_ubigeo: string;
  dropoff_address: string;
}
export interface BranchInput {
  name: string;
  ubigeo: string;
  address: string;
}
