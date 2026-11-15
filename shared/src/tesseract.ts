import catalog from '../data/tesseract.json';

export type TesseractMission = (typeof catalog.missions)[number];
export type TesseractPart = (typeof catalog.parts)[number];
export type TesseractLauncher = (typeof catalog.launchVehicles)[number];
export type TesseractPartCategory = TesseractPart['category'];
export type TesseractGroundStation = (typeof catalog.groundStations)[number];

export const TESSERACT_MISSIONS = catalog.missions;
export const TESSERACT_PARTS = catalog.parts;
export const TESSERACT_LAUNCHERS = catalog.launchVehicles;
export const TESSERACT_GROUND_STATIONS = catalog.groundStations;
export const EARTH_RADIUS_KM = 6371;
export const EARTH_MU_KM3_S2 = 398600.4418;
export const GAME_ORBIT_ALTITUDE_KM = 500;
export const SAFE_DEPTH_OF_DISCHARGE = 0.4;
export const G0_M_S2 = 9.80665;

export function calculateMissionOrbitPeriodMinutes(altitudeKm = GAME_ORBIT_ALTITUDE_KM): number {
  const semiMajorAxisKm = EARTH_RADIUS_KM + altitudeKm;
  return 2 * Math.PI * Math.sqrt((semiMajorAxisKm ** 3) / EARTH_MU_KM3_S2) / 60;
}

export function calculateMissionEclipseMinutes(altitudeKm = GAME_ORBIT_ALTITUDE_KM): number {
  const radiusRatio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm);
  const fraction = Math.asin(radiusRatio) / Math.PI;
  return calculateMissionOrbitPeriodMinutes(altitudeKm) * fraction;
}

export function calculateEclipseBatteryWh(loadW: number, altitudeKm = GAME_ORBIT_ALTITUDE_KM): number {
  return loadW * (calculateMissionEclipseMinutes(altitudeKm) / 60) / SAFE_DEPTH_OF_DISCHARGE;
}

export function calculateMissionDataMbPerOrbit(payloadId: string): number {
  const payload = TESSERACT_PARTS.find((part) => part.id === payloadId && part.category === 'Payload');
  return payload && 'dataMbPerOrbit' in payload ? payload.dataMbPerOrbit ?? 0 : 0;
}

export function calculateDownlinkCapacityMb(radioId: string, contactMinutes = 7): number {
  const radio = TESSERACT_PARTS.find((part) => part.id === radioId && part.category === 'Radio');
  const contactMbps = radio && 'contactMbps' in radio ? radio.contactMbps ?? 0 : 0;
  return contactMbps * contactMinutes * 60 / 8;
}

export type EclipseScheduleInput = {
  solarW: number;
  baseLoadW: number;
  instrumentLoadW: number;
  heaterLoadW: number;
  batteryCapacityWh: number;
  observationQuotaMinutes: number;
  instrumentSchedule: boolean[];
  heaterSchedule: boolean[];
  altitudeKm?: number;
};

export type EclipseScheduleResult = {
  success: boolean;
  quotaMet: boolean;
  batterySafe: boolean;
  observationMinutes: number;
  minimumBatteryWh: number;
  minimumBatteryPct: number;
  depthOfDischargePct: number;
  eclipseMinutes: number;
  criticalSegment: number | null;
  score: number;
  reason: string;
};

