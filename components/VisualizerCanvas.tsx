"use client";

import { Suspense, useRef, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

const DEPTH = 5;

function RoomBackground({ imageUrl }: { imageUrl: string }) {
  const texture = useTexture(imageUrl);
  const { size, camera } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);

  const { position, scale } = useMemo(() => {
    if (!size.width || !size.height || !(camera instanceof THREE.PerspectiveCamera))
      return { position: [0, 0, -DEPTH] as [number, number, number], scale: [1, 1, 1] as [number, number, number] };
    const cam = camera as THREE.PerspectiveCamera;
    const fovRad = (cam.fov * Math.PI) / 180;
    const h = 2 * DEPTH * Math.tan(fovRad / 2);
    const w = h * (size.width / size.height);
    return {
      position: [0, 0, -DEPTH] as [number, number, number],
      scale: [w, h, 1] as [number, number, number],
    };
  }, [size.width, size.height, camera]);

  return (
    <mesh ref={meshRef} position={position} scale={scale}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} depthWrite={false} />
    </mesh>
  );
}

function Scene({ roomImageUrl }: { roomImageUrl: string }) {
  return (
    <Suspense fallback={null}>
      <RoomBackground imageUrl={roomImageUrl} />
    </Suspense>
  );
}

interface VisualizerCanvasProps {
  roomImageUrl: string | null;
  width: number;
  height: number;
  containerRef?: React.RefObject<HTMLDivElement>;
}

export default function VisualizerCanvas({
  roomImageUrl,
  width,
  height,
  containerRef,
}: VisualizerCanvasProps) {
  if (!width || !height) return null;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full bg-slate-900"
      style={{ width, height }}
    >
      {roomImageUrl && (
        <Canvas
          camera={{ position: [0, 0, 0], fov: 50 }}
          gl={{ preserveDrawingBuffer: true }}
          style={{ width, height }}
        >
          <Scene roomImageUrl={roomImageUrl} />
        </Canvas>
      )}
    </div>
  );
}
