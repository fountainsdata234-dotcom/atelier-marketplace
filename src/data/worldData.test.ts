import { describe, expect, it } from 'vitest';
import { findCountryStateCity, resolveLocationCoordinates, resolveSellerMapLocation, WORLD_COUNTRIES } from './worldData';

describe('world location reference data', () => {
  it('provides country, state, and city suggestions from the full CSC dataset', () => {
    expect(WORLD_COUNTRIES.length).toBeGreaterThanOrEqual(200);
    expect(WORLD_COUNTRIES.find(country => country.code === 'NG')?.name).toBe('Nigeria');
    expect(WORLD_COUNTRIES.find(country => country.code === 'NG')?.states.find(state => state.name === 'Lagos')?.cities).toContain('Ikeja');
  });

  it('rejects city names that do not belong to the selected state', () => {
    expect(findCountryStateCity('NG', 'LA', 'Ikeja')?.state?.name).toBe('Lagos');
    expect(findCountryStateCity('NG', 'LA', 'Kano')).toBeNull();
    expect(findCountryStateCity('NG', 'INVALID', 'Ikeja')).toBeNull();
  });

  it('resolves seller pins to city coordinates instead of country or state centroids', () => {
    const coordinates = resolveLocationCoordinates('NG', 'Lagos', 'Ikeja', { lat: 9.082, lng: 8.6753 });
    expect(coordinates.lat).toBeCloseTo(6.59651, 4);
    expect(coordinates.lng).toBeCloseTo(3.34205, 4);

    const sellerLocation = resolveSellerMapLocation({
      country: 'Nigeria',
      countryCode: 'NG',
      state: 'Lagos',
      city: 'Ikeja',
      lat: 9.082,
      lng: 8.6753,
    });
    expect(sellerLocation?.lat).toBeCloseTo(6.59651, 4);
    expect(sellerLocation?.lng).toBeCloseTo(3.34205, 4);
  });
});
