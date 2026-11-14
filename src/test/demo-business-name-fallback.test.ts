import { describe, expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractBusinessName } from '@/components/landing/DemoIntakePanel';

// Ron's standing rule (pre-publish #42 pass, 2026-11-14): a business must
// never be displayed — or stored — as the bare word "Business". The last
// two fallbacks on the demo path were DemoSite's CRM-param lead creation
// and extractBusinessName's catch. These tests pin both shut: names come
// from the site's own host, or from a neutral phrase when nothing can be
// derived.
const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('extractBusinessName', () => {
  test('derives the name from the site host', () => {
    expect(extractBusinessName('https://www.aureliaperez.com/')).toBe('Aureliaperez');
    expect(extractBusinessName('martinezrealestate.com')).toBe('Martinezrealestate');
  });

  test('never returns the bare word "Business"', () => {
    for (const input of ['', '   ', 'https://', 'http://www.', '/', '...']) {
      expect(extractBusinessName(input)).not.toBe('Business');
    }
  });

  test('falls back to a neutral phrase when nothing is derivable', () => {
    expect(extractBusinessName('')).toBe('this business');
    expect(extractBusinessName('https://')).toBe('this business');
  });
});

describe('DemoSite CRM-param lead creation', () => {
  const demoSite = read('pages/DemoSite.tsx');

  test('never stores the bare word "Business" as a lead name', () => {
    expect(demoSite).not.toContain('|| "Business"');
    expect(demoSite).not.toContain("|| 'Business'");
  });

  test('stores the host-derived name the seed displays when no name param arrives', () => {
    expect(demoSite).toContain('_business_name: nameParam || getSiteName(urlParam)');
  });
});
