import type { CountryGeo } from '../types';
import * as countryStateCity from 'country-state-city';

const fallbackWorldCountries: CountryGeo[] = [
  {
    name: 'Nigeria',
    code: 'NG',
    dialCode: '+234',
    flag: '🇳🇬',
    lat: 9.082,
    lng: 8.6753,
    states: [
      { name: 'Lagos', cities: ['Ikeja', 'Victoria Island', 'Lekki', 'Surulere', 'Yaba', 'Ikoyi'] },
      { name: 'Abuja (FCT)', cities: ['Garki', 'Wuse', 'Maitama', 'Asokoro', 'Gwarinpa', 'Jabi'] },
      { name: 'Rivers', cities: ['Port Harcourt', 'Obio-Akpor', 'Bonny', 'Eleme'] },
      { name: 'Oyo', cities: ['Ibadan', 'Ogbomosho', 'Oyo', 'Iseyin'] },
      { name: 'Kano', cities: ['Kano Municipal', 'Fagge', 'Dala', 'Gwale'] }
    ]
  },
  {
    name: 'United States',
    code: 'US',
    dialCode: '+1',
    flag: '🇺🇸',
    lat: 37.0902,
    lng: -95.7129,
    states: [
      { name: 'California', cities: ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose'] },
      { name: 'New York', cities: ['New York City', 'Brooklyn', 'Queens', 'Buffalo'] },
      { name: 'Texas', cities: ['Houston', 'Dallas', 'Austin', 'San Antonio'] },
      { name: 'Florida', cities: ['Miami', 'Orlando', 'Tampa', 'Fort Lauderdale'] }
    ]
  },
  {
    name: 'United Kingdom',
    code: 'GB',
    dialCode: '+44',
    flag: '🇬🇧',
    lat: 55.3781,
    lng: -3.436,
    states: [
      { name: 'England', cities: ['London', 'Manchester', 'Birmingham', 'Leeds'] },
      { name: 'Scotland', cities: ['Edinburgh', 'Glasgow', 'Aberdeen'] },
      { name: 'Wales', cities: ['Cardiff', 'Swansea', 'Newport'] }
    ]
  }
];

const normalizeCityNames = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => typeof item === 'string' ? item : item?.name)
    .filter((name): name is string => Boolean(name && name.trim()));
};

const buildWorldCountries = (): CountryGeo[] => {
  const countryApi = (countryStateCity as any)?.Country;
  const stateApi = (countryStateCity as any)?.State;
  const cityApi = (countryStateCity as any)?.City;

  const countries = typeof countryApi?.getAllCountries === 'function' ? countryApi.getAllCountries() : [];
  if (!Array.isArray(countries) || countries.length === 0) {
    return fallbackWorldCountries;
  }

  return countries
    .filter((country: any) => country && country.name)
    .map((country: any) => {
      const stateList = typeof stateApi?.getStatesOfCountry === 'function'
        ? stateApi.getStatesOfCountry(country.isoCode)
        : [];

      const states = (Array.isArray(stateList) ? stateList : []).map((state: any) => {
        const cityList = typeof cityApi?.getCitiesOfState === 'function'
          ? cityApi.getCitiesOfState(country.isoCode, state.isoCode)
          : [];

        const cityNames = normalizeCityNames(cityList).slice(0, 40);
        const stateName = state?.name || 'Unknown State';
        return {
          name: stateName,
          code: state?.isoCode || stateName,
          cities: cityNames.length > 0 ? cityNames : ['Main City']
        };
      });

      const normalizedStates = states.length > 0
        ? states
        : [{ name: 'Main Region', code: 'main', cities: [country.capital || country.name || 'Main City'] }];

      return {
        name: country.name,
        code: country.isoCode || country.name.slice(0, 2).toUpperCase(),
        dialCode: country.phonecode ? `+${String(country.phonecode).replace(/[^\d+]/g, '')}` : '+0',
        flag: '🌍',
        lat: Number(country.latitude) || 0,
        lng: Number(country.longitude) || 0,
        states: normalizedStates,
      };
    })
    .filter((country: CountryGeo) => country.name && country.states.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const WORLD_COUNTRIES: CountryGeo[] = buildWorldCountries();

export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function resolveLocationCoordinates(countryCode: string, stateCode: string, cityName: string, fallback: { lat: number; lng: number }) {
  const countryApi = (countryStateCity as any)?.Country;
  const stateApi = (countryStateCity as any)?.State;
  const cityApi = (countryStateCity as any)?.City;

  try {
    const country = typeof countryApi?.getCountryByCode === 'function' ? countryApi.getCountryByCode(countryCode) : null;
    const state = typeof stateApi?.getStateByCodeAndCountry === 'function'
      ? stateApi.getStateByCodeAndCountry(stateCode, countryCode)
      : null;
    const cities = typeof cityApi?.getCitiesOfState === 'function' && state
      ? cityApi.getCitiesOfState(countryCode, stateCode)
      : [];
    const city = Array.isArray(cities)
      ? cities.find((item: any) => String(item?.name || '').toLowerCase() === cityName.trim().toLowerCase())
      : null;
    const source = city || state || country;
    const lat = Number(source?.latitude);
    const lng = Number(source?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : fallback;
  } catch {
    return fallback;
  }
}
