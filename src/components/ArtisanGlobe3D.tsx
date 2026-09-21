import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Line, OrbitControls, Stars } from '@react-three/drei';
import { Crown, Scissors, SwatchBook, X } from 'lucide-react';
import * as THREE from 'three';
import type { User } from '../types';
import { getProfileInitials, getRoleLabel } from '../utils/profile';

export interface GlobeArtisan extends User {
  distanceKm: number | null;
  postCount: number;
}

interface ArtisanGlobe3DProps {
  artisans: GlobeArtisan[];
  selectedArtisanId: string | null;
  onSelectArtisan: (artisan: GlobeArtisan) => void;
  onOpenArtisan: (artisan: GlobeArtisan) => void;
  onCloseArtisan: () => void;
  isDarkMode: boolean;
}

const toGlobePosition = (latitude: number, longitude: number, radius = 2.02) => {
  const lat = THREE.MathUtils.degToRad(latitude);
  const lng = THREE.MathUtils.degToRad(longitude);
  return new THREE.Vector3(
    radius * Math.cos(lat) * Math.sin(lng),
    radius * Math.sin(lat),
    radius * Math.cos(lat) * Math.cos(lng),
  );
};

const createMapTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#082b3a';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = 'rgba(103, 232, 249, 0.16)';
  context.lineWidth = 2;
  for (let latitude = 0; latitude <= 8; latitude += 1) {
    const y = (latitude / 8) * canvas.height;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }
  for (let longitude = 0; longitude <= 16; longitude += 1) {
    const x = (longitude / 16) * canvas.width;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }

  const landMasses = [
    [[80, 135], [160, 92], [235, 112], [270, 175], [225, 225], [180, 205], [130, 240], [94, 198]],
    [[255, 275], [302, 250], [340, 300], [325, 385], [278, 445], [245, 382], [260, 325]],
    [[410, 120], [480, 96], [535, 135], [565, 190], [522, 222], [485, 185], [438, 205], [400, 165]],
    [[545, 225], [610, 210], [680, 255], [655, 335], [600, 370], [555, 320], [520, 275]],
    [[700, 118], [770, 100], [840, 140], [900, 190], [850, 230], [780, 214], [720, 180]],
    [[830, 270], [900, 250], [950, 300], [925, 390], [860, 420], [815, 350]],
  ];
  context.fillStyle = '#1b665e';
  context.strokeStyle = '#58c9a9';
  context.lineWidth = 3;
  landMasses.forEach((points) => {
    context.beginPath();
    points.forEach(([x, y], index) => index === 0 ? context.moveTo(x, y) : context.lineTo(x, y));
    context.closePath();
    context.fill();
    context.stroke();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const CurrentBands: React.FC = () => {
  const firstBand = useRef<THREE.Mesh>(null);
  const secondBand = useRef<THREE.Mesh>(null);
  const firstCharge = useRef<THREE.Mesh>(null);
  const secondCharge = useRef<THREE.Mesh>(null);
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    elapsed.current += delta;
    if (firstBand.current) firstBand.current.rotation.y += delta * 0.22;
    if (secondBand.current) secondBand.current.rotation.x -= delta * 0.17;
    if (firstCharge.current) {
      const angle = elapsed.current * 1.15;
      firstCharge.current.position.set(Math.cos(angle) * 2.15, 0, Math.sin(angle) * 2.15);
    }
    if (secondCharge.current) {
      const angle = elapsed.current * -0.9;
      secondCharge.current.position.set(0, Math.sin(angle) * 2.2, Math.cos(angle) * 2.2);
    }
  });

  return (
    <>
      <mesh ref={firstBand} rotation={[Math.PI / 2.6, 0.15, 0]}>
        <torusGeometry args={[2.15, 0.012, 8, 160]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.8} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={secondBand} rotation={[0.55, Math.PI / 2.4, 0.2]}>
        <torusGeometry args={[2.2, 0.009, 8, 160]} />
        <meshBasicMaterial color="#34d399" transparent opacity={0.82} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={firstCharge}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshBasicMaterial color="#f0fdfa" toneMapped={false} />
      </mesh>
      <mesh ref={secondCharge}>
        <sphereGeometry args={[0.028, 8, 8]} />
        <meshBasicMaterial color="#fbbf24" toneMapped={false} />
      </mesh>
    </>
  );
};

