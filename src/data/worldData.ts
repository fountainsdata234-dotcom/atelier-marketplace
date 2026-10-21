import { City, Country, State } from 'country-state-city';
import { CountryGeo, UserLocation } from '../types';

const countries = Country.getAllCountries();
const locationCoordinateCache = new Map<string, { lat: number; lng: number }>();
const normalizeLocationName = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const parseCoordinate = (value: string | null | undefined): number | null => {
  if (!value?.trim()) return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
};
const hasValidCoordinates = (location: { lat?: number; lng?: number }): location is { lat: number; lng: number } => (
  typeof location.lat === 'number' && Number.isFinite(location.lat) && location.lat >= -90 && location.lat <= 90
  && typeof location.lng === 'number' && Number.isFinite(location.lng) && location.lng >= -180 && location.lng <= 180
);

export const WORLD_COUNTRIES: CountryGeo[] = countries.map((country) => {
  const countryStates = State.getStatesOfCountry(country.isoCode);
  const states = countryStates.length > 0 ? countryStates.map((state) => ({
    code: state.isoCode,
    name: state.name,
    cities: City.getCitiesOfState(country.isoCode, state.isoCode).map((city) => city.name),
  })) : [{
    code: 'ALL',
    name: 'All regions',
    cities: City.getCitiesOfCountry(country.isoCode).map((city) => city.name),
  }];

  return {
    name: country.name,
    code: country.isoCode,
    dialCode: `+${country.phonecode}`,
    flag: country.flag,
    currency: country.currency || 'USD',
    lat: Number(country.latitude) || 0,
    lng: Number(country.longitude) || 0,
    states,
  };
});

export function getCountryByCode(code: string) {
  return countries.find((country) => country.isoCode === code);
}

export function getCountryByName(name: string) {
  return countries.find((country) => country.name === name);
}

export function getStatesForCountry(countryCode: string) {
  return State.getStatesOfCountry(countryCode);
}

export function getCitiesForState(countryCode: string, stateCode: string) {
  return City.getCitiesOfState(countryCode, stateCode);
}

export function findCountryStateCity(countryCode: string, stateCode: string, cityName: string) {
  const country = Country.getCountryByCode(countryCode);
  const normalizedStateCode = stateCode.trim();
  const isAllRegions = normalizedStateCode.toUpperCase() === 'ALL';
  const state = State.getStatesOfCountry(countryCode).find(candidate => (
    candidate.isoCode.toLowerCase() === normalizedStateCode.toLowerCase()
    || normalizeLocationName(candidate.name) === normalizeLocationName(normalizedStateCode)
  ));
  if (!country || (!state && !isAllRegions)) return null;
  const cities = state
    ? City.getCitiesOfState(country.isoCode, state.isoCode)
    : City.getCitiesOfCountry(country.isoCode);
  const city = cities
    .find(candidate => normalizeLocationName(candidate.name) === normalizeLocationName(cityName));
  return city ? { country, state, city } : null;
}

export function resolveLocationCoordinates(countryCode: string, stateCode: string, cityName: string, fallback: { lat: number; lng: number }) {
  const cacheKey = `${countryCode}:${stateCode}:${normalizeLocationName(cityName)}`;
  const cached = locationCoordinateCache.get(cacheKey);
  if (cached) return cached;

  const selected = findCountryStateCity(countryCode, stateCode, cityName);
  const matchedState = State.getStatesOfCountry(countryCode).find(candidate => (
    candidate.isoCode.toLowerCase() === stateCode.trim().toLowerCase()
    || normalizeLocationName(candidate.name) === normalizeLocationName(stateCode)
  ));
  const sources = [
    selected?.city,
    selected?.state ?? matchedState,
    selected?.country ?? Country.getCountryByCode(countryCode),
  ];
  const source = sources.find(candidate => (
    parseCoordinate(candidate?.latitude) !== null && parseCoordinate(candidate?.longitude) !== null
  ));
  const coordinates = source
    ? { lat: parseCoordinate(source.latitude)!, lng: parseCoordinate(source.longitude)! }
    : fallback;
  locationCoordinateCache.set(cacheKey, coordinates);
  return coordinates;
}

export function resolveSellerMapLocation(location: UserLocation): UserLocation | null {
  const country = Country.getCountryByCode(location.countryCode || '')
    || getCountryByName(location.country);
  if (!country) return hasValidCoordinates(location) ? location : null;

  const selected = findCountryStateCity(country.isoCode, location.state, location.city);
  const cityLatitude = parseCoordinate(selected?.city.latitude);
  const cityLongitude = parseCoordinate(selected?.city.longitude);
  const coordinates = cityLatitude !== null && cityLongitude !== null
    ? { lat: cityLatitude, lng: cityLongitude }
    : hasValidCoordinates(location)
      ? { lat: location.lat, lng: location.lng }
      : resolveLocationCoordinates(country.isoCode, location.state, location.city, {
        lat: Number(country.latitude) || 0,
        lng: Number(country.longitude) || 0,
      });

  return { ...location, country: country.name, countryCode: country.isoCode, ...coordinates };
}

export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}