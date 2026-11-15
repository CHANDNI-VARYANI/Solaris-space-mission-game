import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import {
  calculateDownlinkCapacityMb,
  calculateMissionDataMbPerOrbit,
  TESSERACT_GROUND_STATIONS,
} from '@solaris/shared';

type Packet = { id: string; label: string; priority: 'SCIENCE' | 'CALIBRATION' | 'HOUSEKEEPING'; weight: number; fraction: number; sizeMb: number; availableAt: number; available: boolean; sent: boolean; lost: boolean };
type DownlinkState = { elapsed: number; packets: Packet[]; bufferMb: number; sentMb: number; lostMb: number; windowIndex: number; windowSentMb: number; connectedWindow: number; selectedPacket: string | null; message: string; complete: boolean };
export type DownlinkResult = { score: number; sentMb: number; lostMb: number; success: boolean };

const ROUND_SECONDS = 60;
const PASS_SECONDS = 12;
const CYCLE_SECONDS = 20;

function makePackets(dataPerOrbit: number): Packet[] {
  const packets: Omit<Packet, 'sizeMb'>[] = [
    { id: 'science-a', label: 'Magnetic / image strip A', priority: 'SCIENCE', weight: 3, fraction: 0.25, availableAt: 0, available: true, sent: false, lost: false },
    { id: 'calibration', label: 'Calibration frame', priority: 'CALIBRATION', weight: 2, fraction: 0.2, availableAt: 0, available: true, sent: false, lost: false },
    { id: 'science-b', label: 'Science strip B', priority: 'SCIENCE', weight: 3, fraction: 0.15, availableAt: 0, available: true, sent: false, lost: false },
    { id: 'science-c', label: 'Science strip C', priority: 'SCIENCE', weight: 3, fraction: 0.22, availableAt: 14, available: false, sent: false, lost: false },
    { id: 'housekeeping', label: 'Health + housekeeping', priority: 'HOUSEKEEPING', weight: 1, fraction: 0.1, availableAt: 28, available: false, sent: false, lost: false },
    { id: 'science-d', label: 'Science strip D', priority: 'SCIENCE', weight: 3, fraction: 0.08, availableAt: 42, available: false, sent: false, lost: false },
  ];
  return packets.map((packet) => ({ ...packet, sizeMb: dataPerOrbit * packet.fraction }));
}

