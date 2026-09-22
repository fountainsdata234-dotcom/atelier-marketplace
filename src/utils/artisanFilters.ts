type LocationLike = {
  country?: string;
  countryCode?: string;
  state?: string;
  city?: string;
  location?: LocationLike;
};

const normalizeValue = (value?: string) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export const matchesLocationFilter = (
  input: LocationLike | null | undefined,
  filterCountry = 'all',
  filterState = 'all',
  filterCity = 'all',
) => {
  const location = input && 'location' in input && input.location ? input.location : input;

  if (!location) return filterCountry === 'all' && filterState === 'all' && filterCity === 'all';

  const country = normalizeValue(filterCountry);
  const state = normalizeValue(filterState);
  const city = normalizeValue(filterCity);

  if (country !== 'all' && country !== '') {
    const countryMatches =
      normalizeValue(location.country) === country ||
      normalizeValue(location.countryCode) === country ||
      normalizeValue(location.country) === country.replace(/[^a-z]/gi, '') ||
      normalizeValue(location.countryCode) === country.replace(/[^a-z]/gi, '');
    if (!countryMatches) return false;
  }

  if (state !== 'all' && state !== '') {
    const stateMatches = normalizeValue(location.state) === state || normalizeValue(location.state) === state.replace(/[^a-z]/gi, '');
    if (!stateMatches) return false;
  }

  if (city !== 'all' && city !== '') {
    const cityMatches = normalizeValue(location.city) === city || normalizeValue(location.city) === city.replace(/[^a-z]/gi, '');
    if (!cityMatches) return false;
  }

  return true;
};
