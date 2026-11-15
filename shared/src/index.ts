export type Planet = 'Earth' | 'Moon' | 'Mars';

export * from './tesseract';

export type LaunchVehicle = {
  id: string;
  name: string;
  orbit: string[];
  leoKg: number;
  gtoKg: number;
  ssoKg: number;
  costUsdM: number;
  reliability: number;
  notes: string;
  approximate: boolean;
  source: string;
};

export type OrbitDefinition = {
  id: string;
  name: string;
  altitudeKm: number;
  periodMinutes: number;
  eclipseFraction: number;
  radiation: string;
  drag: string;
  deltaVFromLeoKmS: number;
  notes: string;
};

export type InstrumentDefinition = {
  id: string;
  name: string;
  massKg: number;
  powerW: number;
  dataRateMbps: number;
  dutyCycle: number;
  costUsdM: number;
  trl: number;
  orbitSuitability: string[];
  description: string;
};

export type ComponentDefinition = {
  id: string;
  name: string;
  category: string;
  massKg: number;
  powerW: number;
  costUsdM: number;
  description: string;
};

export type Scenario = {
  id: string;
  name: string;
  mission: string;
  objective: string;
  difficulty: 'Explorer' | 'Engineer' | 'Mission Director';
  budgetM: number;
  deadlineMonths: number;
};

export type LinkBudgetInputs = {
  transmitPowerDbW: number;
  antennaGainDb: number;
  frequencyHz: number;
  slantRangeM: number;
  dataRateBitsPerSecond: number;
  receiverGainDb: number;
  systemNoiseTemperatureK: number;
};

export type RocketEquationInputs = {
  isp: number;
  initialMass: number;
  finalMass: number;
  g0?: number;
};

export type ScienceScoreInputs = {
  objective: string;
  capability: number;
  coverage: number;
  revisit: number;
  dataDownlinked: number;
  lifetime: number;
  pointingAccuracy: number;
  calibration: number;
};

export type MissionDesignInput = {
  scenarioId: string;
  difficulty: 'Explorer' | 'Engineer' | 'Mission Director';
  launchVehicleId: string;
  orbitId: string;
  instrumentIds: string[];
  componentIds: string[];
};

export type MissionReport = {
  success: boolean;
  score: number;
  rootCause: string;
  massKg: number;
  powerGeneratedW: number;
  powerConsumedW: number;
  dataProducedMb: number;
  dataDownlinkedMb: number;
  launchMarginPct: number;
  lifetimeYears: number;
  linkMarginDb: number;
};

export const EARTH_RADIUS_M = 6371000;
export const MU_EARTH = 3.986004418e14;
export const MU_MOON = 4.9048696e12;
export const MU_MARS = 4.282837e13;
export const SOLAR_CONSTANT_W_M2 = 1361;

export const LAUNCH_VEHICLES: LaunchVehicle[] = [
  {
    id: 'electron',
    name: 'Rocket Lab Electron',
    orbit: ['LEO'],
    leoKg: 300,
    gtoKg: 0,
    ssoKg: 300,
    costUsdM: 7.5,
    reliability: 0.96,
    notes: 'Small satellite dedicated launch.',
    approximate: true,
    source: 'Rocket Lab public launch guides',
  },
  {
    id: 'sslv',
    name: 'ISRO SSLV',
    orbit: ['LEO'],
    leoKg: 500,
    gtoKg: 0,
    ssoKg: 500,
    costUsdM: 4.5,
    reliability: 0.95,
    notes: 'Small payload launcher.',
    approximate: true,
    source: 'ISRO SSLV user guide',
  },
  {
    id: 'pslv-xl',
    name: 'ISRO PSLV-XL',
    orbit: ['LEO', 'SSO', 'GTO'],
    leoKg: 3800,
    gtoKg: 1400,
    ssoKg: 1750,
    costUsdM: 25,
    reliability: 0.98,
    notes: 'Workhorse Indian launcher.',
    approximate: true,
    source: 'ISRO launch manuals',
  },
  {
    id: 'falcon-9',
    name: 'SpaceX Falcon 9',
    orbit: ['LEO', 'SSO', 'GTO'],
    leoKg: 22000,
    gtoKg: 5500,
    ssoKg: 15000,
    costUsdM: 70,
    reliability: 0.99,
    notes: 'Reused and expendable variants.',
    approximate: true,
    source: 'SpaceX payload user guides',
  },
  {
    id: 'atlas-v',
    name: 'Atlas V 401',
    orbit: ['LEO', 'GTO'],
    leoKg: 9800,
    gtoKg: 4750,
    ssoKg: 0,
    costUsdM: 110,
    reliability: 0.97,
    notes: 'Commercial heavy medium launcher.',
    approximate: true,
    source: 'ULA payload user guide',
  },
];

