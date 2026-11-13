// @vitest-environment node
// INCIDENT 2026-11-12 — regression guard for the Gemini Live SETUP
// payload's function declarations.
//
// After the Batch 1 proxy deploy, the provider began closing every
// Edge session ~0.3s after connect with code 1011, before
// setupComplete: zero ready, zero audio, zero transcripts (harness
// sessions 6a716657…, 02f76eea…, 2026-11-12 19:31 UTC). The only
// setup-payload delta in that deploy was a new function declaration,
// request_manager_transfer, whose parameters schema was
// {type:'OBJECT',properties:{}} — an OBJECT schema with an EMPTY
// properties map, and the only no-argument declaration in the set
// (every declaration that had been working for weeks declares at
// least one property). The declaration is withheld until it can be
// reintroduced in a validated shape; this test makes the suspect
// shape impossible to ship again, for ANY declaration:
//
//   1. No OBJECT parameter schema with an empty properties map,
//      anywhere in the proxy (a no-argument function must omit the
//      parameters object instead of declaring an empty one).
//   2. Every declaration name is a valid, unique function name.
//   3. Every `required` entry names a property the same declaration
//      actually declares.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(
  path.join(__dirname, '..', '..', 'supabase/functions/gemini-live-proxy/index.ts'),
  'utf8',
);

/** Brace-match from the `{` at `start`, string-aware ('…', "…", `…`). */
function braceSlice(text: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced braces');
}

/** The setup tools section of the provider setup message. */
function toolsSection(): string {
  const begin = src.indexOf('tools:[{functionDeclarations:[');
  const end = src.indexOf('realtimeInputConfig');
  expect(begin).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(begin);
  return src.slice(begin, end);
}

interface Declaration { name: string; body: string }

function declarations(): Declaration[] {
  const section = toolsSection();
  const out: Declaration[] = [];
  const re = /\{name:'([A-Za-z_][A-Za-z0-9_]*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section)) !== null) {
    out.push({ name: m[1], body: braceSlice(section, m.index) });
  }
  return out;
}

/** Top-level property keys of an object literal body (depth-1 scan). */
function topLevelKeys(objectLiteral: string): string[] {
  const inner = objectLiteral.slice(1, -1);
  const keys: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let token = '';
  const flush = () => {
    const t = token.trim();
    if (t) keys.push(t);
    token = '';
  };
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    else if (depth === 0 && ch === ':') flush();
    else if (depth === 0 && ch === ',') token = '';
    else if (depth === 0) token += ch;
  }
  return keys.map(k => k.replace(/^['"]|['"]$/g, ''));
}

describe('Live setup function declarations — accepted-shape guard', () => {
  it('the proxy source contains no empty-properties OBJECT schema anywhere', () => {
    expect(src).not.toMatch(/properties:\s*\{\s*\}/);
  });

  it('declarations exist, with valid unique names', () => {
    const decls = declarations();
    expect(decls.length).toBeGreaterThanOrEqual(2);
    const names = decls.map(d => d.name);
    for (const name of names) {
      expect(name).toMatch(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/);
    }
    expect(new Set(names).size).toBe(names.length);
  });

  it('no declaration carries an OBJECT schema with an empty properties map', () => {
    for (const decl of declarations()) {
      const pIdx = decl.body.indexOf('parameters:');
      if (pIdx === -1) continue; // no-argument: parameters omitted entirely — the safe shape
      const params = braceSlice(decl.body, decl.body.indexOf('{', pIdx));
      const propsIdx = params.indexOf('properties:');
      if (propsIdx === -1) continue;
      const props = braceSlice(params, params.indexOf('{', propsIdx));
      const keys = topLevelKeys(props);
      expect(
        keys.length,
        `${decl.name}: OBJECT schema declares an empty properties map (INCIDENT 2026-11-12 shape)`,
      ).toBeGreaterThan(0);
    }
  });

  it('every required entry names a declared property of the same declaration', () => {
    for (const decl of declarations()) {
      const pIdx = decl.body.indexOf('parameters:');
      if (pIdx === -1) continue;
      const params = braceSlice(decl.body, decl.body.indexOf('{', pIdx));
      const reqMatch = params.match(/required:\s*\[([^\]]*)\]/);
      if (!reqMatch) continue;
      const required = [...reqMatch[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
      const propsIdx = params.indexOf('properties:');
      const props = propsIdx === -1 ? '{}' : braceSlice(params, params.indexOf('{', propsIdx));
      const keys = topLevelKeys(props);
      for (const name of required) {
        expect(keys, `${decl.name}: required '${name}' is not a declared property`).toContain(name);
      }
    }
  });
});
