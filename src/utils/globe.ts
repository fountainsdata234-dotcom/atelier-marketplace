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

const normalizeSearchTerm = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

const getArtisanSearchScore = <T extends GlobeSearchCandidate>(artisan: T, query: string) => {
  const term = normalizeSearchTerm(query);
  if (!term) return 0;

  const name = artisan.name.trim();
  const normalizedName = name.toLowerCase();
  const handle = artisan.handle.trim();
  const normalizedHandle = handle.toLowerCase();
  const handleWithoutAt = normalizedHandle.replace(/^@/, '');
  const hasAtQuery = term.startsWith('@');
  const queryWithoutAt = hasAtQuery ? term.slice(1) : term;
  const city = (artisan.location?.city ?? '').trim().toLowerCase();
  const state = (artisan.location?.state ?? '').trim().toLowerCase();
  const country = (artisan.location?.country ?? '').trim().toLowerCase();

  let score = 0;

  if (normalizedName === term) score += 120;
  else if (normalizedName.startsWith(term)) score += 90;
  else if (normalizedName.includes(term)) score += 70;

  if (normalizedHandle === term) score += 120;
  else if (normalizedHandle.startsWith(term)) score += 85;
  else if (normalizedHandle.includes(term)) score += 60;

  if (handleWithoutAt === queryWithoutAt) score += 15;
  else if (handleWithoutAt.startsWith(queryWithoutAt)) score += 10;
  else if (handleWithoutAt.includes(queryWithoutAt)) score += 6;

  if (city === term || city.startsWith(term) || city.includes(term)) score += 18;
  if (state === term || state.startsWith(term) || state.includes(term)) score += 16;
  if (country === term || country.startsWith(term) || country.includes(term)) score += 14;

  if (score === 0 && queryWithoutAt.length > 0) {
    // Fuzzy prefix match on the cleaned search term keeps suggestion ranking useful without over-suggesting unrelated artisans.
    const seededName = normalizedName.replace(/[^a-z0-9]/g, '');
    const seededHandle = handleWithoutAt.replace(/[^a-z0-9]/g, '');
    const querySeed = queryWithoutAt.replace(/[^a-z0-9]/g, '');
    if (seededName.startsWith(querySeed) || seededHandle.startsWith(querySeed)) score += 12;
    if (seededName.includes(querySeed) || seededHandle.includes(querySeed)) score += 8;
  }

  return score;
};

