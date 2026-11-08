// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const crm = readFileSync(new URL('../pages/CRM.tsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../components/crm/CRMSidebar.tsx', import.meta.url), 'utf8');
const view = readFileSync(new URL('../components/crm/OutreachReportView.tsx', import.meta.url), 'utf8');

describe('outreach report surface', () => {
  test('the /dashboard/outreach route renders the outreach report view', () => {
    expect(crm).toContain('OutreachReportView');
    expect(crm).toContain('path="outreach"');
    expect(crm).toContain('element={<OutreachReportView />}');
  });

  test('the sidebar links to the outreach report next to Campaigns', () => {
    const campaignsAt = sidebar.indexOf('/dashboard/campaigns');
    const outreachAt = sidebar.indexOf('/dashboard/outreach');
    expect(campaignsAt).toBeGreaterThan(-1);
    expect(outreachAt).toBeGreaterThan(campaignsAt);
    expect(sidebar).toContain('Outreach Report');
  });

  test('the view loads from the outreach-report function and ships an honest empty state', () => {
    expect(view).toContain('fetchOutreachReport');
    expect(view).toContain('No outreach sends recorded yet');
    // Honest-signal rule: the report never presents email opens.
    expect(view).not.toMatch(/emails?_?opened/i);
  });
});