export function simulateEclipseSchedule(input: EclipseScheduleInput): EclipseScheduleResult {
  const altitudeKm = input.altitudeKm ?? GAME_ORBIT_ALTITUDE_KM;
  const periodMinutes = calculateMissionOrbitPeriodMinutes(altitudeKm);
  const eclipseMinutes = calculateMissionEclipseMinutes(altitudeKm);
  const sunlightEndMinute = periodMinutes - eclipseMinutes;
  const segmentCount = Math.max(input.instrumentSchedule.length, input.heaterSchedule.length);
  const segmentMinutes = periodMinutes / Math.max(segmentCount, 1);
  const safeReserveWh = input.batteryCapacityWh * (1 - SAFE_DEPTH_OF_DISCHARGE);
  let stateWh = input.batteryCapacityWh;
  let minimumBatteryWh = stateWh;
  let observationMinutes = 0;
  let criticalSegment: number | null = null;

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const startMinute = segment * segmentMinutes;
    const endMinute = startMinute + segmentMinutes;
    const eclipseInSegment = Math.max(0, Math.min(endMinute, periodMinutes) - Math.max(startMinute, sunlightEndMinute));
    const sunlightInSegment = segmentMinutes - eclipseInSegment;
    const instrumentOn = input.instrumentSchedule[segment] ?? false;
    const heaterOn = input.heaterSchedule[segment] ?? false;
    const activeLoadW = input.baseLoadW + (instrumentOn ? input.instrumentLoadW : 0) + (heaterOn ? input.heaterLoadW : 0);
    if (instrumentOn) observationMinutes += sunlightInSegment;
    const solarEnergyWh = input.solarW * sunlightInSegment / 60 * 0.85;
    const loadEnergyWh = activeLoadW * segmentMinutes / 60;
    stateWh = Math.min(input.batteryCapacityWh, stateWh + solarEnergyWh - loadEnergyWh);
    minimumBatteryWh = Math.min(minimumBatteryWh, stateWh);
    if (criticalSegment === null && stateWh < safeReserveWh) criticalSegment = segment;
  }

  const batterySafe = criticalSegment === null;
  const quotaMet = observationMinutes >= input.observationQuotaMinutes;
  const minimumBatteryPct = input.batteryCapacityWh > 0 ? minimumBatteryWh / input.batteryCapacityWh * 100 : 0;
  const depthOfDischargePct = 100 - minimumBatteryPct;
  const score = Math.max(0, Math.min(100, Math.round(
    Math.min(1, observationMinutes / Math.max(input.observationQuotaMinutes, 1)) * 55 +
    Math.min(1, Math.max(0, (minimumBatteryPct - 60) / 40)) * 45,
  )));
  const reason = !batterySafe
    ? `Brownout at segment ${(criticalSegment ?? 0) + 1}: battery fell to ${minimumBatteryPct.toFixed(0)}%; keep at least 60%.`
    : !quotaMet
      ? `Only ${observationMinutes.toFixed(0)} min observed; quota is ${input.observationQuotaMinutes} min.`
      : `Eclipse lasts ${eclipseMinutes.toFixed(1)} min. Battery stayed above ${minimumBatteryPct.toFixed(0)}%.`;

  return { success: batterySafe && quotaMet, quotaMet, batterySafe, observationMinutes, minimumBatteryWh, minimumBatteryPct, depthOfDischargePct, eclipseMinutes, criticalSegment, score, reason };
}

export function calculateLauncherDeltaVMs(launcher: TesseractLauncher): number {
  return launcher.stages.reduce((deltaVMs, stage) => deltaVMs + stage.isp * G0_M_S2 * Math.log(stage.massRatio), 0);
}

export type BuildEvaluation = {
  mission: TesseractMission;
  parts: TesseractPart[];
  massKg: number;
  costK: number;
  solarW: number;
  loadW: number;
  batteryWh: number;
  batteryNeedWh: number;
  radioRank: number;
  pointingRank: number;
  checks: { frame: boolean; payload: boolean; mass: boolean; budget: boolean; power: boolean; battery: boolean; radio: boolean; pointing: boolean };
  success: boolean;
  scienceScore: number;
  reasons: string[];
};

