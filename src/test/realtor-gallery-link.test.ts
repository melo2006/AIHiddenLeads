// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('realtors page → main avatar gallery link (Ron, 2026-11-16)', () => {
  const template = readFileSync(new URL('../components/landing/AgentLandingTemplate.tsx', import.meta.url), 'utf8');
  const section = readFileSync(new URL('../components/landing/AvatarGallerySection.tsx', import.meta.url), 'utf8');

  it('the realtors page carries a link to the main gallery above its footer', () => {
    expect(template).toContain('data-avatar-gallery-link');
    expect(template).toContain('href="/#avatar-gallery"');
    expect(template).toContain('see the full avatar gallery');
    // Realtors only, and it sits before the Footer.
    const linkAt = template.indexOf('data-avatar-gallery-link');
    expect(template.slice(linkAt - 200, linkAt)).toContain('vertical.slug === "realtors"');
    expect(linkAt).toBeLessThan(template.indexOf('<Footer />'));
  });

  it('the homepage gallery section carries the matching anchor id', () => {
    expect(section).toContain('<section id="avatar-gallery"');
  });
});
