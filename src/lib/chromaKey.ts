/**
 * Cuts Simli's flat key-green backdrop out of the live face video so the person floats
 * over the page exactly like the transparent static portrait. WebGL keeps it cheap on phones.
 */

/** Key-green distance thresholds in normalised CbCr space; shared by the shader and the JS reference. */
export const CHROMA_LOW = 0.12;
export const CHROMA_HIGH = 0.22;
const KEY_CB = -0.331264 * 0 + -0.168736 * 0 + 0.5 * 0; // placeholder overwritten below for clarity
void KEY_CB;

function cbcr(r: number, g: number, b: number): [number, number] {
  return [-0.168736 * r - 0.331264 * g + 0.5 * b, 0.5 * r - 0.418688 * g - 0.081312 * b];
}
const [KCB, KCR] = cbcr(0, 1, 0);

const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Alpha (0 transparent … 1 opaque) for one pixel with channels in 0..1. */
export function chromaAlpha(r: number, g: number, b: number): number {
  const [cb, cr] = cbcr(r, g, b);
  return smooth(CHROMA_LOW, CHROMA_HIGH, Math.hypot(cb - KCB, cr - KCR));
}

/** Removes green spill from hair and shoulder edges. */
export function despill(r: number, g: number, b: number): number {
  return Math.min(g, Math.max(r, b));
}

const VERT = `attribute vec2 p;varying vec2 uv;void main(){uv=vec2((p.x+1.)/2.,(1.-p.y)/2.);gl_Position=vec4(p,0.,1.);}`;
const FRAG = `precision mediump float;varying vec2 uv;uniform sampler2D t;
vec2 cc(vec3 c){return vec2(-0.168736*c.r-0.331264*c.g+0.5*c.b,0.5*c.r-0.418688*c.g-0.081312*c.b);}
void main(){vec4 c=texture2D(t,uv);float d=distance(cc(c.rgb),cc(vec3(0.,1.,0.)));float a=smoothstep(${CHROMA_LOW.toFixed(3)},${CHROMA_HIGH.toFixed(3)},d);
c.g=min(c.g,max(c.r,c.b));gl_FragColor=vec4(c.rgb*a,a);}`;

/** Starts drawing the keyed video into the canvas; returns a stop function. Returns null when WebGL is unavailable. */
export function startChromaKey(video: HTMLVideoElement, canvas: HTMLCanvasElement): (() => void) | null {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  const shader = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v);

  let stopped = false; let handle = 0;
  const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number; cancelVideoFrameCallback?: (h: number) => void };
  const draw = () => {
    if (stopped) return;
    if (video.videoWidth && video.readyState >= 2) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    handle = v.requestVideoFrameCallback ? v.requestVideoFrameCallback(draw) : requestAnimationFrame(draw);
  };
  draw();
  return () => {
    stopped = true;
    if (v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(handle); else cancelAnimationFrame(handle);
  };
}
