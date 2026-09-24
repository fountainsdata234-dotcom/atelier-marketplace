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

export const findExactArtisanMatch = <T extends GlobeSearchCandidate>(
  artisans: T[],
  query: string,
) => {
  const term = query.trim().toLowerCase();
  if (!term) return null;

  return artisans.find((artisan) => {
    const handle = artisan.handle.replace(/^@/, '').toLowerCase();
    return artisan.name.toLowerCase() === term
      || handle === term
      || artisan.handle.toLowerCase() === term
      || `@${handle}` === term;
  }) ?? null;
};

export const getMarkerScatterOffset = (
  latitude: number,
  longitude: number,
  index: number,
  total: number,
) => {
  const basis = getTangentBasis(latitude, longitude);
  const safeTotal = Math.max(total, 1);
  const anchorRadius = 0.025;
  const spread = Math.min(0.09, 0.04 + safeTotal * 0.005);
  const angle = (index / safeTotal) * Math.PI * 2 + (index * 1.61803398875);
  const radius = spread * (0.52 + ((index % 4) * 0.12));

  return {
    x: basis.x * anchorRadius + basis.tangentX * Math.cos(angle) * radius + basis.binormalX * Math.sin(angle) * radius,
    y: basis.y * anchorRadius + basis.tangentY * Math.cos(angle) * radius + basis.binormalY * Math.sin(angle) * radius,
    z: basis.z * anchorRadius + basis.tangentZ * Math.cos(angle) * radius + basis.binormalZ * Math.sin(angle) * radius,
  };
};

export const getScatterOffsetsForLocations = (
  locations: Array<{ lat: number; lng: number }>,
  minimumDistance = 0.08,
) => {
  const orderedLocations = locations
    .map((location, originalIndex) => ({ ...location, originalIndex }))
    .sort((left, right) => {
      const leftKey = `${left.lat.toFixed(5)}:${left.lng.toFixed(5)}`;
      const rightKey = `${right.lat.toFixed(5)}:${right.lng.toFixed(5)}`;
      return leftKey.localeCompare(rightKey) || left.originalIndex - right.originalIndex;
    });

  const offsets: Array<{ x: number; y: number; z: number }> = Array(locations.length).fill({ x: 0, y: 0, z: 0 });
  const clusterFactor = locations.length <= 3 ? 1.55 : locations.length <= 6 ? 1.28 : locations.length <= 12 ? 1.08 : 1;
  const safeMinimumDistance = Math.max(0.055, Math.min(0.18, minimumDistance * clusterFactor));
  const baseOffset = Math.min(0.032, safeMinimumDistance * 0.38);
  const maxOffsetLength = Math.min(0.1, safeMinimumDistance * 0.9);

  orderedLocations.forEach((location, index) => {
    const basis = getTangentBasis(location.lat, location.lng);
    let bestCandidate: { x: number; y: number; z: number } | null = null;
    let bestSeparation = -Infinity;

    for (let ring = 0; ring < 20; ring += 1) {
      const radius = safeMinimumDistance * (0.4 + ring * 0.22);
      const steps = Math.max(8, Math.round((Math.PI * 2 * radius) / (safeMinimumDistance * 0.75)));

      for (let step = 0; step < steps; step += 1) {
        const angle = ((index + 1) * 1.61803398875 + (step / steps) * Math.PI * 2) % (Math.PI * 2);
        const candidate = {
          x: basis.x * baseOffset + basis.tangentX * Math.cos(angle) * radius + basis.binormalX * Math.sin(angle) * radius * 0.7,
          y: basis.y * baseOffset + basis.tangentY * Math.cos(angle) * radius + basis.binormalY * Math.sin(angle) * radius * 0.7,
          z: basis.z * baseOffset + basis.tangentZ * Math.cos(angle) * radius + basis.binormalZ * Math.sin(angle) * radius * 0.7,
        };

        const candidateLength = Math.hypot(candidate.x, candidate.y, candidate.z);
        if (candidateLength > maxOffsetLength + 0.0001) {
          continue;
        }

        const distancesToPrevious = offsets
          .filter((previous) => previous && (previous.x || previous.y || previous.z))
          .map((previous) => Math.hypot(
            previous.x - candidate.x,
            previous.y - candidate.y,
            previous.z - candidate.z,
          ));

        const minDistanceToPrevious = distancesToPrevious.length > 0 ? Math.min(...distancesToPrevious) : Infinity;
        if (minDistanceToPrevious < safeMinimumDistance) {
          continue;
        }

        const separationScore = minDistanceToPrevious - candidateLength * 0.4;
        if (separationScore > bestSeparation || (Math.abs(separationScore - bestSeparation) < 1e-6 && (!bestCandidate || candidateLength < Math.hypot(bestCandidate.x, bestCandidate.y, bestCandidate.z)))) {
          bestCandidate = candidate;
          bestSeparation = separationScore;
        }
      }

      if (bestCandidate) {
        break;
      }
    }

    if (!bestCandidate) {
      const fallbackAngle = ((index + 1) * Math.PI * 2) / Math.max(orderedLocations.length, 1);
      bestCandidate = {
        x: basis.x * baseOffset + basis.tangentX * Math.cos(fallbackAngle) * safeMinimumDistance * 0.7 + basis.binormalX * Math.sin(fallbackAngle) * safeMinimumDistance * 0.5,
        y: basis.y * baseOffset + basis.tangentY * Math.cos(fallbackAngle) * safeMinimumDistance * 0.7 + basis.binormalY * Math.sin(fallbackAngle) * safeMinimumDistance * 0.5,
        z: basis.z * baseOffset + basis.tangentZ * Math.cos(fallbackAngle) * safeMinimumDistance * 0.7 + basis.binormalZ * Math.sin(fallbackAngle) * safeMinimumDistance * 0.5,
      };
    }

    const finalLength = Math.hypot(bestCandidate.x, bestCandidate.y, bestCandidate.z);
    if (finalLength > maxOffsetLength) {
      const scale = maxOffsetLength / finalLength;
      bestCandidate = {
        x: bestCandidate.x * scale,
        y: bestCandidate.y * scale,
        z: bestCandidate.z * scale,
      };
    }

    offsets[location.originalIndex] = bestCandidate;
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
