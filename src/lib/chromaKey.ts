/**
 * Cuts Simli's flat key-green backdrop out of the live face video so the person floats
 * over the page exactly like the transparent static portrait. WebGL keeps it cheap on phones.
 */

/** Key-green distance thresholds in normalised CbCr space; shared by the shader and the JS reference. */
export const CHROMA_LOW = 0.12;
export const CHROMA_HIGH = 0.22;
/**
 * Sara-scoped key profile (2026-11-13 — Ron's Andriot screenshots:
 * pale "white shadow" fringing around Sara's eyelashes in her live
 * stream, not seen on Aspen). The keying pipeline is SHARED — one
 * shader, one threshold pair, and the simli-avatar function enables
 * keying per session (trinity2 token + key-green backdrop), not per
 * persona — so the difference is Sara's SOURCE frames: her face render
 * carries a soft shadow/halo on the green near fine detail (lashes,
 * blonde hair edges), and those pixels sit in the semi-transparent
 * band between LOW and HIGH, so they composite as a pale fringe over
 * the page. This profile shifts the band up by 0.04: pixels that close
 * to the key colour (the halo) go fully transparent, while subject
 * pixels well clear of the key colour are untouched. It is a
 * conservative erosion, NOT a cure — if the halo is baked into the
 * Simli face asset, the durable fix is a cleaner Sara face render on
 * the Simli side; this only stops the worst of it showing. Aspen and
 * Alex keep the default profile byte-for-byte.
 *
 * REBALANCED 2026-11-20 (+0.04 → +0.02): the full erosion overshot.
 * On white pages it ate Sara's hair edges — the see-through half of
 * Ron's "page through her hair… looks like a zombie" report (T&S
 * Roofing demo, white site; first asked 2026-11-18, re-reported
 * 2026-11-20). The eye/lash half of that fix now comes from the
 * tightened black band below (her lashes and dark hair were being
 * keyed as "padding"), and residual fringe on light pages is
 * absorbed by the soft backdrop painted behind the keyed canvas
 * (SimliAvatar's .simli-keyed-backdrop, light theme only). A halved
 * erosion stays for her baked-in halo.
 *
 * AUDIT ADDENDUM (2026-11-22, the all-avatar audit): Sara's profile
 * never received Monica's black-band treatment — it overrides only
 * the chroma band, so her dark detail still keyed on the SHARED
 * black band. Measured on 22 RAW frames captured from her live
 * doorway segment (Cool Air USA demo): 5,990 subject pixels under
 * alpha 0.5 (0.110%) — 5,946 black-band + 44 encoder-crushed — in
 * her bun, hairline and brows, plus 33,370 subject pixels (0.613%)
 * under 0.98. The same two defects as Monica, in the same order.
 * Her profile therefore gains the same remedy, keeping her chroma
 * band untouched: blackLow/blackHigh 0.002–0.012 and the radius-2
 * dark-core fill → sub-0.5 AND sub-0.98 subject pixels both 0
 * across the 22 frames. Safe for her stream: no letterbox padding
 * (frame edges 0% near-black), chroma factor still gates the fill,
 * true black still keys fully transparent.
 */
