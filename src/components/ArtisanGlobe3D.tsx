import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Line, OrbitControls, Stars } from '@react-three/drei';
import { Scissors, X } from 'lucide-react';
import * as THREE from 'three';
import { User } from '../types';
import { getEarthTexturePosition, getScatterOffsetsForLocations } from '../utils/globe';
import { createGlobeSignalPoints } from '../utils/globeSignals';

export type GlobeArtisan = User & {
  distanceKm: number | null;
  postCount: number;
};

interface ArtisanGlobe3DProps {
  artisans: GlobeArtisan[];
  showArtisanMarkers: boolean;
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
  selected: boolean;
  isMobile: boolean;
  delay: number;
  onSelect: (artisan: GlobeArtisan) => void;
}

const GlobeMarker: React.FC<MarkerProps> = ({ artisan, position, selected, isMobile, delay, onSelect }) => {
  const groupRef = useRef<THREE.Group>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setEntered(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const targetScale = entered ? (selected ? 1.25 : 0.9) : 0.01;
    const targetNormal = position.clone().normalize();
    const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), targetNormal);

    groupRef.current.position.lerp(position, 1 - Math.exp(-delta * 7.5));
    groupRef.current.quaternion.slerp(targetQuaternion, 1 - Math.exp(-delta * 7.5));
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 1 - Math.exp(-delta * 8));

  });

  return (
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
      <mesh renderOrder={selected ? 21 : 2}>
        <sphereGeometry args={[selected ? (isMobile ? 0.06 : 0.05) : (isMobile ? 0.045 : 0.035), 16, 12]} />
        <meshStandardMaterial
          color={artisan.role === 'tailor' ? '#ff7043' : '#5b7cff'}
          emissive={artisan.role === 'tailor' ? '#ff7043' : '#5b7cff'}
          emissiveIntensity={selected ? 0.9 : 0.5}
          roughness={0.32}
          metalness={0.38}
        />
      </mesh>
    </group>
  );
};

interface GlobeSceneProps extends ArtisanGlobe3DProps {
  onZoomDistance: (distance: number) => void;
  isMobile: boolean;
  prefersReducedMotion: boolean;
  onEarthReady: () => void;
}

const GlobeSignal: React.FC<{
  position: THREE.Vector3;
  phase: number;
  prefersReducedMotion: boolean;
  coreGeometry: THREE.SphereGeometry;
  ringGeometry: THREE.TorusGeometry;
}> = ({ position, phase, prefersReducedMotion, coreGeometry, ringGeometry }) => {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const coreMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const orientation = useMemo(() => new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    position.clone().normalize(),
  ), [position]);

  useFrame(() => {
    const group = groupRef.current;
    const ring = ringRef.current;
    const ringMaterial = ringMaterialRef.current;
    const coreMaterial = coreMaterialRef.current;
    if (!group || !ring || !ringMaterial || !coreMaterial) return;

    if (prefersReducedMotion) {
      ring.scale.setScalar(0.82);
      ringMaterial.opacity = 0.28;
      coreMaterial.opacity = 0.6;
      return;
    }

    const cycle = ((performance.now() / 1000 + phase) % 3.4) / 3.4;
    const eased = cycle * cycle * (3 - 2 * cycle);
    ring.scale.setScalar(0.58 + eased * 1.55);
    ringMaterial.opacity = 0.52 * (1 - cycle);
    coreMaterial.opacity = 0.38 + Math.sin(cycle * Math.PI) * 0.45;
  });

  return (
    <group ref={groupRef} position={position} quaternion={orientation}>
      <mesh geometry={coreGeometry} renderOrder={5}>
        <meshBasicMaterial ref={coreMaterialRef} color="#8df8ff" transparent opacity={0.7} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={ringRef} geometry={ringGeometry} renderOrder={5}>
        <meshBasicMaterial ref={ringMaterialRef} color="#5ce9ff" transparent opacity={0.4} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
};

