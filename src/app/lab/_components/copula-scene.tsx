"use client";

// The render loop writes the simulation straight into three.js buffers every frame, outside React.
/* eslint-disable react-hooks/immutability */

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { frankDensity, Membrane, sampleGrid } from "./copula";

const N = 72;
const SIZE = 4;
const CELL = SIZE / (N - 1);
const THETA = 6;
const HEIGHT_SCALE = 0.22;
const MAX_DROPS = 90;
const DROP_RADIUS = 0.055;
const GRAVITY = 7;
/** How hard a resting drop is pulled downhill along the sheet, and how quickly rolling dies away. */
const ROLL_PULL = 5;
const ROLL_FRICTION = 1.4;
/** How hard a resting drop keeps pressing into the sheet, so it sits in a dent of its own. */
const PRESS = 1.8;
const EDGE = SIZE / 2 - CELL * 2;

const LOW = new THREE.Color("#7E6BFF");
const HIGH = new THREE.Color("#FFB08F");
const HOT = new THREE.Color("#FFFFFF");

const toWorld = (g: number) => g * CELL - SIZE / 2;
const toGrid = (w: number) => (w + SIZE / 2) / CELL;

interface Drop {
  active: boolean;
  x: number;
  z: number;
  y: number;
  vy: number;
  bounces: number;
  life: number;
  squash: number;
  /** 1 for an ordinary drop. A bigger drop is heavier and presses the sheet harder and wider. */
  size: number;
  vx: number;
  vz: number;
  /** Stays on the sheet once it lands, instead of fading after a few bounces. */
  keep: boolean;
  /** Done bouncing: it now rolls along the sheet and rides its ripples. */
  grounded: boolean;
  /** On its way out, to make room for a newer drop. */
  fading: boolean;
  born: number;
}

interface Sim {
  membrane: Membrane;
  drops: Drop[];
  untilBurst: number;
  clock: number;
}

const FRESH: Drop = {
  active: true,
  x: 0,
  z: 0,
  y: 0,
  vy: 0,
  bounces: 0,
  life: 1,
  squash: 0,
  size: 1,
  vx: 0,
  vz: 0,
  keep: false,
  grounded: false,
  fading: false,
  born: 0,
};

const newSim = (): Sim => ({
  membrane: new Membrane(N),
  drops: Array.from({ length: MAX_DROPS }, (): Drop => ({ ...FRESH, active: false, life: 0 })),
  untilBurst: 0.8,
  clock: 0,
});

/** Wakes up to `count` idle drops above the sheet. Most land near the ridge, where the two outcomes agree. */
function spawn(drops: Drop[], count: number) {
  let spawned = 0;
  for (const drop of drops) {
    if (spawned >= count) break;
    if (drop.active) continue;
    const t = Math.random();
    const u = Math.min(0.95, Math.max(0.05, t + (Math.random() - 0.5) * 0.45));
    const v = Math.min(0.95, Math.max(0.05, t + (Math.random() - 0.5) * 0.45));
    Object.assign(drop, {
      ...FRESH,
      x: u * SIZE - SIZE / 2,
      z: v * SIZE - SIZE / 2,
      y: 3 + Math.random() * 1.6,
      vy: -Math.random() * 0.5,
    });
    spawned++;
  }
}

/** Wakes one idle drop at a chosen point, already moving. */
function spawnAt(drops: Drop[], at: Partial<Drop>) {
  const drop = drops.find((d) => !d.active);
  if (drop) Object.assign(drop, { ...FRESH, ...at });
}

/**
 * Pushes overlapping drops that stay on the sheet apart and trades their speed along the line
 * between them, so a new drop knocks the pile about instead of sinking into it.
 */
function collide(drops: Drop[]) {
  const kept = drops.filter((d) => d.active && d.keep);
  for (let a = 0; a < kept.length; a++) {
    for (let b = a + 1; b < kept.length; b++) {
      const p = kept[a];
      const q = kept[b];
      const dx = p.x - q.x;
      const dy = p.grounded && q.grounded ? 0 : p.y - q.y;
      const dz = p.z - q.z;
      const distance = Math.hypot(dx, dy, dz);
      const reach = DROP_RADIUS * (p.size + q.size);
      if (distance >= reach || distance < 1e-6) continue;
      const nx = dx / distance;
      const ny = dy / distance;
      const nz = dz / distance;
      const push = (reach - distance) / 2;
      p.x += nx * push;
      p.z += nz * push;
      q.x -= nx * push;
      q.z -= nz * push;
      if (!p.grounded) p.y += ny * push;
      if (!q.grounded) q.y -= ny * push;
      const closing = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny + (p.vz - q.vz) * nz;
      if (closing >= 0) continue;
      const impulse = (-(1 + 0.35) * closing) / 2;
      p.vx += impulse * nx;
      p.vz += impulse * nz;
      q.vx -= impulse * nx;
      q.vz -= impulse * nz;
      if (!p.grounded) p.vy += impulse * ny;
      if (!q.grounded) q.vy -= impulse * ny;
    }
  }
}

