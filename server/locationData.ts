import { City, Country, State } from 'country-state-city';
import type { LocationCity, LocationCountry, LocationCurrency, LocationRegion } from '../src/types.js';

const currencyOverrides: Record<string, string | null> = {
  AQ: null,
  BG: 'EUR',
  CW: 'XCG',
  HR: 'EUR',
  MR: 'MRU',
  SI: 'EUR',
  SL: 'SLE',
  SX: 'XCG',
  ST: 'STN',
  VE: 'VES',
  ZW: 'ZWG',
};

const obsoleteCurrencies = new Set([
  'AAD', 'ANG', 'BGN', 'CUC', 'HRK', 'MRO', 'SLL', 'STD', 'SVC',
  'VEF', 'XDR', 'XSU', 'ZWL',
]);

const countryList = Country.getAllCountries();
const countries: LocationCountry[] = countryList
  .map(country => ({
    name: country.name,
    code: country.isoCode,
    dialCode: `+${country.phonecode}`,
    flag: country.flag,
    currency: Object.hasOwn(currencyOverrides, country.isoCode)
      ? currencyOverrides[country.isoCode]
      : country.currency || null,
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

const displayNames = new Intl.DisplayNames(['en'], { type: 'currency' });
const currencyCodes = new Set(
  Intl.supportedValuesOf('currency').filter(code => !obsoleteCurrencies.has(code)),
);
countries.forEach(country => {
  if (country.currency) currencyCodes.add(country.currency);
});

const currencies: LocationCurrency[] = [...currencyCodes]
  .sort()
  .map(code => ({ code, name: displayNames.of(code) || code }));

const normalize = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const countryByCode = new Map(countryList.map(country => [country.isoCode.toUpperCase(), country]));
const parseCoordinate = (value: string | null | undefined, minimum: number, maximum: number) => {
  if (!value?.trim()) return undefined;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : undefined;
};

export function listLocationCountries() {
  return countries;
}

export function listLocationCurrencies() {
  return currencies;
}

export function listLocationRegions(countryCode: string): LocationRegion[] | null {
  const country = countryByCode.get(countryCode.trim().toUpperCase());
  if (!country) return null;
  const regions = State.getStatesOfCountry(country.isoCode)
    .map(state => ({ code: state.isoCode, name: state.name }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return regions.length ? regions : [{ code: 'ALL', name: 'All regions' }];
}

export function searchLocationCities(countryCode: string, regionCode: string, query: string): LocationCity[] | null {
  const country = countryByCode.get(countryCode.trim().toUpperCase());
  if (!country) return null;

  const regions = State.getStatesOfCountry(country.isoCode);
  const normalizedRegionCode = regionCode.trim().toUpperCase();
  const region = regions.find(candidate => candidate.isoCode.toUpperCase() === normalizedRegionCode);
  const isAllRegions = normalizedRegionCode === 'ALL' && regions.length === 0;
  if (!region && !isAllRegions) return null;

  const normalizedQuery = normalize(query);
  const cityList = (region
    ? City.getCitiesOfState(country.isoCode, region.isoCode)
    : City.getCitiesOfCountry(country.isoCode)) || [];

  return cityList
    .filter(city => !normalizedQuery || normalize(city.name).includes(normalizedQuery))
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, 100)
    .map(city => {
      const latitude = parseCoordinate(city.latitude, -90, 90);
      const longitude = parseCoordinate(city.longitude, -180, 180);
      return {
        name: city.name,
        ...(latitude !== undefined ? { latitude } : {}),
        ...(longitude !== undefined ? { longitude } : {}),
      };
    });
}