export const ORBIT_DEFINITIONS: OrbitDefinition[] = [
  {
    id: 'leo-500',
    name: 'LEO',
    altitudeKm: 500,
    periodMinutes: 94,
    eclipseFraction: 0.35,
    radiation: 'Low to moderate',
    drag: 'High drag / short lifetime',
    deltaVFromLeoKmS: 2.5,
    notes: 'Most common Earth orbit for small satellites.',
  },
  {
    id: 'sso',
    name: 'Sun-synchronous orbit',
    altitudeKm: 700,
    periodMinutes: 98,
    eclipseFraction: 0.18,
    radiation: 'Moderate',
    drag: 'Moderate drag',
    deltaVFromLeoKmS: 3.0,
    notes: 'Near-constant solar geometry.',
  },
  {
    id: 'geo',
    name: 'GEO',
    altitudeKm: 35786,
    periodMinutes: 1436,
    eclipseFraction: 0.5,
    radiation: 'High',
    drag: 'Negligible',
    deltaVFromLeoKmS: 3.9,
    notes: 'Geostationary orbit.',
  },
  {
    id: 'moon',
    name: 'Low lunar orbit',
    altitudeKm: 100,
    periodMinutes: 120,
    eclipseFraction: 0.4,
    radiation: 'High',
    drag: 'Negligible',
    deltaVFromLeoKmS: 3.1,
    notes: 'Requires transfer and orbit insertion.',
  },
];

export const INSTRUMENTS: InstrumentDefinition[] = [
  {
    id: 'camera',
    name: 'CubeSat multispectral camera',
    massKg: 2,
    powerW: 10,
    dataRateMbps: 50,
    dutyCycle: 0.4,
    costUsdM: 0.8,
    trl: 8,
    orbitSuitability: ['LEO', 'SSO'],
    description: 'Visible and near-IR imaging for land and atmosphere monitoring.',
  },
  {
    id: 'hyperspectral',
    name: 'Hyperspectral imager',
    massKg: 25,
    powerW: 45,
    dataRateMbps: 180,
    dutyCycle: 0.5,
    costUsdM: 12,
    trl: 7,
    orbitSuitability: ['LEO', 'SSO'],
    description: 'High spectral-resolution mapping for chemistry and vegetation monitoring.',
  },
  {
    id: 'magnetometer',
    name: 'Fluxgate magnetometer',
    massKg: 1,
    powerW: 2,
    dataRateMbps: 1,
    dutyCycle: 0.9,
    costUsdM: 1.2,
    trl: 8,
    orbitSuitability: ['LEO', 'SSO', 'Moon'],
    description: 'Measures magnetic field variations and space weather conditions.',
  },
  {
    id: 'lidar',
    name: 'Laser altimeter / lidar',
    massKg: 20,
    powerW: 60,
    dataRateMbps: 15,
    dutyCycle: 0.3,
    costUsdM: 8,
    trl: 7,
    orbitSuitability: ['LEO', 'Moon'],
    description: 'Measures terrain height and ice distribution.',
  },
];

