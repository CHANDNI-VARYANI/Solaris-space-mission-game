import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import {
  calculateMissionEclipseMinutes,
  calculateMissionOrbitPeriodMinutes,
  simulateEclipseSchedule,
  TESSERACT_MISSIONS,
} from '@solaris/shared';
import type { EclipseScheduleResult } from '@solaris/shared';

const SEGMENTS = 12;
const ROUND_SECONDS = 75;
type ScheduleMode = 'instrument' | 'heater';

export function EclipseEnergy({
  missionId,
  solarW,
  totalLoadW,
  instrumentLoadW,
  heaterLoadW = 1.4,
  batteryCapacityWh,
  onComplete,
}: {
  missionId: string;
  solarW: number;
  totalLoadW: number;
  instrumentLoadW: number;
  heaterLoadW?: number;
  batteryCapacityWh: number;
  onComplete: (result: EclipseScheduleResult) => void;
}) {
  const mission = TESSERACT_MISSIONS.find((item) => item.id === missionId) ?? TESSERACT_MISSIONS[0];
  const periodMinutes = calculateMissionOrbitPeriodMinutes();
  const eclipseMinutes = calculateMissionEclipseMinutes();
  const segmentMinutes = periodMinutes / SEGMENTS;
  const baseLoadW = Math.max(0, totalLoadW - instrumentLoadW);
  const eclipseStart = periodMinutes - eclipseMinutes;
  const isShadow = (index: number) => index * segmentMinutes + segmentMinutes / 2 >= eclipseStart;
  const [mode, setMode] = useState<ScheduleMode>('instrument');
  const [instrumentSchedule, setInstrumentSchedule] = useState(() => Array.from({ length: SEGMENTS }, (_, index) => index < 7));
  const [heaterSchedule, setHeaterSchedule] = useState(() => Array.from({ length: SEGMENTS }, () => false));
  const [remainingSeconds, setRemainingSeconds] = useState(ROUND_SECONDS);
  const [result, setResult] = useState<EclipseScheduleResult | null>(null);
  const [message, setMessage] = useState('Instrument is on for 7 sunlight segments. Add heater only where it is needed.');
  const [replayKey, setReplayKey] = useState(0);

  const scheduleResult = useMemo(() => simulateEclipseSchedule({
    solarW,
    baseLoadW,
    instrumentLoadW,
    heaterLoadW,
    batteryCapacityWh,
    observationQuotaMinutes: mission.observationQuotaMinutes,
    instrumentSchedule,
    heaterSchedule,
  }), [solarW, baseLoadW, instrumentLoadW, heaterLoadW, batteryCapacityWh, mission.observationQuotaMinutes, instrumentSchedule, heaterSchedule]);

  useEffect(() => {
    if (result) return;
    const timer = window.setInterval(() => setRemainingSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [result, replayKey]);

  useEffect(() => {
    if (remainingSeconds === 0 && !result) runOrbit();
  }, [remainingSeconds]);

  const toggleSegment = (index: number) => {
    if (result) return;
    if (mode === 'instrument') {
      setInstrumentSchedule((current) => current.map((enabled, slot) => slot === index ? !enabled : enabled));
      setMessage(isShadow(index) ? 'Observations in eclipse add load but no Earth-science minutes.' : 'Observation schedule updated. Run the orbit to check battery and quota.');
    } else {
      setHeaterSchedule((current) => current.map((enabled, slot) => slot === index ? !enabled : enabled));
      setMessage(isShadow(index) ? 'Eclipse heater toggled. Watch the safe depth-of-discharge boundary.' : 'A sunlit heater adds demand while solar generation is available.');
    }
  };

  const runOrbit = () => {
    if (result) return;
    setResult(scheduleResult);
    setMessage(scheduleResult.reason);
  };

  const resetSchedule = () => {
    setInstrumentSchedule(Array.from({ length: SEGMENTS }, (_, index) => index < 7));
    setHeaterSchedule(Array.from({ length: SEGMENTS }, () => false));
    setRemainingSeconds(ROUND_SECONDS);
    setResult(null);
    setMessage('Schedule reset. Keep the payload on in sunlight; use eclipse slots carefully.');
    setReplayKey((value) => value + 1);
  };

  return (
    <motion.section className="eclipse-panel game-panel" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
      <header className="ops-header">
        <div><div className="panel-kicker">OPERATIONS / 02</div><h2>Eclipse Energy</h2></div>
        <div className="ops-timer"><b>{remainingSeconds}</b><small>SEC</small></div>
      </header>
      <div className="eclipse-stats">
        <span>ORBIT <b>{periodMinutes.toFixed(1)} min</b></span>
        <span>SHADOW <b>{eclipseMinutes.toFixed(1)} min</b></span>
        <span>BATTERY <b>{batteryCapacityWh} Wh</b></span>
        <span>SAFE FLOOR <b>{(batteryCapacityWh * 0.6).toFixed(1)} Wh</b></span>
      </div>
      <div className="orbit-timeline" role="group" aria-label="Orbit power schedule">
        {Array.from({ length: SEGMENTS }, (_, index) => {
          const shadow = isShadow(index);
          const instrumentOn = instrumentSchedule[index];
          const heaterOn = heaterSchedule[index];
          return <button
            key={index}
            className={`orbit-sector ${shadow ? 'shadow' : 'sun'} ${instrumentOn ? 'instrument-on' : ''} ${heaterOn ? 'heater-on' : ''} ${result?.criticalSegment === index ? 'brownout' : ''}`}
            style={{ '--angle': `${index * (360 / SEGMENTS)}deg` } as React.CSSProperties}
            type="button"
            aria-label={`Orbit segment ${index + 1}, ${shadow ? 'eclipse' : 'sunlight'}, instrument ${instrumentOn ? 'on' : 'off'}, heater ${heaterOn ? 'on' : 'off'}`}
            onClick={() => toggleSegment(index)}
          >
            <i>{index + 1}</i><span>{instrumentOn ? '◈' : '·'}</span><b>{heaterOn ? 'H' : ''}</b>
          </button>;
        })}
      </div>
      <div className="timeline-legend"><span><i className="sun-key" />SUNLIGHT</span><span><i className="shadow-key" />ECLIPSE</span><span><i className="instrument-key" />INSTRUMENT</span><span><i className="heater-key" />HEATER</span></div>
      <div className="schedule-controls">
        <div className="mode-switch" role="group" aria-label="Schedule mode">
          <button type="button" className={mode === 'instrument' ? 'active' : ''} onClick={() => setMode('instrument')}>◈ INSTRUMENT</button>
          <button type="button" className={mode === 'heater' ? 'active' : ''} onClick={() => setMode('heater')}>♨ HEATER</button>
        </div>
        <div className="energy-bars">
          <div><span>MIN BATTERY</span><b>{scheduleResult.minimumBatteryPct.toFixed(0)}%</b><i><em style={{ width: `${Math.min(100, scheduleResult.minimumBatteryPct)}%`, background: scheduleResult.batterySafe ? '#34d17a' : '#ff6b6b' }} /></i></div>
          <div><span>OBSERVATIONS</span><b>{scheduleResult.observationMinutes.toFixed(0)} / {mission.observationQuotaMinutes} min</b><i><em style={{ width: `${Math.min(100, scheduleResult.observationMinutes / mission.observationQuotaMinutes * 100)}%` }} /></i></div>
        </div>
      </div>
      {result ? (
        <div className={`eclipse-result ${result.success ? 'passed' : 'failed'}`}>
          <div><b>{result.success ? 'ORBIT SURVIVED' : result.batterySafe ? 'OBSERVATION QUOTA MISSED' : `BROWNOUT / SEGMENT ${(result.criticalSegment ?? 0) + 1}`}</b><span>{result.reason}</span></div>
          <div className="eclipse-result-actions"><button className="game-button secondary" onClick={resetSchedule}>REPLAY ROUND</button><button className="game-button primary" onClick={() => onComplete(result)}>NEXT / MISSION SEQUENCER <span>↗</span></button></div>
        </div>
      ) : (
        <div className="eclipse-footer"><span>{message}</span><button type="button" className="game-button primary" onClick={runOrbit}>RUN ONE ORBIT <span>↗</span></button></div>
      )}
    </motion.section>
  );
}