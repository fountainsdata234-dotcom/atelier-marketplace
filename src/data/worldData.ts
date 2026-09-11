import { City, Country, State } from 'country-state-city';
import { CountryGeo } from '../types';

const countries = Country.getAllCountries();

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