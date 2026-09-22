import { describe, expect, it } from 'vitest';
import { getDefaultLocationFilter, matchesLocationFilter } from './artisanFilters';

describe('artisan location filtering', () => {
  it('hides sellers outside the selected country even when their name matches the search', () => {
    const artisan = {
      id: 'seller-1',
      name: 'Adewale Textiles',
      handle: '@adewale',
      role: 'fabric_seller',
      location: {
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        countryCode: 'NG',
        lat: 6.5244,
        lng: 3.3792,
      },
    };

    expect(matchesLocationFilter(artisan as any, 'NG', 'all', 'all')).toBe(true);
    expect(matchesLocationFilter(artisan as any, 'US', 'all', 'all')).toBe(false);
  });

  it('respects state and city filters when a country is already selected', () => {
    const artisan = {
      id: 'seller-2',
      name: 'Satin House',
      handle: '@satin',
      role: 'tailor',
      location: {
        city: 'Accra',
        state: 'Greater Accra',
        country: 'Ghana',
        countryCode: 'GH',
        lat: 5.6037,
        lng: -0.1870,
      },
    };

    expect(matchesLocationFilter(artisan as any, 'GH', 'all', 'all')).toBe(true);
    expect(matchesLocationFilter(artisan as any, 'GH', 'GH-01', 'all')).toBe(false);
    expect(matchesLocationFilter(artisan as any, 'GH', 'GH-01', 'Accra')).toBe(false);
  });

  it('defaults the globe country filter to the current user\'s country when available', () => {
    expect(getDefaultLocationFilter({ country: 'Nigeria', countryCode: 'NG', state: 'Lagos', city: 'Lagos' })).toBe('NG');
    expect(getDefaultLocationFilter({ country: 'United States', state: 'California', city: 'Los Angeles' })).toBe('United States');
    expect(getDefaultLocationFilter(null)).toBe('all');
  });
});
