import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COMPONENT_CATALOG, INSTRUMENTS, LAUNCH_VEHICLES, ORBIT_DEFINITIONS, SCENARIOS, calculateLinkBudget, evaluateMissionDesign } from '@solaris/shared';
import { useMissionStore } from './store/missionStore';

function App() {
  const mission = useMissionStore();
  const scenario = SCENARIOS.find((entry) => entry.id === mission.scenarioId) ?? SCENARIOS[0];
  const selectedLaunch = LAUNCH_VEHICLES.find((entry) => entry.id === mission.launchVehicleId) ?? LAUNCH_VEHICLES[0];
  const selectedOrbit = ORBIT_DEFINITIONS.find((entry) => entry.id === mission.orbitId) ?? ORBIT_DEFINITIONS[0];
  const selectedInstruments = INSTRUMENTS.filter((entry) => mission.instrumentIds.includes(entry.id));
  const selectedComponents = COMPONENT_CATALOG.filter((entry) => mission.componentIds.includes(entry.id));
  const design = mission.getDesign();
  const metrics = evaluateMissionDesign(design);

  const compatibility = selectedLaunch.orbit.includes(selectedOrbit.name) || selectedLaunch.id === 'pslv-xl';
  const massPercent = Math.max(0, (metrics.massKg / (selectedLaunch.leoKg || 1)) * 100);
  const powerCurve = [
    { phase: 'Sunlit', value: Math.max(metrics.powerGeneratedW, 40) },
    { phase: 'Eclipse', value: Math.max(metrics.powerConsumedW, 30) },
    { phase: 'Recovery', value: Math.max(metrics.powerGeneratedW * 0.8, 25) },
  ];

  const totalBudget = selectedLaunch.costUsdM + selectedInstruments.reduce((sum, instrument) => sum + instrument.costUsdM, 0) + selectedComponents.reduce((sum, component) => sum + component.costUsdM, 0);
  const massState = metrics.launchMarginPct > 20 ? 'nominal' : metrics.launchMarginPct > 5 ? 'warning' : 'critical';
  const powerState = metrics.powerGeneratedW >= metrics.powerConsumedW ? 'nominal' : metrics.powerGeneratedW >= metrics.powerConsumedW * 0.85 ? 'warning' : 'critical';
  const dataState = metrics.dataProducedMb <= metrics.dataDownlinkedMb ? 'nominal' : 'warning';

  const [insertionDeltaV, setInsertionDeltaV] = useState(selectedOrbit.deltaVFromLeoKmS);
  const [survivalMode, setSurvivalMode] = useState(false);
  const [groundStationGainDb, setGroundStationGainDb] = useState(14);
  const [payloadReduced, setPayloadReduced] = useState(false);
  const [buildRushLevelIndex, setBuildRushLevelIndex] = useState(0);
  const [buildRushParts, setBuildRushParts] = useState<string[]>(['bus-small', 'battery-li-ion', 'radio-sband', 'computer-cots', 'camera']);
  const [buildRushTimer, setBuildRushTimer] = useState(60);
  const [buildRushFinished, setBuildRushFinished] = useState(false);
  const [buildRushScore, setBuildRushScore] = useState(0);
  const [buildRushStars, setBuildRushStars] = useState(0);
  const [buildRushResult, setBuildRushResult] = useState('');
  const requiredInsertionDeltaV = selectedOrbit.deltaVFromLeoKmS;
  const insertionSuccess = insertionDeltaV >= requiredInsertionDeltaV;
  const reducedPowerLoad = survivalMode ? metrics.powerConsumedW * 0.75 : metrics.powerConsumedW;
  const powerSurvivalSuccess = metrics.powerGeneratedW >= reducedPowerLoad * 1.05;
  const downlinkDataRate = payloadReduced ? Math.max(1_000_000, (metrics.dataProducedMb * 0.7) * 1000) : Math.max(1_000_000, metrics.dataProducedMb * 1000);
  const linkChallenge = calculateLinkBudget({
    transmitPowerDbW: 18,
    antennaGainDb: 18,
    frequencyHz: 2.2e9,
    slantRangeM: 1_800_000 + selectedOrbit.altitudeKm * 1000,
    dataRateBitsPerSecond: downlinkDataRate,
    receiverGainDb: groundStationGainDb,
    systemNoiseTemperatureK: 900,
  });
  const requiredLinkMargin = 3;
  const linkMarginSuccess = linkChallenge.marginDb >= requiredLinkMargin;
  const downlinkSuccess = (payloadReduced ? metrics.dataProducedMb * 0.7 : metrics.dataProducedMb) <= metrics.dataDownlinkedMb;

  const buildRushLevels = [
    {
      title: '1U single-camera build',
      maxMassKg: 4.5,
      maxPowerW: 15,
      requiredParts: ['bus-small', 'battery-li-ion', 'radio-sband', 'computer-cots', 'camera'],
      brief: 'Build a minimal 1U imaging bus with a battery and uplink.',
    },
    {
      title: '3U deployable panel build',
      maxMassKg: 12,
      maxPowerW: 35,
      requiredParts: ['bus-small', 'array-body', 'battery-li-ion', 'radio-sband', 'computer-cots', 'camera'],
      brief: 'Add deployable power for a 3U payload with a reliable bus.',
    },
    {
      title: '6U multi-instrument build',
      maxMassKg: 18,
      maxPowerW: 60,
      requiredParts: ['bus-small', 'array-body', 'battery-li-ion', 'radio-sband', 'computer-cots', 'camera', 'hyperspectral'],
      brief: 'Support dual payload capability with high-power instrumentation.',
    },
  ];

  const buildRushLevel = buildRushLevels[buildRushLevelIndex];
  const buildRushCatalog = COMPONENT_CATALOG.filter((component) => buildRushLevel.requiredParts.includes(component.id));
  const buildRushInstruments = INSTRUMENTS.filter((instrument) => buildRushLevel.requiredParts.includes(instrument.id));

  const buildRushSelection = [...COMPONENT_CATALOG.filter((component) => buildRushParts.includes(component.id)), ...INSTRUMENTS.filter((instrument) => buildRushParts.includes(instrument.id))];
  const buildRushMassKg = buildRushSelection.reduce((sum, item) => sum + ('massKg' in item ? item.massKg : 0), 0);
  const buildRushPowerW = buildRushSelection.reduce((sum, item) => sum + ('powerW' in item ? item.powerW : 0), 0);
  const buildRushCostM = buildRushSelection.reduce((sum, item) => sum + ('costUsdM' in item ? item.costUsdM : 0), 0);
  const buildRushPass = buildRushLevel.requiredParts.every((requiredId) => buildRushParts.includes(requiredId)) && buildRushMassKg <= buildRushLevel.maxMassKg && buildRushPowerW <= buildRushLevel.maxPowerW;

  useEffect(() => {
    if (buildRushFinished) {
      return;
    }

    const timer = window.setInterval(() => {
      setBuildRushTimer((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setBuildRushFinished(true);
          setBuildRushResult('Time expired. The build was not shipped in time.');
          setBuildRushScore(0);
          setBuildRushStars(0);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [buildRushFinished]);

  const handleBuildRushToggle = (id: string) => {
    setBuildRushParts((current) => (current.includes(id) ? current.filter((part) => part !== id) : [...current, id]));
    if (buildRushFinished) {
      setBuildRushFinished(false);
      setBuildRushResult('');
    }
  };

  const handleBuildRushShip = () => {
    const pass = buildRushPass;
    const score = Math.max(0, Math.min(100, Math.round((buildRushLevel.maxMassKg / Math.max(buildRushMassKg, 1)) * 30 + (buildRushLevel.maxPowerW / Math.max(buildRushPowerW, 1)) * 25 + (pass ? 45 : 0))));
    const stars = pass ? (score >= 80 ? 3 : 2) : 1;
    setBuildRushFinished(true);
    setBuildRushScore(score);
    setBuildRushStars(stars);
    setBuildRushResult(pass
      ? `Build passed. The selected stack massed ${buildRushMassKg.toFixed(1)} kg, drew ${buildRushPowerW.toFixed(0)} W, and met the required mission load with ${buildRushCostM.toFixed(1)}M cost.`
      : `Build failed. The stack massed ${buildRushMassKg.toFixed(1)} kg and drew ${buildRushPowerW.toFixed(0)} W, exceeding the ${buildRushLevel.maxMassKg.toFixed(1)} kg and ${buildRushLevel.maxPowerW.toFixed(0)} W limits.`);
  };

  const resetBuildRush = () => {
    setBuildRushFinished(false);
    setBuildRushTimer(60);
    setBuildRushScore(0);
    setBuildRushStars(0);
    setBuildRushResult('');
    setBuildRushParts(['bus-small', 'battery-li-ion', 'radio-sband', 'computer-cots', 'camera']);
  };

  const nextBuildRushLevel = () => {
    setBuildRushLevelIndex((current) => (current + 1) % buildRushLevels.length);
    resetBuildRush();
  };

  const useBuildRushResult = () => {
    mission.setSelectedComponents(Array.from(new Set(buildRushParts)));
  };

  return (
    <div className="min-h-screen bg-[#05070d] text-[#e9e4d8]">
      <header className="border-b border-[#ffb347]/30 bg-[#05070d]/90 px-6 py-5 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.38em] text-[#ffb347]">SOLARIS</div>
            <div className="mt-2 text-xl font-semibold text-[#e9e4d8]">Mission Design Lab</div>
          </div>
          <div className="text-right text-xs uppercase tracking-[0.22em] text-[#8fd3e8]">
            {scenario.name}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <section className="grid gap-6 lg:grid-cols-[1.2fr_1.5fr]">
          <div className="border border-[#ffb347]/30 bg-[#0a1018] p-5">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#ffb347]">Scenario</div>
            <h1 className="mt-3 text-2xl font-semibold text-[#e9e4d8]">{scenario.name}</h1>
            <p className="mt-3 text-sm text-[#d9d4ca]">{scenario.mission}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="border border-[#ffb347]/20 bg-[#090d14] p-3">
                <div className="text-[9px] uppercase tracking-[0.2em] text-[#8fd3e8]">Budget</div>
                <div className="mt-2 font-medium text-[#e9e4d8]">${scenario.budgetM}M</div>
              </div>
              <div className="border border-[#ffb347]/20 bg-[#090d14] p-3">
                <div className="text-[9px] uppercase tracking-[0.2em] text-[#8fd3e8]">Deadline</div>
                <div className="mt-2 font-medium text-[#e9e4d8]">{scenario.deadlineMonths} months</div>
              </div>
            </div>
            <div className="mt-5 border border-[#ffb347]/20 bg-[#090d14] p-4">
              <div className="text-[9px] uppercase tracking-[0.2em] text-[#8fd3e8]">Mission objective</div>
              <div className="mt-2 text-sm text-[#e9e4d8]">{scenario.objective}</div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {SCENARIOS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-label={`Select mission ${entry.name}`}
                  onClick={() => mission.setScenario(entry.id)}
                  className={`rounded border px-3 py-2 text-[10px] uppercase tracking-[0.2em] ${mission.scenarioId === entry.id ? 'border-[#ffb347] bg-[#ffb347]/15 text-[#ffb347]' : 'border-[#ffb347]/20 bg-[#090d14] text-[#e9e4d8]'}`}
                >
                  Select mission
                </button>
              ))}
            </div>
            <div className="mt-5">
              <div className="text-[9px] uppercase tracking-[0.2em] text-[#8fd3e8]">Requirements</div>
              <ul className="mt-3 space-y-2 text-sm text-[#d9d4ca]">
                <li>• Support crop-health imaging at 10–20 m resolution.</li>
                <li>• Maintain at least 20% launch margin.</li>
                <li>• Keep power margin above 10% during eclipse.</li>
                <li>• Downlink at least 60 MB per orbit.</li>
              </ul>
            </div>
          </div>

          <div className="border border-[#ffb347]/30 bg-[#0a1018] p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#ffb347]">Mission telemetry</div>
              <div className="rounded border border-[#ffb347]/20 bg-[#090d14] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[#8fd3e8]">
                {mission.report ? mission.report.success ? 'Mission passed' : 'Mission failed' : 'Ready'}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="border border-[#ffb347]/20 bg-[#090d14] p-3">
                <div className="text-[9px] uppercase tracking-[0.2em] text-[#8fd3e8]">Mass</div>
                <div className="mt-2 text-xl font-semibold text-[#e9e4d8]">{metrics.massKg.toFixed(1)} kg</div>
              </div>
              <div className="border border-[#ffb347]/20 bg-[#090d14] p-3">
                <div className="text-[9px] uppercase tracking-[0.2em] text-[#8fd3e8]">Power</div>
                <div className="mt-2 text-xl font-semibold text-[#e9e4d8]">{metrics.powerGeneratedW.toFixed(0)} W</div>
              </div>
              <div className="border border-[#ffb347]/20 bg-[#090d14] p-3">
                <div className="text-[9px] uppercase tracking-[0.2em] text-[#8fd3e8]">Link margin</div>
                <div className="mt-2 text-xl font-semibold text-[#e9e4d8]">{metrics.linkMarginDb.toFixed(1)} dB</div>
              </div>
            </div>

            <div className="mt-4 rounded border border-[#ffb347]/20 bg-[#090d14] p-3">
              <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-[#8fd3e8]">Mission note</div>
              <div className="text-sm text-[#e9e4d8]">{mission.reason}</div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1.3fr_0.9fr]">
          <div className="border border-[#ffb347]/30 bg-[#0a1018] p-5">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#ffb347]">Design</div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-[9px] uppercase tracking-[0.2em] text-[#8fd3e8]">Difficulty</label>
                <div className="mt-2 flex gap-2">
                  {(['Explorer', 'Engineer', 'Mission Director'] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => mission.setDifficulty(level)}
                      className={`rounded border px-3 py-2 text-xs uppercase tracking-[0.12em] ${mission.difficulty === level ? 'border-[#ffb347] bg-[#ffb347]/15 text-[#ffb347]' : 'border-[#ffb347]/20 bg-[#090d14] text-[#e9e4d8]'}`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[9px] uppercase tracking-[0.2em] text-[#8fd3e8]">Launch vehicle</label>
                <select
                  value={mission.launchVehicleId}
                  onChange={(event) => mission.setLaunchVehicle(event.target.value)}
                  className="mt-2 w-full border border-[#ffb347]/20 bg-[#090d14] p-3 text-sm text-[#e9e4d8]"
                >
                  {LAUNCH_VEHICLES.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>
                  ))}
                </select>
                <div className={`mt-2 text-xs ${compatibility ? 'text-[#6fcf97]' : 'text-[#ff5a4d]'}`}>
                  {compatibility ? 'Compatible: launcher can deliver this orbit.' : `Incompatible: ${selectedLaunch.name} cannot reach ${selectedOrbit.name}.`}
                </div>
              </div>

              <div>
                <label className="text-[9px] uppercase tracking-[0.2em] text-[#8fd3e8]">Orbit</label>
                <select
                  value={mission.orbitId}
                  onChange={(event) => mission.setOrbit(event.target.value)}
                  className="mt-2 w-full border border-[#ffb347]/20 bg-[#090d14] p-3 text-sm text-[#e9e4d8]"
                >
                  {ORBIT_DEFINITIONS.map((orbit) => (
                    <option key={orbit.id} value={orbit.id}>{orbit.name} · {orbit.altitudeKm} km</option>
                  ))}
                </select>
                <div className="mt-2 text-xs text-[#8fd3e8]">eclipse fraction: {selectedOrbit.eclipseFraction.toFixed(2)} · period: {selectedOrbit.periodMinutes.toFixed(0)} min</div>
              </div>
            </div>
          </div>

          <div className="border border-[#ffb347]/30 bg-[#0a1018] p-5">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#ffb347]">Subsystems</div>
            <div className="mt-4 space-y-3">
              {COMPONENT_CATALOG.map((component) => {
                const active = mission.componentIds.includes(component.id);
                return (
                  <button
                    key={component.id}
                    type="button"
                    onClick={() => mission.toggleComponent(component.id)}
                    className={`flex w-full items-center justify-between border p-3 text-left ${active ? 'border-[#ffb347]/40 bg-[#ffb347]/10' : 'border-[#ffb347]/20 bg-[#090d14]'}`}
                  >
                    <div>
                      <div className="text-sm font-medium text-[#e9e4d8]">{component.name}</div>
                      <div className="text-[11px] text-[#8fd3e8]">{component.category}</div>
                    </div>
                    <div className="text-right text-xs text-[#d9d4ca]">
                      <div>{component.massKg} kg</div>
                      <div>{component.powerW} W</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border border-[#ffb347]/30 bg-[#0a1018] p-5">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#ffb347]">Instruments</div>
            <div className="mt-4 space-y-3">
              {INSTRUMENTS.map((instrument) => {
                const active = mission.instrumentIds.includes(instrument.id);
                const compatible = instrument.orbitSuitability.includes(selectedOrbit.name);
                const reason = compatible ? 'Compatible with selected orbit.' : `Not compatible: ${instrument.name} is intended for ${instrument.orbitSuitability.join(', ')}`;
                return (
                  <button
                    key={instrument.id}
                    type="button"
                    disabled={!compatible}
                    onClick={() => mission.toggleInstrument(instrument.id)}
                    className={`flex w-full items-center justify-between border p-3 text-left ${active ? 'border-[#6fcf97]/40 bg-[#6fcf97]/10' : compatible ? 'border-[#ffb347]/20 bg-[#090d14]' : 'border-[#ff5a4d]/20 bg-[#1d090c] opacity-40'}`}
                  >
                    <div>
                      <div className="text-sm font-medium text-[#e9e4d8]">{instrument.name}</div>
                      <div className="text-[11px] text-[#8fd3e8]">{reason}</div>
                    </div>
                    <div className="ml-2 text-right text-xs text-[#d9d4ca]">
                      <div>{instrument.massKg} kg</div>
                      <div>{instrument.powerW} W</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="border border-[#ffb347]/30 bg-[#0a1018] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#ffb347]">Live dashboard</div>
              <button
                type="button"
                onClick={() => mission.runSimulation()}
                className="rounded border border-[#ffb347]/50 bg-[#ffb347]/15 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[#ffb347]"
              >
                Launch
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-2 flex justify-between text-xs text-[#8fd3e8]">
                  <span>Mass margin</span>
                  <span>{metrics.launchMarginPct.toFixed(1)}%</span>
                </div>
                <div className="h-2.5 overflow-hidden border border-[#ffb347]/20 bg-[#090d14]">
                  <div className={`h-full ${massState === 'critical' ? 'bg-[#ff5a4d]' : massState === 'warning' ? 'bg-[#ffb347]' : 'bg-[#6fcf97]'}`} style={{ width: `${Math.min(100, Math.max(10, 100 - massPercent))}%` }} />
                </div>
                <div className="mt-1 text-[11px] text-[#d9d4ca]">{massState === 'critical' ? 'Mass margin is too small for a safe launch.' : 'Mass margin is acceptable for this orbit.'}</div>
              </div>

              <div>
                <div className="mb-2 flex justify-between text-xs text-[#8fd3e8]">
                  <span>Power margin</span>
                  <span>{(metrics.powerGeneratedW - metrics.powerConsumedW).toFixed(0)} W</span>
                </div>
                <div className="h-2.5 overflow-hidden border border-[#ffb347]/20 bg-[#090d14]">
                  <div className={`h-full ${powerState === 'critical' ? 'bg-[#ff5a4d]' : powerState === 'warning' ? 'bg-[#ffb347]' : 'bg-[#6fcf97]'}`} style={{ width: `${Math.min(100, Math.max(10, (metrics.powerGeneratedW / Math.max(metrics.powerConsumedW, 1)) * 100))}%` }} />
                </div>
                <div className="mt-1 text-[11px] text-[#d9d4ca]">{powerState === 'critical' ? 'Power generation is below demand during eclipse.' : 'Power production covers the mission load.'}</div>
              </div>

              <div>
                <div className="mb-2 flex justify-between text-xs text-[#8fd3e8]">
                  <span>Data budget</span>
                  <span>{metrics.dataProducedMb.toFixed(0)} / {metrics.dataDownlinkedMb.toFixed(0)} MB</span>
                </div>
                <div className="h-2.5 overflow-hidden border border-[#ffb347]/20 bg-[#090d14]">
                  <div className={`h-full ${dataState === 'warning' ? 'bg-[#ffb347]' : 'bg-[#6fcf97]'}`} style={{ width: `${Math.min(100, (metrics.dataProducedMb / Math.max(metrics.dataDownlinkedMb, 1)) * 100)}%` }} />
                </div>
                <div className="mt-1 text-[11px] text-[#d9d4ca]">{dataState === 'warning' ? 'Data generation is approaching downlink limits.' : 'Data plan is healthy.'}</div>
              </div>
            </div>

            <div className="mt-5 h-36 border border-[#ffb347]/20 bg-[#090d14] p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={powerCurve}>
                  <CartesianGrid stroke="#ffb34722" />
                  <XAxis dataKey="phase" stroke="#8fd3e8" tick={{ fill: '#8fd3e8', fontSize: 10 }} />
                  <YAxis stroke="#8fd3e8" tick={{ fill: '#8fd3e8', fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#ffb347" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border border-[#ffb347]/30 bg-[#0a1018] p-5">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#ffb347]">Mission report</div>
            {mission.report ? (
              <div className="mt-4 space-y-4">
                <div className={`rounded border p-3 text-sm ${mission.report.success ? 'border-[#6fcf97]/30 bg-[#6fcf97]/10 text-[#dff7e8]' : 'border-[#ff5a4d]/30 bg-[#ff5a4d]/10 text-[#ffd9d5]'}`}>
                  {mission.report.success ? 'Mission passed.' : 'Mission failed.'} Score: {mission.report.score}
                </div>
                <div className="rounded border border-[#ffb347]/20 bg-[#090d14] p-3 text-sm text-[#e9e4d8]">
                  {mission.report.rootCause}
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs text-[#d9d4ca]">
                  <div className="border border-[#ffb347]/20 bg-[#090d14] p-2">Mass: {mission.report.massKg.toFixed(1)} kg</div>
                  <div className="border border-[#ffb347]/20 bg-[#090d14] p-2">Link: {mission.report.linkMarginDb.toFixed(1)} dB</div>
                  <div className="border border-[#ffb347]/20 bg-[#090d14] p-2">Power: {mission.report.powerGeneratedW.toFixed(0)} W</div>
                  <div className="border border-[#ffb347]/20 bg-[#090d14] p-2">Lifetime: {mission.report.lifetimeYears.toFixed(1)} y</div>
                </div>
                <button
                  type="button"
                  onClick={() => mission.runSimulation()}
                  className="w-full rounded border border-[#ffb347]/30 bg-[#090d14] px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[#ffb347]"
                >
                  Re-run analysis
                </button>
              </div>
            ) : (
              <div className="mt-4 rounded border border-[#ffb347]/20 bg-[#090d14] p-4 text-sm text-[#d9d4ca]">
                No mission report yet. Select a scenario, build the vehicle, and launch to generate the mission report.
              </div>
            )}
          </div>
        </section>

        <section className="border border-[#ffb347]/30 bg-[#0a1018] p-5">
          <div className="mb-4 text-[10px] uppercase tracking-[0.28em] text-[#ffb347]">Orbit insertion & power survival</div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded border border-[#ffb347]/20 bg-[#090d14] p-4">
              <div className="text-sm font-medium text-[#e9e4d8]">Required insertion delta-v</div>
              <div className="mt-2 text-2xl font-semibold text-[#8fd3e8]">{requiredInsertionDeltaV.toFixed(1)} km/s</div>
              <label className="mt-4 block text-[10px] uppercase tracking-[0.2em] text-[#8fd3e8]" htmlFor="insertion-delta-v">Insertion delta-v (km/s)</label>
              <input
                id="insertion-delta-v"
                aria-label="Insertion delta-v (km/s)"
                type="number"
                min={0}
                step={0.1}
                value={insertionDeltaV}
                onChange={(event) => setInsertionDeltaV(Number(event.target.value) || 0)}
                className="mt-2 w-full border border-[#ffb347]/20 bg-[#090d14] p-3 text-sm text-[#e9e4d8]"
              />
              <button
                type="button"
                onClick={() => setInsertionDeltaV(requiredInsertionDeltaV)}
                className="mt-4 rounded border border-[#ffb347]/40 bg-[#ffb347]/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[#ffb347]"
              >
                Apply burn
              </button>
              <div className="mt-4 rounded border border-[#ffb347]/20 bg-[#090d14] p-3 text-sm text-[#d9d4ca]">
                Insertion burn status: {insertionSuccess ? 'Enough delta-v to achieve the target orbit.' : `Short by ${(requiredInsertionDeltaV - insertionDeltaV).toFixed(1)} km/s.`}
              </div>
            </div>

            <div className="rounded border border-[#ffb347]/20 bg-[#090d14] p-4">
              <div className="text-sm font-medium text-[#e9e4d8]">Power survival challenge</div>
              <div className="mt-2 text-2xl font-semibold text-[#8fd3e8]">{((metrics.powerGeneratedW / Math.max(reducedPowerLoad, 1)) * 100).toFixed(0)}% load margin</div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setSurvivalMode((value) => !value)}
                  className="rounded border border-[#6fcf97]/40 bg-[#6fcf97]/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[#6fcf97]"
                >
                  {survivalMode ? 'Disable survival mode' : 'Enable survival mode'}
                </button>
              </div>
              <div className="mt-4 rounded border border-[#ffb347]/20 bg-[#090d14] p-3 text-sm text-[#d9d4ca]">
                Power survival status: {powerSurvivalSuccess ? 'Battery and solar array can sustain eclipse conditions.' : `Need ${(reducedPowerLoad * 1.05 - metrics.powerGeneratedW).toFixed(0)} W more generation or load shedding.`}
              </div>
              <div className="mt-3 text-xs text-[#8fd3e8]">
                Eclipse fraction: {selectedOrbit.eclipseFraction.toFixed(2)} · power load: {reducedPowerLoad.toFixed(0)} W
              </div>
            </div>
          </div>
        </section>

        <section className="border border-[#ffb347]/30 bg-[#0a1018] p-5">
          <div className="mb-4 text-[10px] uppercase tracking-[0.28em] text-[#ffb347]">Link budget & downlink challenge</div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded border border-[#ffb347]/20 bg-[#090d14] p-4">
              <div className="text-sm font-medium text-[#e9e4d8]">Required link margin</div>
              <div className="mt-2 text-2xl font-semibold text-[#8fd3e8]">{requiredLinkMargin.toFixed(0)} dB</div>
              <label className="mt-4 block text-[10px] uppercase tracking-[0.2em] text-[#8fd3e8]" htmlFor="ground-station-gain">Ground station gain (dB)</label>
              <input
                id="ground-station-gain"
                aria-label="Ground station gain (dB)"
                type="number"
                min={5}
                max={40}
                step={1}
                value={groundStationGainDb}
                onChange={(event) => setGroundStationGainDb(Number(event.target.value) || 0)}
                className="mt-2 w-full border border-[#ffb347]/20 bg-[#090d14] p-3 text-sm text-[#e9e4d8]"
              />
              <button
                type="button"
                onClick={() => setGroundStationGainDb(14)}
                className="mt-4 rounded border border-[#ffb347]/40 bg-[#ffb347]/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[#ffb347]"
              >
                Update link
              </button>
              <div className="mt-4 rounded border border-[#ffb347]/20 bg-[#090d14] p-3 text-sm text-[#d9d4ca]">
                Link margin status: {linkMarginSuccess ? 'Link budget meets the requirement.' : `Need ${(requiredLinkMargin - linkChallenge.marginDb).toFixed(1)} dB more margin.`}
              </div>
            </div>

            <div className="rounded border border-[#ffb347]/20 bg-[#090d14] p-4">
              <div className="text-sm font-medium text-[#e9e4d8]">Downlink challenge</div>
              <div className="mt-2 text-2xl font-semibold text-[#8fd3e8]">{linkChallenge.marginDb.toFixed(1)} dB</div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setPayloadReduced((value) => !value)}
                  className="rounded border border-[#6fcf97]/40 bg-[#6fcf97]/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[#6fcf97]"
                >
                  {payloadReduced ? 'Restore payload' : 'Reduce payload'}
                </button>
              </div>
              <div className="mt-4 rounded border border-[#ffb347]/20 bg-[#090d14] p-3 text-sm text-[#d9d4ca]">
                Downlink status: {downlinkSuccess ? 'Downlink capacity covers the mission data volume.' : `Need to lower data volume by ${(payloadReduced ? metrics.dataProducedMb * 0.7 : metrics.dataProducedMb) - metrics.dataDownlinkedMb} MB.`}
              </div>
              <div className="mt-3 text-xs text-[#8fd3e8]">
                Data: {(payloadReduced ? metrics.dataProducedMb * 0.7 : metrics.dataProducedMb).toFixed(0)} MB / {metrics.dataDownlinkedMb.toFixed(0)} MB downlink budget
              </div>
            </div>
          </div>
        </section>

        <section className="border border-[#ffb347]/30 bg-[#0a1018] p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#ffb347]">Build Rush</div>
              <div className="mt-2 text-2xl font-semibold text-[#e9e4d8]">{buildRushLevel.title}</div>
            </div>
            <div className="rounded border border-[#ffb347]/20 bg-[#090d14] px-3 py-2 text-sm text-[#8fd3e8]">{buildRushTimer}s</div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded border border-[#ffb347]/20 bg-[#090d14] p-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#8fd3e8]">Mission work order</div>
              <div className="mt-3 text-sm text-[#e9e4d8]">{buildRushLevel.brief}</div>
              <div className="mt-4 space-y-2 text-sm text-[#d9d4ca]">
                <div>Target mass: {buildRushLevel.maxMassKg.toFixed(1)} kg</div>
                <div>Target power: {buildRushLevel.maxPowerW.toFixed(0)} W</div>
                <div>Required stack: {buildRushLevel.requiredParts.join(', ')}</div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {[...buildRushCatalog, ...buildRushInstruments].map((item) => {
                  const selected = buildRushParts.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={`Build Rush ${item.name}`}
                      onClick={() => handleBuildRushToggle(item.id)}
                      className={`rounded border p-3 text-left ${selected ? 'border-[#6fcf97]/40 bg-[#6fcf97]/10' : 'border-[#ffb347]/20 bg-[#090d14]'}`}
                    >
                      <div className="text-sm font-medium text-[#e9e4d8]">{item.name}</div>
                      <div className="mt-1 text-[11px] text-[#8fd3e8]">{'category' in item ? item.category : 'Instrument'}</div>
                      <div className="mt-2 text-xs text-[#d9d4ca]">{('massKg' in item ? item.massKg : 0).toFixed(1)} kg · {('powerW' in item ? item.powerW : 0).toFixed(0)} W</div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={handleBuildRushShip}
                  className="rounded border border-[#ffb347]/40 bg-[#ffb347]/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[#ffb347]"
                >
                  Ship build
                </button>
                <button
                  type="button"
                  aria-label="Build Rush reset board"
                  onClick={resetBuildRush}
                  className="rounded border border-[#ffb347]/20 bg-[#090d14] px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[#e9e4d8]"
                >
                  Play again
                </button>
              </div>
            </div>

            <div className="rounded border border-[#ffb347]/20 bg-[#090d14] p-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#8fd3e8]">Build status</div>
              <div className="mt-3 space-y-3 text-sm text-[#d9d4ca]">
                <div>Selected mass: {buildRushMassKg.toFixed(1)} kg</div>
                <div>Selected power: {buildRushPowerW.toFixed(0)} W</div>
                <div>Selected cost: ${buildRushCostM.toFixed(1)}M</div>
              </div>

              {!buildRushFinished ? (
                <div className="mt-5 rounded border border-[#ffb347]/20 bg-[#090d14] p-3 text-sm text-[#d9d4ca]">
                  Assembly still in progress. Check mass, power, and required components before shipping.
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  <div className={`rounded border p-3 text-sm ${buildRushPass ? 'border-[#6fcf97]/30 bg-[#6fcf97]/10 text-[#dff7e8]' : 'border-[#ff5a4d]/30 bg-[#ff5a4d]/10 text-[#ffd9d5]'}`}>
                    {buildRushPass ? 'Build passed' : 'Build failed'} · score {buildRushScore}
                  </div>
                  <div className="rounded border border-[#ffb347]/20 bg-[#090d14] p-3 text-sm text-[#d9d4ca]">
                    {buildRushResult}
                  </div>
                  <div className="text-sm text-[#8fd3e8]">Stars: {'★'.repeat(buildRushStars) + '☆'.repeat(3 - buildRushStars)}</div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      aria-label="Build Rush retry result"
                      onClick={resetBuildRush}
                      className="rounded border border-[#ffb347]/20 bg-[#090d14] px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[#e9e4d8]"
                    >
                      Play again
                    </button>
                    <button
                      type="button"
                      aria-label="Build Rush next level"
                      onClick={nextBuildRushLevel}
                      className="rounded border border-[#ffb347]/40 bg-[#ffb347]/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[#ffb347]"
                    >
                      Next level
                    </button>
                    <button
                      type="button"
                      aria-label="Build Rush apply mission result"
                      onClick={useBuildRushResult}
                      className="rounded border border-[#6fcf97]/40 bg-[#6fcf97]/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[#6fcf97]"
                    >
                      Use this result in my mission
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="border border-[#ffb347]/30 bg-[#0a1018] p-5">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#ffb347]">Selected payload</div>
            <div className="mt-4 space-y-3 text-sm text-[#d9d4ca]">
              {selectedInstruments.length === 0 ? <div>No instruments selected.</div> : selectedInstruments.map((instrument) => (
                <div key={instrument.id} className="flex items-center justify-between border border-[#ffb347]/20 bg-[#090d14] p-3">
                  <span>{instrument.name}</span>
                  <span>{instrument.massKg} kg · {instrument.powerW} W</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-[#ffb347]/30 bg-[#0a1018] p-5">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#ffb347]">Budget summary</div>
            <div className="mt-4 space-y-3 text-sm text-[#d9d4ca]">
              <div className="flex justify-between border border-[#ffb347]/20 bg-[#090d14] p-3"><span>Launch vehicle</span><span>${selectedLaunch.costUsdM}M</span></div>
              <div className="flex justify-between border border-[#ffb347]/20 bg-[#090d14] p-3"><span>Payload</span><span>${selectedInstruments.reduce((sum, instrument) => sum + instrument.costUsdM, 0).toFixed(1)}M</span></div>
              <div className="flex justify-between border border-[#ffb347]/20 bg-[#090d14] p-3"><span>Subsystems</span><span>${selectedComponents.reduce((sum, component) => sum + component.costUsdM, 0).toFixed(1)}M</span></div>
              <div className="flex justify-between border border-[#ffb347]/30 bg-[#ffb347]/10 p-3 font-medium text-[#ffb347]"><span>Total</span><span>${totalBudget.toFixed(1)}M</span></div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
