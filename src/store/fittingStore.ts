import { create } from 'zustand';

export type Gender = 'male' | 'female';
export type FitStatus = 'Too tight' | 'Fitted' | 'Comfortable' | 'Loose' | 'Too loose';

export interface MeasurementSet {
  height: number;
  chest: number;
  waist: number;
  hip: number;
  shoulder: number;
  armLength: number;
  bust?: number;
  thigh?: number;
  neck?: number;
}

export interface FittingRoomState {
  selectedGender: Gender;
  measurements: MeasurementSet;
  garmentVisible: boolean;
  showMeasurements: boolean;
  garmentColor: string;
  fabricName: string;
  fitStatus: FitStatus;
  isSimulating: boolean;
  setGender: (gender: Gender) => void;
  updateMeasurement: (key: keyof MeasurementSet, value: number) => void;
  updateMeasurements: (measurements: Partial<MeasurementSet>) => void;
  toggleGarmentVisibility: () => void;
  toggleMeasurementOverlay: () => void;
  setGarmentColor: (color: string) => void;
  setFabricName: (fabric: string) => void;
  startSimulation: () => void;
  stopSimulation: () => void;
  resetMeasurements: () => void;
  resetFittingRoom: () => void;
  analyzeFit: () => void;
}

const baseMeasurements: Record<Gender, MeasurementSet> = {
  male: {
    height: 175,
    chest: 102,
    waist: 88,
    hip: 100,
    shoulder: 45,
    armLength: 62,
    neck: 38,
    thigh: 56,
  },
  female: {
    height: 168,
    chest: 96,
    waist: 76,
    hip: 100,
    shoulder: 40,
    armLength: 60,
    bust: 96,
    thigh: 54,
    neck: 34,
  },
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const calculateFitStatus = (measurements: MeasurementSet): FitStatus => {
  const chestRatio = Math.abs(measurements.chest - 102) / 22;
  const waistRatio = Math.abs(measurements.waist - 88) / 18;
  const shoulderRatio = Math.abs(measurements.shoulder - 45) / 12;

  const score = (chestRatio + waistRatio + shoulderRatio) / 3;

  if (score > 1.05) return 'Too loose';
  if (score > 0.7) return 'Loose';
  if (score > 0.3) return 'Fitted';
  if (score > 0.15) return 'Comfortable';
  return 'Too tight';
};

export const useFittingStore = create<FittingRoomState>((set, get) => ({
  selectedGender: 'male',
  measurements: { ...baseMeasurements.male },
  garmentVisible: true,
  showMeasurements: false,
  garmentColor: '#5fa8ff',
  fabricName: 'Cotton',
  fitStatus: 'Fitted',
  isSimulating: false,

  setGender: (gender) => {
    set({
      selectedGender: gender,
      measurements: { ...baseMeasurements[gender] },
      fitStatus: 'Fitted',
    });
  },

  updateMeasurement: (key, value) => {
    const nextValue = clamp(value, 0, 300);
    set((state) => {
      const measurements = { ...state.measurements, [key]: nextValue };
      return { measurements, fitStatus: calculateFitStatus(measurements) };
    });
  },

  updateMeasurements: (measurements) => {
    set((state) => {
      const nextMeasurements = { ...state.measurements, ...measurements };
      return { measurements: nextMeasurements, fitStatus: calculateFitStatus(nextMeasurements) };
    });
  },

  toggleGarmentVisibility: () => set((state) => ({ garmentVisible: !state.garmentVisible })),
  toggleMeasurementOverlay: () => set((state) => ({ showMeasurements: !state.showMeasurements })),
  setGarmentColor: (garmentColor) => set({ garmentColor }),
  setFabricName: (fabricName) => set({ fabricName }),
  startSimulation: () => set({ isSimulating: true }),
  stopSimulation: () => set({ isSimulating: false }),
  resetMeasurements: () => {
    const gender = get().selectedGender;
    const nextMeasurements = { ...baseMeasurements[gender] };
    set({ measurements: nextMeasurements, fitStatus: calculateFitStatus(nextMeasurements) });
  },
  resetFittingRoom: () => {
    set({
      selectedGender: 'male',
      measurements: { ...baseMeasurements.male },
      garmentVisible: true,
      showMeasurements: false,
      garmentColor: '#d97706',
      fabricName: 'Cotton',
      fitStatus: 'Fitted',
      isSimulating: false,
    });
  },
  analyzeFit: () => {
    set((state) => ({ fitStatus: calculateFitStatus(state.measurements) }));
  },
}));

export const measurementConfig = {
  height: { label: 'Height', unit: 'cm', min: 140, max: 220, step: 1 },
  chest: { label: 'Chest', unit: 'cm', min: 70, max: 170, step: 1 },
  waist: { label: 'Waist', unit: 'cm', min: 60, max: 160, step: 1 },
  hip: { label: 'Hip', unit: 'cm', min: 70, max: 190, step: 1 },
  shoulder: { label: 'Shoulder', unit: 'cm', min: 30, max: 80, step: 1 },
  armLength: { label: 'Arm', unit: 'cm', min: 42, max: 90, step: 1 },
  bust: { label: 'Bust', unit: 'cm', min: 70, max: 180, step: 1 },
  thigh: { label: 'Thigh', unit: 'cm', min: 30, max: 100, step: 1 },
  neck: { label: 'Neck', unit: 'cm', min: 20, max: 60, step: 1 },
};