export const SARA_CHROMA_KEY_PROFILE = { low: 0.14, high: 0.24, blackLow: 0.002, blackHigh: 0.012, darkFillRadius: 2 } as const;
/**
 * Monica-scoped key profile (2026-11-22 — Ron's Aurelia Perez phone
 * screenshots: the page showing THROUGH streaks of Monica's hair
 * beside her cheeks and at her hairline on light sites). Forensics on
 * her RAW live frames (768×768, captured from the video element, not
 * the keyed canvas): her Simli backdrop is the standard key green —
 * uniformly (0, 0.847, 0) after encoding, CbCr distance 0.082 from
 * pure green, keying fully transparent — so the face asset and the
 * backdrop are NOT the problem, and her chroma band stays the shared
 * default. The leak is the BLACK padding band below: the darkest
 * cores of her hair strands sit at max-channel 0.012–0.031, INSIDE
 * the shared 0.01–0.04 band, so ~2.4% of her subject pixels (alpha
 * mean 0.35, 100% black-band-caused, zero chroma-caused) composite
 * as bright streaks over light pages. Aspen's blonde hair never
 * enters the band; Sara's residual leak is absorbed by her
 * light-theme backdrop (Monica has none — the backdrop div is
 * Sara-only since 2026-11-21). This profile narrows ONLY the black
 * band for Monica's stream (0.002–0.012): measured on her frames,
 * subject pixels under alpha 0.5 fall ~34× (1.71% → 0.05%), her
 * median dark-hair pixel (0.020) becomes fully opaque, and the
 * darkest strand population (max-channel 3/255) keys opaque instead
 * of sparkling over white. The narrowing is safe for HER stream
 * specifically because it carries no letterbox padding at all — the
 * backdrop fills the frame edge-to-edge (verified on the captured
 * frames) — and true black (0) still keys fully transparent. Every
 * other persona keeps the shared bands byte-for-byte.
 *
 * ROUND 2 — DARK-CORE FILL (2026-11-22, Ron's live retest after the
 * band narrowing: "hair looks okay but not 100% — two small areas
 * still transparent over her head and her hair"). Forensics on 12
 * fresh RAW frames from the live Aurelia demo: the residue is NOT
 * the band edge and NOT chroma wisps. Every one of the 2,069
 * remaining sub-0.5-alpha subject pixels (0.058% of subject) has
 * max-channel 0 or 1 of 255 — the video encoder's dead zone crushes
 * the darkest cores of her hair masses (the parting/top of her head
 * and the masses beside both ears — Ron's two areas) to pure black,
 * mottled through regions that otherwise sit at 2–3/255. No
 * per-pixel threshold can rescue a (0,0,0) hair pixel — it is
 * indistinguishable from padding black — but spatially it is
 * unmistakable: a crushed pixel sits within 2 texels of hair at
 * ≥3/255. So Monica's profile adds a dark-core fill: the black
 * factor reads the max channel over the pixel's ring neighbourhood
 * (radius 2, 8 directions, shader + JS mirror in chromaAlphaSpatial).
 * Measured on the 12 frames: sub-0.5 subject pixels 2,069 → 0,
 * subject pixels under alpha 0.98 fall 6,135 → 63 (0.002%), and the
 * fill touches NOTHING else — the chroma factor still gates every
 * pixel, so her backdrop (distance 0.082) keys to 0 exactly as
 * before, the partial-chroma edge band is unchanged (0 pixels
 * altered), and a uniform crushed field with no brighter subject
 * within the ring (a 9×9 field of (1,0,0)) stays at alpha ≈0.10 —
 * the fill rescues holes INSIDE subject masses, it does not lift
 * the floor for genuinely dark regions. True black fields still
 * key fully transparent.
 */
export const MONICA_CHROMA_KEY_PROFILE = { low: CHROMA_LOW, high: CHROMA_HIGH, blackLow: 0.002, blackHigh: 0.012, darkFillRadius: 2 } as const;
/**
 * Denise-scoped key profile ('black-professional-lady', 2026-11-22 —
 * the all-avatar audit Ron ordered after Monica's fix; her Ann
 * Chamberlain demo frames are the worst of the roster). Forensics on
 * 12 RAW live frames under the SHARED defaults: 159,465 subject
 * pixels under alpha 0.5 — 4.39% of her subject, against Monica's
 * 1.71% pre-fix. The leak map is her hair exactly: the long dark
 * masses beside her face. Cause split: 125,311 black-band pixels
 * (her shadowed hair reads max-channel 3–6/255, inside the shared
 * 0.01–0.04 band) + 34,154 encoder-crushed pixels (≤1/255). The
 * narrowed band alone (Monica's values) clears the band half and
 * leaves every crushed pixel; her crushed pockets are far WIDER
 * than Monica's — her hair masses are larger and darker — so the
 * dark-core fill needs a wider ring: measured radius sweep under
 * the narrowed band, sub-0.5 subject pixels across the 12 frames —
 * radius 2: 6,156 · 6: 243 · 8: 98 (0.0027%), with subject pixels
 * under alpha 0.98 at 830 (0.023%). Radius 8 it is; the shader cost
 * is the same 8 taps at any radius. Safe for her stream by the same
 * evidence as Monica: her frames carry NO letterbox padding (frame
 * edges 0% near-black; the backdrop fills edge-to-edge), the chroma
 * factor still gates every pixel so her backdrop keys to 0 exactly,
 * and true black still keys fully transparent.
 */
