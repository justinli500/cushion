import * as THREE from "three";

/**
 * A throw pillow built from two faces that meet at a seam. Each face is a grid over u, v in [-1, 1]:
 * the fill pushes the middle up and leaves the edges flat, and pulls the middle of each edge inward
 * so the corners stand out as points, the way a real pillow does.
 */
export interface PillowShape {
  /** Half the width, in world units. */
  size: number;
  /** Height of the top face at its middle. */
  height: number;
  /** How far the middle of each edge is pulled in, 0 to 1. */
  pinch: number;
  /** Grid cells along each side. */
  segments: number;
}

export const PILLOW: PillowShape = { size: 1, height: 0.4, pinch: 0.12, segments: 120 };

/** The bottom face is flatter: the pillow is resting on it. */
const BOTTOM_RATIO = 0.55;

export function planPosition(shape: PillowShape, u: number, v: number): [number, number] {
  const x = u * shape.size * (1 - shape.pinch * (1 - v * v));
  const z = v * shape.size * (1 - shape.pinch * (1 - u * u));
  return [x, z];
}

/** 1 in the middle, 0 at the seam. */
export function fill(u: number, v: number): number {
  // A stuffed pillow is nearly flat across the top and falls away steeply near the seam.
  const a = Math.max(0, 1 - u ** 4);
  const b = Math.max(0, 1 - v ** 4);
  return Math.pow(a * b, 0.55);
}

/** Small folds that radiate in from each corner, where the fabric bunches. */
function folds(u: number, v: number): number {
  let total = 0;
  for (const cu of [-1, 1]) {
    for (const cv of [-1, 1]) {
      const du = u - cu;
      const dv = v - cv;
      const d = Math.hypot(du, dv);
      const angle = Math.atan2(dv, du);
      total += Math.exp(-d * 3.4) * Math.sin(angle * 16 + cu * 1.3 + cv * 0.7);
    }
  }
  // A few long, soft creases across the face.
  total += 0.18 * Math.sin(u * 5.1 + v * 2.3) * Math.sin(v * 4.2 - u * 1.7);
  return total;
}

export interface PillowFaces {
  top: THREE.BufferGeometry;
  bottom: THREE.BufferGeometry;
  /** Top-face heights before any dent, one per vertex. */
  topBase: Float32Array;
  /** The fill value of each top vertex, used to keep dents off the seam. */
  topFill: Float32Array;
  seam: THREE.CatmullRomCurve3;
}

export function buildPillow(shape: PillowShape = PILLOW): PillowFaces {
  const n = shape.segments;
  const count = (n + 1) * (n + 1);
  const make = (sign: 1 | -1) => {
    const positions = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const base = new Float32Array(count);
    const fills = new Float32Array(count);
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const k = j * (n + 1) + i;
        const u = (i / n) * 2 - 1;
        const v = (j / n) * 2 - 1;
        const [x, z] = planPosition(shape, u, v);
        const f = fill(u, v);
        // Puckers along the seam, where the fabric is gathered into the piping.
        const pucker = Math.pow(1 - f, 3) * Math.min(1, f * 10) * (Math.sin(v * 36) * u ** 8 + Math.sin(u * 36) * v ** 8);
        const crease = folds(u, v) * 0.04 * (1 - 0.6 * f) * Math.min(1, f * 6) + pucker * 0.03;
        const y = sign === 1 ? shape.height * f + crease : -shape.height * BOTTOM_RATIO * f - crease * 0.5;
        positions.set([x, y, z], k * 3);
        uvs.set([i / n, j / n], k * 2);
        base[k] = y;
        fills[k] = f;
      }
    }
    const index: number[] = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i;
        const b = a + 1;
        const c = a + (n + 1);
        const d = c + 1;
        if (sign === 1) index.push(a, c, b, b, c, d);
        else index.push(a, b, c, b, d, c);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return { geometry, base, fills };
  };

  const top = make(1);
  const bottom = make(-1);

  const points: THREE.Vector3[] = [];
  const steps = 240;
  for (let s = 0; s < steps; s++) {
    const t = (s / steps) * 4;
    const side = Math.floor(t);
    const p = t - side;
    const along = p * 2 - 1;
    const [u, v] = side === 0 ? [along, -1] : side === 1 ? [1, along] : side === 2 ? [-along, 1] : [-1, -along];
    const [x, z] = planPosition(shape, u, v);
    points.push(new THREE.Vector3(x, 0, z));
  }

  return {
    top: top.geometry,
    bottom: bottom.geometry,
    topBase: top.base,
    topFill: top.fills,
    seam: new THREE.CatmullRomCurve3(points, true, "centripetal"),
  };
}

/** How far the bottom face reaches below the seam, so the pillow can sit on the floor. */
export const restingLift = (shape: PillowShape = PILLOW) => shape.height * BOTTOM_RATIO;

/** A fine, random weave, used as a bump map so the velvet has a nap under the light. */
export function napTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const image = context.createImageData(size, size);
    for (let p = 0; p < size * size; p++) {
      const x = p % size;
      const y = Math.floor(p / size);
      const grain = Math.random() * 60;
      const weave = 20 * Math.sin(x * 0.9) * Math.sin(y * 0.9);
      const value = 128 + grain - 30 + weave;
      image.data.set([value, value, value, 255], p * 4);
    }
    context.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  return texture;
}