function buildSurface() {
  const base = new Float32Array(N * N);
  const positions = new Float32Array(N * N * 3);
  const colors = new Float32Array(N * N * 3);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const u = 0.01 + (0.98 * i) / (N - 1);
      const v = 0.01 + (0.98 * j) / (N - 1);
      base[k] = HEIGHT_SCALE * Math.min(6, frankDensity(u, v, THETA));
      positions.set([toWorld(i), base[k], toWorld(j)], k * 3);
    }
  }
  const position = new THREE.BufferAttribute(positions, 3);
  position.setUsage(THREE.DynamicDrawUsage);
  const color = new THREE.BufferAttribute(colors, 3);
  color.setUsage(THREE.DynamicDrawUsage);

  const triangles: number[] = [];
  const lines: number[] = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      if (i < N - 1) lines.push(k, k + 1);
      if (j < N - 1) lines.push(k, k + N);
      if (i < N - 1 && j < N - 1) triangles.push(k, k + N, k + 1, k + 1, k + N, k + N + 1);
    }
  }
  const fill = new THREE.BufferGeometry();
  fill.setAttribute("position", position);
  fill.setIndex(triangles);
  const grid = new THREE.BufferGeometry();
  grid.setAttribute("position", position);
  grid.setAttribute("color", color);
  grid.setIndex(lines);
  const maxBase = base.reduce((m, h) => Math.max(m, h), 0);
  return { base, position, color, fill, grid, maxBase };
}

