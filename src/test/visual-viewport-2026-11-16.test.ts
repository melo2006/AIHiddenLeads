import { describe, expect, it } from 'vitest';

import { availableHeightFor, isShortVisualViewport, visualViewportClass } from '@/lib/visualViewport';

// Chat-fix4 (2026-11-16): the panel's available height derives from
// window.visualViewport so the on-screen keyboard can never cover
// the composer. These pin the pure sizing rules DraggableFloating
// applies (the class drives the short-viewport CSS in index.css).
describe('chat-fix4 visual viewport sizing', () => {
  it('reserves the floating chrome from the visual height', () => {
    expect(availableHeightFor(892)).toBe(836);
    expect(availableHeightFor(520)).toBe(464);
    expect(availableHeightFor(460)).toBe(404);
  });

  it('never collapses below a usable floor', () => {
    expect(availableHeightFor(100)).toBe(140);
    expect(availableHeightFor(0)).toBe(140);
  });

  it('flags keyboard-height viewports as short', () => {
    expect(isShortVisualViewport(520)).toBe(true);
    expect(isShortVisualViewport(460)).toBe(true);
    expect(isShortVisualViewport(560)).toBe(true);
    expect(isShortVisualViewport(561)).toBe(false);
    expect(isShortVisualViewport(892)).toBe(false);
    expect(isShortVisualViewport(0)).toBe(false);
  });

  it('maps the short state to the CSS hook class', () => {
    expect(visualViewportClass(520)).toBe('aspen-vv-short');
    expect(visualViewportClass(892)).toBe('');
  });
});
