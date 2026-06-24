import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Float, Lightformer } from '@react-three/drei';
import { defaultCoverCrop } from '../lib/flightCrop.js';

// Loads a champion's custom flight image without the conditional-hook
// problems of drei's suspending useTexture — there may be no URL at all,
// and the dart must still render its default colors while one loads.
function useFlightTexture(url) {
  const [texture, setTexture] = useState(null);
  useEffect(() => {
    if (!url) { setTexture(null); return; }
    let active = true;
    new THREE.TextureLoader().load(url, tex => {
      // Without this, three.js treats the photo's sRGB pixel data as linear
      // light values — every color renders far too bright, washing dark
      // images out toward white.
      tex.colorSpace = THREE.SRGBColorSpace;
      if (active) setTexture(tex);
    });
    return () => { active = false; };
  }, [url]);
  return texture;
}

// repeat/offset live on the Texture instance, not the mesh — so symmetric
// vs. paired mode (two different crops from the same source image) needs
// two cloned textures, not one shared one.
function cropTexture(baseTexture, crop) {
  const tex = baseTexture.clone();
  tex.repeat.set(crop.w, crop.h);
  // crop.y is "distance from the top" (how the crop editor expresses it,
  // and how FlightEditor's SVG overlay works) — UV space's v=0 is the
  // bottom of the image, hence the flip.
  tex.offset.set(crop.x, 1 - crop.y - crop.h);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function resolveCrop(crop, baseTexture) {
  if (crop) return crop;
  const img = baseTexture.image;
  return defaultCoverCrop(img.width / img.height);
}

// A turned-metal dart built from lathe profiles — looks sculpted, not blocky.
// Tip (steel needle) → barrel (knurled tungsten) → shaft → 4 kite flights.
// accentColor / flightImageUrl(+crop/mode) come from a player's profile —
// all optional, falling back to the original crimson/off-white scheme.
function DartMesh({ accentColor, flightImageUrl, flightCropA, flightCropB, flightMode = 'symmetric' }) {
  const spin = useRef();
  const baseTexture = useFlightTexture(flightImageUrl);

  // textureA covers vanes 0+2, textureB covers vanes 1+3 in "paired" mode;
  // in "symmetric" mode all 4 vanes share textureA.
  const { textureA, textureB } = useMemo(() => {
    if (!baseTexture) return { textureA: null, textureB: null };
    const a = cropTexture(baseTexture, resolveCrop(flightCropA, baseTexture));
    if (flightMode !== 'paired') return { textureA: a, textureB: a };
    const b = cropTexture(baseTexture, resolveCrop(flightCropB ?? flightCropA, baseTexture));
    return { textureA: a, textureB: b };
  }, [baseTexture, flightCropA, flightCropB, flightMode]);

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
      {/* Flights — 4 vanes. A champion's uploaded flight image (if any) is
          textured onto all 4; otherwise alternating crimson/off-white (the
          crimson swapped for the champion's accent color, if set) so they
          always read against the near-black background. */}
      {[0, 1, 2, 3].map(i => {
        const red = i % 2 === 0; // also vanes 0+2 vs 1+3, used below for paired mode
        const baseColor = red ? (accentColor || '#E61E2A') : '#EDEDE8';
        const flightTexture = red ? textureA : textureB;
        return (
          <group key={i} position={[0, 0.78, 0]} rotation={[0, (i * Math.PI) / 2, 0]}>
            <mesh geometry={flightGeo}>
              {flightTexture ? (
                // Unlit on purpose: the studio Environment/Lightformer rig below
                // is tuned for a shiny metal dart, and even at low roughness its
                // specular/IBL contribution washes a photo out toward white.
                // meshBasicMaterial ignores scene lighting entirely, so the
                // uploaded image renders exactly as uploaded.
                <meshBasicMaterial map={flightTexture} toneMapped={false} side={THREE.DoubleSide} />
              ) : (
                <meshStandardMaterial
                  color={baseColor}
                  metalness={0.35}
                  roughness={0.4}
                  emissive={red ? baseColor : '#2a2a2e'}
                  emissiveIntensity={red ? 0.18 : 0.08}
                  side={THREE.DoubleSide}
                />
              )}
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

export default function Dart({ accentColor, flightImageUrl, flightCropA, flightCropB, flightMode }) {
  return (
    <Canvas camera={{ position: [0, 0, 8], fov: 34 }} dpr={[1, 2]}>
      <ambientLight intensity={0.45} />
      <directionalLight position={[5, 6, 6]} intensity={2.4} />
      <directionalLight position={[-6, -1, -3]} intensity={0.7} color="#E61E2A" />
      <Float speed={1.2} rotationIntensity={0.25} floatIntensity={0.5}>
        {/* Lean the whole dart for a dynamic read; spin stays on its own axis. */}
        <group rotation={[0.18, 0, -0.32]}>
          <DartMesh
            accentColor={accentColor}
            flightImageUrl={flightImageUrl}
            flightCropA={flightCropA}
            flightCropB={flightCropB}
            flightMode={flightMode}
          />
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
