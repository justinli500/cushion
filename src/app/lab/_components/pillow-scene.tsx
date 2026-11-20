"use client";

import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { buildPillow, napTexture, PILLOW, planPosition, restingLift } from "./pillow-geometry";

export const FABRICS = {
  lavender: { label: "Lavender", color: "#B7A4E6", sheen: "#EDE6FF" },
  clay: { label: "Clay", color: "#C98A6C", sheen: "#F8D6C4" },
  sage: { label: "Sage", color: "#8FAA92", sheen: "#DDEDDD" },
  charcoal: { label: "Charcoal", color: "#3A3946", sheen: "#9C9AB4" },
} as const;
export type Fabric = keyof typeof FABRICS;

const COIN_RADIUS = 0.2;
const COIN_HALF = 0.016;
const DROP_HEIGHT = 2.6;
const GRAVITY = 6.5;
const STIFFNESS = 38;
const DAMPING = 3.2;

/** A tiny seeded random, so the tassels look the same on every render. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

type Phase = "waiting" | "falling" | "lifting";

interface Sim {
  phase: Phase;
  timer: number;
  restTime: number;
  x: number;
  z: number;
  y: number;
  vy: number;
  touched: boolean;
  dent: number;
  squash: number;
  squashV: number;
  spin: number;
  opacity: number;
}

const newSim = (): Sim => ({
  phase: "waiting",
  timer: 0.6,
  restTime: 0,
  x: 0,
  z: 0,
  y: DROP_HEIGHT,
  vy: 0,
  touched: false,
  dent: 0,
  squash: 0,
  squashV: 0,
  spin: 0,
  opacity: 0,
});

function Tassel({ corner, color, simRef }: { corner: [number, number]; color: string; simRef: RefObject<Sim> }) {
  const group = useRef<THREE.Group>(null);
  const [x, z] = planPosition(PILLOW, corner[0], corner[1]);
  const outward = useMemo(() => new THREE.Vector3(corner[0], 0, corner[1]).normalize(), [corner]);
  const strands = useMemo(() => {
    const random = seeded(Math.round((corner[0] + 2) * 7 + (corner[1] + 2) * 13));
    const count = 140;
    const geometry = new THREE.CylinderGeometry(0.0052, 0.004, 1, 5, 1);
    geometry.translate(0, -0.5, 0);
    const matrices: THREE.Matrix4[] = [];
    const down = new THREE.Vector3(0, -1, 0);
    for (let s = 0; s < count; s++) {
      const angle = random() * Math.PI * 2;
      const r = random() * 0.026;
      const start = new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      const direction = outward
        .clone()
        .multiplyScalar(0.62)
        .add(new THREE.Vector3(0, -0.78, 0))
        .add(new THREE.Vector3((random() - 0.5) * 0.35, (random() - 0.5) * 0.1, (random() - 0.5) * 0.35))
        .normalize();
      const length = 0.24 + random() * 0.07;
      const quaternion = new THREE.Quaternion().setFromUnitVectors(down, direction);
      matrices.push(new THREE.Matrix4().compose(start, quaternion, new THREE.Vector3(1, length, 1)));
    }
    return { geometry, matrices, count };
  }, [corner, outward]);

  const instanced = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = instanced.current;
    if (!mesh) return;
    strands.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
  }, [strands]);

  useFrame(() => {
    if (!group.current) return;
    const wobble = simRef.current.squashV * 0.05;
    group.current.rotation.set(-wobble * outward.z, 0, wobble * outward.x);
  });

  const knot: [number, number, number] = [x + outward.x * 0.03, 0, z + outward.z * 0.03];
  return (
    <group position={knot}>
      <group ref={group}>
        <mesh castShadow>
          <sphereGeometry args={[0.042, 24, 16]} />
          <meshPhysicalMaterial color={color} roughness={0.9} sheen={1} sheenRoughness={0.5} sheenColor={color} />
        </mesh>
        <mesh castShadow position={[outward.x * 0.02, -0.03, outward.z * 0.02]}>
          <cylinderGeometry args={[0.032, 0.036, 0.045, 20]} />
          <meshPhysicalMaterial color={color} roughness={0.75} />
        </mesh>
        <instancedMesh
          ref={instanced}
          args={[strands.geometry, undefined, strands.count]}
          position={[outward.x * 0.03, -0.06, outward.z * 0.03]}
          castShadow
        >
          <meshPhysicalMaterial color={color} roughness={0.95} sheen={1} sheenRoughness={0.6} sheenColor={color} />
        </instancedMesh>
      </group>
    </group>
  );
}

function PillowAndCoin({ fabric, drops }: { fabric: Fabric; drops: number }) {
  const pillow = useMemo(() => buildPillow(), []);
  const nap = useMemo(() => napTexture(), []);
  const simRef = useRef<Sim>(newSim());
  const topRef = useRef<THREE.Mesh>(null);
  const coinRef = useRef<THREE.Group>(null);
  const coinMaterial = useRef<THREE.MeshPhysicalMaterial>(null);
  const restore = useRef(false);
  const lift = restingLift();
  const tone = FABRICS[fabric];

  useEffect(() => {
    if (drops === 0) return;
    simRef.current.phase = "waiting";
    simRef.current.timer = 0.15;
  }, [drops]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 30);
    const sim = simRef.current;

    // The coin.
    if (sim.phase === "waiting") {
      sim.timer -= dt;
      sim.opacity = 0;
      if (sim.timer <= 0) {
        sim.phase = "falling";
        sim.x = (Math.random() - 0.5) * 0.4;
        sim.z = (Math.random() - 0.5) * 0.3;
        sim.y = DROP_HEIGHT;
        sim.vy = 0;
        sim.touched = false;
        sim.restTime = 0;
        sim.spin = (Math.random() - 0.5) * 1.2;
      }
    } else if (sim.phase === "falling") {
      sim.opacity = Math.min(1, sim.opacity + dt * 6);
      const surface = (PILLOW.height + lift) * 1 - sim.squash * PILLOW.height;
      const penetration = surface - (sim.y - COIN_HALF);
      let force = -GRAVITY;
      if (penetration > 0) {
        if (!sim.touched) {
          sim.touched = true;
          sim.squashV += -sim.vy * 0.35;
        }
        force += Math.max(0, STIFFNESS * penetration - DAMPING * sim.vy);
      }
      sim.vy += force * dt;
      sim.y += sim.vy * dt;
      sim.spin *= Math.exp(-dt * (sim.touched ? 8 : 0.5));
      const depth = Math.max(0, penetration);
      sim.dent = depth > sim.dent ? depth : sim.dent + (depth - sim.dent) * (1 - Math.exp(-dt / 0.25));
      if (sim.touched && Math.abs(sim.vy) < 0.05) sim.restTime += dt;
      if (sim.restTime > 2.6) sim.phase = "lifting";
    } else {
      sim.vy = 2.2;
      sim.y += sim.vy * dt;
      sim.opacity = Math.max(0, sim.opacity - dt * 2.5);
      // Memory foam: the dent eases back slowly once the weight is gone.
      sim.dent += (0 - sim.dent) * (1 - Math.exp(-dt / 0.9));
      if (sim.y > DROP_HEIGHT) {
        sim.phase = "waiting";
        sim.timer = 1.4;
      }
    }

    // The whole pillow squashes and springs back.
    sim.squashV += (-90 * sim.squash - 7 * sim.squashV) * dt;
    sim.squash += sim.squashV * dt;

    const coin = coinRef.current;
    if (coin) {
      coin.position.set(sim.x, sim.y, sim.z);
      coin.rotation.set(sim.spin * 0.6, 0, sim.spin);
      coin.visible = sim.opacity > 0.01;
    }
    if (coinMaterial.current) coinMaterial.current.opacity = sim.opacity;

    // Press the dent and the squash into the top face.
    const mesh = topRef.current;
    const active = sim.dent > 0.0005 || Math.abs(sim.squash) > 0.0005;
    if (!mesh || (!active && !restore.current)) return;
    restore.current = active;
    const position = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = position.array as Float32Array;
    const sigma = 0.16 + sim.dent * 0.6;
    const twoSigma2 = 2 * sigma * sigma;
    for (let k = 0; k < pillow.topBase.length; k++) {
      const px = array[k * 3];
      const pz = array[k * 3 + 2];
      const r2 = (px - sim.x) * (px - sim.x) + (pz - sim.z) * (pz - sim.z);
      const f = pillow.topFill[k];
      const r = Math.sqrt(r2);
      const ring = Math.exp(-((r - 1.7 * sigma) ** 2) / (0.5 * sigma * sigma));
      const press = sim.dent * (Math.exp(-r2 / twoSigma2) - 0.12 * ring) * Math.min(1, f * 3);
      array[k * 3 + 1] = pillow.topBase[k] * (1 - sim.squash * f) - press;
    }
    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  });

  const tasselColor = new THREE.Color(tone.color).offsetHSL(0, -0.04, 0.03).getStyle();

  return (
    <>
      <group position={[0, lift, 0]}>
        <mesh ref={topRef} geometry={pillow.top} castShadow receiveShadow>
          <meshPhysicalMaterial
            color={tone.color}
            roughness={0.82}
            sheen={1}
            sheenRoughness={0.32}
            sheenColor={tone.sheen}
            bumpMap={nap}
            bumpScale={0.6}
          />
        </mesh>
        <mesh geometry={pillow.bottom} castShadow receiveShadow>
          <meshPhysicalMaterial color={tone.color} roughness={0.85} sheen={1} sheenRoughness={0.35} sheenColor={tone.sheen} />
        </mesh>
        <mesh castShadow>
          <tubeGeometry args={[pillow.seam, 480, 0.017, 12, true]} />
          <meshPhysicalMaterial color={tone.color} roughness={0.6} sheen={0.6} sheenColor={tone.sheen} />
        </mesh>
        {([[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]).map((corner) => (
          <Tassel key={corner.join()} corner={corner} color={tasselColor} simRef={simRef} />
        ))}
      </group>

      <group ref={coinRef}>
        <mesh castShadow>
          <cylinderGeometry args={[COIN_RADIUS, COIN_RADIUS, COIN_HALF * 2, 72]} />
          <meshPhysicalMaterial ref={coinMaterial} color="#E8B64C" metalness={0.9} roughness={0.28} clearcoat={0.4} transparent />
        </mesh>
        <mesh position={[0, COIN_HALF + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[COIN_RADIUS * 0.78, 0.008, 12, 72]} />
          <meshPhysicalMaterial color="#F6D27A" metalness={1} roughness={0.3} />
        </mesh>
      </group>
    </>
  );
}

export function PillowScene({ fabric, drops }: { fabric: Fabric; drops: number }) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [2.9, 3.3, 3.6], fov: 30 }} gl={{ antialias: true }}>
      <color attach="background" args={["#E9E5DF"]} />
      <directionalLight
        position={[-2.5, 4.5, 2]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <ambientLight intensity={0.15} />
      <PillowAndCoin fabric={fabric} drops={drops} />
      <ContactShadows position={[0, 0.001, 0]} opacity={0.55} scale={6} blur={2.6} far={1.2} resolution={1024} color="#2B2333" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#E9E5DF" roughness={1} />
      </mesh>
      <Environment resolution={256} background={false}>
        <color attach="background" args={["#8A857E"]} />
        <Lightformer form="rect" intensity={2.2} position={[0, 4, 0]} rotation-x={Math.PI / 2} scale={[6, 6, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[-4, 2, 1]} rotation-y={Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[4, 1.5, -1]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} color="#FFE6D6" />
        <Lightformer form="ring" intensity={1.2} position={[1, 3, 4]} scale={2} color="#F3EEFF" />
      </Environment>
      <OrbitControls
        target={[0, 0.15, 0]}
        enablePan={false}
        minDistance={3.4}
        maxDistance={6}
        minPolarAngle={0.35}
        maxPolarAngle={1.35}
        enableDamping
      />
    </Canvas>
  );
}

export function PillowLab() {
  const [fabric, setFabric] = useState<Fabric>("lavender");
  const [drops, setDrops] = useState(0);
  return (
    <div className="fixed inset-0 z-40 bg-[#E9E5DF] text-[#221C2E]">
      <PillowScene fabric={fabric} drops={drops} />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-4 p-6">
        <div>
          <p className="text-[12px] font-semibold tracking-[0.16em] text-[#5A5266]">CUSHION LAB · PILLOW</p>
          <h1 className="mt-2 text-[40px] font-extrabold leading-none tracking-tight">Something lands. It gives.</h1>
          <p className="mt-2 text-[15px] text-[#5A5266]">Drag to look around.</p>
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          {(Object.keys(FABRICS) as Fabric[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFabric(key)}
              aria-pressed={fabric === key}
              className="flex min-h-11 items-center gap-2 rounded-full bg-white/70 px-4 text-[14px] font-semibold shadow-sm backdrop-blur aria-pressed:bg-[#221C2E] aria-pressed:text-white"
            >
              <span className="size-4 rounded-full" style={{ background: FABRICS[key].color }} aria-hidden />
              {FABRICS[key].label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDrops((d) => d + 1)}
            className="min-h-11 rounded-full bg-[#221C2E] px-5 text-[14px] font-semibold text-white"
          >
            Drop again
          </button>
        </div>
      </div>
    </div>
  );
}
