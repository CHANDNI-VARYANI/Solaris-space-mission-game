import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { calculateDownlinkCapacityMb } from '@solaris/shared';

const DECISION_SECONDS = 12;
type IncidentEffect = { risk: number; batteryDeltaWh: number; dataLossMb: number; sciencePenalty: number; budgetSavedK: number };
type IncidentOption = { id: string; label: string; subline: string; effect: IncidentEffect };
type Incident = { id: string; title: string; signal: string; description: string; icon: string; options: IncidentOption[] };
export type MissionControlResult = IncidentEffect & { score: number; eventsHandled: number; summary: string };

function makeIncidents(radioId: string): Incident[] {
  const relayCapacityMb = calculateDownlinkCapacityMb(radioId, 1);
  return [
    {
      id: 'flare', title: 'Solar flare alert', signal: 'X-RAY FLUX / CLASS M', description: 'Particle counts are climbing. The payload is mid-observation.', icon: '☼',
      options: [
        { id: 'safe', label: 'ENTER SAFE MODE', subline: 'Drop observations. Preserve battery and electronics.', effect: { risk: 25, batteryDeltaWh: 1.8, dataLossMb: 0, sciencePenalty: 3, budgetSavedK: 0 } },
        { id: 'continue', label: 'KEEP OBSERVING', subline: 'More science now; deeper battery draw and radiation risk.', effect: { risk: 8, batteryDeltaWh: -2.4, dataLossMb: 0, sciencePenalty: 0, budgetSavedK: 0 } },
      ],
    },
    {
      id: 'wheel', title: 'Reaction wheel fault', signal: 'WHEEL 2 / TORQUE LOW', description: 'Attitude drift is growing while the camera is pointed at target.', icon: '⟳',
      options: [
        { id: 'safe', label: 'SAFE THE PAYLOAD', subline: 'Stop imaging until the attitude estimate settles.', effect: { risk: 23, batteryDeltaWh: 0.8, dataLossMb: 0, sciencePenalty: 4, budgetSavedK: 0 } },
        { id: 'coil', label: 'SWITCH TO MAGNETORQUERS', subline: 'Keep pointing in LEO; spend time and power on detumble.', effect: { risk: 16, batteryDeltaWh: -1.2, dataLossMb: 0, sciencePenalty: 1, budgetSavedK: 0 } },
      ],
    },
    {
      id: 'station', title: 'Ground station outage', signal: 'GOLDSTONE / OFFLINE', description: `The pass just opened. Backup UHF can move about ${relayCapacityMb.toFixed(1)} MB this minute.`, icon: '⌁',
      options: [
        { id: 'hold', label: 'HOLD FOR NEXT PASS', subline: 'Protect the packet queue; accept a 94-minute delay.', effect: { risk: 22, batteryDeltaWh: -0.3, dataLossMb: 0, sciencePenalty: 0, budgetSavedK: 0 } },
        { id: 'relay', label: 'USE BACKUP RELAY', subline: 'Send a low-rate slice now; remaining data waits onboard.', effect: { risk: 15, batteryDeltaWh: -0.8, dataLossMb: Math.max(0, 0.4 - relayCapacityMb), sciencePenalty: 0, budgetSavedK: 0 } },
      ],
    },
    {
      id: 'budget', title: 'Budget cut notice', signal: 'PROGRAM RESERVE / −$12K', description: 'The review board needs a credible response before the next downlink.', icon: '$',
      options: [
        { id: 'trim', label: 'TRIM NON-FLIGHT COSTS', subline: 'Protect the payload; lower the reserve by $12k.', effect: { risk: 22, batteryDeltaWh: 0, dataLossMb: 0, sciencePenalty: 1, budgetSavedK: 12 } },
        { id: 'protect', label: 'PROTECT SCIENCE', subline: 'Keep the flight plan; accept a smaller schedule reserve.', effect: { risk: 12, batteryDeltaWh: 0, dataLossMb: 0, sciencePenalty: 0, budgetSavedK: 0 } },
      ],
    },
  ];
}

