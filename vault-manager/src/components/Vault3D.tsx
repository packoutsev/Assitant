import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Vault } from '../types';
import { FLAG_CONFIG } from '../types';
import { createWoodTexture } from './ProceduralTextures';

// Status accent colors — just for the label band, not the whole vault
const STATUS_ACCENTS = {
  occupied: '#3b82f6',   // blue
  empty:    '#22c55e',   // green
  pallet:   '#f59e0b',   // amber
  mold:     '#ef4444',   // red
};

interface Vault3DProps {
  vault: Vault;
  position: [number, number, number];
  size?: [number, number, number];
  isHighlighted: boolean;
  isDimmed: boolean;
  isSelected: boolean;
  onClick: () => void;
}

export default function Vault3D({
  vault,
  position,
  size = [7, 7, 5],
  isHighlighted,
  isDimmed,
  isSelected,
  onClick,
}: Vault3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  // Animate hover lift
  useFrame(() => {
    if (!groupRef.current) return;
    const targetY = position[1] + (hovered || isSelected ? 0.3 : 0);
    groupRef.current.position.y += (targetY - groupRef.current.position.y) * 0.12;
  });

  const opacity = isDimmed ? 0.12 : 1;
  const [w, h, d] = size;
  const isPallet = vault.status === 'pallet';

  // Wood textures — each vault gets a slightly different look
  const woodMaterials = useMemo(() => {
    const hueChoice = isPallet ? 'light' : (Math.random() > 0.5 ? 'warm' : 'dark');
    const sideTex = createWoodTexture(256, 256, hueChoice);
    sideTex.repeat.set(w / 5, h / 5);
    const frontTex = createWoodTexture(256, 256, hueChoice);
    frontTex.repeat.set(d / 5, h / 5);
    const topTex = createWoodTexture(256, 256, 'light');
    topTex.repeat.set(w / 5, d / 5);

    const makeMat = (map: THREE.CanvasTexture) => new THREE.MeshStandardMaterial({
      map,
      transparent: isDimmed,
      opacity,
      roughness: 0.85,
      metalness: 0.0,
    });

    // Box faces: +x, -x, +y, -y, +z, -z
    return [
      makeMat(frontTex),  // right
      makeMat(frontTex),  // left
      makeMat(topTex),    // top
      makeMat(topTex),    // bottom
      makeMat(sideTex),   // front
      makeMat(sideTex),   // back
    ];
  }, [w, h, d, isPallet, isDimmed, opacity]);

  // Edge/frame lumber strips
  const frameMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#3d2815',
    transparent: isDimmed,
    opacity,
    roughness: 0.9,
  }), [isDimmed, opacity]);

  // Highlight/selection glow
  const glowColor = isHighlighted ? '#facc15' : isSelected ? '#3b82f6' : null;

  const accentColor = STATUS_ACCENTS[vault.status];

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerEnter={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerLeave={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
    >
      {/* Main vault body — wooden box */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow material={woodMaterials}>
        <boxGeometry args={[w, h, d]} />
      </mesh>

      {/* Frame edges — 2x4 lumber along corners */}
      {!isPallet && (
        <group>
          {/* Vertical corner posts */}
          {[
            [-w / 2, 0, -d / 2],
            [w / 2, 0, -d / 2],
            [-w / 2, 0, d / 2],
            [w / 2, 0, d / 2],
          ].map(([fx, , fz], i) => (
            <mesh key={`vpost-${i}`} position={[fx, h / 2, fz]} castShadow material={frameMat}>
              <boxGeometry args={[0.3, h + 0.1, 0.3]} />
            </mesh>
          ))}
          {/* Top horizontal rails */}
          <mesh position={[0, h + 0.05, -d / 2]} castShadow material={frameMat}>
            <boxGeometry args={[w + 0.3, 0.25, 0.25]} />
          </mesh>
          <mesh position={[0, h + 0.05, d / 2]} castShadow material={frameMat}>
            <boxGeometry args={[w + 0.3, 0.25, 0.25]} />
          </mesh>
          <mesh position={[-w / 2, h + 0.05, 0]} castShadow material={frameMat}>
            <boxGeometry args={[0.25, 0.25, d + 0.3]} />
          </mesh>
          <mesh position={[w / 2, h + 0.05, 0]} castShadow material={frameMat}>
            <boxGeometry args={[0.25, 0.25, d + 0.3]} />
          </mesh>
          {/* Mid rail (front face) — like a horizontal brace */}
          <mesh position={[0, h * 0.45, d / 2 + 0.05]} castShadow material={frameMat}>
            <boxGeometry args={[w + 0.1, 0.2, 0.15]} />
          </mesh>
        </group>
      )}

      {/* Status accent strip on front top edge */}
      {!isDimmed && (
        <mesh position={[0, h + 0.15, d / 2 + 0.02]}>
          <boxGeometry args={[w * 0.6, 0.12, 0.05]} />
          <meshStandardMaterial
            color={accentColor}
            emissive={accentColor}
            emissiveIntensity={0.5}
            roughness={0.3}
          />
        </mesh>
      )}

      {/* Flag — color-coded dot on top front-left */}
      {vault.flagReason && !isDimmed && (() => {
        const flagColor = FLAG_CONFIG[vault.flagReason].dotColor;
        return (
          <mesh position={[-w / 2 + 0.6, h + 0.4, d / 2 - 0.3]}>
            <sphereGeometry args={[0.25, 12, 12]} />
            <meshStandardMaterial color={flagColor} emissive={flagColor} emissiveIntensity={1.0} />
          </mesh>
        );
      })()}

      {/* Selection / highlight ring */}
      {glowColor && !isDimmed && (
        <lineSegments position={[0, h / 2, 0]}>
          <edgesGeometry args={[new THREE.BoxGeometry(w + 0.5, h + 0.5, d + 0.5)]} />
          <lineBasicMaterial color={glowColor} linewidth={2} transparent opacity={0.8} />
        </lineSegments>
      )}

      {/* Label — HTML overlay */}
      {!isDimmed && (
        <Html
          position={[0, h + 0.8, 0]}
          center
          distanceFactor={18}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div className="text-center whitespace-nowrap">
            {vault.vaultNum && (
              <div
                className="font-mono leading-none"
                style={{
                  fontSize: '10px',
                  color: '#94a3b8',
                  marginBottom: '2px',
                  textShadow: '0 1px 6px rgba(0,0,0,0.9)',
                }}
              >
                #{vault.vaultNum}
              </div>
            )}
            <div
              className="font-semibold leading-none"
              style={{
                fontSize: vault.customer ? '12px' : '10px',
                color: vault.customer ? '#f1f5f9' : '#4ade80',
                textShadow: '0 1px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.6)',
              }}
            >
              {vault.customer || 'Empty'}
            </div>
          </div>
        </Html>
      )}

      {/* Hover tooltip with notes */}
      {hovered && !isDimmed && vault.notes && (
        <Html
          position={[0, h + 2.5, 0]}
          center
          distanceFactor={14}
          style={{ pointerEvents: 'none' }}
        >
          <div className="bg-gray-900/95 border border-gray-600 rounded px-2 py-1 text-[10px] text-gray-300 max-w-[180px] text-center shadow-xl">
            {vault.notes}
          </div>
        </Html>
      )}
    </group>
  );
}