export function evaluateTesseractBuild(missionId: string, selectedPartIds: string[]): BuildEvaluation {
  const mission = TESSERACT_MISSIONS.find((item) => item.id === missionId) ?? TESSERACT_MISSIONS[0];
  const parts = TESSERACT_PARTS.filter((part) => selectedPartIds.includes(part.id));
  const find = (category: string) => parts.find((part) => part.category === category);
  const frame = find('Frame');
  const solar = find('Solar');
  const battery = find('Battery');
  const radio = find('Radio');
  const pointing = find('Pointing');
  const payload = find('Payload');
  const massKg = parts.reduce((sum, part) => sum + part.massKg, 0);
  const costK = parts.reduce((sum, part) => sum + part.costK, 0);
  const solarW = solar && 'powerW' in solar ? solar.powerW ?? 0 : 0;
  const loadW = parts.reduce((sum, part) => sum + ('loadW' in part ? part.loadW ?? 0 : 0), 0);
  const batteryWh = battery && 'energyWh' in battery ? battery.energyWh ?? 0 : 0;
  const batteryNeedWh = calculateEclipseBatteryWh(loadW);
  const radioRank = radio && 'rank' in radio ? radio.rank ?? 0 : 0;
  const pointingRank = pointing && 'rank' in pointing ? pointing.rank ?? 0 : 0;
  const checks = {
    frame: Boolean(frame && 'class' in frame && frame.class === mission.frameClass),
    payload: Boolean(payload && payload.id === mission.payloadId),
    mass: massKg <= mission.maxMassKg,
    budget: costK <= mission.budgetK,
    power: solarW >= loadW,
    battery: batteryWh >= batteryNeedWh,
    radio: radioRank >= mission.radioRank,
    pointing: pointingRank >= mission.pointingRank,
  };
  const reasons = [
    !checks.frame && `Needs a ${mission.frameClass} frame.`,
    !checks.payload && `Needs ${TESSERACT_PARTS.find((part) => part.id === mission.payloadId)?.name ?? 'the assigned payload'}.`,
    !checks.mass && `Mass ${massKg.toFixed(2)} kg exceeds ${mission.maxMassKg.toFixed(1)} kg.`,
    !checks.budget && `Cost ${costK}k exceeds the ${mission.budgetK}k cap.`,
    !checks.power && `Solar makes ${solarW} W for a ${loadW.toFixed(1)} W load.`,
    !checks.battery && `Eclipse needs ${batteryNeedWh.toFixed(1)} Wh; battery stores ${batteryWh} Wh.`,
    !checks.radio && `Radio rank ${radioRank} is below rank ${mission.radioRank}.`,
    !checks.pointing && `Pointing rank ${pointingRank} is below rank ${mission.pointingRank}.`,
  ].filter((reason): reason is string => Boolean(reason));
  const success = Object.values(checks).every(Boolean);
  const score = Math.max(0, Math.min(100, Math.round(
    mission.science * (success ? 1 : 0.55) +
    (checks.mass ? 2 : 0) + (checks.budget ? 2 : 0) +
    (checks.power ? 2 : 0) + (checks.battery ? 2 : 0) +
    (checks.radio ? 2 : 0) + (checks.pointing ? 2 : 0),
  )));

  return { mission, parts, massKg, costK, solarW, loadW, batteryWh, batteryNeedWh, radioRank, pointingRank, checks, success, scienceScore: score, reasons };
}

export function calculateHohmannDeltaVMs(initialAltitudeKm: number, targetAltitudeKm: number): number {
  const initialRadiusM = (EARTH_RADIUS_KM + initialAltitudeKm) * 1000;
  const targetRadiusM = (EARTH_RADIUS_KM + targetAltitudeKm) * 1000;
  const transferSemiMajorAxisM = (initialRadiusM + targetRadiusM) / 2;
  const initialVelocity = Math.sqrt((EARTH_MU_KM3_S2 * 1e9) / initialRadiusM);
  const targetVelocity = Math.sqrt((EARTH_MU_KM3_S2 * 1e9) / targetRadiusM);
  const transferPerigeeVelocity = Math.sqrt((EARTH_MU_KM3_S2 * 1e9) * (2 / initialRadiusM - 1 / transferSemiMajorAxisM));
  const transferApogeeVelocity = Math.sqrt((EARTH_MU_KM3_S2 * 1e9) * (2 / targetRadiusM - 1 / transferSemiMajorAxisM));
  return Math.abs(transferPerigeeVelocity - initialVelocity) + Math.abs(targetVelocity - transferApogeeVelocity);
}

export type MissionCommand = 'slew' | 'power-on' | 'observe' | 'store' | 'downlink' | 'safe-mode';

export type MissionSequenceInput = {
  commands: MissionCommand[];
  solarW: number;
  baseLoadW: number;
  instrumentLoadW: number;
  radioLoadW: number;
  batteryCapacityWh: number;
  dataMbPerOrbit: number;
  radioId: string;
  observationQuotaMinutes: number;
  bufferCapacityMb?: number;
  altitudeKm?: number;
};

export type MissionSequenceResult = {
  success: boolean;
  failureIndex: number | null;
  reason: string;
  observationMinutes: number;
  dataProducedMb: number;
  dataStoredMb: number;
  dataDownlinkedMb: number;
  dataLostMb: number;
  minimumBatteryPct: number;
  score: number;
};

