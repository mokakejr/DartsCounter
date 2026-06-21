import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Float, Lightformer } from '@react-three/drei';

// A turned-metal dart built from lathe profiles — looks sculpted, not blocky.
// Tip (steel needle) → barrel (knurled tungsten) → shaft → 4 kite flights.
function DartMesh() {
  const spin = useRef();

  // Slow spin around the dart's own long axis for the metal shimmer.
  useFrame((_, delta) => {
    spin.current.rotation.y += delta * 0.6;
  });

  const { tipGeo, barrelGeo, flightGeo } = useMemo(() => {
    const v = (r, y) => new THREE.Vector2(r, y);

    // Steel needle, smooth taper to a sharp point.
    const tip = new THREE.LatheGeometry(
      [v(0.001, -2.5), v(0.018, -2.15), v(0.038, -1.85), v(0.05, -1.55)],
      48
    );

    // Knurled barrel: small radius ripples read as grip rings.
    const barrel = new THREE.LatheGeometry(
      [
        v(0.05, -1.55), v(0.135, -1.46), v(0.17, -1.36),
        v(0.15, -1.3), v(0.172, -1.22), v(0.15, -1.16),
        v(0.172, -1.08), v(0.15, -1.02), v(0.172, -0.94),
        v(0.15, -0.88), v(0.17, -0.8), v(0.142, -0.66),
        v(0.1, -0.52), v(0.06, -0.42), v(0.05, -0.36),
      ],
      64
    );

    // One flight vane (flat kite), spine at x=0 extending radially out.
    const f = new THREE.Shape();
    f.moveTo(0.0, 0.0);
    f.lineTo(0.5, 0.3);
    f.lineTo(0.5, 0.62);
    f.lineTo(0.1, 0.8);
    f.lineTo(0.0, 0.8);
    f.closePath();
    const flight = new THREE.ShapeGeometry(f);

    return { tipGeo: tip, barrelGeo: barrel, flightGeo: flight };
  }, []);

  return (
    <group ref={spin}>
      <mesh geometry={tipGeo}>
        <meshStandardMaterial color="#dce0e6" metalness={1} roughness={0.16} />
      </mesh>
      <mesh geometry={barrelGeo}>
        <meshStandardMaterial color="#17171b" metalness={0.95} roughness={0.3} />
      </mesh>
      {/* Shaft */}
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.04, 0.045, 0.96, 24]} />
        <meshStandardMaterial color="#0e0e10" metalness={0.6} roughness={0.5} />
      </mesh>
      {/* Flights — 4 vanes, alternating crimson / off-white so they always
          read against the near-black background (graphite blended into it). */}
      {[0, 1, 2, 3].map(i => {
        const red = i % 2 === 0;
        return (
          <group key={i} position={[0, 0.78, 0]} rotation={[0, (i * Math.PI) / 2, 0]}>
            <mesh geometry={flightGeo}>
              <meshStandardMaterial
                color={red ? '#E61E2A' : '#EDEDE8'}
                metalness={0.35}
                roughness={0.4}
                emissive={red ? '#E61E2A' : '#2a2a2e'}
                emissiveIntensity={red ? 0.18 : 0.08}
                side={THREE.DoubleSide}
              />
            </mesh>
            {/* thin edge to detach the vane from the background */}
            <lineSegments>
              <edgesGeometry args={[flightGeo]} />
              <lineBasicMaterial color={red ? '#ff7a80' : '#ffffff'} transparent opacity={0.5} />
            </lineSegments>
          </group>
        );
      })}
    </group>
  );
}

export default function Dart() {
  return (
    <Canvas camera={{ position: [0, 0, 8], fov: 34 }} dpr={[1, 2]}>
      <ambientLight intensity={0.45} />
      <directionalLight position={[5, 6, 6]} intensity={2.4} />
      <directionalLight position={[-6, -1, -3]} intensity={0.7} color="#E61E2A" />
      <Float speed={1.2} rotationIntensity={0.25} floatIntensity={0.5}>
        {/* Lean the whole dart for a dynamic read; spin stays on its own axis. */}
        <group rotation={[0.18, 0, -0.32]}>
          <DartMesh />
        </group>
      </Float>
      {/* Studio environment built in-scene (no external HDR fetch). */}
      <Environment resolution={256}>
        <Lightformer intensity={3} position={[3, 4, 4]} scale={[6, 6, 1]} color="#ffffff" />
        <Lightformer intensity={1.4} position={[-4, 1, -2]} scale={[5, 5, 1]} color="#E61E2A" />
        <Lightformer intensity={1} position={[0, -3, 2]} scale={[6, 3, 1]} color="#3a3a44" />
      </Environment>
    </Canvas>
  );
}
