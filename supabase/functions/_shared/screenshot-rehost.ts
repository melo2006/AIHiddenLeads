// Permanent storage for Firecrawl screenshot URLs.
//
// Firecrawl returns a signed GCS URL that expires roughly 24 hours after a
// scan. The scan must therefore download the image while the URL is fresh
// and upload those bytes to our own public bucket. JPEG conversion is only
// a size optimization: when the converter is unavailable, errors, or still
// leaves the capture above the preferred size, the downloaded ORIGINAL
// bytes are uploaded instead. A successfully downloaded capture must not be
// abandoned on the expiring provider URL merely because conversion failed.
//
// This module is dependency-injected so Vitest can exercise the complete
// download → optional conversion → upload decision without Deno, Supabase,
// Browserless, or network access.

export const SCREENSHOT_REHOST_PREFERRED_MAX_BYTES = 8 * 1024 * 1024;
export const SCREENSHOT_REHOST_DOWNLOAD_CEILING = 32 * 1024 * 1024;

export interface ScreenshotCapResult {
  bytes: ArrayBuffer;
  type: string;
  extension: string;
  wasConverted: boolean;
}

export interface ScreenshotUploadInput {
  bytes: ArrayBuffer;
  contentType: string;
  extension: string;
}

export interface ScreenshotRehostDeps {
  fetcher?: typeof fetch;
  capBytes: (buffer: ArrayBuffer) => Promise<ScreenshotCapResult>;
  upload: (input: ScreenshotUploadInput) => Promise<string | null>;
  preferredMaxBytes?: number;
  downloadCeiling?: number;
  log?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export function screenshotExtensionForContentType(contentType: string): string {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  return 'png';
}

function normalizeImageContentType(value: string | null | undefined): string {
  const contentType = (value || 'image/png').split(';')[0].trim().toLowerCase();
  return contentType.startsWith('image/') ? contentType : 'image/png';
}

/**
 * Download a provider screenshot URL and store it through the injected
 * uploader. The original provider URL is returned only when the capture
 * could not be downloaded or the bucket upload itself failed; conversion
 * failure is explicitly NOT a keep-original condition.
 */
export async function rehostScreenshotUrlWith(
  screenshotUrl: string,
  deps: ScreenshotRehostDeps,
): Promise<string> {
  const fetcher = deps.fetcher ?? fetch;
  const log = deps.log ?? ((...args: unknown[]) => console.log(...args));
  const warn = deps.warn ?? ((...args: unknown[]) => console.warn(...args));
  const error = deps.error ?? ((...args: unknown[]) => console.error(...args));
  const preferredMaxBytes = deps.preferredMaxBytes ?? SCREENSHOT_REHOST_PREFERRED_MAX_BYTES;
  const downloadCeiling = deps.downloadCeiling ?? SCREENSHOT_REHOST_DOWNLOAD_CEILING;

  try {
    // Already ours (public bucket) or an inline image — nothing to re-host.
    if (
      screenshotUrl.startsWith('data:') ||
      screenshotUrl.includes('/storage/v1/object/public/')
    ) {
      return screenshotUrl;
    }

    const response = await fetcher(screenshotUrl, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      warn(`[Rehost] Screenshot download failed (${response.status}), keeping original URL`);
      return screenshotUrl;
    }

    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > downloadCeiling) {
      warn(`[Rehost] Screenshot declared length ${declaredLength} beyond download ceiling, keeping original URL`);
      return screenshotUrl;
    }

    const downloaded = await response.arrayBuffer();
    if (downloaded.byteLength === 0) {
      warn('[Rehost] Screenshot download was empty, keeping original URL');
      return screenshotUrl;
    }
    if (downloaded.byteLength > downloadCeiling) {
      warn(`[Rehost] Screenshot downloaded length ${downloaded.byteLength} beyond download ceiling, keeping original URL`);
      return screenshotUrl;
    }

    const originalContentType = normalizeImageContentType(response.headers.get('content-type'));
    let uploadBytes = downloaded;
    let uploadContentType = originalContentType;

    if (downloaded.byteLength > preferredMaxBytes) {
      try {
        const capped = await deps.capBytes(downloaded);
        if (capped.wasConverted && capped.bytes.byteLength > 0 && capped.bytes.byteLength <= preferredMaxBytes) {
          log(`[Rehost] Screenshot JPEG-capped ${downloaded.byteLength} → ${capped.bytes.byteLength} bytes`);
          uploadBytes = capped.bytes;
          uploadContentType = normalizeImageContentType(capped.type);
        } else {
          warn(
            `[Rehost] Screenshot conversion did not produce an in-bounds JPEG ` +
            `(downloaded ${downloaded.byteLength} bytes); storing the downloaded original instead of the expiring URL`,
          );
        }
      } catch (capError) {
        warn(
          `[Rehost] Screenshot conversion failed (${capError instanceof Error ? capError.message : String(capError)}); ` +
          'storing the downloaded original instead of the expiring URL',
        );
      }
    }

    let publicUrl: string | null = null;
    try {
      publicUrl = await deps.upload({
        bytes: uploadBytes,
        contentType: uploadContentType,
        extension: screenshotExtensionForContentType(uploadContentType),
      });
    } catch (uploadError) {
      error('[Rehost] Screenshot upload failed, keeping original URL:', uploadError);
      return screenshotUrl;
    }

    if (!publicUrl) {
      warn('[Rehost] Screenshot upload returned no public URL, keeping original URL');
      return screenshotUrl;
    }

    log('[Rehost] Screenshot re-hosted:', publicUrl);
    return publicUrl;
  } catch (err) {
    error('[Rehost] Screenshot re-host failed, keeping original URL:', err);
    return screenshotUrl;
  }
}
