import { useRef, useEffect, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

export interface CameraPreset {
  position: [number, number, number];
  target: [number, number, number];
}

// Scale: 1 unit = 1 foot. Warehouse is ~180ft x 65ft
export const PRESETS: Record<string, CameraPreset> = {
  overview:  { position: [0, 110, 55],   target: [0, 0, -5] },
  isometric: { position: [70, 65, 50],   target: [0, 0, -5] },
  front:     { position: [0, 25, 55],    target: [0, 5, -5] },
  backWall:  { position: [0, 20, -12],   target: [0, 4, -26] },
  floorSouth:{ position: [0, 35, 42],    target: [0, 0, 18] },
};

interface CameraControlsProps {
  preset: string;
  onPresetApplied: () => void;
}

export default function CameraControlsComponent({ preset, onPresetApplied }: CameraControlsProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(...PRESETS.overview.position));
  const targetLook = useRef(new THREE.Vector3(...PRESETS.overview.target));
  const animating = useRef(false);

  const applyPreset = useCallback((name: string) => {
    const p = PRESETS[name];
    if (!p) return;
    targetPos.current.set(...p.position);
    targetLook.current.set(...p.target);
    animating.current = true;
  }, []);

  useEffect(() => {
    applyPreset(preset);
    onPresetApplied();
  }, [preset, applyPreset, onPresetApplied]);

  useFrame(() => {
    if (!animating.current || !controlsRef.current) return;

    const cam = camera as THREE.PerspectiveCamera;
    const controls = controlsRef.current;

    cam.position.lerp(targetPos.current, 0.05);
    controls.target.lerp(targetLook.current, 0.05);
    controls.update();

    const dist = cam.position.distanceTo(targetPos.current);
    if (dist < 0.3) {
      animating.current = false;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      minPolarAngle={0.1}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={10}
      maxDistance={160}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.4}
      panSpeed={1.0}
      zoomSpeed={1.0}
      target={[0, 0, -5]}
    />
  );
}
