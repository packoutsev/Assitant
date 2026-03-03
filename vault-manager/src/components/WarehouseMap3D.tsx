import { useState, useCallback, useMemo, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Text, Environment } from '@react-three/drei';
import { Eye, RotateCcw, Maximize, MonitorUp, ArrowDown, Warehouse as WarehouseIcon } from 'lucide-react';
import * as THREE from 'three';
import { useWarehouse } from '../contexts/WarehouseContext';
import Vault3D from './Vault3D';
import CameraControlsComponent from './CameraControls';
import { createBrickTexture, createBrickNormalMap, createConcreteTexture } from './ProceduralTextures';
import type { Vault } from '../types';

// ─── Scale: 1 unit = 1 foot ──────────────────────────
const GAP = 1.5;

const WAREHOUSE_LENGTH = 180;  // ~180ft east-west
const WAREHOUSE_WIDTH = 65;    // ~65ft north-south
const WALL_HEIGHT = 18;        // brick walls 18ft

// Door dimensions
const ROLLUP_W = 16;           // rollup door width (back/north wall)
const ROLLUP_H = 14;           // rollup door height
const DOOR_W = 3.5;            // each double-door panel width (south wall to office)
const DOOR_H = 8;              // double door height

const BACK_WALL_Z = -WAREHOUSE_WIDTH / 2 + 6;
const CENTER_NORTH_Z = -8;
const CENTER_SOUTH_Z = 6;
const FLOOR_ROW_Z_BASE = 18;