export const COMPONENT_CATALOG: ComponentDefinition[] = [
  {
    id: 'bus-small',
    name: 'Small structural bus',
    category: 'Structure',
    massKg: 22,
    powerW: 0,
    costUsdM: 3,
    description: 'Modular 6U class bus frame.',
  },
  {
    id: 'array-body',
    name: 'Body-mounted solar array',
    category: 'Power',
    massKg: 8,
    powerW: 70,
    costUsdM: 4,
    description: 'Reliable panel set for LEO operations.',
  },
  {
    id: 'battery-li-ion',
    name: 'Li-ion battery pack',
    category: 'Power',
    massKg: 9,
    powerW: 0,
    costUsdM: 2,
    description: 'Energy storage for eclipse survival.',
  },
  {
    id: 'radio-sband',
    name: 'S-band radio',
    category: 'Communications',
    massKg: 3,
    powerW: 18,
    costUsdM: 2,
    description: 'Common bus-level communications system.',
  },
  {
    id: 'computer-cots',
    name: 'COTS flight computer',
    category: 'Computing',
    massKg: 2.5,
    powerW: 7,
    costUsdM: 1.5,
    description: 'Onboard processing for command and data handling.',
  },
  {
    id: 'thermal-passive',
    name: 'Passive thermal control',
    category: 'Thermal',
    massKg: 4,
    powerW: 0,
    costUsdM: 1,
    description: 'Thermal surfaces and insulation.',
  },
  {
    id: 'propulsion-cold-gas',
    name: 'Cold-gas propulsion',
    category: 'Propulsion',
    massKg: 6,
    powerW: 4,
    costUsdM: 2,
    description: 'Simple attitude and trim capability.',
  },
];

export const SCENARIOS: Scenario[] = [
  {
    id: 'student-cubesat',
    name: 'Student CubeSat',
    mission: 'Urban heat and crop health over India',
    objective: 'Earth observation',
    difficulty: 'Explorer',
    budgetM: 25,
    deadlineMonths: 12,
  },
  {
    id: 'space-weather',
    name: 'Space Weather Sentinel',
    mission: 'Monitor solar wind and geomagnetic events',
    objective: 'Space weather',
    difficulty: 'Engineer',
    budgetM: 60,
    deadlineMonths: 18,
  },
  {
    id: 'lunar-mapper',
    name: 'Lunar Ice Mapper',
    mission: 'Map water-ice in permanent shadow regions',
    objective: 'Lunar science',
    difficulty: 'Mission Director',
    budgetM: 110,
    deadlineMonths: 24,
  },
];

export function calculateOrbitalPeriod(altitudeM: number, body: Planet = 'Earth'): number {
  const mu = body === 'Moon' ? MU_MOON : body === 'Mars' ? MU_MARS : MU_EARTH;
  const radiusM = body === 'Earth' ? EARTH_RADIUS_M + altitudeM : body === 'Moon' ? 1737400 + altitudeM : 3389500 + altitudeM;
  return 2 * Math.PI * Math.sqrt((radiusM ** 3) / mu);
}

export function calculatePowerGeneration(altitudeKm: number, panelEff = 0.28): number {
  const sunlightFraction = altitudeKm <= 800 ? 0.82 : 0.7;
  return SOLAR_CONSTANT_W_M2 * 2.1 * panelEff * sunlightFraction * 0.9;
}

export function calculateDataVolumeMb(instrumentIds: string[]): number {
  return instrumentIds.reduce((total, id) => {
    const instrument = INSTRUMENTS.find((item) => item.id === id);
    if (!instrument) return total;
    return total + instrument.dataRateMbps * instrument.dutyCycle * 4;
  }, 0);
}

export function calculateOrbitVelocity(altitudeM: number, body: Planet = 'Earth'): number {
  const mu = body === 'Moon' ? MU_MOON : body === 'Mars' ? MU_MARS : MU_EARTH;
  const radiusM = body === 'Earth' ? EARTH_RADIUS_M + altitudeM : body === 'Moon' ? 1737400 + altitudeM : 3389500 + altitudeM;
  return Math.sqrt(mu / radiusM);
}