export const findExactArtisanMatch = <T extends GlobeSearchCandidate>(
  artisans: T[],
  query: string,
) => {
  const term = normalizeSearchTerm(query);
  if (!term) return null;

  return artisans.find((artisan) => {
    const handle = artisan.handle.trim().toLowerCase();
    const normalizedHandle = handle.replace(/^@/, '');
    const name = artisan.name.trim().toLowerCase();
    const queryWithAt = term.startsWith('@') ? term : `@${term}`;
    return name === term
      || name === queryWithAt.replace(/^@/, '')
      || handle === term
      || handle === queryWithAt
      || normalizedHandle === term
      || `@${normalizedHandle}` === term;
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

const vectorLength = (vector: { x: number; y: number; z: number }) => Math.hypot(vector.x, vector.y, vector.z);

const scaleVector = (vector: { x: number; y: number; z: number }, scalar: number) => ({
  x: vector.x * scalar,
  y: vector.y * scalar,
  z: vector.z * scalar,
});

const subtractVectors = (
  left: { x: number; y: number; z: number },
  right: { x: number; y: number; z: number },
) => ({
  x: left.x - right.x,
  y: left.y - right.y,
  z: left.z - right.z,
});

const addVectors = (
  left: { x: number; y: number; z: number },
  right: { x: number; y: number; z: number },
) => ({
  x: left.x + right.x,
  y: left.y + right.y,
  z: left.z + right.z,
});

const normalizeVector = (vector: { x: number; y: number; z: number }) => {
  const length = vectorLength(vector) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
};

export const getScatterOffsetsForLocations = (
  locations: Array<{ lat: number; lng: number }>,
  minimumDistance = 0.08,
) => {
  if (locations.length === 0) return [];

  const orderedLocations = locations
    .map((location, originalIndex) => ({ ...location, originalIndex }))
    .sort((left, right) => {
      const leftKey = `${left.lat.toFixed(5)}:${left.lng.toFixed(5)}`;
      const rightKey = `${right.lat.toFixed(5)}:${right.lng.toFixed(5)}`;
      return leftKey.localeCompare(rightKey) || left.originalIndex - right.originalIndex;
    });

  const offsets: Array<{ x: number; y: number; z: number }> = Array(locations.length).fill({ x: 0, y: 0, z: 0 });
  const clusterFactor = locations.length <= 2 ? 2.1 : locations.length <= 4 ? 1.8 : locations.length <= 6 ? 1.42 : locations.length <= 12 ? 1.16 : 1;
  const safeMinimumDistance = Math.max(0.08, Math.min(0.34, minimumDistance * clusterFactor));
  const baseOffset = Math.min(0.038, safeMinimumDistance * 0.42);
  const maxOffsetLength = minimumDistance <= 0.12
    ? Math.min(0.12, safeMinimumDistance * 0.92)
    : Math.min(0.28, safeMinimumDistance * 0.92);

  for (let index = 0; index < orderedLocations.length; index += 1) {
    const location = orderedLocations[index];
    const basis = getTangentBasis(location.lat, location.lng);
    const anchorVector = normalizeVector({ x: basis.x, y: basis.y, z: basis.z });
    let bestCandidate: { x: number; y: number; z: number } | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let ring = 0; ring < 22; ring += 1) {
      const radius = safeMinimumDistance * (0.3 + ring * 0.22);
      const steps = Math.max(10, Math.round((Math.PI * 2 * radius) / (safeMinimumDistance * 0.7)));

      for (let step = 0; step < steps; step += 1) {
        const angle = (step / steps) * Math.PI * 2 + (index + 1) * 1.61803398875;
        const candidate = {
          x: basis.x * baseOffset + basis.tangentX * Math.cos(angle) * radius + basis.binormalX * Math.sin(angle) * radius * 0.8,
          y: basis.y * baseOffset + basis.tangentY * Math.cos(angle) * radius + basis.binormalY * Math.sin(angle) * radius * 0.8,
          z: basis.z * baseOffset + basis.tangentZ * Math.cos(angle) * radius + basis.binormalZ * Math.sin(angle) * radius * 0.8,
        };

        const candidateLength = vectorLength(candidate);
        if (candidateLength > maxOffsetLength + 0.0001) continue;

        const previousVectors = offsets.filter((previous) => previous && (previous.x || previous.y || previous.z));
        const nearestDistance = previousVectors.reduce((nearest, previous) => {
          const delta = subtractVectors(candidate, previous);
          const distance = vectorLength(delta);
          return Math.min(nearest, distance);
        }, Number.POSITIVE_INFINITY);

        if (nearestDistance < safeMinimumDistance) continue;

        const score = nearestDistance - candidateLength * 0.45 + (1 / Math.max(radius, 0.08)) * 0.18;
        if (score > bestScore || (!bestCandidate && score === bestScore)) {
          bestCandidate = candidate;
          bestScore = score;
        }
      }

      if (bestCandidate) break;
    }

    if (!bestCandidate) {
      const fallbackAngle = ((index + 1) * Math.PI * 2) / Math.max(orderedLocations.length, 1);
      bestCandidate = {
        x: basis.x * baseOffset + basis.tangentX * Math.cos(fallbackAngle) * safeMinimumDistance * 0.75 + basis.binormalX * Math.sin(fallbackAngle) * safeMinimumDistance * 0.58,
        y: basis.y * baseOffset + basis.tangentY * Math.cos(fallbackAngle) * safeMinimumDistance * 0.75 + basis.binormalY * Math.sin(fallbackAngle) * safeMinimumDistance * 0.58,
        z: basis.z * baseOffset + basis.tangentZ * Math.cos(fallbackAngle) * safeMinimumDistance * 0.75 + basis.binormalZ * Math.sin(fallbackAngle) * safeMinimumDistance * 0.58,
      };
    }

    const candidateLength = vectorLength(bestCandidate);
    const finalScale = candidateLength > maxOffsetLength ? maxOffsetLength / candidateLength : 1;
    const adjusted = scaleVector(bestCandidate, finalScale);
    offsets[location.originalIndex] = adjusted;
  }

  for (let iteration = 0; iteration < 5; iteration += 1) {
    for (let index = 0; index < orderedLocations.length; index += 1) {
      const location = orderedLocations[index];
      const basis = getTangentBasis(location.lat, location.lng);
      const anchorVector = normalizeVector({ x: basis.x, y: basis.y, z: basis.z });
      const current = offsets[location.originalIndex];
      let displacement = { x: 0, y: 0, z: 0 };

      for (let compareIndex = 0; compareIndex < orderedLocations.length; compareIndex += 1) {
        if (compareIndex === index) continue;
        const other = offsets[orderedLocations[compareIndex].originalIndex];
        const delta = subtractVectors(current, other);
        const distance = vectorLength(delta) || 1;
        const minAllowed = safeMinimumDistance * 0.8;

        if (distance < minAllowed * 1.8) {
          const repulsion = Math.max(0, minAllowed * 1.8 - distance) / 8;
          const direction = normalizeVector(delta);
          displacement = addVectors(displacement, scaleVector(direction, repulsion));
        }
      }

      const attraction = scaleVector(anchorVector, 0.02 + safeMinimumDistance * 0.04);
      displacement = addVectors(displacement, attraction);
      const relaxed = addVectors(current, displacement);
      const relaxedLength = vectorLength(relaxed);
      const maxAllowed = Math.max(0.02, maxOffsetLength * 0.94);
      const normalized = relaxedLength > maxAllowed ? scaleVector(relaxed, maxAllowed / relaxedLength) : relaxed;
      offsets[location.originalIndex] = normalized;
    }
  }

  return offsets;
};

export const getSearchSuggestions = <T extends GlobeSearchCandidate>(
  artisans: T[],
  query: string,
  limit = 7,
) => {
  const term = normalizeSearchTerm(query);

  if (!term) {
    return artisans.slice(0, limit);
  }

  return artisans
    .filter((artisan) => {
      const name = artisan.name.trim().toLowerCase();
      const handle = artisan.handle.trim().toLowerCase();
      const handleWithoutAt = handle.replace(/^@/, '');
      const city = artisan.location?.city?.trim().toLowerCase() ?? '';
      const state = artisan.location?.state?.trim().toLowerCase() ?? '';
      const country = artisan.location?.country?.trim().toLowerCase() ?? '';
      return name.includes(term)
        || handle.includes(term)
        || handleWithoutAt.includes(term)
        || city.includes(term)
        || state.includes(term)
        || country.includes(term);
    })
    .sort((left, right) => getArtisanSearchScore(right, term) - getArtisanSearchScore(left, term))
    .slice(0, limit);
};