function Copula({ pours, cue, auto, lead }: { pours: number; cue: number; auto: boolean; lead: Lead }) {
  const surface = useMemo(() => buildSurface(), []);
  const sim = useRef<Sim | null>(null);
  const cores = useRef<THREE.InstancedMesh>(null);
  const halos = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const scratch = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    if (pours > 0 && sim.current) spawn(sim.current.drops, 26);
  }, [pours]);

  // A cue drops one heavy drop straight down the middle of the view, where the page's line ends.
  // Drops that stay are capped: past the cap, the oldest one fades to make room.
  useEffect(() => {
    if (cue === 0 || !sim.current) return;
    const { drops } = sim.current;
    const keep = lead.keep > 0;
    if (keep) {
      const kept = drops.filter((d) => d.active && d.keep && !d.fading).sort((a, b) => a.born - b.born);
      if (kept.length >= lead.keep) kept[0].fading = true;
    }
    spawnAt(drops, {
      // A hair off the very middle, which is a saddle: a drop there would balance instead of rolling off.
      x: (Math.random() - 0.5) * 0.12,
      z: (Math.random() - 0.5) * 0.12,
      y: lead.y,
      vy: lead.vy,
      size: lead.size,
      keep,
      born: sim.current.clock,
    });
  }, [cue, lead.y, lead.vy, lead.size, lead.keep]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 30);
    sim.current ??= newSim();
    const { membrane, drops } = sim.current;

    if (auto) sim.current.untilBurst -= dt;
    if (sim.current.untilBurst <= 0) {
      spawn(drops, 8 + Math.floor(Math.random() * 8));
      sim.current.untilBurst = 1.8 + Math.random() * 1.2;
    }

    const substeps = 4;
    for (let s = 0; s < substeps; s++) membrane.step(dt / substeps, CELL);

    sim.current.clock += dt;
    const heightAt = (x: number, z: number) => {
      const gx = toGrid(x);
      const gz = toGrid(z);
      return sampleGrid(surface.base, N, gx, gz) + membrane.sample(gx, gz);
    };

    for (const drop of drops) {
      if (!drop.active) continue;
      const radius = DROP_RADIUS * drop.size;
      drop.squash *= Math.exp(-dt * 10);
      if (drop.fading) drop.life -= dt * 1.2;

      if (!drop.grounded) {
        drop.vy -= GRAVITY * dt;
        drop.y += drop.vy * dt;
        drop.x += drop.vx * dt;
        drop.z += drop.vz * dt;
        const floor = heightAt(drop.x, drop.z);
        if (drop.y - radius < floor && drop.vy < 0) {
          // Weight grows with volume, so a bigger drop dents the sheet much more, over a wider patch.
          membrane.strike(toGrid(drop.x), toGrid(drop.z), Math.abs(drop.vy) * 0.22 * drop.size ** 3, 1.6 * drop.size);
          drop.y = floor + radius;
          drop.vy = -drop.vy * 0.45;
          drop.squash = Math.min(0.6, Math.abs(drop.vy) * 0.25);
          drop.bounces++;
          if (drop.keep && (drop.bounces >= 3 || drop.vy < 0.4)) {
            drop.grounded = true;
            drop.vy = 0;
          }
        }
        if (!drop.keep && drop.bounces >= 3) drop.life -= dt * 1.6;
      } else {
        // Roll downhill along the sheet, slowed by friction, riding whatever ripples pass under it.
        const e = 0.04;
        const slopeX = (heightAt(drop.x + e, drop.z) - heightAt(drop.x - e, drop.z)) / (2 * e);
        const slopeZ = (heightAt(drop.x, drop.z + e) - heightAt(drop.x, drop.z - e)) / (2 * e);
        const friction = Math.exp(-ROLL_FRICTION * dt);
        drop.vx = (drop.vx - ROLL_PULL * slopeX * dt) * friction;
        drop.vz = (drop.vz - ROLL_PULL * slopeZ * dt) * friction;
        drop.x += drop.vx * dt;
        drop.z += drop.vz * dt;
        drop.y = heightAt(drop.x, drop.z) + radius;
        membrane.strike(toGrid(drop.x), toGrid(drop.z), PRESS * drop.size ** 3 * dt, 1.2 * drop.size);
      }

      if (Math.abs(drop.x) > EDGE) {
        drop.x = Math.sign(drop.x) * EDGE;
        drop.vx = 0;
      }
      if (Math.abs(drop.z) > EDGE) {
        drop.z = Math.sign(drop.z) * EDGE;
        drop.vz = 0;
      }
      if (drop.life <= 0) drop.active = false;
    }
    collide(drops);

    // Write the sheet into the shared vertex buffer and color it by height and motion.
    const positions = surface.position.array as Float32Array;
    const colors = surface.color.array as Float32Array;
    for (let k = 0; k < N * N; k++) {
      const w = membrane.height[k];
      positions[k * 3 + 1] = surface.base[k] + w;
      const t = Math.min(1, surface.base[k] / surface.maxBase);
      scratch.copy(LOW).lerp(HIGH, Math.pow(t, 0.6));
      scratch.lerp(HOT, Math.min(0.85, Math.abs(w) * 9 + Math.abs(membrane.velocity[k]) * 0.6));
      const fade = 0.35 + 0.65 * Math.pow(t, 0.4);
      colors.set([scratch.r * fade, scratch.g * fade, scratch.b * fade], k * 3);
    }
    surface.position.needsUpdate = true;
    surface.color.needsUpdate = true;
    surface.fill.computeVertexNormals();

    const coreMesh = cores.current;
    const haloMesh = halos.current;
    if (!coreMesh || !haloMesh) return;
    drops.forEach((drop, index) => {
      const scale = drop.active ? Math.max(0, drop.life) * drop.size : 0;
      dummy.position.set(drop.x, drop.y, drop.z);
      dummy.scale.set(scale * (1 + drop.squash), scale * (1 - drop.squash), scale * (1 + drop.squash));
      dummy.updateMatrix();
      coreMesh.setMatrixAt(index, dummy.matrix);
      dummy.scale.multiplyScalar(1.9);
      dummy.updateMatrix();
      haloMesh.setMatrixAt(index, dummy.matrix);
    });
    coreMesh.instanceMatrix.needsUpdate = true;
    haloMesh.instanceMatrix.needsUpdate = true;
  });

  const box = useMemo(() => {
    const h = surface.maxBase + 0.4;
    const s = SIZE / 2;
    const corners = [
      [-s, 0, -s], [s, 0, -s], [s, 0, s], [-s, 0, s],
      [-s, h, -s], [s, h, -s], [s, h, s], [-s, h, s],
    ];
    const edges = [0, 1, 1, 2, 2, 3, 3, 0, 0, 4, 1, 5, 3, 7];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(edges.flatMap((e) => corners[e])), 3));
    return { geometry, h };
  }, [surface]);

  return (
    <>
      <mesh geometry={surface.fill}>
        <meshStandardMaterial color="#5B4BC9" transparent opacity={0.16} side={THREE.DoubleSide} roughness={0.4} metalness={0.2} depthWrite={false} />
      </mesh>
      <lineSegments geometry={surface.grid}>
        <lineBasicMaterial vertexColors transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={box.geometry}>
        <lineBasicMaterial color="#3A3850" />
      </lineSegments>

      <instancedMesh ref={cores} args={[undefined, undefined, MAX_DROPS]} frustumCulled={false}>
        <sphereGeometry args={[DROP_RADIUS, 20, 14]} />
        <meshBasicMaterial color="#FFE3D4" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={halos} args={[undefined, undefined, MAX_DROPS]} frustumCulled={false}>
        <sphereGeometry args={[DROP_RADIUS, 16, 10]} />
        <meshBasicMaterial color="#FF9E7A" transparent opacity={0.14} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>

    </>
  );
}