export function eclipseFraction(altitudeM: number, betaDeg = 0): number {
  const radius = EARTH_RADIUS_M + altitudeM;
  const betaRad = (betaDeg * Math.PI) / 180;
  const ratio = EARTH_RADIUS_M / radius;
  const eclipseBase = (Math.PI / 2 - Math.acos(ratio)) / Math.PI;
  const betaAdjustment = 0.25 * Math.abs(Math.sin(betaRad));
  return Number(Math.min(0.49, Math.max(0.25, eclipseBase + 0.15 + betaAdjustment)));
}

export function rocketEquation({ isp, initialMass, finalMass, g0 = 9.81 }: RocketEquationInputs): number {
  const ratio = initialMass / finalMass;
  return isp * g0 * Math.log(ratio);
}

export function calculateLinkBudget(inputs: LinkBudgetInputs): {
  eirpDbW: number;
  pathLossDb: number;
  gOverTDb: number;
  marginDb: number;
  dataRateBitsPerSecond: number;
} {
  const wavelengthM = 299792458 / inputs.frequencyHz;
  const pathLossDb = 20 * Math.log10((4 * Math.PI * inputs.slantRangeM) / wavelengthM);
  const eirpDbW = inputs.transmitPowerDbW + inputs.antennaGainDb;
  const gOverTDb = inputs.receiverGainDb - 10 * Math.log10(inputs.systemNoiseTemperatureK) + 24;
  const requiredEbN0Db = 6;
  const dataRateDb = 10 * Math.log10(inputs.dataRateBitsPerSecond);
  const receivedPowerDbW = eirpDbW - pathLossDb + gOverTDb;
  const marginDb = receivedPowerDbW - requiredEbN0Db - dataRateDb + 190;

  return {
    eirpDbW,
    pathLossDb,
    gOverTDb,
    marginDb,
    dataRateBitsPerSecond: inputs.dataRateBitsPerSecond,
  };
}

export function scienceScore(inputs: ScienceScoreInputs): number {
  const weighted =
    0.2 * inputs.capability +
    0.2 * inputs.coverage +
    0.15 * inputs.revisit +
    0.2 * inputs.dataDownlinked +
    0.1 * inputs.lifetime +
    0.1 * inputs.pointingAccuracy +
    0.05 * inputs.calibration;

  return Math.round(weighted * 100);
}

export function generateSummaryText(score: number): string {
  if (score >= 85) return 'Excellent mission design with healthy margins and strong science return.';
  if (score >= 70) return 'Mission is viable with minor trade-offs and manageable risk.';
  if (score >= 50) return 'Mission requires additional optimization or risk acceptance.';
  return 'Mission likely fails without a redesign or mission-level trade study.';
}

