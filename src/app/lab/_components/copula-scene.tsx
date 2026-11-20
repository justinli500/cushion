"use client";

// The render loop writes the simulation straight into three.js buffers every frame, outside React.
/* eslint-disable react-hooks/immutability */

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { frankDensity, Membrane } from "./copula";

const N = 72;
const SIZE = 4;
const CELL = SIZE / (N - 1);
const THETA = 6;
const HEIGHT_SCALE = 0.22;
const MAX_DROPS = 90;
const DROP_RADIUS = 0.055;
const GRAVITY = 7;

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
}

interface Sim {
  membrane: Membrane;
  drops: Drop[];
  untilBurst: number;
}

const newSim = (): Sim => ({
  membrane: new Membrane(N),
  drops: Array.from({ length: MAX_DROPS }, () => ({ active: false, x: 0, z: 0, y: 0, vy: 0, bounces: 0, life: 0, squash: 0 })),
  untilBurst: 0.8,
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
      active: true,
      x: u * SIZE - SIZE / 2,
      z: v * SIZE - SIZE / 2,
      y: 3 + Math.random() * 1.6,
      vy: -Math.random() * 0.5,
      bounces: 0,
      life: 1,
      squash: 0,
    });
    spawned++;
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

function Copula({ pours }: { pours: number }) {
  const surface = useMemo(() => buildSurface(), []);
  const sim = useRef<Sim | null>(null);
  const cores = useRef<THREE.InstancedMesh>(null);
  const halos = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const scratch = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    if (pours > 0 && sim.current) spawn(sim.current.drops, 26);
  }, [pours]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 30);
    sim.current ??= newSim();
    const { membrane, drops } = sim.current;

    sim.current.untilBurst -= dt;
    if (sim.current.untilBurst <= 0) {
      spawn(drops, 8 + Math.floor(Math.random() * 8));
      sim.current.untilBurst = 1.8 + Math.random() * 1.2;
    }

    const substeps = 4;
    for (let s = 0; s < substeps; s++) membrane.step(dt / substeps, CELL);

    for (const drop of drops) {
      if (!drop.active) continue;
      drop.vy -= GRAVITY * dt;
      drop.y += drop.vy * dt;
      drop.squash *= Math.exp(-dt * 10);
      const gx = toGrid(drop.x);
      const gz = toGrid(drop.z);
      const i = Math.min(N - 1, Math.max(0, Math.round(gx)));
      const j = Math.min(N - 1, Math.max(0, Math.round(gz)));
      const floor = surface.base[j * N + i] + membrane.sample(gx, gz);
      if (drop.y - DROP_RADIUS < floor && drop.vy < 0) {
        membrane.strike(gx, gz, Math.abs(drop.vy) * 0.22, 1.6);
        drop.y = floor + DROP_RADIUS;
        drop.vy = -drop.vy * 0.45;
        drop.squash = Math.min(0.6, Math.abs(drop.vy) * 0.25);
        drop.bounces++;
      }
      if (drop.bounces >= 3) drop.life -= dt * 1.6;
      if (drop.life <= 0) drop.active = false;
    }

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
      const scale = drop.active ? Math.max(0, drop.life) : 0;
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

export interface CopulaView {
  camera?: [number, number, number];
  /** Wheel zoom. Off where the scene sits inside a scrolling page, so the wheel still scrolls. */
  zoom?: boolean;
  /** Lets the page behind show through, for a scene placed inside a page. */
  transparent?: boolean;
}

export function CopulaScene({ pours, view = {} }: { pours: number; view?: CopulaView }) {
  const { camera = [4.6, 3.4, 4.8], zoom = true, transparent = false } = view;
  return (
    <Canvas dpr={[1, 2]} camera={{ position: camera, fov: 34 }} gl={{ antialias: true, alpha: transparent }}>
      {!transparent && <color attach="background" args={["#0A0B14"]} />}
      <fog attach="fog" args={["#0A0B14", 7, 14]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 5, 2]} intensity={1.2} color="#FFD9C4" />
      <pointLight position={[-3, 2, -2]} intensity={6} color="#8C7CFF" />
      <Copula pours={pours} />
      <OrbitControls
        target={[0, 0.5, 0]}
        enablePan={false}
        enableZoom={zoom}
        minDistance={4}
        maxDistance={11}
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