const GlobeSignalField: React.FC<{ isMobile: boolean; prefersReducedMotion: boolean }> = ({ isMobile, prefersReducedMotion }) => {
  const signals = useMemo(() => createGlobeSignalPoints(isMobile ? 22 : 36), [isMobile]);
  const coreGeometry = useMemo(() => new THREE.SphereGeometry(0.025, 8, 6), []);
  const ringGeometry = useMemo(() => new THREE.TorusGeometry(0.085, 0.006, 4, 20), []);
  const positions = useMemo(() => signals.map(signal => toGlobePosition(signal.lat, signal.lng, EARTH_RADIUS + 0.025)), [signals]);

  useEffect(() => () => {
    coreGeometry.dispose();
    ringGeometry.dispose();
  }, [coreGeometry, ringGeometry]);

  return (
    <group>
      {signals.map((signal, index) => (
        <GlobeSignal
          key={index}
          position={positions[index]}
          phase={signal.phase}
          prefersReducedMotion={prefersReducedMotion}
          coreGeometry={coreGeometry}
          ringGeometry={ringGeometry}
        />
      ))}
    </group>
  );
};

const GlobeScene: React.FC<GlobeSceneProps> = ({ artisans, showArtisanMarkers, selectedArtisanId, onSelectArtisan, onZoomDistance, onCloseArtisan, isMobile, prefersReducedMotion, onEarthReady }) => {
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
      const offset = offsets[index] ?? { x: 0, y: 0, z: 0 };
      const markerOffset = new THREE.Vector3(offset.x, offset.y, offset.z);
      const alignedOffset = markerOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      const mapPosition = getEarthTexturePosition(artisan.location.lat ?? 0, artisan.location.lng ?? 0, EARTH_RADIUS);
      const position = new THREE.Vector3(mapPosition.x, mapPosition.y, mapPosition.z)
        .add(alignedOffset)
        .normalize()
        .multiplyScalar(MARKER_RADIUS);
      return { position };
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
        <GlobeSignalField isMobile={isMobile} prefersReducedMotion={prefersReducedMotion} />
        {showArtisanMarkers && artisans.map((artisan, index) => (
          <GlobeMarker
            key={artisan.id}
            artisan={artisan}
            position={positions[index].position}
            selected={artisan.id === selectedArtisanId}
            isMobile={isMobile}
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

const GlobeFallback: React.FC<Pick<ArtisanGlobe3DProps, 'artisans' | 'showArtisanMarkers' | 'selectedArtisanId' | 'onSelectArtisan'>> = ({ artisans, showArtisanMarkers, selectedArtisanId, onSelectArtisan }) => (
  <div className="globe-webgl-fallback" role="group" aria-label="Earth map with artisan locations">
    <div className="globe-fallback-sphere">
      <img src="/textures/earth/earth_atmos_2048.jpg" alt="" />
      {showArtisanMarkers && artisans.map((artisan, index) => {
        const latitude = THREE.MathUtils.degToRad(artisan.location.lat ?? 0);
        const longitude = THREE.MathUtils.degToRad(artisan.location.lng ?? 0);
        const x = Math.cos(latitude) * Math.sin(longitude);
        const y = Math.sin(latitude);
        const depth = Math.cos(latitude) * Math.cos(longitude);
        if (depth < 0) return null;
        const coordinateKey = `${Math.round(latitude * 20)}:${Math.round(longitude * 20)}`;
        const clusterIndex = artisans.slice(0, index).filter((candidate) => (
          `${Math.round(THREE.MathUtils.degToRad(candidate.location.lat ?? 0) * 20)}:${Math.round(THREE.MathUtils.degToRad(candidate.location.lng ?? 0) * 20)}` === coordinateKey
        )).length;
        const angle = clusterIndex * 2.4;
        const spread = clusterIndex > 0 ? 6 : 0;
        return (
          <button
            key={artisan.id}
            type="button"
            className={`globe-fallback-marker ${artisan.role === 'tailor' ? 'is-tailor' : 'is-fabric-seller'}${artisan.id === selectedArtisanId ? ' is-selected' : ''}`}
            style={{ left: `${50 + x * 43 + Math.cos(angle) * spread}%`, top: `${50 - y * 43 + Math.sin(angle) * spread}%` }}
            onClick={() => onSelectArtisan(artisan)}
            aria-label={`Select ${artisan.name}, ${formatLocation(artisan)}`}
            title={`${artisan.name} · ${formatLocation(artisan)}`}
          />
        );
      })}
    </div>
    <span className="globe-fallback-label">Static Earth view</span>
  </div>
);

export const ArtisanGlobe3D: React.FC<ArtisanGlobe3DProps> = ({ artisans, showArtisanMarkers, selectedArtisanId, onSelectArtisan, onOpenArtisan, onCloseArtisan, isDarkMode }) => {
  const [zoomDistance, setZoomDistance] = useState(8.2);
  const [isEarthReady, setIsEarthReady] = useState(false);
  const [isWebGlUnavailable, setIsWebGlUnavailable] = useState(false);
  const [failedAvatarIds, setFailedAvatarIds] = useState<Set<string>>(() => new Set());
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const readyTimerRef = useRef<number | null>(null);
  const selectedArtisan = artisans.find((artisan) => artisan.id === selectedArtisanId) ?? null;
  const markersReadyDelay = 250;
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
    setIsWebGlUnavailable(false);
    if (readyTimerRef.current !== null) window.clearTimeout(readyTimerRef.current);
  }, [isMobile]);

  return (
    <div className={`artisan-globe-3d ${isDarkMode ? 'is-dark' : 'is-light'}${isWebGlUnavailable ? ' webgl-unavailable' : ''}`} aria-label="Interactive artisan globe" aria-busy={!isEarthReady && !isWebGlUnavailable}>
      <Canvas
        key={isMobile ? 'mobile' : 'desktop'}
        camera={{ position: [0, 0, 8.2], fov: 34 }}
        frameloop="always"
        dpr={isMobile ? 1 : [1, 1.2]}
        gl={{ antialias: !isMobile, alpha: true }}
        fallback={<GlobeFallback artisans={artisans} showArtisanMarkers={showArtisanMarkers} selectedArtisanId={selectedArtisanId} onSelectArtisan={onSelectArtisan} />}
        onCreated={({ gl }) => {
          gl.setClearColor('#000000', 0);
          gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.2));
          gl.domElement.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            setIsWebGlUnavailable(true);
            setIsEarthReady(true);
            if (readyTimerRef.current !== null) window.clearTimeout(readyTimerRef.current);
          });
          gl.domElement.addEventListener('webglcontextrestored', () => {
            setIsWebGlUnavailable(false);
            handleEarthReady();
          });
        }}
      >
        <GlobeScene
          artisans={artisans}
          showArtisanMarkers={showArtisanMarkers}
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
      {isWebGlUnavailable && <GlobeFallback artisans={artisans} showArtisanMarkers={showArtisanMarkers} selectedArtisanId={selectedArtisanId} onSelectArtisan={onSelectArtisan} />}
      {!isEarthReady && !isWebGlUnavailable && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#10151b]/90 px-5 text-center" role="status" aria-live="polite"><span className="h-10 w-10 animate-spin rounded-full border-2 border-amber-300/25 border-t-amber-300" /><strong className="text-sm text-white">Mapping artisan locations</strong><span className="text-xs text-neutral-300">Locating the global signal field.</span></div>}
      <div className="globe-legend" aria-hidden="true">
        <span><Scissors /> Tailors</span>
        <span><i className="globe-legend-fabric-dot" /> Fabric sellers</span>
        <span className="globe-legend-zoom">{showArtisanMarkers ? `${artisans.length} matching maker${artisans.length === 1 ? '' : 's'}` : 'Search to reveal makers'}</span>
      </div>
      {selectedArtisan && (
        <div className="globe-selected-card">
          <button type="button" className="globe-selected-close" onClick={onCloseArtisan} aria-label="Clear selected artisan"><X /></button>
          <button type="button" className="globe-selected-avatar" onClick={() => onOpenArtisan(selectedArtisan)} aria-label={`View ${selectedArtisan.name}'s profile`}>
            {selectedArtisan.avatarUrl && !failedAvatarIds.has(selectedArtisan.id)
              ? <img src={selectedArtisan.avatarUrl} alt="" onError={() => setFailedAvatarIds(current => new Set(current).add(selectedArtisan.id))} />
              : selectedArtisan.name.slice(0, 1).toUpperCase()}
          </button>
          <div className="globe-selected-copy">
            <span>{selectedArtisan.role === 'tailor' ? 'Tailor' : 'Fabric seller'}{zoomDistance < 5.8 ? ' · In view' : ''}</span>
            <strong>{selectedArtisan.name}</strong>
            <small>{formatLocation(selectedArtisan)}</small>
          </div>
          <button type="button" className="globe-selected-open" onClick={() => onOpenArtisan(selectedArtisan)}>View profile</button>
        </div>
      )}
    </div>
  );
};
