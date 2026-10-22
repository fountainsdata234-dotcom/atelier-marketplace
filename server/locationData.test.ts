import { describe, expect, it } from 'vitest';
import { listLocationCountries, listLocationCurrencies, listLocationRegions, resolveMapLocation, searchLocationCities } from './locationData.js';

describe('location API catalog', () => {
  it('provides the full country list with accurate current country currency defaults', () => {
    const countries = listLocationCountries();
    const countryByCode = new Map(countries.map(country => [country.code, country]));

    expect(countries).toHaveLength(250);
    expect(countryByCode.get('NG')).toMatchObject({ name: 'Nigeria', currency: 'NGN' });
    expect(countryByCode.get('BG')?.currency).toBe('EUR');
    expect(countryByCode.get('HR')?.currency).toBe('EUR');
    expect(countryByCode.get('AQ')?.currency).toBeNull();
  });

  it('returns linked Nigerian states and searchable cities', () => {
    const abia = listLocationRegions('NG')?.find(region => region.name === 'Abia');
    expect(abia?.code).toBe('AB');
    expect(searchLocationCities('NG', 'AB', 'Aba')?.map(city => city.name)).toContain('Aba');
    expect(searchLocationCities('NG', 'LA', 'Aba')).toEqual([]);
  });

  it('provides a broad current currency catalog and rejects unknown location codes', () => {
    const currencyCodes = new Set(listLocationCurrencies().map(currency => currency.code));
    expect(currencyCodes.size).toBeGreaterThanOrEqual(150);
    expect(['NGN', 'USD', 'EUR', 'MRU', 'SLE', 'STN', 'VES', 'XCG', 'ZWG'].every(code => currencyCodes.has(code))).toBe(true);
    expect(['AAD', 'ANG', 'BGN', 'HRK', 'MRO', 'SLL', 'STD', 'VEF', 'ZWL'].some(code => currencyCodes.has(code))).toBe(false);
    expect(listLocationRegions('NOT_A_COUNTRY')).toBeNull();
    expect(searchLocationCities('NG', 'NOT_A_STATE', 'Aba')).toBeNull();
  });

  it('resolves approximate map coordinates on the server without shipping the location catalog to clients', () => {
    expect(resolveMapLocation({
      country: 'Nigeria',
      countryCode: 'NG',
      state: 'LA',
      city: 'Lagos',
    })).toMatchObject({
      country: 'Nigeria',
      countryCode: 'NG',
      city: 'Lagos',
      lat: expect.any(Number),
      lng: expect.any(Number),
    });
    expect(resolveMapLocation({
      country: 'Unknown',
      state: '',
      city: '',
    })).toBeNull();
  });

  it('prioritizes saved coordinates over city-level estimates', () => {
    expect(resolveMapLocation({
      country: 'Nigeria',
      countryCode: 'NG',
      state: 'LA',
      city: 'Lagos',
      lat: 6.5244,
      lng: 3.3792,
    })).toMatchObject({
      lat: 6.5244,
      lng: 3.3792,
    });
  });
});
