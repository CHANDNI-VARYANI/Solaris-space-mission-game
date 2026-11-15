import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { simulateMissionSequence, type MissionCommand, type MissionSequenceResult } from '@solaris/shared';

const SLOT_COUNT = 8;
const ROUND_SECONDS = 75;
const COMMANDS: { id: MissionCommand; label: string; icon: string; tone: string }[] = [
  { id: 'slew', label: 'Slew', icon: '⟳', tone: 'cyan' },
  { id: 'power-on', label: 'Power on', icon: '⏻', tone: 'yellow' },
  { id: 'observe', label: 'Observe', icon: '◈', tone: 'violet' },
  { id: 'store', label: 'Store', icon: '▤', tone: 'mint' },
  { id: 'downlink', label: 'Downlink', icon: '⌁', tone: 'blue' },
  { id: 'safe-mode', label: 'Safe mode', icon: '⬡', tone: 'coral' },
];
const STARTER_COMMANDS: MissionCommand[] = ['power-on', 'observe', 'store', 'downlink', 'observe', 'store', 'safe-mode', 'downlink'];

export function MissionSequencer({
  solarW,
  totalLoadW,
  instrumentLoadW,
  radioLoadW,
  batteryCapacityWh,
  dataMbPerOrbit,
  radioId,
  observationQuotaMinutes,
  onComplete,
}: {
  solarW: number;
  totalLoadW: number;
  instrumentLoadW: number;
  radioLoadW: number;
  batteryCapacityWh: number;
  dataMbPerOrbit: number;
  radioId: string;
  observationQuotaMinutes: number;
  onComplete: (result: MissionSequenceResult) => void;
}) {
  const [commands, setCommands] = useState<MissionCommand[]>(STARTER_COMMANDS);
  const [selectedCommand, setSelectedCommand] = useState<MissionCommand | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(ROUND_SECONDS);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [result, setResult] = useState<MissionSequenceResult | null>(null);
  const [message, setMessage] = useState('Drag blocks into the timeline. Observe needs power; downlink only works at contact slots 4 and 8.');

  const simulation = useMemo(() => simulateMissionSequence({
    commands,
    solarW,
    baseLoadW: Math.max(0, totalLoadW - instrumentLoadW),
    instrumentLoadW,
    radioLoadW,
    batteryCapacityWh,
    dataMbPerOrbit,
    radioId,
    observationQuotaMinutes,
  }), [commands, solarW, totalLoadW, instrumentLoadW, radioLoadW, batteryCapacityWh, dataMbPerOrbit, radioId, observationQuotaMinutes]);

  useEffect(() => {
    if (result) return;
    const timer = window.setInterval(() => setRemainingSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [result]);

  useEffect(() => {
    if (remainingSeconds === 0 && !result) runSequence();
  }, [remainingSeconds]);

  const placeCommand = (slot: number, command: MissionCommand) => {
    if (result || activeSlot !== null) return;
    setCommands((current) => current.map((entry, index) => index === slot ? command : entry));
    setSelectedCommand(null);
    setMessage(`${COMMANDS.find((entry) => entry.id === command)?.label} placed in slot ${slot + 1}.`);
  };

  const runSequence = () => {
    if (activeSlot !== null || result) return;
    const computed = simulation;
    let slot = 0;
    setActiveSlot(slot);
    setMessage('Flight software executing one orbital command cycle.');
    const timer = window.setInterval(() => {
      slot += 1;
      if (computed.failureIndex !== null && slot >= computed.failureIndex) {
        window.clearInterval(timer);
        setActiveSlot(computed.failureIndex);
        window.setTimeout(() => {
          setResult(computed);
          setMessage(computed.reason);
        }, 330);
        return;
      }
      if (slot >= SLOT_COUNT - 1) {
        window.clearInterval(timer);
        setActiveSlot(SLOT_COUNT - 1);
        window.setTimeout(() => {
          setResult(computed);
          setMessage(computed.reason);
        }, 330);
        return;
      }
      setActiveSlot(slot);
    }, 330);
  };

  const reset = () => {
    setCommands(STARTER_COMMANDS);
    setSelectedCommand(null);
    setRemainingSeconds(ROUND_SECONDS);
    setActiveSlot(null);
    setResult(null);
    setMessage('Schedule reset. Sequence power, sunlight observations, storage, and contact windows.');
  };

  const acceptDrop = (event: React.DragEvent<HTMLButtonElement>, slot: number) => {
    event.preventDefault();
    const command = event.dataTransfer.getData('command') as MissionCommand;
    if (COMMANDS.some((entry) => entry.id === command)) placeCommand(slot, command);
  };

  return (
    <motion.section className="sequencer-panel game-panel" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
      <header className="ops-header">
        <div><div className="panel-kicker">OPERATIONS / 03</div><h2>Mission Sequencer</h2></div>
        <div className="ops-timer"><b>{remainingSeconds}</b><small>SEC</small></div>
      </header>
      <div className="sequence-metrics"><span>ORBIT <b>94.5 MIN</b></span><span>CONTACT <b>SLOTS 4 / 8</b></span><span>QUOTA <b>{observationQuotaMinutes} MIN</b></span><span>BUFFER <b>{(dataMbPerOrbit * 0.75).toFixed(1)} MB</b></span></div>
      <div className="command-palette" role="group" aria-label="Command blocks">
        {COMMANDS.map((command) => <button
          key={command.id}
          type="button"
          draggable
          className={`command-block ${command.tone} ${selectedCommand === command.id ? 'chosen' : ''}`}
          onClick={() => setSelectedCommand((value) => value === command.id ? null : command.id)}
          onDragStart={(event) => event.dataTransfer.setData('command', command.id)}
        ><b>{command.icon}</b>{command.label}</button>)}
      </div>
      <div className="command-timeline" role="group" aria-label="One-orbit command sequence">
        {commands.map((command, index) => {
          const item = COMMANDS.find((entry) => entry.id === command)!;
          return <button
            key={index}
            type="button"
            className={`command-slot ${item.tone} ${activeSlot === index ? 'running' : ''} ${result?.failureIndex === index ? 'failure' : ''} ${result && result.failureIndex !== null && index < result.failureIndex ? 'completed' : ''}`}
            aria-label={`Slot ${index + 1}: ${item.label}`}
            onClick={() => selectedCommand ? placeCommand(index, selectedCommand) : setCommands((current) => current.map((entry, slot) => slot === index ? 'safe-mode' : entry))}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => acceptDrop(event, index)}
          >
            <small>{String(index + 1).padStart(2, '0')}</small><b>{item.icon}</b><span>{item.label}</span>
            {(index === 3 || index === 7) && <i>CONTACT</i>}
            {index === 4 && <em>SHADOW</em>}
          </button>;
        })}
      </div>
      <div className="sequence-readouts">
        <span>OBSERVED<b>{simulation.observationMinutes.toFixed(0)} / {observationQuotaMinutes} min</b></span>
        <span>DATA STORED<b>{simulation.dataStoredMb.toFixed(1)} MB</b></span>
        <span>DOWNLINKED<b>{simulation.dataDownlinkedMb.toFixed(1)} MB</b></span>
        <span>BATTERY FLOOR<b>{simulation.minimumBatteryPct.toFixed(0)}%</b></span>
      </div>
      {result ? (
        <div className={`sequence-result ${result.success ? 'passed' : 'failed'}`}>
          <div><b>{result.success ? 'CONOPS EXECUTED' : `CHECK COMMAND ${(result.failureIndex ?? 0) + 1}`}</b><span>{result.reason}</span></div>
          <div className="sequence-result-actions"><button className="game-button secondary" onClick={reset}>REPLAY PLAN</button><button className="game-button primary" onClick={() => onComplete(result)}>NEXT / ORBIT BURN <span>↗</span></button></div>
        </div>
      ) : (
        <div className="sequencer-footer"><span>{message}</span><button type="button" className="game-button primary" onClick={runSequence} disabled={activeSlot !== null}>RUN SEQUENCE <span>↗</span></button></div>
      )}
    </motion.section>
  );
}