export function DownlinkRush({ payloadId, radioId, onComplete }: { payloadId: string; radioId: string; onComplete: (result: DownlinkResult) => void }) {
  const dataPerOrbit = calculateMissionDataMbPerOrbit(payloadId);
  const capacityMb = calculateDownlinkCapacityMb(radioId);
  const bufferLimitMb = dataPerOrbit * 0.75;
  const stations = TESSERACT_GROUND_STATIONS;
  const [game, setGame] = useState<DownlinkState>(() => ({
    elapsed: 0,
    packets: makePackets(dataPerOrbit),
    bufferMb: dataPerOrbit * 0.6,
    sentMb: 0,
    lostMb: 0,
    windowIndex: 0,
    windowSentMb: 0,
    connectedWindow: -1,
    selectedPacket: null,
    message: 'Drag the antenna to the satellite, then send priority data during a ground pass.',
    complete: false,
  }));
  const [result, setResult] = useState<DownlinkResult | null>(null);
  const totalPriority = useMemo(() => makePackets(dataPerOrbit).reduce((total, packet) => total + packet.fraction * packet.weight, 0), [dataPerOrbit]);
  const phaseSeconds = game.elapsed % CYCLE_SECONDS;
  const windowOpen = game.elapsed < ROUND_SECONDS && phaseSeconds < PASS_SECONDS;
  const station = stations[game.windowIndex % stations.length];
  const connected = game.connectedWindow === game.windowIndex;
  const availableCapacity = Math.max(0, capacityMb - game.windowSentMb);
  const bufferPercent = bufferLimitMb > 0 ? Math.min(100, (game.bufferMb / bufferLimitMb) * 100) : 0;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setGame((current) => {
        if (current.complete || current.elapsed >= ROUND_SECONDS) return { ...current, complete: true };
        const elapsed = current.elapsed + 1;
        const windowIndex = Math.floor(elapsed / CYCLE_SECONDS);
        const windowChanged = windowIndex !== current.windowIndex;
        let bufferMb = current.bufferMb;
        let lostMb = current.lostMb;
        const packets = current.packets.map((packet) => {
          if (packet.available || packet.availableAt > elapsed) return packet;
          if (bufferMb + packet.sizeMb <= bufferLimitMb) {
            bufferMb += packet.sizeMb;
            return { ...packet, available: true };
          }
          lostMb += packet.sizeMb;
          return { ...packet, available: true, lost: true };
        });
        return {
          ...current,
          elapsed,
          packets,
          bufferMb,
          lostMb,
          windowIndex,
          windowSentMb: windowChanged ? 0 : current.windowSentMb,
          connectedWindow: windowChanged ? -1 : current.connectedWindow,
          message: windowChanged ? 'New station pass. Reconnect the antenna.' : current.message,
          complete: elapsed >= ROUND_SECONDS,
        };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [bufferLimitMb]);

  const connectAntenna = () => {
    if (!windowOpen) {
      setGame((current) => ({ ...current, message: 'No station in view. Wait for the next contact window.' }));
      return;
    }
    setGame((current) => ({ ...current, connectedWindow: current.windowIndex, message: `${station.name} link locked. Send the highest-priority packets first.` }));
  };

  const sendPacket = (packetId: string) => {
    setGame((current) => {
      const packet = current.packets.find((entry) => entry.id === packetId);
      const contactActive = current.elapsed < ROUND_SECONDS && current.elapsed % CYCLE_SECONDS < PASS_SECONDS;
      if (!contactActive) return { ...current, message: 'Contact lost. Hold the packet for the next pass.' };
      if (current.connectedWindow !== current.windowIndex) return { ...current, selectedPacket: packetId, message: 'Antenna is not linked. Drag it to the satellite first.' };
      if (!packet || !packet.available || packet.sent || packet.lost) return current;
      if (current.windowSentMb + packet.sizeMb > capacityMb) return { ...current, selectedPacket: packetId, message: `Pass capacity reached. ${availableCapacity.toFixed(1)} MB left in this window.` };
      return {
        ...current,
        packets: current.packets.map((entry) => entry.id === packetId ? { ...entry, sent: true } : entry),
        bufferMb: Math.max(0, current.bufferMb - packet.sizeMb),
        sentMb: current.sentMb + packet.sizeMb,
        windowSentMb: current.windowSentMb + packet.sizeMb,
        selectedPacket: null,
        message: `${packet.priority} packet secured at ${station.name}: ${packet.sizeMb.toFixed(1)} MB.`,
      };
    });
  };

  const endRun = () => {
    if (result) return;
    const prioritySent = game.packets.filter((packet) => packet.sent).reduce((total, packet) => total + packet.fraction * packet.weight, 0);
    const score = Math.max(0, Math.min(100, Math.round((game.sentMb / Math.max(dataPerOrbit, 0.1)) * 65 + (prioritySent / Math.max(totalPriority, 0.1)) * 35 - (game.lostMb / Math.max(dataPerOrbit, 0.1)) * 25)));
    const nextResult = { score, sentMb: game.sentMb, lostMb: game.lostMb, success: score >= 65 && game.lostMb < dataPerOrbit * 0.25 };
    setResult(nextResult);
  };

  const replay = () => {
    setResult(null);
    setGame({
      elapsed: 0,
      packets: makePackets(dataPerOrbit),
      bufferMb: dataPerOrbit * 0.6,
      sentMb: 0,
      lostMb: 0,
      windowIndex: 0,
      windowSentMb: 0,
      connectedWindow: -1,
      selectedPacket: null,
      message: 'New orbit pass. Link the antenna and secure science data.',
      complete: false,
    });
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const packetId = event.dataTransfer.getData('packet');
    if (packetId) sendPacket(packetId);
  };

  const antennaDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.getData('antenna')) connectAntenna();
  };

  const finish = result;
  return (
    <motion.section className="ops-panel game-panel" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
      <header className="ops-header">
        <div><div className="panel-kicker">OPERATIONS / 01</div><h2>Downlink Rush</h2></div>
        <div className="ops-timer"><b>{Math.max(0, ROUND_SECONDS - game.elapsed)}</b><small>SEC</small></div>
      </header>
      {!finish ? (
        <>
          <div className="ops-metrics">
            <span>BUFFER <b>{game.bufferMb.toFixed(1)} / {bufferLimitMb.toFixed(1)} MB</b><i><em style={{ width: `${bufferPercent}%` }} /></i></span>
            <span>SENT <b>{game.sentMb.toFixed(1)} / {dataPerOrbit.toFixed(1)} MB</b></span>
            <span>LOST <b className={game.lostMb > 0 ? 'danger-text' : ''}>{game.lostMb.toFixed(1)} MB</b></span>
          </div>
          <div className="downlink-map">
            <div className="station-route">
              {stations.map((entry, index) => <div key={entry.id} className={`station-node ${index === game.windowIndex % stations.length && windowOpen ? 'active' : ''}`}>
                <i style={{ backgroundColor: entry.color }} /><b>{entry.name}</b><small>{entry.region}</small>
              </div>)}
              <div className="orbit-route"><span className="route-orbit" /><div className="route-satellite">▣</div><span className={`route-beam ${windowOpen && connected ? 'on' : ''}`} /></div>
            </div>
            <div className="link-controls">
              <button className="antenna-token" draggable onDragStart={(event) => event.dataTransfer.setData('antenna', 'ground-antenna')} onClick={connectAntenna} type="button">⌁ <span>DRAG ANTENNA</span></button>
              <div className={`satellite-link-target ${connected ? 'linked' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={antennaDrop}>
                <b>▣</b><span>{connected ? `${station.name.toUpperCase()} LINKED` : 'DROP ON SATELLITE'}</span>
              </div>
              <div className={`contact-window ${windowOpen ? 'open' : ''}`}>
                <b>{windowOpen ? `${station.name.toUpperCase()} PASS` : 'NO CONTACT'}</b>
                <span>{windowOpen ? `${PASS_SECONDS - phaseSeconds}s window · ${availableCapacity.toFixed(1)} MB left` : `Next pass in ${Math.max(0, CYCLE_SECONDS - phaseSeconds)}s`}</span>
              </div>
            </div>
          </div>
          <div className="packet-header"><span>ONBOARD PACKETS</span><small>PRIORITY FIRST · {capacityMb.toFixed(1)} MB / CONTACT</small></div>
          <div className="packet-tray">
            {game.packets.map((packet) => <div
              key={packet.id}
              className={`data-packet ${packet.priority.toLowerCase()} ${packet.sent ? 'sent' : ''} ${packet.lost ? 'lost' : ''} ${packet.available ? 'available' : 'locked'} ${game.selectedPacket === packet.id ? 'chosen' : ''}`}
              draggable={packet.available && !packet.sent && !packet.lost}
              onDragStart={(event) => event.dataTransfer.setData('packet', packet.id)}
              onClick={() => {
                if (!packet.available || packet.sent || packet.lost) return;
                if (connected) sendPacket(packet.id);
                else setGame((current) => ({ ...current, selectedPacket: packet.id }));
              }}
            >
              <b>{packet.priority === 'SCIENCE' ? '✦' : packet.priority === 'CALIBRATION' ? '⌖' : '·'}</b>
              <span>{packet.label}</span>
              <small>{packet.available ? `${packet.sizeMb.toFixed(1)} MB` : `IN ${Math.max(0, packet.availableAt - game.elapsed)}s`}</small>
              {packet.sent && <i>✓ SENT</i>}{packet.lost && <i>× LOST</i>}
            </div>)}
          </div>
          <div className="station-drop" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} onClick={() => game.selectedPacket && sendPacket(game.selectedPacket)}>
            <span>{connected ? `DROP PACKET TO ${station.name.toUpperCase()}` : 'LINK THE ACTIVE STATION TO RECEIVE DATA'}</span>
            {connected && <b>RECEIVE ▣</b>}
          </div>
          <div className="ops-footer"><span>{game.message}</span><button type="button" className="game-button secondary" onClick={endRun}>END RUN</button></div>
        </>
      ) : (
        <div className="ops-result">
          <div className="panel-kicker">DATA PASS COMPLETE</div>
          <h3>{finish.success ? 'Science secured.' : 'Buffer took a hit.'}</h3>
          <p>{finish.sentMb.toFixed(1)} MB downlinked · {finish.lostMb.toFixed(1)} MB lost to buffer overflow.</p>
          <div className="ops-score">{finish.score}<small> / 100</small></div>
          <div className="ops-result-actions">
            <button type="button" className="game-button secondary" onClick={replay}>REPLAY ROUND</button>
            <button type="button" className="game-button primary" onClick={() => onComplete(finish)}>NEXT / ECLIPSE ENERGY <span>↗</span></button>
          </div>
        </div>
      )}
    </motion.section>
  );
}