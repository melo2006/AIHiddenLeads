import { expect, test } from 'vitest';
import { selectedSalesPlan, salesPlanDestination } from '../lib/salesActions';
test('Start now defaults to Essentials rather than immediate payment', () => {
  expect(salesPlanDestination()).toBe('/plans?plan=essentials');
});
test('recommended Growth opens Growth plan selection', () => {
  expect(salesPlanDestination('growth')).toBe('/plans?plan=growth');
});
test('unknown plan cannot bypass supported plan selection', () => {
  expect(selectedSalesPlan('invented')).toBe('essentials');
});