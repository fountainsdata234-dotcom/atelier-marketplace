import React, { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ArrowLeft, RotateCw, ZoomIn, Sparkles, RefreshCw, Save, Gauge, Ruler, Move3d, Eye, EyeOff } from 'lucide-react';
import { useFittingStore } from '../store/fittingStore';

type FittingRoomProps = {
  onBack: () => void;
  garmentTitle?: string;
};

const fabricPalette = ['#d97706', '#f59e0b', '#f97316', '#ef4444', '#7c3aed', '#1f2937'];

function AvatarModel() {
  const {
    selectedGender,
    measurements,
    garmentVisible,
    showMeasurements,
    garmentColor,
    isSimulating,
  } = useFittingStore();

  const avatarRef = useRef<THREE.Group>(null);
  const avatarModel = useLoader(FBXLoader, '/3d/avatars/male/fabric-male.fbx');

  const model = useMemo(() => {
    if (!avatarModel) return null;

    const root = avatarModel.clone(true);
    root.name = selectedGender === 'male' ? 'fabric-male-avatar' : 'fabric-female-avatar';
    root.scale.setScalar(0.0125);
    root.position.set(0, -1.85, 0);
    root.rotation.y = selectedGender === 'female' ? -0.4 : 0.35;

    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      child.castShadow = true;
      child.receiveShadow = true;

      const materialList = Array.isArray(child.material) ? child.material : [child.material];
      materialList.forEach((material) => {
        if (!(material instanceof THREE.MeshStandardMaterial)) return;

        material.roughness = 0.8;
        material.metalness = 0.08;
        material.envMapIntensity = 1.2;
        material.needsUpdate = true;
      });
    });

    return root;
  }, [avatarModel, selectedGender]);

  useFrame((state) => {
    if (!avatarRef.current) return;
    avatarRef.current.rotation.y = THREE.MathUtils.lerp(
      avatarRef.current.rotation.y,
      (Math.sin(state.clock.elapsedTime * 0.5) * 0.18) + (selectedGender === 'female' ? -0.08 : 0.18),
      0.05,
    );
  });

  return (
    <group ref={avatarRef} position={[0, 0, 0]}>
      {model && <primitive object={model} />}

      {garmentVisible && (
        <group position={[0, 1.08, 0.05]} scale={[0.96 + measurements.chest / 220, 1 + measurements.height / 620, 0.96]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[1.65, 2.25, 0.85]} />
            <meshStandardMaterial color={garmentColor} roughness={0.9} metalness={0.04} />
          </mesh>
        </group>
      )}

      {showMeasurements && (
        <group>
          <mesh position={[0, 2.45, 0.01]}>
            <ringGeometry args={[0.9, 1.12, 48]} />
            <meshBasicMaterial color="#7dd3fc" transparent opacity={0.46} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0.45, 0.02]}>
            <torusGeometry args={[1.35, 0.03, 12, 80]} />
            <meshBasicMaterial color="#8b5cf6" transparent opacity={0.45} />
          </mesh>
        </group>
      )}

      {isSimulating && (
        <mesh position={[0, 1.1, 1.4]}>
          <torusGeometry args={[1.56, 0.045, 12, 120]} />
          <meshBasicMaterial color="#fff7d6" transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}

function Scene() {
  const { selectedGender } = useFittingStore();

  return (
    <>
      <color attach="background" args={[selectedGender === 'male' ? '#fff4dc' : '#fff1eb']} />
      <fog attach="fog" args={[selectedGender === 'male' ? '#fff4dc' : '#fff1eb', 6, 16]} />

      <ambientLight intensity={0.7} />
      <hemisphereLight args={[selectedGender === 'male' ? '#ffe7b8' : '#ffd4c2', '#f4e7d5', 1.18]} />
      <directionalLight position={[3, 5, 4]} intensity={1.7} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <directionalLight position={[-4, 3, -3]} intensity={0.85} color="#fff3dd" />
      <spotLight position={[0, 6, 4]} angle={0.35} penumbra={0.8} intensity={25} color={selectedGender === 'male' ? '#f7c76a' : '#f9a66b'} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.07, 0]} receiveShadow>
        <circleGeometry args={[5.2, 64]} />
        <meshStandardMaterial color="#edf2f8" roughness={1} />
      </mesh>

      <AvatarModel />
      <OrbitControls enablePan enableZoom minDistance={4} maxDistance={9} target={[0, 0.6, 0]} />
    </>
  );
}