// ─── Historic Warehouse Structure ────────────────────
function WarehouseStructure() {
  const brickTex = useMemo(() => createBrickTexture(), []);
  const brickNorm = useMemo(() => createBrickNormalMap(), []);
  const concreteTex = useMemo(() => createConcreteTexture(), []);

  const brickMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      map: brickTex,
      normalMap: brickNorm,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.9,
      metalness: 0.0,
    });
    return mat;
  }, [brickTex, brickNorm]);

  return (
    <group>
      {/* ── Concrete Floor ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[WAREHOUSE_LENGTH + 10, WAREHOUSE_WIDTH + 10]} />
        <meshStandardMaterial
          map={concreteTex}
          roughness={0.92}
          metalness={0.02}
          color="#888888"
        />
      </mesh>

      {/* ── Brick Walls ── */}
      {/* EW = east/west short walls (WAREHOUSE_WIDTH wide, along Z axis) */}
      {/* NS = north/south long walls (WAREHOUSE_LENGTH wide, along X axis) */}

      {/* North long wall (solid brick) */}
      <mesh position={[0, WALL_HEIGHT / 2, -WAREHOUSE_WIDTH / 2]} receiveShadow>
        <boxGeometry args={[WAREHOUSE_LENGTH + 2, WALL_HEIGHT, 1.5]} />
        <primitive object={(() => {
          const m = brickMat.clone();
          m.map = brickTex.clone();
          m.map.repeat.set(WAREHOUSE_LENGTH / 20, WALL_HEIGHT / 20);
          m.map.needsUpdate = true;
          return m;
        })()} attach="material" />
      </mesh>

      {/* South long wall (solid brick) */}
      <mesh position={[0, WALL_HEIGHT / 2, WAREHOUSE_WIDTH / 2]} receiveShadow>
        <boxGeometry args={[WAREHOUSE_LENGTH + 2, WALL_HEIGHT, 1.5]} />
        <primitive object={(() => {
          const m = brickMat.clone();
          m.map = brickTex.clone();
          m.map.repeat.set(WAREHOUSE_LENGTH / 20, WALL_HEIGHT / 20);
          m.map.needsUpdate = true;
          return m;
        })()} attach="material" />
      </mesh>

      {/* ── East short wall — OFFICE DOUBLE DOORS centered ── */}
      {/* Brick south of doors */}
      <mesh position={[WAREHOUSE_LENGTH / 2, WALL_HEIGHT / 2, -(WAREHOUSE_WIDTH / 4 + DOOR_W / 2)]} receiveShadow>
        <boxGeometry args={[1.5, WALL_HEIGHT, (WAREHOUSE_WIDTH - DOOR_W * 2) / 2]} />
        <primitive object={(() => {
          const m = brickMat.clone();
          m.map = brickTex.clone();
          m.map.repeat.set((WAREHOUSE_WIDTH - DOOR_W * 2) / 2 / 20, WALL_HEIGHT / 20);
          m.map.needsUpdate = true;
          return m;
        })()} attach="material" />
      </mesh>
      {/* Brick north of doors */}
      <mesh position={[WAREHOUSE_LENGTH / 2, WALL_HEIGHT / 2, (WAREHOUSE_WIDTH / 4 + DOOR_W / 2)]} receiveShadow>
        <boxGeometry args={[1.5, WALL_HEIGHT, (WAREHOUSE_WIDTH - DOOR_W * 2) / 2]} />
        <primitive object={(() => {
          const m = brickMat.clone();
          m.map = brickTex.clone();
          m.map.repeat.set((WAREHOUSE_WIDTH - DOOR_W * 2) / 2 / 20, WALL_HEIGHT / 20);
          m.map.needsUpdate = true;
          return m;
        })()} attach="material" />
      </mesh>
      {/* Header above doors */}
      <mesh position={[WAREHOUSE_LENGTH / 2, WALL_HEIGHT - (WALL_HEIGHT - DOOR_H) / 4, 0]} receiveShadow>
        <boxGeometry args={[1.5, (WALL_HEIGHT - DOOR_H) / 2, DOOR_W * 2 + 2]} />
        <primitive object={(() => {
          const m = brickMat.clone();
          m.map = brickTex.clone();
          m.map.repeat.set(DOOR_W * 2 / 20, 0.3);
          m.map.needsUpdate = true;
          return m;
        })()} attach="material" />
      </mesh>
      {/* Left door panel */}
      <mesh position={[WAREHOUSE_LENGTH / 2 - 0.3, DOOR_H / 2, -DOOR_W / 2]}>
        <boxGeometry args={[0.4, DOOR_H, DOOR_W - 0.3]} />
        <meshStandardMaterial color="#5c3d1e" roughness={0.8} />
      </mesh>
      {/* Right door panel */}
      <mesh position={[WAREHOUSE_LENGTH / 2 - 0.3, DOOR_H / 2, DOOR_W / 2]}>
        <boxGeometry args={[0.4, DOOR_H, DOOR_W - 0.3]} />
        <meshStandardMaterial color="#5c3d1e" roughness={0.8} />
      </mesh>
      {/* Door center seam */}
      <mesh position={[WAREHOUSE_LENGTH / 2 - 0.05, DOOR_H / 2, 0]}>
        <boxGeometry args={[0.15, DOOR_H, 0.2]} />
        <meshStandardMaterial color="#3a2510" roughness={0.7} />
      </mesh>
      {/* Door frame */}
      <mesh position={[WAREHOUSE_LENGTH / 2 - 0.2, DOOR_H / 2, -DOOR_W - 0.2]}>
        <boxGeometry args={[0.5, DOOR_H + 0.5, 0.4]} />
        <meshStandardMaterial color="#3a2510" roughness={0.7} />
      </mesh>
      <mesh position={[WAREHOUSE_LENGTH / 2 - 0.2, DOOR_H / 2, DOOR_W + 0.2]}>
        <boxGeometry args={[0.5, DOOR_H + 0.5, 0.4]} />
        <meshStandardMaterial color="#3a2510" roughness={0.7} />
      </mesh>
      <mesh position={[WAREHOUSE_LENGTH / 2 - 0.2, DOOR_H + 0.25, 0]}>
        <boxGeometry args={[0.5, 0.5, DOOR_W * 2 + 1]} />
        <meshStandardMaterial color="#3a2510" roughness={0.7} />
      </mesh>
      {/* Door handles */}
      <mesh position={[WAREHOUSE_LENGTH / 2 - 0.6, DOOR_H * 0.45, -0.6]}>
        <boxGeometry args={[0.12, 0.8, 0.12]} />
        <meshStandardMaterial color="#8a7a60" roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[WAREHOUSE_LENGTH / 2 - 0.6, DOOR_H * 0.45, 0.6]}>
        <boxGeometry args={[0.12, 0.8, 0.12]} />
        <meshStandardMaterial color="#8a7a60" roughness={0.3} metalness={0.7} />
      </mesh>
      <Text position={[WAREHOUSE_LENGTH / 2 - 1, DOOR_H + 1.5, 0]} rotation={[0, -Math.PI / 2, 0]} fontSize={1.0} color="#94a3b8" anchorX="center">
        OFFICE
      </Text>

      {/* ── West short wall — ROLLUP DOOR centered ── */}
      {/* Brick left of rollup */}
      <mesh position={[-WAREHOUSE_LENGTH / 2, WALL_HEIGHT / 2, -(WAREHOUSE_WIDTH / 4 + ROLLUP_W / 4)]} receiveShadow>
        <boxGeometry args={[1.5, WALL_HEIGHT, (WAREHOUSE_WIDTH - ROLLUP_W) / 2]} />
        <primitive object={(() => {
          const m = brickMat.clone();
          m.map = brickTex.clone();
          m.map.repeat.set((WAREHOUSE_WIDTH - ROLLUP_W) / 2 / 20, WALL_HEIGHT / 20);
          m.map.needsUpdate = true;
          return m;
        })()} attach="material" />
      </mesh>
      {/* Brick right of rollup */}
      <mesh position={[-WAREHOUSE_LENGTH / 2, WALL_HEIGHT / 2, (WAREHOUSE_WIDTH / 4 + ROLLUP_W / 4)]} receiveShadow>
        <boxGeometry args={[1.5, WALL_HEIGHT, (WAREHOUSE_WIDTH - ROLLUP_W) / 2]} />
        <primitive object={(() => {
          const m = brickMat.clone();
          m.map = brickTex.clone();
          m.map.repeat.set((WAREHOUSE_WIDTH - ROLLUP_W) / 2 / 20, WALL_HEIGHT / 20);
          m.map.needsUpdate = true;
          return m;
        })()} attach="material" />
      </mesh>
      {/* Header above rollup */}
      <mesh position={[-WAREHOUSE_LENGTH / 2, WALL_HEIGHT - (WALL_HEIGHT - ROLLUP_H) / 4, 0]} receiveShadow>
        <boxGeometry args={[1.5, (WALL_HEIGHT - ROLLUP_H) / 2, ROLLUP_W + 2]} />
        <primitive object={(() => {
          const m = brickMat.clone();
          m.map = brickTex.clone();
          m.map.repeat.set(ROLLUP_W / 20, 0.3);
          m.map.needsUpdate = true;
          return m;
        })()} attach="material" />
      </mesh>
      {/* Rollup door — corrugated metal */}
      <mesh position={[-WAREHOUSE_LENGTH / 2 + 0.4, ROLLUP_H / 2, 0]}>
        <boxGeometry args={[0.3, ROLLUP_H, ROLLUP_W]} />
        <meshStandardMaterial color="#5a5a5a" roughness={0.6} metalness={0.5} />
      </mesh>
      {/* Rollup door horizontal ribs */}
      {Array.from({ length: Math.floor(ROLLUP_H / 1.2) }).map((_, i) => (
        <mesh key={`rib-${i}`} position={[-WAREHOUSE_LENGTH / 2 + 0.6, 0.6 + i * 1.2, 0]}>
          <boxGeometry args={[0.15, 0.15, ROLLUP_W - 0.5]} />
          <meshStandardMaterial color="#6e6e6e" roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
      {/* Rollup door frame */}
      <mesh position={[-WAREHOUSE_LENGTH / 2 + 0.5, ROLLUP_H / 2, -ROLLUP_W / 2 - 0.3]}>
        <boxGeometry args={[0.5, ROLLUP_H + 0.5, 0.5]} />
        <meshStandardMaterial color="#3a3a3a" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[-WAREHOUSE_LENGTH / 2 + 0.5, ROLLUP_H / 2, ROLLUP_W / 2 + 0.3]}>
        <boxGeometry args={[0.5, ROLLUP_H + 0.5, 0.5]} />
        <meshStandardMaterial color="#3a3a3a" roughness={0.5} metalness={0.4} />
      </mesh>
      <Text position={[-WAREHOUSE_LENGTH / 2 + 1, ROLLUP_H + 2, 0]} rotation={[0, Math.PI / 2, 0]} fontSize={1.2} color="#9ca3af" anchorX="center">
        ROLLUP DOOR
      </Text>

      {/* ── Warehouse pendant lights ── */}
      {Array.from({ length: 6 }).map((_, i) => {
        const x = -WAREHOUSE_LENGTH / 2 + 25 + i * 28;
        return (
          <group key={`light-${i}`}>
            {/* Light fixture */}
            <mesh position={[x, WALL_HEIGHT - 2, 0]}>
              <cylinderGeometry args={[0.3, 0.8, 0.6, 8]} />
              <meshStandardMaterial color="#2a2a2a" roughness={0.5} metalness={0.6} />
            </mesh>
            {/* Point light */}
            <pointLight
              position={[x, WALL_HEIGHT - 2.5, 0]}
              intensity={15}
              distance={45}
              color="#ffcb8e"
              decay={2}
            />
          </group>
        );
      })}

      {/* ── Zone labels on the floor ── */}
      <Text position={[0, 0.06, BACK_WALL_Z + 1.5]} rotation={[-Math.PI / 2, 0, 0]} fontSize={1.5} color="#5a5040" anchorX="center" fontWeight="bold">
        BACK WALL
      </Text>
      <Text position={[0, 0.06, (CENTER_NORTH_Z + CENTER_SOUTH_Z) / 2]} rotation={[-Math.PI / 2, 0, 0]} fontSize={1} color="#4a4035" anchorX="center">
        CENTER AISLE
      </Text>

      {/* Aisle safety stripes (yellow paint) */}
      {[-0.5, 0.5].map((off) => (
        <mesh key={`stripe-${off}`} position={[0, 0.03, (CENTER_NORTH_Z + CENTER_SOUTH_Z) / 2 + off * 2.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[WAREHOUSE_LENGTH * 0.7, 0.15]} />
          <meshBasicMaterial color="#d4a017" transparent opacity={0.35} />
        </mesh>
      ))}

      <Text position={[-50, 0.06, FLOOR_ROW_Z_BASE + 2]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.9} color="#4a4035" anchorX="center">
        SUPPLIES
      </Text>
      <Text position={[0, 0.06, FLOOR_ROW_Z_BASE + 6]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.9} color="#4a4035" anchorX="center">
        FLOOR CENTER
      </Text>
      <Text position={[50, 0.06, FLOOR_ROW_Z_BASE + 2]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.9} color="#4a4035" anchorX="center">
        RIGHT WALL
      </Text>
    </group>
  );
}

// ─── Layout calculator ───────────────────────────────
interface VaultPlacement {
  vault: Vault;
  position: [number, number, number];
  size: [number, number, number];
}

// Known row positions for backward compat with original seed data
const KNOWN_ROW_POSITIONS: Record<string, { startX?: number; z: number; vaultSize?: [number, number, number] }> = {
  'back-wall-row-1':    { z: BACK_WALL_Z },
  'center-north':       { z: CENTER_NORTH_Z },
  'center-south':       { z: CENTER_SOUTH_Z },
  'floor-left-row1':    { startX: -60, z: FLOOR_ROW_Z_BASE },
  'floor-left-row2':    { startX: -60, z: FLOOR_ROW_Z_BASE + 7 },
  'floor-center-row1':  { startX: -10, z: FLOOR_ROW_Z_BASE },
  'floor-center-row2':  { startX: -18, z: FLOOR_ROW_Z_BASE + 7 },
  'floor-center-pallet': { startX: -8, z: FLOOR_ROW_Z_BASE + 15, vaultSize: [14, 2, 8] },
  'floor-right-row1':   { startX: 40, z: FLOOR_ROW_Z_BASE },
  'floor-right-row2':   { startX: 40, z: FLOOR_ROW_Z_BASE + 7 },
};

// Dynamic Z base for each layout hint (new zones get placed here)
const HINT_Z_BASE: Record<string, number> = {
  'back-wall': BACK_WALL_Z,
  'center': (CENTER_NORTH_Z + CENTER_SOUTH_Z) / 2,
  'floor': FLOOR_ROW_Z_BASE,
};

import type { Zone as ZoneType } from '../types';
import { ROW_TYPE_CONFIG } from '../types';

function computeLayout(zones: ZoneType[]): VaultPlacement[] {
  const placements: VaultPlacement[] = [];
  let dynamicFloorZ = FLOOR_ROW_Z_BASE + 22; // start past known floor rows

  for (const zone of zones) {
    // Check if this zone has any known row positions
    const hasKnownRows = zone.rows.some(r => KNOWN_ROW_POSITIONS[r.id]);
    let zoneZ = dynamicFloorZ;

    if (!hasKnownRows) {
      // Dynamic zone — place based on layoutHint or append to floor
      const hint = zone.layoutHint || 'floor';
      if (hint === 'floor') {
        zoneZ = dynamicFloorZ;
      } else {
        zoneZ = HINT_Z_BASE[hint] ?? dynamicFloorZ;
      }
    }

    for (let ri = 0; ri < zone.rows.length; ri++) {
      const row = zone.rows[ri];
      const count = row.vaults.length;
      if (count === 0) continue;

      const rowType = row.rowType || 'vault';
      const typeConfig = ROW_TYPE_CONFIG[rowType];
      const step = typeConfig.w + GAP;
      const totalWidth = count * step - GAP;
      const defaultSize: [number, number, number] = [typeConfig.w, typeConfig.h, typeConfig.d];

      const known = KNOWN_ROW_POSITIONS[row.id];
      let startX: number;
      let z: number;
      let vaultSize: [number, number, number] = defaultSize;

      if (known) {
        startX = known.startX ?? -totalWidth / 2;
        z = known.z;
        if (known.vaultSize) vaultSize = known.vaultSize;
      } else {
        // Dynamic row
        startX = -totalWidth / 2;
        z = hasKnownRows ? FLOOR_ROW_Z_BASE + 22 + ri * 9 : zoneZ + ri * 9;
      }

      row.vaults.forEach((vault, i) => {
        const isPalletRow = row.id === 'floor-center-pallet';
        const x = isPalletRow ? startX : startX + i * step;
        placements.push({
          vault,
          position: [x, 0, z],
          size: vault.status === 'pallet' && !isPalletRow ? [typeConfig.w, 2, typeConfig.d] : vaultSize,
        });
      });
    }

    if (!hasKnownRows) {
      dynamicFloorZ += zone.rows.length * 9 + 5;
    }
  }

  return placements;
}

// ─── View preset buttons ─────────────────────────────
const VIEW_BUTTONS = [
  { id: 'overview', label: 'Top', icon: Maximize, tooltip: 'Overhead view' },
  { id: 'isometric', label: 'Iso', icon: Eye, tooltip: 'Isometric angle' },
  { id: 'front', label: 'Front', icon: MonitorUp, tooltip: 'Front view' },
  { id: 'backWall', label: 'Back', icon: ArrowDown, tooltip: 'Back wall close-up' },
  { id: 'floorSouth', label: 'Floor', icon: WarehouseIcon, tooltip: 'Floor zone' },
];

// ─── Main component ──────────────────────────────────
export default function WarehouseMap3D() {
  const {
    zones,
    searchQuery,
    highlightedCustomer,
    selectedVaultId,
    resolveCustomerName,
    dispatch,
  } = useWarehouse();

  const [cameraPreset, setCameraPreset] = useState('overview');
  const [presetKey, setPresetKey] = useState(0);

  const placements = useMemo(() => computeLayout(zones), [zones]);

  const isVaultHighlighted = useCallback((vault: Vault): boolean => {
    const q = searchQuery.toLowerCase().trim();
    const hasCustomerHighlight = highlightedCustomer !== null;
    if (!q && !hasCustomerHighlight) return false;

    if (q) {
      if (vault.vaultNum.toLowerCase().includes(q)) return true;
      if (vault.customer.toLowerCase().includes(q)) return true;
      const resolved = resolveCustomerName(vault.customer);
      if (resolved.toLowerCase().includes(q)) return true;
    }

    if (hasCustomerHighlight && vault.customer) {
      const resolved = resolveCustomerName(vault.customer);
      if (resolved === highlightedCustomer) return true;
    }

    return false;
  }, [searchQuery, highlightedCustomer, resolveCustomerName]);

  const hasAnyFilter = searchQuery.trim() !== '' || highlightedCustomer !== null;

  const handlePreset = (id: string) => {
    setCameraPreset(id);
    setPresetKey(k => k + 1);
  };

  return (
    <div className="w-full h-full relative" style={{ minHeight: 'calc(100vh - 140px)' }}>
      {/* View controls */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 bg-gray-900/80 backdrop-blur border border-gray-700 rounded-lg p-1.5 shadow-xl">
        {VIEW_BUTTONS.map((btn) => (
          <button
            key={btn.id}
            onClick={() => handlePreset(btn.id)}
            title={btn.tooltip}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors
              ${cameraPreset === btn.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
          >
            <btn.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{btn.label}</span>
          </button>
        ))}
        <div className="border-t border-gray-700 my-0.5" />
        <button
          onClick={() => handlePreset('overview')}
          title="Reset view"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-gray-500 hover:bg-gray-800 hover:text-gray-200"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>

      {/* Nav hint */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 text-[10px] text-gray-500 bg-black/50 px-3 py-1 rounded-full pointer-events-none">
        Left-drag rotate &middot; Right-drag pan &middot; Scroll zoom &middot; Click vault to inspect
      </div>

      <Canvas
        camera={{ position: [0, 80, 55], fov: 50 }}
        shadows
        style={{ background: '#0a0812' }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.9 }}
        onPointerMissed={() => dispatch({ type: 'SELECT_VAULT', vaultId: null })}
      >
        <Suspense fallback={null}>
          {/* Ambient: warm low fill */}
          <ambientLight intensity={0.15} color="#ffeedd" />

          {/* Main directional — simulates high windows */}
          <directionalLight
            position={[30, 40, -20]}
            intensity={0.4}
            color="#ffe8cc"
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-far={150}
            shadow-camera-left={-100}
            shadow-camera-right={100}
            shadow-camera-top={50}
            shadow-camera-bottom={-50}
          />

          {/* Subtle fill from the other side */}
          <directionalLight position={[-40, 30, 30]} intensity={0.15} color="#c4d4e0" />

          {/* Warm fog — dusty warehouse atmosphere */}
          <fog attach="fog" args={['#1a1008', 60, 180]} />

          <Environment preset="warehouse" backgroundIntensity={0} />

          <WarehouseStructure />

          {placements.map(({ vault, position, size }) => (
            <Vault3D
              key={vault.id}
              vault={vault}
              position={position}
              size={size}
              isHighlighted={isVaultHighlighted(vault)}
              isDimmed={hasAnyFilter && !isVaultHighlighted(vault)}
              isSelected={vault.id === selectedVaultId}
              onClick={() => dispatch({ type: 'SELECT_VAULT', vaultId: vault.id })}
            />
          ))}

          <CameraControlsComponent
            key={presetKey}
            preset={cameraPreset}
            onPresetApplied={() => {}}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
