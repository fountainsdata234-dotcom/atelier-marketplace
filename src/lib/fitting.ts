import { z } from 'zod';

export const MeasurementSchema = z.object({
  gender: z.enum(['male', 'female']).default('male'),
  height: z.number().min(140).max(220).default(175),
  chest: z.number().min(70).max(170).default(102),
  waist: z.number().min(60).max(160).default(88),
  hip: z.number().min(70).max(190).default(100),
  shoulder: z.number().min(30).max(80).default(45),
  armLength: z.number().min(42).max(90).default(62),
  bust: z.number().min(70).max(180).default(96),
  thigh: z.number().min(30).max(100).default(56),
  neck: z.number().min(20).max(60).default(38),
});

export type MeasurementInput = z.infer<typeof MeasurementSchema>;

export const normalizeMeasurement = (value: number, min: number, max: number) => {
  const clamped = Math.min(Math.max(value, min), max);
  return (clamped - min) / (max - min);
};

export const createFitSummary = (measurements: Partial<MeasurementInput>) => ({
  chest: measurements.chest ? 'Good fit' : 'Set chest',
  waist: measurements.waist ? 'Good fit' : 'Set waist',
  shoulder: measurements.shoulder ? 'Good fit' : 'Set shoulders',
});