export const FittingRoom: React.FC<FittingRoomProps> = ({ onBack, garmentTitle = 'Classic Senator' }) => {
  const {
    selectedGender,
    measurements,
    garmentColor,
    garmentVisible,
    showMeasurements,
    fitStatus,
    isSimulating,
    setGender,
    updateMeasurement,
    toggleGarmentVisibility,
    toggleMeasurementOverlay,
    setGarmentColor,
    startSimulation,
    stopSimulation,
    resetMeasurements,
    analyzeFit,
  } = useFittingStore();

  const [activeTab, setActiveTab] = useState<'body' | 'fabric' | 'fit'>('body');

  const reading = useMemo(() => [
    { label: 'Height', value: measurements.height },
    { label: 'Chest', value: measurements.chest },
    { label: 'Waist', value: measurements.waist },
    { label: 'Hip', value: measurements.hip },
    { label: 'Shoulder', value: measurements.shoulder },
    { label: 'Arm', value: measurements.armLength },
  ], [measurements]);

  const handleFabricSelect = (nextColor: string) => {
    setGarmentColor(nextColor);
  };

  const handleSimulateClick = () => {
    if (!isSimulating) {
      startSimulation();
      setTimeout(() => {
        stopSimulation();
        analyzeFit();
      }, 1200);
      return;
    }
    stopSimulation();
  };

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-3 pb-6 pt-4 md:px-6 lg:px-8">
        <header className="flex items-center justify-between rounded-[22px] border border-slate-200 bg-white/80 px-3 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur-md md:px-5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 transition hover:border-amber-300 hover:text-amber-700"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Marketplace</span>
          </button>

          <div className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-600">Virtual fit estimate</p>
            <h1 className="text-base font-semibold md:text-xl">{garmentTitle}</h1>
          </div>

          <button
            type="button"
            onClick={resetMeasurements}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1.6fr_0.9fr]">
          <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setGender('male')}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    selectedGender === 'male' ? 'bg-amber-600 text-white' : 'bg-white text-slate-600'
                  }`}
                >
                  Male
                </button>
                <button
                  type="button"
                  onClick={() => setGender('female')}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    selectedGender === 'female' ? 'bg-pink-500 text-white' : 'bg-white text-slate-600'
                  }`}
                >
                  Female
                </button>
              </div>

              <div className="flex items-center gap-2 text-slate-500">
                <button type="button" onClick={() => toggleGarmentVisibility()} className="rounded-full border border-slate-200 bg-white p-2 transition hover:border-amber-300 hover:text-amber-600" aria-label="Toggle garment visibility">
                  {garmentVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button type="button" onClick={toggleMeasurementOverlay} className="rounded-full border border-slate-200 bg-white p-2 transition hover:border-amber-300 hover:text-amber-600" aria-label="Toggle measurement guide">
                  <Ruler className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="relative h-[420px] md:h-[560px]">
              <Canvas
                shadows
                dpr={[1, 1.8]}
                camera={{ position: [0, 1.45, 5.8], fov: 28, near: 0.1, far: 40 }}
              >
                <Suspense fallback={<Html center><div className="rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-slate-600 shadow-lg">Loading digital mannequin…</div></Html>}>
                  <Scene />
                </Suspense>
              </Canvas>

              <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 md:inset-x-4 md:bottom-4">
                <div className="pointer-events-auto rounded-full border border-white/50 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-lg backdrop-blur-sm">
                  {fitStatus}
                </div>
                <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/50 bg-white/80 p-1.5 shadow-lg backdrop-blur-sm">
                  <button type="button" className="rounded-full bg-slate-900 p-2 text-white" aria-label="Rotate view">
                    <RotateCw className="h-4 w-4" />
                  </button>
                  <button type="button" className="rounded-full bg-slate-100 p-2 text-slate-700" aria-label="Zoom view">
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button type="button" className="rounded-full bg-slate-100 p-2 text-slate-700" aria-label="Toggle move view">
                    <Move3d className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <aside className="rounded-[30px] border border-slate-200 bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.06)] md:p-4">
            <div className="mb-4 flex items-center gap-2 rounded-2xl bg-slate-100 p-1.5">
              {(['body', 'fabric', 'fit'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                    activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === 'body' && (
              <div className="space-y-3">
                {Object.entries(measurements).map(([key, value]) => {
                  const config = {
                    height: { label: 'Height', min: 140, max: 220 },
                    chest: { label: 'Chest', min: 70, max: 170 },
                    waist: { label: 'Waist', min: 60, max: 160 },
                    hip: { label: 'Hip', min: 70, max: 190 },
                    shoulder: { label: 'Shoulder', min: 30, max: 80 },
                    armLength: { label: 'Arm', min: 42, max: 90 },
                    bust: { label: 'Bust', min: 70, max: 180 },
                    thigh: { label: 'Thigh', min: 30, max: 100 },
                    neck: { label: 'Neck', min: 20, max: 60 },
                  }[key as keyof typeof measurements];

                  if (!config) return null;

                  return (
                    <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        <span>{config.label}</span>
                        <span className="text-slate-900">{value} cm</span>
                      </div>
                      <input
                        type="range"
                        min={config.min}
                        max={config.max}
                        value={value}
                        onChange={(event) => updateMeasurement(key as keyof typeof measurements, Number(event.target.value))}
                        className="h-2 w-full accent-amber-600"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'fabric' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Fabric</p>
                  <div className="flex flex-wrap gap-2">
                    {fabricPalette.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => handleFabricSelect(color)}
                        className={`h-8 w-8 rounded-full border-2 transition ${
                          garmentColor === color ? 'border-slate-900 scale-110' : 'border-white'
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Smart fit</p>
                  <div className="flex items-center justify-between rounded-xl bg-white p-3">
                    <span className="text-sm font-medium text-slate-700">Cotton Blend</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">Comfortable</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'fit' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-emerald-700">
                    <Gauge className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-[0.18em]">Fit analysis</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{fitStatus}</p>
                  <p className="mt-2 text-sm text-slate-600">Use the measurements as a guide. Your tailor may request additional measurements.</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Body snapshot</p>
                  <div className="space-y-2 text-sm text-slate-700">
                    {reading.map((item) => (
                      <div key={item.label} className="flex items-center justify-between border-b border-slate-200 pb-1 last:border-b-0 last:pb-0">
                        <span>{item.label}</span>
                        <span className="font-medium text-slate-900">{item.value} cm</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={handleSimulateClick}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:from-amber-400 hover:to-orange-400"
              >
                <Sparkles className="h-4 w-4" />
                {isSimulating ? 'Fitting garment...' : 'Simulate fit'}
              </button>

              <button type="button" className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300">
                <Save className="h-4 w-4" />
                Save fit profile
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default FittingRoom;