export const DENISE_CHROMA_KEY_PROFILE = { low: CHROMA_LOW, high: CHROMA_HIGH, blackLow: 0.002, blackHigh: 0.012, darkFillRadius: 8 } as const;
/**
 * Diego-scoped key profile (2026-11-22, same audit; Mauricio Barba
 * demo frames). 12 RAW frames under the shared defaults: 2,998
 * subject pixels under alpha 0.5 (0.086%) — 2,995 black-band (his
 * dark hair and jaw shadow at max-channel 4–6/255) + 3 crushed.
 * The narrowed band alone leaves the 3 crushed pixels; adding the
 * radius-2 dark-core fill (Monica's exact values) takes him to
 * zero — sub-0.5 AND sub-0.98 subject pixels both 0 across the 12
 * frames. No letterbox padding in his stream (edges 0% near-black).
 */
export const DIEGO_CHROMA_KEY_PROFILE = { low: CHROMA_LOW, high: CHROMA_HIGH, blackLow: 0.002, blackHigh: 0.012, darkFillRadius: 2 } as const;
/**
 * James-scoped key profile (2026-11-22, same audit; Jean-Luc
 * Andriot demo frames). 12 RAW frames under the shared defaults:
 * 330 subject pixels under alpha 0.5 (0.0096%), ALL of them
 * black-band — a hairline sliver at max-channel 5–6/255 — and ZERO
 * encoder-crushed pixels, so the narrowed band alone is the whole
 * remedy (→ 0 sub-0.5; one subject pixel under 0.98 in 3.43M). No
 * dark-core fill: the audit proves no crushed cores for him, and
 * unproven machinery stays off. No letterbox padding in his
 * stream (edges 0% near-black).
 */
export const JAMES_CHROMA_KEY_PROFILE = { low: CHROMA_LOW, high: CHROMA_HIGH, blackLow: 0.002, blackHigh: 0.012 } as const;
/** Optional per-call key thresholds (CbCr distance band + near-black padding band).
 *  `darkFillRadius` (texels; Monica 2, Denise 8, Sara 2) turns on the dark-core fill:
 *  the black factor then reads the ring-neighbourhood max channel —
 *  see the round-2 note on MONICA_CHROMA_KEY_PROFILE. */
export interface ChromaKeyProfile { low: number; high: number; blackLow?: number; blackHigh?: number; darkFillRadius?: number; }
/** The per-persona key profile: Sara, Monica ('latina'), Denise
 *  ('black-professional-lady'), Diego and James carry their own
 *  measured profiles (see above); every other persona — Aspen and
 *  Frank included — keys with the shared defaults (undefined). The
 *  2026-11-22 all-avatar audit measured Frank at zero leak and
 *  Aspen's blonde hair entirely clear of the black band (her only
 *  sub-0.5 pixels are a sub-visible neck-shadow sliver and earring
 *  specks, 0.06% — not the hair defect), so neither is touched. */
export function chromaKeyProfileForPersona(persona?: string): ChromaKeyProfile | undefined {
  if (persona === 'sara') return SARA_CHROMA_KEY_PROFILE;
  if (persona === 'latina') return MONICA_CHROMA_KEY_PROFILE;
  if (persona === 'black-professional-lady') return DENISE_CHROMA_KEY_PROFILE;
  if (persona === 'diego') return DIEGO_CHROMA_KEY_PROFILE;
  if (persona === 'james') return JAMES_CHROMA_KEY_PROFILE;
  return undefined;
}
/** Simli may pad the frame with pure black outside the backdrop; treat near-black padding as transparent too.
 *  The band must end BELOW the darkest real facial detail. The original
 *  0.02–0.06 band sat exactly on pupils, lash lines, brows and shadowed
 *  dark hair (max-channel ≈ 0.03–0.06), multiplying their alpha by
 *  0–0.84 — invisible on dark pages, but on light pages the page showed
 *  through eyes and hair (Ron's "zombie" report, 2026-11-20). True
 *  encoder padding is essentially 0 (ringing lifts it to ≈0.01), so the
 *  band now spans 0.01–0.04: pure black still keys fully, a pupil at
 *  max ≥ 0.04 is fully opaque, and a lash pixel at 0.03 keeps ≈0.74
 *  alpha instead of ≈0.16. Applies to every persona — the band is
 *  shared by the JS reference and the shader. */
export const BLACK_LOW = 0.01;
export const BLACK_HIGH = 0.04;
function cbcr(r: number, g: number, b: number): [number, number] {
  return [-0.168736 * r - 0.331264 * g + 0.5 * b, 0.5 * r - 0.418688 * g - 0.081312 * b];
}
const [KCB, KCR] = cbcr(0, 1, 0);

