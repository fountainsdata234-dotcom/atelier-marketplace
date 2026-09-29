import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Line, OrbitControls, Stars } from '@react-three/drei';
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
const MARKER_RADIUS = 2.09;

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

const shortestAngleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

const GlobeGrid: React.FC<{ isMobile: boolean }> = ({ isMobile }) => {
  const lines = useMemo(() => {
    const values: THREE.Vector3[][] = [];
    const longitudeSegments = isMobile ? 32 : 64;
    const latitudeSegments = isMobile ? 19 : 37;
    for (let latitude = -75; latitude <= 75; latitude += isMobile ? 30 : 15) {
      values.push(Array.from({ length: longitudeSegments + 1 }, (_, index) => toGlobePosition(latitude, -180 + index * (360 / longitudeSegments), EARTH_RADIUS + 0.006)));
    }
    for (let longitude = -180; longitude < 180; longitude += isMobile ? 30 : 15) {
      values.push(Array.from({ length: latitudeSegments }, (_, index) => toGlobePosition(-90 + index * (180 / (latitudeSegments - 1)), longitude, EARTH_RADIUS + 0.006)));
    }
    return values;
  }, [isMobile]);

  return <group rotation={[0, Math.PI / 2, 0]}>{lines.map((points, index) => <Line key={index} points={points} color="#83d8d0" transparent opacity={0.13} lineWidth={0.45} />)}</group>;
};

const Earth: React.FC<{ isMobile: boolean; onReady: () => void }> = ({ isMobile, onReady }) => {
  const texturePaths = isMobile
    ? ['/textures/earth/earth_atmos_2048.jpg', '/textures/earth/earth_lights_2048.png']
    : ['/textures/earth/earth_atmos_2048.jpg', '/textures/earth/earth_normal_2048.jpg', '/textures/earth/earth_specular_2048.jpg', '/textures/earth/earth_lights_2048.png'];
  const textures = useLoader(THREE.TextureLoader, texturePaths);
  const surfaceMap = textures[0];
  const normalMap = isMobile ? undefined : textures[1];
  const specularMap = isMobile ? undefined : textures[2];
  const lightsMap = isMobile ? textures[1] : textures[3];

  textures.forEach((texture) => {
    texture.anisotropy = isMobile ? 1 : 4;
  });
  surfaceMap.colorSpace = THREE.SRGBColorSpace;
  lightsMap.colorSpace = THREE.SRGBColorSpace;

  useEffect(() => {
    const frame = window.requestAnimationFrame(onReady);
    return () => window.cancelAnimationFrame(frame);
  }, [onReady]);

  return (
    <group>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, isMobile ? 32 : 48, isMobile ? 32 : 48]} />
        <meshStandardMaterial
          map={surfaceMap}
          normalMap={normalMap}
          normalScale={new THREE.Vector2(0.72, 0.72)}
          roughnessMap={specularMap}
          roughness={0.82}
          metalness={0.02}
        />
      </mesh>
      <mesh scale={1.002}>
        <sphereGeometry args={[EARTH_RADIUS, isMobile ? 32 : 48, isMobile ? 32 : 48]} />
        <meshBasicMaterial map={lightsMap} transparent opacity={0.72} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh scale={1.018}>
        <sphereGeometry args={[EARTH_RADIUS, isMobile ? 32 : 48, isMobile ? 32 : 48]} />
        <meshBasicMaterial color="#52b8ff" transparent opacity={0.09} side={THREE.BackSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <GlobeGrid isMobile={isMobile} />
    </group>
  );
};

interface MarkerProps {
  artisan: GlobeArtisan;
  position: THREE.Vector3;
  anchor: THREE.Vector3;
  selected: boolean;
  delay: number;
  onSelect: (artisan: GlobeArtisan) => void;
}

