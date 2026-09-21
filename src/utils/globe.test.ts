import { describe, expect, it } from 'vitest';
import { getMarkerScatterOffset, getSearchSuggestions } from './globe';

describe('globe helpers', () => {
  it('keeps nearby seller markers slightly apart', () => {
    const offsets = Array.from({ length: 5 }, (_, index) => getMarkerScatterOffset(6.5244, 3.3792, index, 5));
    const distances = offsets.map((offset) => Math.hypot(offset.x, offset.y, offset.z));
    const minDistance = Math.min(...distances);

    expect(minDistance).toBeGreaterThan(0.06);
    expect(offsets.every((offset) => Math.abs(offset.x) + Math.abs(offset.y) + Math.abs(offset.z) > 0)).toBe(true);
  });

  it('surfaces handle and name matches while typing', () => {
    const artisans = [
      { id: 'a1', name: 'Adewale Atelier', handle: '@adewale', location: { city: 'Lagos', state: 'Lagos', country: 'Nigeria', countryCode: 'NG', lat: 6.5244, lng: 3.3792 } },
      { id: 'a2', name: 'Dana Silk Co', handle: '@dana', location: { city: 'Cairo', state: 'Cairo', country: 'Egypt', countryCode: 'EG', lat: 30.0444, lng: 31.2357 } },
    ] as any[];

    const matches = getSearchSuggestions(artisans, 'dana');
    expect(matches[0].id).toBe('a2');
    expect(matches[0].handle).toBe('@dana');

    const names = getSearchSuggestions(artisans, 'ade');
    expect(names[0].name).toBe('Adewale Atelier');
  });
});