export function evaluateMissionDesign(design: MissionDesignInput): MissionReport {
  const scenario = SCENARIOS.find((entry) => entry.id === design.scenarioId) ?? SCENARIOS[0];
  const launchVehicle = LAUNCH_VEHICLES.find((entry) => entry.id === design.launchVehicleId) ?? LAUNCH_VEHICLES[0];
  const orbit = ORBIT_DEFINITIONS.find((entry) => entry.id === design.orbitId) ?? ORBIT_DEFINITIONS[0];
  const instruments = INSTRUMENTS.filter((instrument) => design.instrumentIds.includes(instrument.id));
  const components = COMPONENT_CATALOG.filter((component) => design.componentIds.includes(component.id));

  const busMass = components.reduce((sum, component) => sum + component.massKg, 0);
  const payloadMass = instruments.reduce((sum, instrument) => sum + instrument.massKg, 0);
  const totalMass = busMass + payloadMass;

  const capacityKg = orbit.name === 'GEO' ? launchVehicle.gtoKg || launchVehicle.leoKg : orbit.name === 'SSO' ? launchVehicle.ssoKg || launchVehicle.leoKg : launchVehicle.leoKg;
  const launchMarginPct = ((capacityKg - totalMass) / capacityKg) * 100;

  const powerGeneratedW = calculatePowerGeneration(orbit.altitudeKm) + components.reduce((sum, component) => sum + component.powerW, 0) * 0.35;
  const powerConsumedW = 25 + instruments.reduce((sum, instrument) => sum + instrument.powerW, 0) + components.reduce((sum, component) => sum + component.powerW, 0) * 0.6;
  const eclipseHours = Math.max(0.4, orbit.eclipseFraction * 24);
  const batteryReserveWh = 60 + components.filter((component) => component.id === 'battery-li-ion').length * 40;
  const batteryDemandWh = powerConsumedW * eclipseHours;

  const dataProducedMb = calculateDataVolumeMb(design.instrumentIds);
  const dataDownlinkedMb = 140 + (design.componentIds.includes('radio-sband') ? 80 : 35);
  const linkMarginDb = calculateLinkBudget({
    transmitPowerDbW: 18,
    antennaGainDb: 18,
    frequencyHz: 2.2e9,
    slantRangeM: 1_800_000 + orbit.altitudeKm * 1000,
    dataRateBitsPerSecond: Math.max(1_000_000, dataProducedMb * 1000),
    receiverGainDb: 14,
    systemNoiseTemperatureK: 900,
  }).marginDb;

  const lifetimeYears = Math.max(0.6, 5.5 - totalMass / 100 + launchVehicle.reliability * 2.2 - scenario.deadlineMonths / 24);

  const massFail = totalMass > capacityKg;
  const powerFail = powerGeneratedW < powerConsumedW * 1.05;
  const batteryFail = batteryDemandWh > batteryReserveWh;
  const dataFail = dataProducedMb > dataDownlinkedMb;
  const linkFail = linkMarginDb < 3;

  const success = !massFail && !powerFail && !batteryFail && !dataFail && !linkFail;
  const score = Math.max(0, Math.min(100, Math.round((launchMarginPct / 30) * 30 + (powerGeneratedW / powerConsumedW) * 20 + (linkMarginDb / 10) * 20 + (lifetimeYears / 5) * 20 + (success ? 15 : 0))));

  let rootCause = 'Mission design is viable.';
  if (massFail) {
    rootCause = `Mass failed: ${totalMass.toFixed(1)} kg exceeds the launcher capacity of ${capacityKg.toFixed(0)} kg for ${orbit.name}.`;
  } else if (powerFail || batteryFail) {
    rootCause = `Power failed: generated ${powerGeneratedW.toFixed(0)} W against ${powerConsumedW.toFixed(0)} W consumed, while eclipse demand was ${batteryDemandWh.toFixed(0)} Wh and reserve was ${batteryReserveWh.toFixed(0)} Wh.`;
  } else if (dataFail) {
    rootCause = `Data failed: the mission produced ${dataProducedMb.toFixed(0)} MB but only ${dataDownlinkedMb.toFixed(0)} MB can be downlinked.`;
  } else if (linkFail) {
    rootCause = `Link margin failed: the communication system margin is ${linkMarginDb.toFixed(1)} dB, below the 3 dB requirement.`;
  }

  if (success) {
    rootCause = `Mission passed. Launch margin is ${launchMarginPct.toFixed(1)}%, power margin is ${(powerGeneratedW - powerConsumedW).toFixed(0)} W, and link margin is ${linkMarginDb.toFixed(1)} dB.`;
  }

  return {
    success,
    score,
    rootCause,
    massKg: totalMass,
    powerGeneratedW,
    powerConsumedW,
    dataProducedMb,
    dataDownlinkedMb,
    launchMarginPct,
    lifetimeYears,
    linkMarginDb,
  };
}