const GlobeMarker: React.FC<MarkerProps> = ({ artisan, position, anchor, selected, delay, onSelect }) => {
  const groupRef = useRef<THREE.Group>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const pulseMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setEntered(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const targetScale = entered ? (selected ? 1.08 : 0.72) : 0.01;
    const targetNormal = position.clone().normalize();
    const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), targetNormal);

    groupRef.current.position.lerp(position, 1 - Math.exp(-delta * 7.5));
    groupRef.current.quaternion.slerp(targetQuaternion, 1 - Math.exp(-delta * 7.5));
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 1 - Math.exp(-delta * 8));

    if (pulseRef.current && pulseMaterialRef.current) {
      const phase = selected ? (performance.now() * 0.0008 + delay * 0.001) % 1 : 0;
      pulseRef.current.scale.setScalar(selected ? 0.9 + phase * 2.6 : 0.01);
      pulseMaterialRef.current.opacity = selected ? (1 - phase) * 0.72 : 0;
    }
  });

  return (
    <>
      {selected && <Line
          points={[anchor, position]}
          color={artisan.role === 'tailor' ? '#ff7043' : '#5b7cff'}
          transparent
          opacity={0.82}
          lineWidth={1}
          renderOrder={19}
        />}
      {selected && <mesh position={anchor.clone().normalize().multiplyScalar(0.008)} renderOrder={19}>
          <ringGeometry args={[0.035, 0.052, 24]} />
          <meshBasicMaterial color={artisan.role === 'tailor' ? '#ff7043' : '#5b7cff'} transparent opacity={0.85} side={THREE.DoubleSide} depthTest />
        </mesh>}
      <group
        ref={groupRef}
        renderOrder={selected ? 20 : 2}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(artisan);
        }}
        onPointerOver={(event) => event.stopPropagation()}
        onPointerOut={(event) => event.stopPropagation()}
      >
        {selected ? <>
          <mesh ref={pulseRef} rotation={[Math.PI / 2, 0, 0]} renderOrder={21}>
            <torusGeometry args={[0.14, 0.012, 8, 32]} />
            <meshBasicMaterial ref={pulseMaterialRef} color={artisan.role === 'tailor' ? '#ffb347' : '#8ea2ff'} transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0.08, 0]} rotation={[0, 0, Math.PI]} castShadow>
            <coneGeometry args={[0.045, 0.12, 8]} />
            <meshStandardMaterial color={artisan.role === 'tailor' ? '#ff7043' : '#5b7cff'} roughness={0.42} metalness={0.28} />
          </mesh>
          <mesh position={[0, 0.15, 0]} castShadow>
            <sphereGeometry args={[0.034, 12, 8]} />
            <meshStandardMaterial color="#fff1c2" emissive="#ffb347" emissiveIntensity={1.4} roughness={0.3} metalness={0.2} />
          </mesh>
        </> : <mesh renderOrder={2}>
          <sphereGeometry args={[0.022, 8, 6]} />
          <meshBasicMaterial color={artisan.role === 'tailor' ? '#ff7043' : '#5b7cff'} />
        </mesh>}
      </group>
    </>
  );
};

interface GlobeSceneProps extends ArtisanGlobe3DProps {
  onZoomDistance: (distance: number) => void;
  isMobile: boolean;
  prefersReducedMotion: boolean;
  onEarthReady: () => void;
}

