import { describe, expect, it } from 'vitest';
import { classifyMicrophoneFailure, isEmbeddedContext, isMicrophonePermissionError } from '@/lib/embeddedContext';

const DENIED = 'Microphone permission was denied — allow it in your browser and try again.';

const fakeWindow = (self: unknown, top: unknown) => ({ self, top }) as unknown as Window;

describe('isEmbeddedContext', () => {
  it('is false without a window (SSR/tests)', () => {
    expect(isEmbeddedContext(undefined)).toBe(false);
  });

  it('is false when the page is the top window', () => {
    const win = {};
    expect(isEmbeddedContext(fakeWindow(win, win))).toBe(false);
  });

  it('is true when the page is framed by another window', () => {
    expect(isEmbeddedContext(fakeWindow({}, {}))).toBe(true);
  });

  it('is true when reaching the top window throws (cross-origin frame)', () => {
    const framed: Record<string, unknown> = { self: null };
    Object.defineProperty(framed, 'top', { get() { throw new Error('SecurityError'); } });
    framed.self = framed;
    expect(isEmbeddedContext(framed as unknown as Window)).toBe(true);
  });
});

describe('isMicrophonePermissionError', () => {
  it('matches the browser microphone refusal names', () => {
    const notAllowed = new Error('denied'); notAllowed.name = 'NotAllowedError';
    const security = new Error('blocked'); security.name = 'SecurityError';
    expect(isMicrophonePermissionError(notAllowed)).toBe(true);
    expect(isMicrophonePermissionError(security)).toBe(true);
  });

  it('rejects other errors and non-errors', () => {
    expect(isMicrophonePermissionError(new Error('NotFoundError'))).toBe(false);
    expect(isMicrophonePermissionError('NotAllowedError')).toBe(false);
    expect(isMicrophonePermissionError(null)).toBe(false);
    expect(isMicrophonePermissionError(undefined)).toBe(false);
  });
});

describe('classifyMicrophoneFailure', () => {
  it('flags a mic denial inside an embedded frame for guidance', () => {
    expect(classifyMicrophoneFailure(DENIED, DENIED, true)).toBe('mic-denied-embedded');
  });

  it('keeps a mic denial at top level as a genuine denial', () => {
    expect(classifyMicrophoneFailure(DENIED, DENIED, false)).toBe('mic-denied');
  });

  it('treats any other error text as other, framed or not', () => {
    expect(classifyMicrophoneFailure('The connection closed before the session started. Try again.', DENIED, true)).toBe('other');
    expect(classifyMicrophoneFailure('Could not start. Check your microphone and try again.', DENIED, false)).toBe('other');
  });

  it('treats no error as other', () => {
    expect(classifyMicrophoneFailure(null, DENIED, true)).toBe('other');
    expect(classifyMicrophoneFailure(undefined, DENIED, false)).toBe('other');
    expect(classifyMicrophoneFailure('', DENIED, true)).toBe('other');
  });
});
