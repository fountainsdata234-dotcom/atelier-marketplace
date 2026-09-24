import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls, Stars } from '@react-three/drei';
import { Scissors, Shirt, X } from 'lucide-react';
import * as THREE from 'three';
import { User } from '../types';
import { getScatterOffsetsForLocations } from '../utils/globe';

export type GlobeArtisan = User & {
  distanceKm: number | null;
  postCount: number;
  rating: number;
};

interface ArtisanGlobe3DProps {
  artisans: GlobeArtisan[];
  selectedArtisanId: string | null;
  onSelectArtisan: (artisan: GlobeArtisan) => void;
  onOpenArtisan: (artisan: GlobeArtisan) => void;
  onCloseArtisan: () => void;
  isDarkMode: boolean;
}

const EARTH_RADIUS = 2;
const MARKER_RADIUS = 2.055;

const toGlobePosition = (latitude: number, longitude: number, radius = EARTH_RADIUS) => {
  const lat = THREE.MathUtils.degToRad(latitude);
  const lng = THREE.MathUtils.degToRad(longitude);
  return new THREE.Vector3(
    radius * Math.cos(lat) * Math.sin(lng),
    radius * Math.sin(lat),
    radius * Math.cos(lat) * Math.cos(lng),
  );
};

const formatLocation = (artisan: GlobeArtisan) => [artisan.location.city, artisan.location.country].filter(Boolean).join(', ');

const GlobeGrid: React.FC = () => {
  const lines = useMemo(() => {
    const values: THREE.Vector3[][] = [];
    for (let latitude = -75; latitude <= 75; latitude += 15) {
      values.push(Array.from({ length: 65 }, (_, index) => toGlobePosition(latitude, -180 + index * (360 / 64), EARTH_RADIUS + 0.006)));
    }
    for (let longitude = -180; longitude < 180; longitude += 15) {
      values.push(Array.from({ length: 37 }, (_, index) => toGlobePosition(-90 + index * 5, longitude, EARTH_RADIUS + 0.006)));
    }
    return values;
  }, []);

  return <group rotation={[0, Math.PI / 2, 0]}>{lines.map((points, index) => <Line key={index} points={points} color="#83d8d0" transparent opacity={0.13} lineWidth={0.45} />)}</group>;
};

const Earth: React.FC = () => (
  <group>
    <mesh>
      <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
      <meshStandardMaterial color="#123c52" roughness={0.86} metalness={0.08} emissive="#06131b" emissiveIntensity={0.45} />
    </mesh>
    <mesh scale={1.015}>
      <sphereGeometry args={[EARTH_RADIUS, 48, 48]} />
      <meshBasicMaterial color="#f1a35a" transparent opacity={0.055} side={THREE.BackSide} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
    <GlobeGrid />
    <mesh rotation={[0.6, -0.8, 0.2]} scale={1.025}>
      <sphereGeometry args={[EARTH_RADIUS, 32, 32]} />
      <meshBasicMaterial color="#4d9c75" wireframe transparent opacity={0.13} depthWrite={false} />
    </mesh>
  </group>
);

const MarkerIcon: React.FC<{ role: User['role'] }> = ({ role }) => role === 'tailor'
  ? <Scissors className="globe-marker-icon" aria-hidden="true" />
  : <Shirt className="globe-marker-icon" aria-hidden="true" />;

interface MarkerProps {
  artisan: GlobeArtisan;
  position: THREE.Vector3;
  selected: boolean;
  zoomDistance: number;
  delay: number;
  onSelect: (artisan: GlobeArtisan) => void;
}