const GlobeScene: React.FC<GlobeSceneProps> = ({ artisans, selectedArtisanId, onSelectArtisan, onZoomDistance, onCloseArtisan, isMobile, prefersReducedMotion, onEarthReady }) => {
  const controlsRef = useRef<any>(null);
  const rotatingGroupRef = useRef<THREE.Group>(null);
  const interactingRef = useRef(false);
  const lastInteractionRef = useRef(0);
  const focusVectorRef = useRef<THREE.Vector3 | null>(null);
  const focusRotationRef = useRef<number | null>(null);
  const lastReportedZoomRef = useRef(8.2);
  const { camera } = useThree();

  const positions = useMemo(() => {
    const offsets = getScatterOffsetsForLocations(
      artisans.map((artisan) => ({ lat: artisan.location.lat ?? 0, lng: artisan.location.lng ?? 0 })),
      0.18,
    );

    return artisans.map((artisan, index) => {
      const base = toGlobePosition(artisan.location.lat ?? 0, artisan.location.lng ?? 0, EARTH_RADIUS);
      const offset = offsets[index] ?? { x: 0, y: 0, z: 0 };
      const markerOffset = new THREE.Vector3(offset.x, offset.y, offset.z);
      const anchor = base.clone().add(markerOffset.clone().multiplyScalar(0.24)).normalize().multiplyScalar(EARTH_RADIUS + 0.006);
      const position = base.add(markerOffset).normalize().multiplyScalar(MARKER_RADIUS);
      return { anchor, position };
    });
  }, [artisans]);

  useEffect(() => {
    const selectedIndex = artisans.findIndex((artisan) => artisan.id === selectedArtisanId);
    if (selectedIndex < 0) {
      focusVectorRef.current = null;
      focusRotationRef.current = null;
      return;
    }
    const selectedPosition = positions[selectedIndex].position.clone();
    const currentRotation = rotatingGroupRef.current?.rotation.y ?? 0;
    const targetRotation = currentRotation + shortestAngleDelta(currentRotation, Math.atan2(-selectedPosition.x, selectedPosition.z));
    selectedPosition.applyAxisAngle(new THREE.Vector3(0, 1, 0), targetRotation);
    focusRotationRef.current = targetRotation;
    focusVectorRef.current = selectedPosition.normalize().multiplyScalar(5.2);
  }, [artisans, camera, positions, selectedArtisanId]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    const now = performance.now();
    if (controls) {
      controls.autoRotate = !prefersReducedMotion && !selectedArtisanId && !interactingRef.current && now - lastInteractionRef.current > 1400;
      controls.autoRotateSpeed = 0.28;
    }
    if (focusVectorRef.current && focusRotationRef.current !== null && !interactingRef.current) {
      if (rotatingGroupRef.current) {
        rotatingGroupRef.current.rotation.y += shortestAngleDelta(rotatingGroupRef.current.rotation.y, focusRotationRef.current) * (1 - Math.exp(-delta * 2.6));
      }
      camera.position.lerp(focusVectorRef.current, 1 - Math.exp(-delta * 2.4));
      controls?.update();
      if (camera.position.distanceTo(focusVectorRef.current) < 0.03 && Math.abs(shortestAngleDelta(rotatingGroupRef.current?.rotation.y ?? 0, focusRotationRef.current)) < 0.01) {
        focusVectorRef.current = null;
        focusRotationRef.current = null;
      }
    }
    const zoomDistance = Math.round(camera.position.length() * 10) / 10;
    if (zoomDistance !== lastReportedZoomRef.current) {
      lastReportedZoomRef.current = zoomDistance;
      onZoomDistance(zoomDistance);
    }
    if (rotatingGroupRef.current && !prefersReducedMotion && !selectedArtisanId) rotatingGroupRef.current.rotation.y += delta * 0.004;
  });

  return (
    <>
      <ambientLight intensity={1.2} color="#f6d7bd" />
      <directionalLight position={[4, 3, 5]} intensity={2.4} color="#ffd8b0" />
      <pointLight position={[-4, -2, 3]} intensity={12} distance={12} color="#4dd4c0" />
      <Stars radius={18} depth={8} count={isMobile ? 120 : 450} factor={1.8} saturation={0.25} fade speed={prefersReducedMotion ? 0 : isMobile ? 0.08 : 0.25} />
      <group ref={rotatingGroupRef}>
        <Earth isMobile={isMobile} onReady={onEarthReady} />
        {artisans.map((artisan, index) => (
          <GlobeMarker
            key={artisan.id}
            artisan={artisan}
            position={positions[index].position}
            anchor={positions[index].anchor}
            selected={artisan.id === selectedArtisanId}
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
          focusRotationRef.current = null;
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
  const [isEarthReady, setIsEarthReady] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const readyTimerRef = useRef<number | null>(null);
  const selectedArtisan = artisans.find((artisan) => artisan.id === selectedArtisanId) ?? null;
  const markersReadyDelay = Math.min(Math.max(artisans.length - 1, 0) * 24, 720) + 650;
  const handleEarthReady = useCallback(() => {
    setIsEarthReady(false);
    if (readyTimerRef.current !== null) window.clearTimeout(readyTimerRef.current);
    readyTimerRef.current = window.setTimeout(() => {
      setIsEarthReady(true);
      readyTimerRef.current = null;
    }, markersReadyDelay);
  }, [markersReadyDelay]);

  useEffect(() => () => {
    if (readyTimerRef.current !== null) window.clearTimeout(readyTimerRef.current);
  }, []);

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateProfile = () => {
      setIsMobile(mobileQuery.matches);
      setPrefersReducedMotion(motionQuery.matches);
    };
    updateProfile();
    mobileQuery.addEventListener('change', updateProfile);
    motionQuery.addEventListener('change', updateProfile);
    return () => {
      mobileQuery.removeEventListener('change', updateProfile);
      motionQuery.removeEventListener('change', updateProfile);
    };
  }, []);

  useEffect(() => {
    setIsEarthReady(false);
    if (readyTimerRef.current !== null) window.clearTimeout(readyTimerRef.current);
  }, [isMobile]);

  return (
    <div className={`artisan-globe-3d ${isDarkMode ? 'is-dark' : 'is-light'}`} aria-label="Interactive 3D artisan globe" aria-busy={!isEarthReady}>
      <Canvas key={isMobile ? 'mobile' : 'desktop'} camera={{ position: [0, 0, 8.2], fov: 34 }} dpr={isMobile ? 1 : [1, 1.2]} gl={{ antialias: !isMobile, alpha: true, powerPreference: isMobile ? 'low-power' : 'high-performance' }}>
        <GlobeScene
          artisans={artisans}
          selectedArtisanId={selectedArtisanId}
          onSelectArtisan={onSelectArtisan}
          onOpenArtisan={onOpenArtisan}
          onCloseArtisan={onCloseArtisan}
          isDarkMode={isDarkMode}
          onZoomDistance={setZoomDistance}
          isMobile={isMobile}
          prefersReducedMotion={prefersReducedMotion}
          onEarthReady={handleEarthReady}
        />
      </Canvas>
      {!isEarthReady && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#10151b]/90 px-5 text-center" role="status" aria-live="polite"><span className="h-10 w-10 animate-spin rounded-full border-2 border-amber-300/25 border-t-amber-300" /><strong className="text-sm text-white">Mapping artisan locations</strong><span className="text-xs text-neutral-300">Loading the Earth and placing makers on the map.</span></div>}
      <div className="globe-legend" aria-hidden="true">
        <span><Scissors /> Tailors</span>
        <span><Shirt /> Fabric sellers</span>
        <span className="globe-legend-zoom">{zoomDistance < 5.8 ? 'Profiles in view' : 'Zoom to reveal profiles'}</span>
      </div>
      {selectedArtisan && (
        <div className="globe-selected-card">
          <button type="button" className="globe-selected-close" onClick={onCloseArtisan} aria-label="Clear selected artisan"><X /></button>
          <button type="button" className="globe-selected-avatar" onClick={() => onOpenArtisan(selectedArtisan)} aria-label={`View ${selectedArtisan.name}'s profile`}>
            {selectedArtisan.avatarUrl ? <img src={selectedArtisan.avatarUrl} alt="" /> : selectedArtisan.name.slice(0, 1).toUpperCase()}
          </button>
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
