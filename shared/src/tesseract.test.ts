import { describe, expect, it } from 'vitest';
import {
  calculateEclipseBatteryWh,
  calculateDownlinkCapacityMb,
  calculateHohmannDeltaVMs,
  calculateLauncherDeltaVMs,
  calculateMissionDataMbPerOrbit,
  simulateEclipseSchedule,
  simulateMissionSequence,
  calculateMissionEclipseMinutes,
  calculateMissionOrbitPeriodMinutes,
  evaluateTesseractBuild,
  TESSERACT_LAUNCHERS,
} from './tesseract';

describe('TESSERACT mission rules', () => {
  it('calculates the 500 km orbital period and eclipse from circular-orbit geometry', () => {
    expect(calculateMissionOrbitPeriodMinutes(500)).toBeGreaterThan(94);
    expect(calculateMissionOrbitPeriodMinutes(500)).toBeLessThan(96);
    expect(calculateMissionEclipseMinutes(500)).toBeGreaterThan(35);
    expect(calculateMissionEclipseMinutes(500)).toBeLessThan(38);
  });

  it('sizes eclipse storage with the 40 percent depth-of-discharge rule', () => {
    expect(calculateEclipseBatteryWh(10, 500)).toBeCloseTo(15.2, 0);
  });

  it('passes a complete magnetic probe stack and reports its real margins', () => {
    const result = evaluateTesseractBuild('magnetic-probe', [
      'frame-1u', 'solar-body', 'battery-10', 'computer-basic', 'radio-uhf', 'pointing-mag', 'magnetometer',
    ]);
    expect(result.success).toBe(true);
    expect(result.massKg).toBeCloseTo(1.15);
    expect(result.costK).toBe(98);
    expect(result.batteryNeedWh).toBeGreaterThan(0);
  });

  it('uses the rocket equation for launcher capability and vis-viva for orbit changes', () => {
    expect(calculateLauncherDeltaVMs(TESSERACT_LAUNCHERS[0])).toBeGreaterThan(8000);
    expect(calculateHohmannDeltaVMs(500, 700)).toBeGreaterThan(50);
    expect(calculateHohmannDeltaVMs(500, 700)).toBeLessThan(150);
  });

  it('calculates payload data and radio contact capacity in megabytes', () => {
    expect(calculateMissionDataMbPerOrbit('multispectral')).toBe(80);
    expect(calculateDownlinkCapacityMb('radio-uhf')).toBeCloseTo(7.875);
    expect(calculateDownlinkCapacityMb('radio-sband')).toBe(105);
  });

  it('keeps a probe safe through eclipse when observations are scheduled in sunlight', () => {
    const result = simulateEclipseSchedule({
      solarW: 3,
      baseLoadW: 1.9,
      instrumentLoadW: 1,
      heaterLoadW: 0.3,
      batteryCapacityWh: 10,
      observationQuotaMinutes: 20,
      instrumentSchedule: Array.from({ length: 12 }, (_, index) => index < 7),
      heaterSchedule: Array.from({ length: 12 }, () => false),
    });
    expect(result.success).toBe(true);
    expect(result.minimumBatteryPct).toBeGreaterThan(60);
    expect(result.observationMinutes).toBeGreaterThanOrEqual(20);
  });

  it('identifies the exact schedule segment that crosses safe battery reserve', () => {
    const result = simulateEclipseSchedule({
      solarW: 0,
      baseLoadW: 9,
      instrumentLoadW: 8,
      heaterLoadW: 2,
      batteryCapacityWh: 10,
      observationQuotaMinutes: 20,
      instrumentSchedule: Array.from({ length: 12 }, () => true),
      heaterSchedule: Array.from({ length: 12 }, () => true),
    });
    expect(result.success).toBe(false);
    expect(result.batterySafe).toBe(false);
    expect(result.criticalSegment).not.toBeNull();
  });

  it('runs a valid sequence through observation, storage, and contact windows', () => {
    const result = simulateMissionSequence({
      commands: ['power-on', 'observe', 'store', 'downlink', 'observe', 'store', 'safe-mode', 'downlink'],
      solarW: 3,
      baseLoadW: 1.9,
      instrumentLoadW: 1,
      radioLoadW: 1,
      batteryCapacityWh: 10,
      dataMbPerOrbit: 6,
      radioId: 'radio-uhf',
      observationQuotaMinutes: 20,
    });
    expect(result.success).toBe(true);
    expect(result.dataDownlinkedMb).toBeGreaterThan(0);
    expect(result.minimumBatteryPct).toBeGreaterThan(60);
  });

  it('pinpoints an observation command that runs before payload power-on', () => {
    const result = simulateMissionSequence({
      commands: ['slew', 'observe', 'power-on', 'store'],
      solarW: 3,
      baseLoadW: 1.9,
      instrumentLoadW: 1,
      radioLoadW: 1,
      batteryCapacityWh: 10,
      dataMbPerOrbit: 6,
      radioId: 'radio-uhf',
      observationQuotaMinutes: 20,
    });
    expect(result.success).toBe(false);
    expect(result.failureIndex).toBe(1);
    expect(result.reason).toMatch(/before payload power-on/);
  });
});