const GlobeMarker: React.FC<MarkerProps> = ({ artisan, position, selected, zoomDistance, delay, onSelect }) => {
  const groupRef = useRef<THREE.Group>(null);
  const [entered, setEntered] = useState(false);
  const showAvatar = zoomDistance < 5.8;

  useEffect(() => {
    const timer = window.setTimeout(() => setEntered(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);

  useFrame(() => {
    if (!groupRef.current) return;
    const targetScale = entered ? (selected ? 1.18 : 1) : 0.01;
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.14);
  });

  return (
    <group ref={groupRef} position={position} renderOrder={selected ? 20 : 2}>
      <Html center transform sprite distanceFactor={6.2} occlude="blending" zIndexRange={selected ? [30, 40] : [10, 20]}>
        <button
          type="button"
          className={`globe-marker ${selected ? 'is-selected' : ''} ${showAvatar ? 'show-avatar' : 'show-icon'}`}
          onClick={() => onSelect(artisan)}
          aria-label={`Select ${artisan.name}`}
        >
          <span className="globe-marker-icon-layer"><MarkerIcon role={artisan.role} /></span>
          <span className="globe-marker-avatar-layer">
            {artisan.avatarUrl ? <img src={artisan.avatarUrl} alt="" loading="lazy" /> : <span>{artisan.name.slice(0, 1).toUpperCase()}</span>}
          </span>
          <span className="globe-marker-badge"><MarkerIcon role={artisan.role} /></span>
          {selected && <span className="globe-marker-pulse" aria-hidden="true" />}
        </button>
      </Html>
    </group>
  );
};

interface GlobeSceneProps extends ArtisanGlobe3DProps {
  onZoomDistance: (distance: number) => void;
}

const GlobeScene: React.FC<GlobeSceneProps> = ({ artisans, selectedArtisanId, onSelectArtisan, onZoomDistance, onCloseArtisan }) => {
  const controlsRef = useRef<any>(null);
  const rotatingGroupRef = useRef<THREE.Group>(null);
  const interactingRef = useRef(false);
  const lastInteractionRef = useRef(0);
  const focusVectorRef = useRef<THREE.Vector3 | null>(null);
  const { camera } = useThree();

  const positions = useMemo(() => {
    const offsets = getScatterOffsetsForLocations(artisans.map((artisan) => ({ lat: artisan.location.lat ?? 0, lng: artisan.location.lng ?? 0 })), 0.24);
    return artisans.map((artisan, index) => {
      const base = toGlobePosition(artisan.location.lat ?? 0, artisan.location.lng ?? 0, EARTH_RADIUS);
      const offset = offsets[index];
      return base.add(new THREE.Vector3(offset.x, offset.y, offset.z)).normalize().multiplyScalar(MARKER_RADIUS);
    });
  }, [artisans]);

  useEffect(() => {
    const selectedIndex = artisans.findIndex((artisan) => artisan.id === selectedArtisanId);
    if (selectedIndex < 0) {
      focusVectorRef.current = null;
      return;
    }
    focusVectorRef.current = positions[selectedIndex].clone().normalize().multiplyScalar(Math.min(camera.position.length(), 5.6));
  }, [artisans, camera.position, positions, selectedArtisanId]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    const now = performance.now();
    if (controls) {
      controls.autoRotate = !interactingRef.current && now - lastInteractionRef.current > 1400;
      controls.autoRotateSpeed = 0.28;
    }
    if (focusVectorRef.current && !interactingRef.current) {
      camera.position.lerp(focusVectorRef.current, 1 - Math.exp(-delta * 2.4));
      controls?.update();
      if (camera.position.distanceTo(focusVectorRef.current) < 0.03) focusVectorRef.current = null;
    }
    onZoomDistance(camera.position.length());
    if (rotatingGroupRef.current) rotatingGroupRef.current.rotation.y += delta * 0.004;
  });

  return (
    <>
      <ambientLight intensity={1.2} color="#f6d7bd" />
      <directionalLight position={[4, 3, 5]} intensity={2.4} color="#ffd8b0" />
      <pointLight position={[-4, -2, 3]} intensity={12} distance={12} color="#4dd4c0" />
      <Stars radius={18} depth={8} count={900} factor={1.8} saturation={0.25} fade speed={0.25} />
      <group ref={rotatingGroupRef}>
        <Earth />
        {artisans.map((artisan, index) => (
          <GlobeMarker
            key={artisan.id}
            artisan={artisan}
            position={positions[index]}
            selected={artisan.id === selectedArtisanId}
            zoomDistance={camera.position.length()}
            delay={Math.min(index * 24, 720)}
            onSelect={onSelectArtisan}
          />
        ))}
      </group>
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.075}
        enablePan={false}
        minDistance={4.2}
        maxDistance={10.5}
        rotateSpeed={0.55}
        zoomSpeed={0.65}
        onStart={() => {
          interactingRef.current = true;
          focusVectorRef.current = null;
        }}
        onEnd={() => {
          interactingRef.current = false;
          lastInteractionRef.current = performance.now();
        }}
      />
    </>
  );
};

export const ArtisanGlobe3D: React.FC<ArtisanGlobe3DProps> = ({ artisans, selectedArtisanId, onSelectArtisan, onOpenArtisan, onCloseArtisan, isDarkMode }) => {
  const [zoomDistance, setZoomDistance] = useState(8.2);
  const selectedArtisan = artisans.find((artisan) => artisan.id === selectedArtisanId) ?? null;

  return (
    <div className={`artisan-globe-3d ${isDarkMode ? 'is-dark' : 'is-light'}`} aria-label="Interactive 3D artisan globe">
      <Canvas camera={{ position: [0, 0, 8.2], fov: 34 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <GlobeScene
          artisans={artisans}
          selectedArtisanId={selectedArtisanId}
          onSelectArtisan={onSelectArtisan}
          onOpenArtisan={onOpenArtisan}
          onCloseArtisan={onCloseArtisan}
          isDarkMode={isDarkMode}
          onZoomDistance={setZoomDistance}
        />
      </Canvas>
      <div className="globe-legend" aria-hidden="true">
        <span><Scissors /> Tailors</span>
        <span><Shirt /> Fabric sellers</span>
        <span className="globe-legend-zoom">{zoomDistance < 5.8 ? 'Profiles in view' : 'Zoom to reveal profiles'}</span>
      </div>
      {selectedArtisan && (
        <div className="globe-selected-card">
          <button type="button" className="globe-selected-close" onClick={onCloseArtisan} aria-label="Clear selected artisan"><X /></button>
          <div className="globe-selected-avatar">
            {selectedArtisan.avatarUrl ? <img src={selectedArtisan.avatarUrl} alt="" /> : selectedArtisan.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="globe-selected-copy">
            <span>{selectedArtisan.role === 'tailor' ? 'Tailor' : 'Fabric seller'}</span>
            <strong>{selectedArtisan.name}</strong>
            <small>{formatLocation(selectedArtisan)}</small>
          </div>
          <button type="button" className="globe-selected-open" onClick={() => onOpenArtisan(selectedArtisan)}>View profile</button>
        </div>
      )}
    </div>
  );
};
