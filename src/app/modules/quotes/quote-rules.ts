export function matchesCustomerLookup(requested: string, current: string): boolean {
  return requested.trim().toUpperCase() === current.trim().toUpperCase();
}
