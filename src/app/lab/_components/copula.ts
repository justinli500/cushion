/**
 * The Frank copula density: how likely two outcomes are to land together at (u, v), each a
 * probability in (0, 1). With theta > 0 the outcomes move together, which shows as a ridge along
 * the diagonal of the unit square.
 */
export function frankDensity(u: number, v: number, theta: number): number {
  const a = 1 - Math.exp(-theta);
  const top = theta * a * Math.exp(-theta * (u + v));
  const bottom = a - (1 - Math.exp(-theta * u)) * (1 - Math.exp(-theta * v));
  return top / (bottom * bottom);
}

/** Reads a square grid of values at a fractional position, blending the four nearest cells. */
export function sampleGrid(values: Float32Array, n: number, gx: number, gy: number): number {
  const x = Math.min(n - 1.001, Math.max(0, gx));
  const y = Math.min(n - 1.001, Math.max(0, gy));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const k = y0 * n + x0;
  const top = values[k] * (1 - fx) + values[k + 1] * fx;
  const bottom = values[k + n] * (1 - fx) + values[k + n + 1] * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * A stretched sheet pinned at its edges, stored as a square grid of heights and velocities. Drops
 * push it down where they land and the push travels out as ripples that slowly die away.
 */
export class Membrane {
  readonly n: number;
  readonly height: Float32Array;
  readonly velocity: Float32Array;
  private readonly next: Float32Array;

  constructor(
    n: number,
    private readonly speed = 1.6,
    private readonly damping = 1.4,
  ) {
    this.n = n;
    this.height = new Float32Array(n * n);
    this.velocity = new Float32Array(n * n);
    this.next = new Float32Array(n * n);
  }

  /** Pushes the sheet at grid position (gx, gy) with a soft, round footprint. */
  strike(gx: number, gy: number, strength: number, radius: number) {
    const { n } = this;
    const reach = Math.ceil(radius * 2.5);
    for (let y = Math.max(1, Math.floor(gy) - reach); y <= Math.min(n - 2, Math.ceil(gy) + reach); y++) {
      for (let x = Math.max(1, Math.floor(gx) - reach); x <= Math.min(n - 2, Math.ceil(gx) + reach); x++) {
        const d2 = (x - gx) ** 2 + (y - gy) ** 2;
        this.velocity[y * n + x] -= strength * Math.exp(-d2 / (2 * radius * radius));
      }
    }
  }

  /** Advances the sheet by `dt` seconds. `cell` is the grid spacing in world units. */
  step(dt: number, cell: number) {
    const { n, height, velocity, next } = this;
    const c2 = (this.speed * this.speed) / (cell * cell);
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        const k = y * n + x;
        const laplacian = height[k - 1] + height[k + 1] + height[k - n] + height[k + n] - 4 * height[k];
        next[k] = velocity[k] + dt * (c2 * laplacian - this.damping * velocity[k]);
      }
    }
    for (let k = 0; k < n * n; k++) {
      velocity[k] = next[k];
      height[k] += dt * velocity[k];
    }
  }

  /** The sheet's height at a fractional grid position. */
  sample(gx: number, gy: number): number {
    return sampleGrid(this.height, this.n, gx, gy);
  }
}