interface Lead {
  /** Height the lead drop starts at, in world units. */
  y: number;
  /** Its downward speed when it appears. */
  vy: number;
  /** Its size against an ordinary drop. */
  size: number;
  /** How many of these drops stay on the sheet at once. 0 lets each fade after it bounces. */
  keep: number;
}

export interface CopulaView {
  camera?: [number, number, number];
  /** Wheel zoom. Off where the scene sits inside a scrolling page, so the wheel still scrolls. */
  zoom?: boolean;
  /** Lets the page behind show through, for a scene placed inside a page. */
  transparent?: boolean;
  /** Where across the canvas the middle of the surface sits, 0 to 1. The surface still turns about it. */
  center?: number;
  /** Random bursts of drops. Off when the page cues every drop itself. */
  auto?: boolean;
  lead?: Lead;
}

/** Slides the picture sideways without moving the point the camera turns around. */
function Recenter({ center }: { center: number }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    camera.setViewOffset(size.width, size.height, -(center - 0.5) * size.width, 0, size.width, size.height);
    camera.updateProjectionMatrix();
    return () => {
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
  }, [camera, size.width, size.height, center]);
  return null;
}

const DEFAULT_LEAD: Lead = { y: 3.2, vy: -2, size: 1, keep: 0 };

export function CopulaScene({ pours, cue = 0, view = {} }: { pours: number; cue?: number; view?: CopulaView }) {
  const { camera = [4.6, 3.4, 4.8], zoom = true, transparent = false, center = 0.5, auto = true, lead = DEFAULT_LEAD } = view;
  return (
    <Canvas dpr={[1, 2]} camera={{ position: camera, fov: 34 }} gl={{ antialias: true, alpha: transparent }}>
      {!transparent && <color attach="background" args={["#0A0B14"]} />}
      <fog attach="fog" args={["#0A0B14", 7, 16]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 5, 2]} intensity={1.2} color="#FFD9C4" />
      <pointLight position={[-3, 2, -2]} intensity={6} color="#8C7CFF" />
      {center !== 0.5 && <Recenter center={center} />}
      <Copula pours={pours} cue={cue} auto={auto} lead={lead} />
      <OrbitControls
        target={[0, 0.5, 0]}
        enablePan={false}
        enableZoom={zoom}
        minDistance={4}
        maxDistance={12}
        autoRotate
        autoRotateSpeed={0.35}
        enableDamping
      />
    </Canvas>
  );
}

export function CopulaLab() {
  const [pours, setPours] = useState(0);
  return (
    <div className="fixed inset-0 z-40 bg-[#0A0B14] text-[#F1EEF8]">
      <CopulaScene pours={pours} />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-4 p-6">
        <div>
          <p className="font-mono text-[12px] tracking-[0.16em] text-[#A29FB8]">CUSHION LAB · COPULA</p>
          <h1 className="mt-2 font-serif text-[44px] italic leading-none">Things fall. The surface gives.</h1>
          <p className="mt-2 max-w-md text-[15px] text-[#CFCBE0]">
            A Frank copula, θ = 6: the joint chance c(u, v) of two outcomes u and v. Each drop dents it, and the ripples travel and settle. Drag to turn it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPours((p) => p + 1)}
          className="pointer-events-auto min-h-11 rounded-full bg-gradient-to-br from-[#FFC9A8] to-[#FF9E7A] px-5 text-[14px] font-semibold text-[#1A0E0A]"
        >
          Pour more
        </button>
      </div>
    </div>
  );
}