export function MissionControlLive({ radioId, batteryWh, dataMb, onComplete }: { radioId: string; batteryWh: number; dataMb: number; onComplete: (result: MissionControlResult) => void }) {
  const [incidents] = useState(() => makeIncidents(radioId).sort(() => Math.random() - 0.5));
  const [incidentIndex, setIncidentIndex] = useState(0);
  const [seconds, setSeconds] = useState(DECISION_SECONDS);
  const [history, setHistory] = useState<{ incident: string; choice: string }[]>([]);
  const [effect, setEffect] = useState<IncidentEffect>({ risk: 0, batteryDeltaWh: 0, dataLossMb: 0, sciencePenalty: 0, budgetSavedK: 0 });
  const [result, setResult] = useState<MissionControlResult | null>(null);
  const resolved = useRef(false);
  const incident = incidents[incidentIndex];

  const choose = (option: IncidentOption) => {
    if (resolved.current || result) return;
    resolved.current = true;
    const updated = {
      risk: effect.risk + option.effect.risk,
      batteryDeltaWh: effect.batteryDeltaWh + option.effect.batteryDeltaWh,
      dataLossMb: effect.dataLossMb + option.effect.dataLossMb,
      sciencePenalty: effect.sciencePenalty + option.effect.sciencePenalty,
      budgetSavedK: effect.budgetSavedK + option.effect.budgetSavedK,
    };
    setEffect(updated);
    setHistory((current) => [...current, { incident: incident.title, choice: option.label }]);
    if (incidentIndex === incidents.length - 1) {
      const score = Math.round(updated.risk / incidents.length);
      setResult({ ...updated, score, eventsHandled: incidents.length, summary: `${incidents.length} flight decisions. Battery ${Math.max(0, batteryWh + updated.batteryDeltaWh).toFixed(1)} Wh; ${Math.max(0, dataMb - updated.dataLossMb).toFixed(1)} MB retained; $${updated.budgetSavedK}k reserve protected.` });
      return;
    }
    setIncidentIndex((value) => value + 1);
    setSeconds(DECISION_SECONDS);
    window.setTimeout(() => { resolved.current = false; }, 250);
  };

  useEffect(() => {
    if (result) return;
    if (seconds === 0) {
      choose(incident.options[0]);
      return;
    }
    const timer = window.setTimeout(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds, incidentIndex, result]);

  return (
    <motion.section className="mission-control-panel game-panel" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
      <header className="ops-header">
        <div><div className="panel-kicker">MISSION CONTROL / LIVE</div><h2>{result ? 'Shift complete' : `Alert ${incidentIndex + 1} / ${incidents.length}`}</h2></div>
        {!result && <div className={`ops-timer ${seconds <= 4 ? 'urgent' : ''}`}><b>{seconds}</b><small>SEC</small></div>}
      </header>
      {!result ? (
        <>
          <div className="mc-console-strip"><span>BATTERY <b>{Math.max(0, batteryWh + effect.batteryDeltaWh).toFixed(1)} Wh</b></span><span>DATA QUEUE <b>{Math.max(0, dataMb - effect.dataLossMb).toFixed(1)} MB</b></span><span>RISK <b>{effect.risk} / 100</b></span></div>
          <motion.div key={incident.id} className="incident-card" initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
            <div className={`incident-symbol ${incident.id}`}>{incident.icon}</div>
            <div className="incident-copy"><span>{incident.signal}</span><h3>{incident.title}</h3><p>{incident.description}</p></div>
          </motion.div>
          <div className="decision-grid">
            {incident.options.map((option) => <button key={option.id} className="decision-card" type="button" onClick={() => choose(option)}>
              <b>{option.label}<i>↗</i></b><span>{option.subline}</span>
            </button>)}
          </div>
          <div className="incident-history">{history.map((entry, index) => <span key={`${entry.incident}-${index}`}><i>✓</i>{entry.incident}</span>)}</div>
        </>
      ) : (
        <div className="mc-result">
          <div className="panel-kicker">OPERATIONS / RISK HANDLING</div>
          <h3>{result.score >= 18 ? 'Mission protected.' : 'Risk accepted.'}</h3>
          <p>{result.summary}</p>
          <div className="mc-final-metrics"><span>RISK SCORE<b>{result.score}/25</b></span><span>SCIENCE COST<b>−{result.sciencePenalty}</b></span><span>DATA AT RISK<b>{result.dataLossMb.toFixed(1)} MB</b></span></div>
          <button type="button" className="game-button primary" onClick={() => onComplete(result)}>FINAL MISSION DEBRIEF <span>↗</span></button>
        </div>
      )}
    </motion.section>
  );
}