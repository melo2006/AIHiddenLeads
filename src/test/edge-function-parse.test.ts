// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';

// REGRESSION GUARD (Publish #61, 2026-11-15): the edge functions are
// Deno/TypeScript sources that vitest never imports, so a syntax
// error in one of them sails through the whole suite and only fails
// at deploy time — exactly what happened when an unescaped
// apostrophe ("business's") landed inside a single-quoted string in
// gemini-live-proxy and the functions deploy failed. Parse every
// function source with esbuild (syntax only, no bundling) so this
// class of error fails HERE instead.
const require = createRequire(import.meta.url);
const esbuild = require('esbuild') as typeof import('esbuild');

const functionsRoot = new URL('../../supabase/functions/', import.meta.url);

function sources(): Array<{ name: string; path: URL }> {
  const out: Array<{ name: string; path: URL }> = [];
  for (const entry of readdirSync(functionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '_shared') {
      for (const file of readdirSync(new URL('_shared/', functionsRoot))) {
        if (file.endsWith('.ts')) out.push({ name: `_shared/${file}`, path: new URL(`_shared/${file}`, functionsRoot) });
      }
    } else {
      out.push({ name: `${entry.name}/index.ts`, path: new URL(`${entry.name}/index.ts`, functionsRoot) });
    }
  }
  return out;
}

describe('edge function sources parse (esbuild syntax check)', () => {
  test('every function entry and shared module parses as TypeScript', () => {
    const failures: string[] = [];
    for (const { name, path } of sources()) {
      try {
        esbuild.transformSync(readFileSync(path, 'utf8'), { loader: 'ts' });
      } catch (error) {
        failures.push(`${name}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
