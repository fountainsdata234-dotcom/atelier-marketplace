export interface GlobeSignalPoint {
  lat: number;
  lng: number;
  phase: number;
}

const createRandom = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
};

export const createGlobeSignalPoints = (count = 32, seed = 20261023): GlobeSignalPoint[] => {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError('Globe signal count must be a non-negative integer.');
  }
  if (!Number.isInteger(seed)) {
    throw new RangeError('Globe signal seed must be an integer.');
  }

  const random = createRandom(seed);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  return Array.from({ length: count }, (_, index) => {
    const vertical = 1 - 2 * ((index + 0.5) / count);
    const longitude = index * goldenAngle + (random() - 0.5) * goldenAngle * 0.36;
    const latitude = Math.asin(vertical) + (random() - 0.5) * Math.min(0.15, Math.PI / count);
    const radial = Math.cos(latitude);

    return {
      lat: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, latitude)) * (180 / Math.PI),
      lng: Math.atan2(Math.sin(longitude) * radial, Math.cos(longitude) * radial) * (180 / Math.PI),
      phase: random() * Math.PI * 2,
    };
  });
};
