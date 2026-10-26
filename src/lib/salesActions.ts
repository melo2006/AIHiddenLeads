export const salesPlans = ['essentials', 'growth', 'fullservice'] as const;
export type SalesPlan = typeof salesPlans[number];
export function selectedSalesPlan(value: string | null): SalesPlan {
  return salesPlans.find(plan => plan === value) || 'essentials';
}
export function salesPlanDestination(plan: string | null = null) {
  return `/plans?plan=${selectedSalesPlan(plan)}`;
}