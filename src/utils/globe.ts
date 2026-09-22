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

const getTangentBasis = (latitude: number, longitude: number) => {
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

  return { x: baseX, y: baseY, z: baseZ, tangentX, tangentY, tangentZ, binormalX, binormalY, binormalZ };
};

export const getMarkerScatterOffset = (
  latitude: number,
  longitude: number,
  index: number,
  total: number,
) => {
  const basis = getTangentBasis(latitude, longitude);
  const safeTotal = Math.max(total, 1);
  const spread = 0.14 + Math.min(0.28, safeTotal * 0.024);
  const angle = (index / safeTotal) * Math.PI * 2 + (index * 1.61803398875);
  const radius = spread * (0.8 + ((index % 4) * 0.18));

  return {
    x: basis.x * 0.035 + basis.tangentX * Math.cos(angle) * radius + basis.binormalX * Math.sin(angle) * radius,
    y: basis.y * 0.035 + basis.tangentY * Math.cos(angle) * radius + basis.binormalY * Math.sin(angle) * radius,
    z: basis.z * 0.035 + basis.tangentZ * Math.cos(angle) * radius + basis.binormalZ * Math.sin(angle) * radius,
  };
};

export const getScatterOffsetsForLocations = (
  locations: Array<{ lat: number; lng: number }>,
  minimumDistance = 0.18,
) => {
  const orderedLocations = locations
    .map((location, originalIndex) => ({ ...location, originalIndex }))
    .sort((left, right) => {
      const leftKey = `${left.lat.toFixed(5)}:${left.lng.toFixed(5)}`;
      const rightKey = `${right.lat.toFixed(5)}:${right.lng.toFixed(5)}`;
      return leftKey.localeCompare(rightKey) || left.originalIndex - right.originalIndex;
    });

  const offsets: Array<{ x: number; y: number; z: number }> = Array(locations.length).fill({ x: 0, y: 0, z: 0 });

  orderedLocations.forEach((location, index) => {
    const basis = getTangentBasis(location.lat, location.lng);
    let chosen = { x: 0, y: 0, z: 0 };
    let found = false;

    for (let ring = 0; ring < 18; ring += 1) {
      const radius = minimumDistance * (1 + ring * 0.45);
      const steps = Math.max(8, Math.round((Math.PI * 2 * radius) / 0.18));

      for (let step = 0; step < steps; step += 1) {
        const angle = (step / steps) * Math.PI * 2 + index * 1.61803398875;
        const candidate = {
          x: basis.x * 0.035 + basis.tangentX * Math.cos(angle) * radius + basis.binormalX * Math.sin(angle) * radius,
          y: basis.y * 0.035 + basis.tangentY * Math.cos(angle) * radius + basis.binormalY * Math.sin(angle) * radius,
          z: basis.z * 0.035 + basis.tangentZ * Math.cos(angle) * radius + basis.binormalZ * Math.sin(angle) * radius,
        };

        const overlaps = offsets.some((previous) => {
          if (!previous || !previous.x && !previous.y && !previous.z) return false;
          const dx = previous.x - candidate.x;
          const dy = previous.y - candidate.y;
          const dz = previous.z - candidate.z;
          return Math.hypot(dx, dy, dz) < minimumDistance;
        });

        if (!overlaps) {
          chosen = candidate;
          found = true;
          break;
        }
      }

      if (found) {
        break;
      }
    }

    if (!found) {
      chosen = getMarkerScatterOffset(location.lat, location.lng, index, Math.max(locations.length, 1));
    }

    offsets[location.originalIndex] = chosen;
  });

  return offsets;
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