const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Alpha (0 transparent … 1 opaque) for one pixel with channels in 0..1.
 *  `low`/`high` override the key band (see SARA_CHROMA_KEY_PROFILE);
 *  `blackLow`/`blackHigh` override the padding band (see
 *  MONICA_CHROMA_KEY_PROFILE); omitted, the shared defaults apply
 *  exactly as before. */
export function chromaAlpha(r: number, g: number, b: number, low: number = CHROMA_LOW, high: number = CHROMA_HIGH, blackLow: number = BLACK_LOW, blackHigh: number = BLACK_HIGH): number {
  const [cb, cr] = cbcr(r, g, b);
  return smooth(low, high, Math.hypot(cb - KCB, cr - KCR)) * smooth(blackLow, blackHigh, Math.max(r, g, b));
}

const RING_OFFSETS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/** Alpha for the pixel at (x, y) of an RGBA buffer under a profile,
 *  mirroring the shader exactly. With the profile's `darkFillRadius`
 *  (Monica, Denise, Sara), the black factor reads the brightest channel over the
 *  ring neighbourhood at that radius (clamp-to-edge, like the
 *  shader's CLAMP_TO_EDGE sampling) instead of the pixel's own —
 *  the dark-core fill documented on MONICA_CHROMA_KEY_PROFILE.
 *  The chroma factor always reads the centre pixel, so backdrop and
 *  edge blends are untouched. Without a fill radius this reduces
 *  exactly to chromaAlpha. */
export function chromaAlphaSpatial(data: Uint8ClampedArray, w: number, h: number, x: number, y: number, profile?: ChromaKeyProfile): number {
  const low = profile?.low ?? CHROMA_LOW;
  const high = profile?.high ?? CHROMA_HIGH;
  const blackLow = profile?.blackLow ?? BLACK_LOW;
  const blackHigh = profile?.blackHigh ?? BLACK_HIGH;
  const radius = profile?.darkFillRadius ?? 0;
  const i = (y * w + x) * 4;
  const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
  if (!radius) return chromaAlpha(r, g, b, low, high, blackLow, blackHigh);
  let mx = Math.max(r, g, b);
  for (const [dx, dy] of RING_OFFSETS) {
    const nx = Math.min(w - 1, Math.max(0, x + dx * radius));
    const ny = Math.min(h - 1, Math.max(0, y + dy * radius));
    const j = (ny * w + nx) * 4;
    mx = Math.max(mx, data[j] / 255, data[j + 1] / 255, data[j + 2] / 255);
  }
  const [cb, cr] = cbcr(r, g, b);
  return smooth(low, high, Math.hypot(cb - KCB, cr - KCR)) * smooth(blackLow, blackHigh, mx);
}

/** Removes green spill from hair and shoulder edges. */
export function despill(r: number, g: number, b: number): number {
  return Math.min(g, Math.max(r, b));
}

