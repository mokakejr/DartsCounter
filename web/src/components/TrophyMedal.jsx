import { useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Environment, Lightformer } from '@react-three/drei';

const COLORS = {
  legendary: { color: '#C9A227', emissive: '#7c5200', light: '#ffd700' },
  epic:      { color: '#A974E6', emissive: '#4c1d95', light: '#c084fc' },
  rare:      { color: '#4C9BE6', emissive: '#1e3a8a', light: '#7dd3fc' },
  common:    { color: '#9CA3AF', emissive: '#374151', light: '#d1d5db' },
};

function Medal({ color, emissive }) {
  const ref = useRef();
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.75; });
  return (
    <group ref={ref}>
      <mesh>
        <cylinderGeometry args={[1, 1, 0.15, 80]} />
        <meshStandardMaterial
          color={color} metalness={0.96} roughness={0.1}
          emissive={emissive} emissiveIntensity={0.3}
        />
      </mesh>
      <mesh>
        <torusGeometry args={[1, 0.072, 20, 80]} />
        <meshStandardMaterial
          color={color} metalness={1} roughness={0.06}
          emissive={emissive} emissiveIntensity={0.2}
        />
      </mesh>
      <mesh position={[0, 0.09, 0]}>
        <torusGeometry args={[0.7, 0.025, 12, 80]} />
        <meshStandardMaterial color={color} metalness={0.9} roughness={0.15} />
      </mesh>
    </group>
  );
}

export default function TrophyMedal({ rarity }) {
  const key = rarity?.key || 'common';
  const { color, emissive, light } = COLORS[key];
  return (
    <Canvas
      camera={{ position: [0, 1.0, 3.8], fov: 38 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ alpha: true, antialias: true }}
    >
      <ambientLight intensity={0.5} />
      <pointLight position={[3, 3, 3]} intensity={2.5} color="#ffffff" />
      <pointLight position={[-3, 0, 1]} intensity={1.8} color={light} />
      <Suspense fallback={null}>
        <Float speed={1.4} rotationIntensity={0.12} floatIntensity={0.3}>
          <Medal color={color} emissive={emissive} />
        </Float>
        <Environment resolution={128}>
          <Lightformer intensity={2.5} color="#ffffff" position={[4, 5, 4]} scale={[4, 4, 1]} />
          <Lightformer intensity={1.2} color={light} position={[-4, 1, -2]} scale={[3, 3, 1]} />
          <Lightformer intensity={0.6} color="#cccccc" position={[0, -4, 2]} scale={[4, 3, 1]} />
        </Environment>
      </Suspense>
    </Canvas>
  );
}
