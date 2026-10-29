import { dots, GLYPH_H, width } from "./dotfont";

const VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 aCell;
layout(location = 2) in vec4 aMap;

uniform vec2 uGrid;
uniform vec2 uRes;
uniform float uCell;
uniform float uTime;
uniform float uReveal;
uniform float uLoader;
uniform sampler2D uDigits;
uniform vec4 uHeads[48];
uniform vec4 uRings[8];
uniform vec2 uPointer;
uniform float uLens;
uniform vec2 uStations[16];
uniform float uStationCount;
uniform float uDim;
uniform vec4 uClear[8];

out vec3 vColour;
out float vAlpha;

const vec3 WHITE = vec3(1.0);
const vec3 PINK = vec3(1.0, 0.243, 0.647);
const vec3 YELLOW = vec3(1.0, 0.898, 0.231);
const vec3 BLUE = vec3(0.106, 0.208, 1.0);

float bayer(vec2 p) {
  // 4 x 4 ordered dither threshold
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int index = x + y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[index]) + 0.5) / 16.0;
}

void main() {
  float land = aMap.x;
  float polar = aMap.y;
  float seed = aMap.z;
  vec2 centre = uGrid * 0.5;
  float dist = distance(aCell, centre);
  float far = length(uGrid) * 0.5;

  // The reveal wave.
  float front = uReveal * (far + 6.0);
  float revealed = smoothstep(front + 0.5, front - 0.5, dist);
  float ring = exp(-pow((dist - front) / 1.6, 2.0)) * step(0.001, uReveal) * step(uReveal, 0.999);

  // The map.
  float size = 0.0;
  vec3 colour = WHITE;
  float alpha = 1.0;
  if (land > 0.02) {
    size = 0.22 + 0.58 * land;
    alpha = 0.6 + 0.4 * land;
  } else if (polar > 0.02) {
    size = 0.2 + 0.6 * polar * step(bayer(aCell) * 0.9, polar);
    colour = PINK;
  } else {
    float depth = aCell.y / uGrid.y;
    size = step(bayer(aCell + 1.0), 0.07 + depth * 0.12) * 0.24;
    alpha = 0.5;
  }
  // Stations: a pulsing block of squares.
  for (int i = 0; i < 16; i++) {
    if (float(i) >= uStationCount) break;
    float d = distance(aCell, uStations[i]);
    if (d < 1.6) {
      float pulse = 0.5 + 0.5 * sin(uTime * 3.0 + float(i));
      size = 1.0;
      colour = mix(WHITE, YELLOW, pulse * step(0.9, d));
      alpha = 1.0;
    }
  }
  // Twinkle, now and then.
  alpha *= 0.85 + 0.15 * step(0.5, fract(seed * 13.0 + uTime * 0.3 * (0.5 + seed)));

  // Room for the type: squares behind each line of text step aside.
  float clear = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 r = uClear[i];
    if (r.z <= 0.0) continue;
    vec2 d = max(r.xy - aCell, aCell - (r.xy + r.zw));
    clear = max(clear, smoothstep(1.2, -0.8, max(d.x, d.y)));
  }
  size *= revealed * (1.0 - clear);
  alpha *= mix(1.0, 0.5, uDim);

  // Packets: lit squares with trails.
  float lit = 0.0;
  vec3 litColour = PINK;
  for (int i = 0; i < 48; i++) {
    vec4 h = uHeads[i];
    if (h.z <= 0.0) continue;
    float d = distance(aCell, h.xy);
    float glow = h.z * smoothstep(1.5, 0.4, d);
    if (glow > lit) {
      lit = glow;
      litColour = h.w < 0.5 ? PINK : h.w < 1.5 ? YELLOW : WHITE;
    }
  }
  // Landing rings.
  for (int i = 0; i < 8; i++) {
    vec4 r = uRings[i];
    if (r.w <= 0.0) continue;
    float d = abs(distance(aCell, r.xy) - r.z);
    float glow = r.w * smoothstep(1.1, 0.2, d);
    if (glow > lit) {
      lit = glow;
      litColour = YELLOW;
    }
  }
  // The reveal's wavefront.
  if (ring > lit) {
    lit = ring;
    litColour = YELLOW;
  }
  lit *= 1.0 - clear * 0.85;
  size = mix(size, 1.0, lit);
  colour = mix(colour, litColour, lit);
  alpha = mix(alpha, 1.0, lit);

  // The loader's counter, until the wave passes.
  float digit = texture(uDigits, (aCell + 0.5) / uGrid).r * uLoader * (1.0 - revealed);
  size = mix(size, 0.92, digit);
  colour = mix(colour, WHITE, digit);
  alpha = mix(alpha, 1.0, digit);
  // Behind the counter, a faint grid of dots.
  float idle = uLoader * (1.0 - revealed) * (1.0 - digit) * 0.12;
  size = max(size, idle);

  // The lens.
  float lens = uLens * smoothstep(9.0, 0.0, distance(aCell, uPointer));
  size = min(1.0, size * (1.0 + lens * 0.9) + lens * 0.12 * revealed);
  colour = mix(colour, mix(WHITE, PINK, smoothstep(0.6, 1.0, lens)), lens * 0.5 * step(0.01, size));

  vColour = colour;
  vAlpha = alpha * step(0.01, size);

  vec2 px = (aCell + 0.5 + aCorner * 0.5 * size) * uCell;
  vec2 clip = px / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec3 vColour;
