// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
  rehostScreenshotUrlWith,
  type ScreenshotUploadInput,
} from '../../supabase/functions/_shared/screenshot-rehost';

const SIGNED_URL = 'https://storage.googleapis.com/firecrawl-scrape-media/heavy.png?X-Goog-Signature=test';
const BUCKET_URL = 'https://project.supabase.co/storage/v1/object/public/email-assets/demo-screenshots/lead-desktop.png';
const BUCKET_JPEG_URL = 'https://project.supabase.co/storage/v1/object/public/email-assets/demo-screenshots/lead-desktop.jpg';

function bytesOf(values: number[]): ArrayBuffer {
  return Uint8Array.from(values).buffer;
}

function screenshotResponse(bytes: ArrayBuffer, contentType = 'image/png') {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'content-type') return contentType;
        if (name.toLowerCase() === 'content-length') return String(bytes.byteLength);
        return null;
      },
    },
    arrayBuffer: async () => bytes.slice(0),
  } as unknown as Response;
}

function makeDeps(original: ArrayBuffer, overrides: Record<string, unknown> = {}) {
  const uploads: ScreenshotUploadInput[] = [];
  const deps = {
    fetcher: vi.fn(async () => screenshotResponse(original)),
    capBytes: vi.fn(async (buffer: ArrayBuffer) => ({
      bytes: buffer,
      type: 'image/png',
      extension: 'png',
      wasConverted: false,
    })),
    upload: vi.fn(async (input: ScreenshotUploadInput) => {
      uploads.push(input);
      return input.extension === 'jpg' ? BUCKET_JPEG_URL : BUCKET_URL;
    }),
    preferredMaxBytes: 4,
    downloadCeiling: 32,
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    ...overrides,
  };
  return { deps, uploads };
}

describe('Firecrawl screenshot re-host permanence fallback', () => {
  it('stores the ORIGINAL bytes when JPEG conversion returns the unconverted PNG', async () => {
    const original = bytesOf([1, 2, 3, 4, 5, 6]);
    const { deps, uploads } = makeDeps(original);

    const result = await rehostScreenshotUrlWith(SIGNED_URL, deps as never);

    expect(result).toBe(BUCKET_URL);
    expect(result).not.toContain('storage.googleapis.com/firecrawl-scrape-media');
    expect(deps.capBytes).toHaveBeenCalledTimes(1);
    expect(uploads).toHaveLength(1);
    expect(new Uint8Array(uploads[0].bytes)).toEqual(new Uint8Array(original));
    expect(uploads[0]).toMatchObject({ contentType: 'image/png', extension: 'png' });
  });

  it('stores the ORIGINAL bytes when the conversion step throws', async () => {
    const original = bytesOf([9, 8, 7, 6, 5]);
    const { deps, uploads } = makeDeps(original, {
      capBytes: vi.fn(async () => {
        throw new Error('Browserless /function unavailable');
      }),
    });

    const result = await rehostScreenshotUrlWith(SIGNED_URL, deps as never);

    expect(result).toBe(BUCKET_URL);
    expect(uploads).toHaveLength(1);
    expect(new Uint8Array(uploads[0].bytes)).toEqual(new Uint8Array(original));
  });

  it('stores the ORIGINAL bytes when a converted result is still above the preferred bound', async () => {
    const original = bytesOf([1, 1, 1, 1, 1, 1]);
    const stillOversized = bytesOf([2, 2, 2, 2, 2]);
    const { deps, uploads } = makeDeps(original, {
      capBytes: vi.fn(async () => ({
        bytes: stillOversized,
        type: 'image/jpeg',
        extension: 'jpg',
        wasConverted: true,
      })),
    });

    const result = await rehostScreenshotUrlWith(SIGNED_URL, deps as never);

    expect(result).toBe(BUCKET_URL);
    expect(uploads).toHaveLength(1);
    expect(new Uint8Array(uploads[0].bytes)).toEqual(new Uint8Array(original));
    expect(uploads[0].extension).toBe('png');
  });

  it('uses the converted JPEG when conversion succeeds within the preferred bound', async () => {
    const original = bytesOf([1, 2, 3, 4, 5, 6]);
    const jpeg = bytesOf([7, 7, 7]);
    const { deps, uploads } = makeDeps(original, {
      capBytes: vi.fn(async () => ({
        bytes: jpeg,
        type: 'image/jpeg',
        extension: 'jpg',
        wasConverted: true,
      })),
    });

    const result = await rehostScreenshotUrlWith(SIGNED_URL, deps as never);

    expect(result).toBe(BUCKET_JPEG_URL);
    expect(uploads).toHaveLength(1);
    expect(new Uint8Array(uploads[0].bytes)).toEqual(new Uint8Array(jpeg));
    expect(uploads[0]).toMatchObject({ contentType: 'image/jpeg', extension: 'jpg' });
  });

  it('does not invoke conversion for an in-bounds capture', async () => {
    const original = bytesOf([1, 2, 3]);
    const { deps, uploads } = makeDeps(original);

    const result = await rehostScreenshotUrlWith(SIGNED_URL, deps as never);

    expect(result).toBe(BUCKET_URL);
    expect(deps.capBytes).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(1);
  });

  it('keeps the provider URL only when the bucket upload itself fails', async () => {
    const original = bytesOf([1, 2, 3, 4, 5]);
    const { deps } = makeDeps(original, {
      upload: vi.fn(async () => null),
    });

    const result = await rehostScreenshotUrlWith(SIGNED_URL, deps as never);

    expect(result).toBe(SIGNED_URL);
  });
});