export function simulateMissionSequence(input: MissionSequenceInput): MissionSequenceResult {
  const altitudeKm = input.altitudeKm ?? GAME_ORBIT_ALTITUDE_KM;
  const periodMinutes = calculateMissionOrbitPeriodMinutes(altitudeKm);
  const eclipseMinutes = calculateMissionEclipseMinutes(altitudeKm);
  const sunlightEndMinute = periodMinutes - eclipseMinutes;
  const segmentMinutes = periodMinutes / Math.max(input.commands.length, 1);
  const bufferCapacityMb = input.bufferCapacityMb ?? input.dataMbPerOrbit * 0.75;
  const reserveWh = input.batteryCapacityWh * (1 - SAFE_DEPTH_OF_DISCHARGE);
  let batteryWh = input.batteryCapacityWh;
  let minimumBatteryWh = batteryWh;
  let instrumentPowered = false;
  let pendingDataMb = 0;
  let dataStoredMb = 0;
  let dataDownlinkedMb = 0;
  let dataLostMb = 0;
  let dataProducedMb = 0;
  let observationMinutes = 0;
  let failureIndex: number | null = null;
  let reason = 'Sequence completed without a brownout or buffer loss.';

  for (let index = 0; index < input.commands.length; index += 1) {
    const command = input.commands[index];
    const startMinute = index * segmentMinutes;
    const sunlightMinutes = Math.max(0, Math.min(startMinute + segmentMinutes, sunlightEndMinute) - startMinute);
    if (command === 'power-on') instrumentPowered = true;
    if (command === 'safe-mode') instrumentPowered = false;

    if (command === 'observe') {
      if (!instrumentPowered) {
        failureIndex = index;
        reason = `Observe command ${index + 1} ran before payload power-on.`;
        break;
      }
      if (sunlightMinutes > 0) {
        observationMinutes += sunlightMinutes;
        const produced = input.dataMbPerOrbit / 3;
        pendingDataMb += produced;
        dataProducedMb += produced;
      }
    }

    if (command === 'store' && pendingDataMb > 0) {
      const available = Math.max(0, bufferCapacityMb - dataStoredMb);
      const stored = Math.min(available, pendingDataMb);
      dataStoredMb += stored;
      dataLostMb += pendingDataMb - stored;
      pendingDataMb = 0;
      if (dataLostMb > 0 && failureIndex === null) {
        failureIndex = index;
        reason = `Store command ${index + 1} overflowed the ${bufferCapacityMb.toFixed(1)} MB buffer.`;
      }
    }

    if (command === 'downlink') {
      if (index !== 3 && index !== 7) {
        if (failureIndex === null) {
          failureIndex = index;
          reason = `Downlink command ${index + 1} ran outside a ground-station contact window.`;
        }
      } else {
        const capacityMb = calculateDownlinkCapacityMb(input.radioId);
        const sent = Math.min(dataStoredMb, capacityMb);
        dataStoredMb -= sent;
        dataDownlinkedMb += sent;
      }
    }

    const eclipseMinutesInSlot = segmentMinutes - sunlightMinutes;
    const loadW = input.baseLoadW + (instrumentPowered ? input.instrumentLoadW : 0) + (command === 'slew' ? 0.8 : 0) + (command === 'downlink' ? input.radioLoadW : 0);
    const generatedWh = input.solarW * sunlightMinutes / 60 * 0.85;
    const consumedWh = loadW * (sunlightMinutes + eclipseMinutesInSlot) / 60;
    batteryWh = Math.min(input.batteryCapacityWh, batteryWh + generatedWh - consumedWh);
    minimumBatteryWh = Math.min(minimumBatteryWh, batteryWh);
    if (batteryWh < reserveWh && failureIndex === null) {
      failureIndex = index;
      reason = `Brownout at command ${index + 1}: battery fell below 60% reserve.`;
    }
    if (failureIndex !== null) break;
  }

  const quotaMet = observationMinutes >= input.observationQuotaMinutes;
  const minimumBatteryPct = input.batteryCapacityWh > 0 ? minimumBatteryWh / input.batteryCapacityWh * 100 : 0;
  const score = Math.max(0, Math.min(100, Math.round(
    Math.min(1, observationMinutes / Math.max(input.observationQuotaMinutes, 1)) * 45 +
    Math.min(1, dataDownlinkedMb / Math.max(input.dataMbPerOrbit * 0.6, 1)) * 35 +
    Math.min(1, Math.max(0, (minimumBatteryPct - 60) / 40)) * 20,
  )));
  const success = failureIndex === null && quotaMet && dataLostMb < input.dataMbPerOrbit * 0.25;
  if (failureIndex === null && !quotaMet) reason = `Only ${observationMinutes.toFixed(0)} min observed; mission quota is ${input.observationQuotaMinutes} min.`;
  if (failureIndex === null && quotaMet && dataLostMb === 0) reason = `${dataDownlinkedMb.toFixed(1)} MB downlinked; ${minimumBatteryPct.toFixed(0)}% minimum battery; observation quota met.`;

  return { success, failureIndex, reason, observationMinutes, dataProducedMb, dataStoredMb, dataDownlinkedMb, dataLostMb, minimumBatteryPct, score };
}