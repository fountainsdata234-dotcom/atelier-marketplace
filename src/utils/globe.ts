export type GlobeSearchCandidate = {
  id: string;
  name: string;
  handle: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
    countryCode?: string;
    lat?: number;
    lng?: number;
  };
};

export const getMarkerScatterOffset = (
  latitude: number,
  longitude: number,
  index: number,
  total: number,
) => {
  const lat = (latitude * Math.PI) / 180;
  const lon = (longitude * Math.PI) / 180;

  const baseX = Math.cos(lat) * Math.sin(lon);
  const baseY = Math.sin(lat);
  const baseZ = Math.cos(lat) * Math.cos(lon);

  const tangentX = -Math.sin(lon);
  const tangentY = 0;
  const tangentZ = Math.cos(lon);

  const binormalX = -Math.sin(lat) * Math.cos(lon);
  const binormalY = Math.cos(lat);
  const binormalZ = -Math.sin(lat) * Math.sin(lon);

  const safeTotal = Math.max(total, 1);
  const spread = 0.12 + Math.min(0.28, safeTotal * 0.024);
  const angle = (index / safeTotal) * Math.PI * 2 + (index * 1.61803398875);
  const radius = spread * (0.78 + ((index % 4) * 0.18));

  const x = baseX * 0.035 + tangentX * Math.cos(angle) * radius + binormalX * Math.sin(angle) * radius;
  const y = baseY * 0.035 + tangentY * Math.cos(angle) * radius + binormalY * Math.sin(angle) * radius;
  const z = baseZ * 0.035 + tangentZ * Math.cos(angle) * radius + binormalZ * Math.sin(angle) * radius;

  return { x, y, z };
};

export const getSearchSuggestions = <T extends GlobeSearchCandidate>(
  artisans: T[],
  query: string,
  limit = 7,
) => {
  const term = query.trim().toLowerCase();

  if (!term) {
    return artisans.slice(0, limit);
  }

  return artisans
    .filter((artisan) => {
      const name = artisan.name.toLowerCase();
      const handle = artisan.handle.toLowerCase().replace(/^@/, '');
      const normalizedHandle = artisan.handle.toLowerCase();
      const city = artisan.location?.city?.toLowerCase() ?? '';
      const state = artisan.location?.state?.toLowerCase() ?? '';
      const country = artisan.location?.country?.toLowerCase() ?? '';
      return name.includes(term)
        || handle.includes(term)
        || normalizedHandle.includes(term)
        || city.includes(term)
        || state.includes(term)
        || country.includes(term);
    })
    .slice(0, limit);
};
