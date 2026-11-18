import type { AgencyInput, BranchInput } from './agency.model.ts';
export function normalizeAgency(value: AgencyInput): AgencyInput {
  return {
    code: value.code.trim().toUpperCase(),
    name: value.name.trim(),
    dropoff_ubigeo: value.dropoff_ubigeo.trim(),
    dropoff_address: value.dropoff_address.trim(),
  };
}
export function normalizeBranch(value: BranchInput): BranchInput {
  return { name: value.name.trim(), ubigeo: value.ubigeo.trim(), address: value.address.trim() };
}
export function validAgency(value: AgencyInput): boolean {
  const v = normalizeAgency(value);
  return (
    /^[A-Z0-9_]{2,20}$/.test(v.code) &&
    !!v.name &&
    /^\d{6}$/.test(v.dropoff_ubigeo) &&
    !!v.dropoff_address
  );
}
export function validBranch(value: BranchInput): boolean {
  const v = normalizeBranch(value);
  return !!v.name && /^\d{6}$/.test(v.ubigeo) && !!v.address;
}
