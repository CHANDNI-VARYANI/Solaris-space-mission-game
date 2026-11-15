import { describe, expect, it } from 'vitest';
import { calculateOrbitalPeriod, calculateOrbitVelocity, eclipseFraction, rocketEquation, calculateLinkBudget, scienceScore } from './index';

describe('orbital calculations', () => {
  it('computes a near-ISS-like orbital period at ~400 km', () => {
    const orbit = calculateOrbitalPeriod(400000, 'Earth');
    expect(orbit).toBeGreaterThan(90 * 60);
    expect(orbit).toBeLessThan(94 * 60);
  });

  it('computes GEO period near 23h56m', () => {
    const orbit = calculateOrbitalPeriod(35786000, 'Earth');
    expect(orbit).toBeGreaterThan(23 * 60 * 60);
    expect(orbit).toBeLessThan(24 * 60 * 60);
  });

  it('computes a realistic orbital velocity for LEO', () => {
    const velocity = calculateOrbitVelocity(400000, 'Earth');
    expect(velocity).toBeGreaterThan(7600);
    expect(velocity).toBeLessThan(8200);
  });

  it('estimates eclipse fraction for a LEO orbit', () => {
    const eclipse = eclipseFraction(500000, 0);
    expect(eclipse).toBeGreaterThan(0.25);
    expect(eclipse).toBeLessThan(0.5);
  });
});

describe('propulsion, communications and science scoring', () => {
  it('calculates delta-v from the ideal rocket equation', () => {
    const deltaV = rocketEquation({ isp: 320, initialMass: 1000, finalMass: 500, g0: 9.81 });
    expect(deltaV).toBeGreaterThan(2000);
    expect(deltaV).toBeLessThan(2500);
  });

  it('calculates a positive link margin for a favorable downlink', () => {
    const result = calculateLinkBudget({
      transmitPowerDbW: 20,
      antennaGainDb: 20,
      frequencyHz: 2.2e9,
      slantRangeM: 2000000,
      dataRateBitsPerSecond: 2e6,
      receiverGainDb: 10,
      systemNoiseTemperatureK: 800,
    });
    expect(result.marginDb).toBeGreaterThan(0);
  });

  it('scores high science when requirements are met', () => {
    const score = scienceScore({
      objective: 'Earth observation',
      capability: 0.9,
      coverage: 0.8,
      revisit: 0.7,
      dataDownlinked: 0.9,
      lifetime: 0.8,
      pointingAccuracy: 0.8,
      calibration: 0.9,
    });
    expect(score).toBeGreaterThan(70);
    expect(score).toBeLessThan(100);
  });
});