in float vAlpha;
out vec4 fragColor;
void main() {
  fragColor = vec4(vColour * vAlpha + vec3(0.106, 0.208, 1.0) * (1.0 - vAlpha), 1.0);
}
`;

export type Station = { id: string; name: string; x: number; y: number };

type Packet = {
  from: [number, number];
  to: [number, number];
  t: number;
  duration: number;
  colour: number;
  lift: number;
  onArrive?: () => void;
};

type Ring = { x: number; y: number; age: number; life: number };

const TRAIL = [0, 0.035, 0.07, 0.11, 0.16, 0.22];

export class Board {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private program: WebGLProgram;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private cellBuffer: WebGLBuffer;
  private mapBuffer: WebGLBuffer;
  private digits: WebGLTexture;
  private map: HTMLImageElement;
  private elapsed = 0;
  private cornerBuffer: WebGLBuffer;
  private packets: Packet[] = [];
  private rings: Ring[] = [];
  private heads = new Float32Array(48 * 4);
  private ringData = new Float32Array(8 * 4);
  private pointer = { x: -99, y: -99, lens: 0, target: 0 };
  private stationCells: [number, number][] = [];
  private clearRects = new Float32Array(8 * 4);
  cols = 1;
  rows = 1;
  cell = 11;
  /** 0 to 1: how far the reveal wave has spread. */
  reveal = 0;
  /** 1 while the loader's counter is showing. */
  loader = 1;
  /** 0 to 1: dims the map, as the hero scrolls away. */
  dim = 0;
  /** Where the map sits: which part of the image is centred. */
  focus = { x: 0.5, y: 0.52 };
  stations: Station[] = [];

  static supported() {
    try {
      return !!document.createElement("canvas").getContext("webgl2");
    } catch {
      return false;
    }
  }

  constructor(canvas: HTMLCanvasElement, map: HTMLImageElement, stations: Station[]) {
    this.canvas = canvas;
    this.map = map;
    this.stations = stations;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) throw new Error("WebGL 2 unavailable");
    this.gl = gl;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "shader");
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "link");
    gl.useProgram(program);
    this.program = program;

    // A unit square, as two triangles.
    const corner = gl.createBuffer()!;
    this.cornerBuffer = corner;
    gl.bindBuffer(gl.ARRAY_BUFFER, corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.cellBuffer = gl.createBuffer()!;
    this.mapBuffer = gl.createBuffer()!;
    this.digits = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.digits);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.clearColor(0.106, 0.208, 1.0, 1);
    this.resize();
  }

  private u(name: string) {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name)!;
  }

  /** The map image's placement: a cover fit centred on `focus`. */
  private placement() {
    const { cols, rows } = this;
    const scale = Math.max(cols / this.map.naturalWidth, rows / this.map.naturalHeight);
    const w = this.map.naturalWidth * scale;
    const h = this.map.naturalHeight * scale;
    const x = Math.min(0, Math.max(cols - w, cols / 2 - this.focus.x * w));
    const y = Math.min(0, Math.max(rows - h, rows / 2 - this.focus.y * h));
    return { x, y, w, h };
  }

  /** A point on the map image (0 to 1) in grid cells. */
  toCell(u: number, v: number): [number, number] {
    const p = this.placement();
    return [p.x + u * p.w, p.y + v * p.h];
  }

  /** A point on the map image (0 to 1) in CSS pixels on the canvas. */
  toScreen(u: number, v: number) {
    const [x, y] = this.toCell(u, v);
    return { x: (x + 0.5) * this.cell, y: (y + 0.5) * this.cell };
  }

  resize() {
    const gl = this.gl;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width <= 0 || height <= 0) return;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.cell = width < 700 ? 8 : Math.max(9, Math.round(Math.min(width, 1800) / 130));
    this.cols = Math.ceil(width / this.cell);
    this.rows = Math.ceil(height / this.cell);

    // Read the map into the land mask, at one sample per cell.
    const sample = document.createElement("canvas");
    sample.width = this.cols;
    sample.height = this.rows;
    const ctx = sample.getContext("2d", { willReadFrequently: true })!;
    const p = this.placement();
    ctx.drawImage(this.map, p.x, p.y, p.w, p.h);
    const pixels = ctx.getImageData(0, 0, this.cols, this.rows).data;

    const count = this.cols * this.rows;
    const cells = new Float32Array(count * 2);
    const map = new Float32Array(count * 4);
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const i = row * this.cols + col;
        const r = pixels[i * 4];
        const g = pixels[i * 4 + 1];
        const b = pixels[i * 4 + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        // Continents are deep blue to black; the sea is cyan, yellow and red.
        // Continents run from cyan-blue at the coast to deep blue and black
        // inland (blue above green); the sea is green-cyan, yellow and red.
        const isLand = (b > g + 6 && r < 90 && b > 60) || lum < 55;
        const land = isLand ? Math.min(1, Math.max(0.12, 1 - g / 190)) : 0;
        const polar = !isLand && r > 170 && g < 130 && b < 150 ? Math.min(1, (r - g) / 160) : 0;
        cells[i * 2] = col;
        cells[i * 2 + 1] = row;
        map[i * 4] = land;
        map[i * 4 + 1] = polar;
        map[i * 4 + 2] = Math.random();
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cellBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, cells, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.mapBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, map, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    this.stationCells = this.stations.map((s) => this.toCell(s.x, s.y));
    this.setDigits(this.lastDigits);
  }

  private lastDigits = "000";

  /** Shows text on the board in the dot-matrix face, centred. */
  setDigits(text: string) {
    this.lastDigits = text;
    const gl = this.gl;
    const { cols, rows } = this;
    const scale = Math.max(2, Math.floor(Math.min(cols / (width(text) + 4), (rows * 0.46) / GLYPH_H)));
    const data = new Uint8Array(cols * rows);
    const ox = Math.floor((cols - width(text) * scale) / 2);
    const oy = Math.floor((rows - GLYPH_H * scale) / 2);
    for (const [dx, dy] of dots(text)) {
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          // A one-square gap inside each dot keeps the dot-matrix look.
          if (scale >= 3 && (x === scale - 1 || y === scale - 1)) continue;
          const cx = ox + dx * scale + x;
          const cy = oy + dy * scale + y;
          if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) data[cy * cols + cx] = 255;
        }
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, this.digits);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, cols, rows, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  }

  /** Rectangles (CSS pixels on the canvas) the map keeps clear, so type reads over it. */
  setClear(rects: { x: number; y: number; width: number; height: number }[]) {
    this.clearRects.fill(0);
    rects.slice(0, 8).forEach((r, i) => {
      this.clearRects.set([r.x / this.cell - 0.5, r.y / this.cell - 0.5, r.width / this.cell, r.height / this.cell], i * 4);
    });
  }

  /** Whether a point (CSS pixels) falls inside a cleared rectangle. */
  isCleared(x: number, y: number) {
    const cx = x / this.cell - 0.5;
    const cy = y / this.cell - 0.5;
    for (let i = 0; i < 8; i++) {
      const [rx, ry, rw, rh] = this.clearRects.subarray(i * 4, i * 4 + 4);
      if (rw > 0 && cx > rx - 2 && cy > ry - 2 && cx < rx + rw + 2 && cy < ry + rh + 2) return true;
    }
    return false;
  }

  /** Pointer in CSS pixels on the canvas, or null when it leaves. */
  setPointer(x: number | null, y = 0) {
    if (x === null) {
      this.pointer.target = 0;
      return;
    }
    this.pointer.x = x / this.cell - 0.5;
    this.pointer.y = y / this.cell - 0.5;
    this.pointer.target = 1;
  }

  /** Sends a packet from one station to another; resolves when it lands. */
  send(from: string, to: string, options: { duration?: number; colour?: number } = {}) {
    const a = this.stations.findIndex((s) => s.id === from);
    const b = this.stations.findIndex((s) => s.id === to);
    if (a < 0 || b < 0 || a === b) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const [ax, ay] = this.stationCells[a];
      const [bx, by] = this.stationCells[b];
      const distance = Math.hypot(bx - ax, by - ay);
      this.packets.push({
        from: [ax, ay],
        to: [bx, by],
        t: 0,
        duration: options.duration ?? 0.9 + distance / 70,
        colour: options.colour ?? 0,
        lift: Math.min(this.rows * 0.35, distance * 0.35),
        onArrive: resolve,
      });
      if (this.packets.length > 8) this.packets.shift();
    });
  }

  private position(p: Packet, t: number): [number, number] {
    const s = Math.min(1, Math.max(0, t));
    const mx = (p.from[0] + p.to[0]) / 2;
    const my = (p.from[1] + p.to[1]) / 2 - p.lift;
    const x = (1 - s) * (1 - s) * p.from[0] + 2 * (1 - s) * s * mx + s * s * p.to[0];
    const y = (1 - s) * (1 - s) * p.from[1] + 2 * (1 - s) * s * my + s * s * p.to[1];
    return [x, y];
  }

  render(dt: number) {
    const gl = this.gl;
    this.elapsed += dt;
    const time = this.elapsed;

    // Advance the packets and their landings.
    this.heads.fill(0);
    let slot = 0;
    for (const p of [...this.packets]) {
      p.t += dt / p.duration;
      const eased = p.t < 1 ? 1 - Math.pow(1 - p.t, 1.6) : 1;
      for (const lag of TRAIL) {
        const t = eased - lag;
        if (t < 0 || slot >= 48) continue;
        const [x, y] = this.position(p, t);
        this.heads.set([x, y, 1 - lag / 0.26, p.colour], slot * 4);
        slot++;
      }
      if (p.t >= 1) {
        this.packets.splice(this.packets.indexOf(p), 1);
        this.rings.push({ x: p.to[0], y: p.to[1], age: 0, life: 0.9 });
        if (this.rings.length > 8) this.rings.shift();
        p.onArrive?.();
      }
    }
    this.ringData.fill(0);
    this.rings.forEach((ring, i) => {
      ring.age += dt;
      const k = ring.age / ring.life;
      this.ringData.set([ring.x, ring.y, 1 + k * 7, Math.max(0, 1 - k)], i * 4);
    });
    this.rings = this.rings.filter((ring) => ring.age < ring.life);

    this.pointer.lens += (this.pointer.target - this.pointer.lens) * 0.12;

    gl.useProgram(this.program);
    gl.uniform2f(this.u("uGrid"), this.cols, this.rows);
    gl.uniform2f(this.u("uRes"), this.canvas.clientWidth, this.canvas.clientHeight);
    gl.uniform1f(this.u("uCell"), this.cell);
    gl.uniform1f(this.u("uTime"), time);
    gl.uniform1f(this.u("uReveal"), this.reveal);
    gl.uniform1f(this.u("uLoader"), this.loader);
    gl.uniform1f(this.u("uDim"), this.dim);
    gl.uniform4fv(this.u("uHeads"), this.heads);
    gl.uniform4fv(this.u("uRings"), this.ringData);
    gl.uniform4fv(this.u("uClear"), this.clearRects);
    gl.uniform2f(this.u("uPointer"), this.pointer.x, this.pointer.y);
    gl.uniform1f(this.u("uLens"), this.pointer.lens);
    const stations = new Float32Array(32);
    this.stationCells.slice(0, 16).forEach(([x, y], i) => stations.set([x, y], i * 2));
    gl.uniform2fv(this.u("uStations"), stations);
    gl.uniform1f(this.u("uStationCount"), this.reveal >= 0.99 ? this.stationCells.length : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.digits);
    gl.uniform1i(this.u("uDigits"), 0);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.cols * this.rows);
  }

  dispose() {
    const gl = this.gl;
    gl.getAttachedShaders(this.program)?.forEach(shader => gl.deleteShader(shader));
    gl.deleteProgram(this.program);
    gl.deleteBuffer(this.cornerBuffer);
    gl.deleteBuffer(this.cellBuffer);
    gl.deleteBuffer(this.mapBuffer);
    gl.deleteTexture(this.digits);
  }
}
