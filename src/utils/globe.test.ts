import { describe, expect, it } from 'vitest';
import { getScatterOffsetsForLocations, getSearchSuggestions } from './globe';

describe('globe helpers', () => {
  it('keeps nearby seller markers from overlapping one another', () => {
    const points = Array.from({ length: 5 }, () => ({ lat: 6.5244, lng: 3.3792 }));
    const offsets = getScatterOffsetsForLocations(points, 0.18);
    const pairDistances = [] as number[];

    for (let index = 0; index < offsets.length; index += 1) {
      for (let compareIndex = index + 1; compareIndex < offsets.length; compareIndex += 1) {
        pairDistances.push(Math.hypot(
          offsets[index].x - offsets[compareIndex].x,
          offsets[index].y - offsets[compareIndex].y,
          offsets[index].z - offsets[compareIndex].z,
        ));
      }
    }

    expect(pairDistances.length).toBeGreaterThan(0);
    expect(Math.min(...pairDistances)).toBeGreaterThan(0.18);
    expect(offsets.every((offset) => Math.abs(offset.x) + Math.abs(offset.y) + Math.abs(offset.z) > 0)).toBe(true);
  });

  it('keeps marker offsets stable when artisan order changes', () => {
    const firstOrder = [
      { lat: 6.5244, lng: 3.3792 },
      { lat: 30.0444, lng: 31.2357 },
      { lat: -1.2864, lng: 36.8172 },
    ];
    const secondOrder = [...firstOrder].reverse();

    const firstOffsets = getScatterOffsetsForLocations(firstOrder, 0.18);
    const secondOffsets = getScatterOffsetsForLocations(secondOrder, 0.18);

    expect(firstOffsets).toHaveLength(secondOffsets.length);
    expect(firstOffsets[0]).toEqual(secondOffsets[2]);
    expect(firstOffsets[1]).toEqual(secondOffsets[1]);
    expect(firstOffsets[2]).toEqual(secondOffsets[0]);
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