const VERT = `attribute vec2 p;varying vec2 uv;void main(){uv=vec2((p.x+1.)/2.,(1.-p.y)/2.);gl_Position=vec4(p,0.,1.);}`;
const fragSource = (low: number, high: number, blackLow: number = BLACK_LOW, blackHigh: number = BLACK_HIGH, darkFillRadius: number = 0) => {
  if (!darkFillRadius) return `precision mediump float;varying vec2 uv;uniform sampler2D t;
vec2 cc(vec3 c){return vec2(-0.168736*c.r-0.331264*c.g+0.5*c.b,0.5*c.r-0.418688*c.g-0.081312*c.b);}
void main(){vec4 c=texture2D(t,uv);float d=distance(cc(c.rgb),cc(vec3(0.,1.,0.)));float a=smoothstep(${low.toFixed(3)},${high.toFixed(3)},d);float mx=max(c.r,max(c.g,c.b));a*=smoothstep(${blackLow.toFixed(3)},${blackHigh.toFixed(3)},mx);
c.g=min(c.g,max(c.r,c.b));gl_FragColor=vec4(c.rgb*a,a);}`;
  // Dark-core fill variant (Monica, Denise, Sara): the black factor reads the ring
  // neighbourhood's brightest channel (radius in texels via uTexel);
  // the chroma factor still reads the centre pixel only. Mirrors
  // chromaAlphaSpatial sample-for-sample.
  return `precision mediump float;varying vec2 uv;uniform sampler2D t;uniform vec2 uTexel;
vec2 cc(vec3 c){return vec2(-0.168736*c.r-0.331264*c.g+0.5*c.b,0.5*c.r-0.418688*c.g-0.081312*c.b);}
float ringMx(vec2 o){vec3 s=texture2D(t,uv+o).rgb;return max(s.r,max(s.g,s.b));}
void main(){vec4 c=texture2D(t,uv);float d=distance(cc(c.rgb),cc(vec3(0.,1.,0.)));float a=smoothstep(${low.toFixed(3)},${high.toFixed(3)},d);float mx=max(c.r,max(c.g,c.b));
vec2 o=uTexel*${darkFillRadius.toFixed(1)};
mx=max(mx,ringMx(vec2(o.x,0.)));mx=max(mx,ringMx(vec2(-o.x,0.)));mx=max(mx,ringMx(vec2(0.,o.y)));mx=max(mx,ringMx(vec2(0.,-o.y)));
mx=max(mx,ringMx(vec2(o.x,o.y)));mx=max(mx,ringMx(vec2(o.x,-o.y)));mx=max(mx,ringMx(vec2(-o.x,o.y)));mx=max(mx,ringMx(vec2(-o.x,-o.y)));
a*=smoothstep(${blackLow.toFixed(3)},${blackHigh.toFixed(3)},mx);
c.g=min(c.g,max(c.r,c.b));gl_FragColor=vec4(c.rgb*a,a);}`;
};
const FRAG = fragSource(CHROMA_LOW, CHROMA_HIGH);

/** Starts drawing the keyed video into the canvas; returns a stop function. Returns null when WebGL is unavailable. */
/** Bounding box (fractions 0..1) of opaque pixels in an RGBA buffer; null when nothing is opaque. */
export function opaqueBounds(data: Uint8ClampedArray, w: number, h: number): { x0: number; x1: number; y0: number; y1: number } | null {
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (chromaAlpha(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255) > 0.5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { x0: x0 / w, x1: (x1 + 1) / w, y0: y0 / h, y1: (y1 + 1) / h };
}

/** Horizontal shift (fraction of width) that centres the person's opaque area. */
export function centeringShift(b: { x0: number; x1: number }): number {
  return 0.5 - (b.x0 + b.x1) / 2;
}

export function startChromaKey(video: HTMLVideoElement, canvas: HTMLCanvasElement, profile?: ChromaKeyProfile): (() => void) | null {
  // Retain the last composited pixels when rendering stops; otherwise WebGL clears its buffer.
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const shader = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, profile ? fragSource(profile.low, profile.high, profile.blackLow, profile.blackHigh, profile.darkFillRadius) : FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  // Dark-core fill variant only: texel size for the ring offsets.
  const texelLoc = gl.getUniformLocation(prog, 'uTexel');
  if (texelLoc) gl.uniform2f(texelLoc, 1 / canvas.width, 1 / canvas.height);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v);

  let stopped = false; let handle = 0; let lastMeasure = 0;
  const probe = document.createElement('canvas'); probe.width = 48; probe.height = 48;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  // Simli may place the face off-centre in its frame; re-centre the keyed person to match the still portrait.
  const recentre = () => {
    if (!pctx) return;
    try {
      pctx.drawImage(video, 0, 0, 48, 48);
      const b = opaqueBounds(pctx.getImageData(0, 0, 48, 48).data, 48, 48);
      if (b) canvas.style.transform = `translateX(${(centeringShift(b) * 100).toFixed(1)}%)`;
    } catch { /* cross-origin frames cannot be sampled; keep original framing */ }
  };
  const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number; cancelVideoFrameCallback?: (h: number) => void };
  const draw = () => {
    if (stopped) return;
    if (video.videoWidth && video.readyState >= 2) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; if (texelLoc) gl.uniform2f(texelLoc, 1 / canvas.width, 1 / canvas.height); }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const now = performance.now();
      void now; void lastMeasure; void recentre;
    }
    handle = v.requestVideoFrameCallback ? v.requestVideoFrameCallback(draw) : requestAnimationFrame(draw);
  };
  draw();
  return () => {
    stopped = true; canvas.style.transform = '';
    if (v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(handle); else cancelAnimationFrame(handle);
  };
}
