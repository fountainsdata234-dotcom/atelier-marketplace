import { describe, expect, it } from 'vitest';
import { createGlobeSignalPoints } from './globeSignals';

describe('globe signal points', () => {
  it('generates deterministic signal locations distributed around the sphere', () => {
    const first = createGlobeSignalPoints(32, 1234);
    const second = createGlobeSignalPoints(32, 1234);

    expect(first).toEqual(second);
    expect(first).toHaveLength(32);
    expect(first.some(point => point.lat > 45)).toBe(true);
    expect(first.some(point => point.lat < -45)).toBe(true);
    expect(first.some(point => point.lng < -90)).toBe(true);
    expect(first.some(point => point.lng > 90)).toBe(true);
    expect(first.every(point => point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180)).toBe(true);
  });

  it('supports an empty map and rejects invalid signal counts', () => {
    expect(createGlobeSignalPoints(0)).toEqual([]);
    expect(() => createGlobeSignalPoints(-1)).toThrow(RangeError);
    expect(() => createGlobeSignalPoints(1.5)).toThrow(RangeError);
  });
});