const ArtisanMarker: React.FC<{
  artisan: GlobeArtisan;
  selected: boolean;
  onSelect: (artisan: GlobeArtisan) => void;
  onOpen: (artisan: GlobeArtisan) => void;
  onClose: () => void;
}> = ({ artisan, selected, onSelect, onOpen, onClose }) => {
  const markerRef = useRef<THREE.Group>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const pulsePhase = useRef(Math.random() * Math.PI * 2);
  const worldPosition = useRef(new THREE.Vector3());
  const cameraDirection = useRef(new THREE.Vector3());
  const frontFacingRef = useRef(true);
  const revealLevelRef = useRef(0);
  const [revealLevel, setRevealLevel] = React.useState(0);
  const [isFrontFacing, setIsFrontFacing] = React.useState(true);

  useFrame(({ camera, clock }) => {
    if (!markerRef.current) return;
    markerRef.current.getWorldPosition(worldPosition.current);
    const distance = camera.position.distanceTo(worldPosition.current);
    cameraDirection.current.copy(camera.position).normalize();
    const frontFacing = worldPosition.current.normalize().dot(cameraDirection.current) > 0.08;
    markerRef.current.visible = frontFacing;
    if (frontFacingRef.current !== frontFacing) {
      frontFacingRef.current = frontFacing;
      setIsFrontFacing(frontFacing);
    }
    const zoomAmount = THREE.MathUtils.clamp((8 - distance) / 4.75, 0, 1);
    const markerScale = THREE.MathUtils.lerp(0.62, 1.5, zoomAmount);
    markerRef.current.scale.setScalar(markerScale);
    const nextRevealLevel = zoomAmount >= 0.82 ? 2 : zoomAmount >= 0.62 ? 1 : 0;
    if (revealLevelRef.current !== nextRevealLevel) {
      revealLevelRef.current = nextRevealLevel;
      setRevealLevel(nextRevealLevel);
    }

    if (pulseRef.current) {
      const pulse = (Math.sin(clock.elapsedTime * 1.25 + pulsePhase.current) + 1) / 2;
      pulseRef.current.scale.setScalar(1 + pulse * 0.42);
      const material = pulseRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.08 + pulse * 0.16;
    }
  });

  return (
    <group ref={markerRef}>
      {isFrontFacing && <mesh ref={pulseRef}>
        <ringGeometry args={[0.075, 0.084, 20]} />
        <meshBasicMaterial color={artisan.isPromoted || selected ? '#f59e0b' : '#22d3ee'} transparent opacity={0.12} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>}
      {isFrontFacing && <Html distanceFactor={7} position={[0.16, 0.16, 0]} center pointerEvents="auto">
        <button type="button" className={`artisan-role-signal ${artisan.isPromoted ? 'is-promoted' : ''}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => onSelect(artisan)} aria-label={`Select ${artisan.name}`}>
          {artisan.role === 'tailor' ? <Scissors aria-hidden="true" /> : <SwatchBook aria-hidden="true" />}
        </button>
      </Html>}
      {isFrontFacing && artisan.isPromoted && (
        <Html distanceFactor={6} position={[0, 0.13, 0]} center pointerEvents="auto">
          <button type="button" className="artisan-3d-crown" onPointerDown={(event) => event.stopPropagation()} onClick={() => onSelect(artisan)} aria-label={`${artisan.name} promoted artisan`}>
            <Crown aria-hidden="true" />
          </button>
        </Html>
      )}
      {isFrontFacing && revealLevel >= 1 && artisan.avatarUrl && (
        <Html distanceFactor={3.9} position={[0, 0, 0]} center pointerEvents="auto">
          <button type="button" className={`artisan-3d-avatar ${selected ? 'is-selected' : ''}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => onSelect(artisan)} aria-label={`View ${artisan.name}`}>
            <img src={artisan.avatarUrl} alt="" />
          </button>
        </Html>
      )}
      {isFrontFacing && revealLevel >= 1 && !artisan.avatarUrl && (
        <Html distanceFactor={3.9} position={[0, 0, 0]} center pointerEvents="auto">
          <button type="button" className={`artisan-3d-avatar artisan-3d-initials ${selected ? 'is-selected' : ''}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => onSelect(artisan)} aria-label={`View ${artisan.name}`}>
            {getProfileInitials(artisan.name)}
          </button>
        </Html>
      )}
      {isFrontFacing && revealLevel >= 2 && !selected && (
        <Html distanceFactor={7} position={[0.11, 0.16, 0]} center pointerEvents="auto">
          <button type="button" className="artisan-3d-label" onPointerDown={(event) => event.stopPropagation()} onClick={() => onSelect(artisan)}>
            <strong>{artisan.handle}</strong>
            <small>{artisan.location.city}</small>
          </button>
        </Html>
      )}
      {isFrontFacing && selected && (
        <Html distanceFactor={7} position={[0.11, 0.16, 0]} center pointerEvents="auto">
          <div className="artisan-3d-detail-card" onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" className="artisan-3d-detail-close" onClick={(event) => { event.stopPropagation(); onClose(); }} aria-label="Close seller details">
              <X aria-hidden="true" />
            </button>
            <span className="artisan-3d-detail-heading">
              {artisan.avatarUrl ? <img src={artisan.avatarUrl} alt="" /> : <span>{getProfileInitials(artisan.name)}</span>}
              <strong>{artisan.handle}</strong>
            </span>
            <small>{getRoleLabel(artisan.role)} · {artisan.handle}</small>
            <small>{artisan.location.city}, {artisan.location.state}, {artisan.location.country} · {artisan.postCount} live post{artisan.postCount === 1 ? '' : 's'}</small>
            <button type="button" className="artisan-3d-profile-link" onClick={(event) => { event.stopPropagation(); onOpen(artisan); }}>Open seller profile</button>
          </div>
        </Html>
      )}
    </group>
  );
};

const GlobeScene: React.FC<ArtisanGlobe3DProps> = ({ artisans, selectedArtisanId, onSelectArtisan, onOpenArtisan, onCloseArtisan }) => {
  const globeRef = useRef<THREE.Group>(null);
  const texture = useMemo(() => createMapTexture(), []);
  const gridLines = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const latitude = -75 + index * 25;
      const points = Array.from({ length: 65 }, (_, pointIndex) => toGlobePosition(latitude, -180 + pointIndex * (360 / 64), 2.015));
      return { key: `lat-${latitude}`, points };
    }).concat(Array.from({ length: 12 }, (_, index) => {
      const longitude = -150 + index * 30;
      const points = Array.from({ length: 37 }, (_, pointIndex) => toGlobePosition(-90 + pointIndex * 5, longitude, 2.016));
      return { key: `lng-${longitude}`, points };
    }));
  }, []);

  useFrame((_, delta) => {
    if (globeRef.current) globeRef.current.rotation.y += delta * 0.035;
  });

  return (
    <>
      <ambientLight intensity={1.4} color="#b7f7ff" />
      <directionalLight position={[4, 3, 5]} intensity={3} color="#d9fbff" />
      <pointLight position={[-4, -2, 3]} intensity={9} distance={12} color="#22d3ee" />
      <Stars radius={16} depth={8} count={700} factor={2.1} saturation={0.4} fade speed={0.6} />
      <group ref={globeRef}>
        <mesh>
          <sphereGeometry args={[2, 64, 64]} />
          <meshPhongMaterial map={texture || undefined} color="#b9f7ff" emissive="#062b38" emissiveIntensity={0.45} shininess={28} />
        </mesh>
        <mesh scale={1.012}>
          <sphereGeometry args={[2, 48, 48]} />
          <meshBasicMaterial color="#67e8f9" transparent opacity={0.08} side={THREE.BackSide} blending={THREE.AdditiveBlending} />
        </mesh>
        {gridLines.map((line) => <Line key={line.key} points={line.points} color="#9aeaf2" transparent opacity={0.18} lineWidth={0.5} />)}
        <CurrentBands />
        {artisans.map((artisan) => {
          const lat = Number(artisan.location.lat);
          const lng = Number(artisan.location.lng);
          const position = toGlobePosition(lat, lng, 2.08);
          const selected = selectedArtisanId === artisan.id;
          return (
            <group key={artisan.id} position={position}>
              <ArtisanMarker artisan={artisan} selected={selected} onSelect={onSelectArtisan} onOpen={onOpenArtisan} onClose={onCloseArtisan} />
            </group>
          );
        })}
      </group>
      <OrbitControls enablePan={false} enableDamping dampingFactor={0.08} minDistance={3.25} maxDistance={8} autoRotate autoRotateSpeed={0.18} zoomToCursor rotateSpeed={0.55} zoomSpeed={0.8} touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }} />
    </>
  );
};

export const ArtisanGlobe3D: React.FC<ArtisanGlobe3DProps> = (props) => (
  <div className="artisan-globe-3d" aria-label="Interactive 3D artisan globe">
    <Canvas camera={{ position: [0, 0, 4.35], fov: 42 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <GlobeScene {...props} />
    </Canvas>
    <div className="artisan-globe-3d-hint">Drag to rotate · pinch or wheel to zoom</div>
  </div>
);

export const ArtisanBoard: React.FC<{ artisan: GlobeArtisan; isDarkMode: boolean; onOpen: (artisan: GlobeArtisan) => void }> = ({ artisan, isDarkMode, onOpen }) => (
  <button type="button" onClick={() => onOpen(artisan)} className={`artisan-selected-board w-full text-left ${isDarkMode ? 'border-cyan-400/20 bg-cyan-950/30' : 'border-cyan-700/20 bg-cyan-50'}`}>
    {artisan.avatarUrl ? <img src={artisan.avatarUrl} alt={artisan.name} className="h-14 w-14 rounded-xl object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-cyan-700 text-sm font-bold text-white">{getProfileInitials(artisan.name)}</div>}
    <span className="min-w-0 flex-1">
      <strong className="block truncate">{artisan.name}</strong>
      <span className="block text-xs opacity-70">{getRoleLabel(artisan.role)} · {artisan.handle}</span>
      <span className="block text-xs opacity-70">{artisan.location.city}, {artisan.location.state}, {artisan.location.country}</span>
      <span className="mt-1 block text-[10px] uppercase tracking-[0.16em] text-cyan-500">Open artisan board · {artisan.postCount} live post{artisan.postCount === 1 ? '' : 's'}</span>
    </span>
  </button>
);
