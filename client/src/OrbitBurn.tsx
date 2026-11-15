import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { calculateHohmannDeltaVMs } from '@solaris/shared';

const ROUND_SECONDS = 75;
export type OrbitBurnResult = { score: number; deltaVMs: number; targetAltitudeKm: number; success: boolean; reason: string };

export function OrbitBurn({ budgetVMs, onComplete }: { budgetVMs: number; onComplete: (result: OrbitBurnResult) => void }) {
  const [targetAltitudeKm, setTargetAltitudeKm] = useState(700);
  const [remainingSeconds, setRemainingSeconds] = useState(ROUND_SECONDS);
  const [result, setResult] = useState<OrbitBurnResult | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('Drag the maneuver node or move the altitude slider. Keep the burn inside the remaining propellant budget.');
  const dragStart = useRef<{ x: number; altitude: number } | null>(null);
  const deltaVMs = useMemo(() => calculateHohmannDeltaVMs(500, targetAltitudeKm), [targetAltitudeKm]);
  const budgetMarginMs = budgetVMs - deltaVMs;
  const budgetPercent = Math.min(100, Math.max(0, deltaVMs / Math.max(budgetVMs, 1) * 100));

  useEffect(() => {
    if (result) return;
    const timer = window.setInterval(() => setRemainingSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [result]);

  useEffect(() => {
    if (remainingSeconds === 0 && !result) runBurn();
  }, [remainingSeconds]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragStart.current) return;
      const direction = event.clientX - dragStart.current.x;
      setTargetAltitudeKm(Math.round(Math.min(5000, Math.max(200, dragStart.current.altitude + direction * 4)) / 25) * 25);
    };
    const up = () => { dragStart.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);

  const runBurn = () => {
    if (result || running) return;
    setRunning(true);
    setMessage('Burn firing. Watching the orbit settle around Earth.');
    const success = deltaVMs <= budgetVMs;
    const score = Math.max(0, Math.min(100, Math.round(success ? 100 - deltaVMs / Math.max(budgetVMs, 1) * 25 : budgetVMs / Math.max(deltaVMs, 1) * 60)));
    const nextResult = {
      score,
      deltaVMs,
      targetAltitudeKm,
      success,
      reason: success
        ? `Target orbit ${targetAltitudeKm} km reached with ${(budgetMarginMs / 1000).toFixed(2)} km/s of propellant margin.`
        : `Burn needs ${(deltaVMs / 1000).toFixed(2)} km/s; only ${(budgetVMs / 1000).toFixed(2)} km/s remains. Lower the target orbit.`,
    };
    window.setTimeout(() => {
      setResult(nextResult);
      setRunning(false);
      setMessage(nextResult.reason);
    }, 850);
  };

  const adjustTarget = (amount: number) => {
    setTargetAltitudeKm((value) => Math.round(Math.min(5000, Math.max(200, value + amount)) / 25) * 25);
  };

  const reset = () => {
    setTargetAltitudeKm(700);
    setRemainingSeconds(ROUND_SECONDS);
    setResult(null);
    setRunning(false);
    setMessage('Plan a new orbit change within the remaining propellant budget.');
  };

  const targetScale = 1 + (targetAltitudeKm - 500) / 8500;
  return (
    <motion.section className="burn-panel game-panel" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
      <header className="ops-header">
        <div><div className="panel-kicker">OPERATIONS / 04</div><h2>Orbit Burn</h2></div>
        <div className="ops-timer"><b>{remainingSeconds}</b><small>SEC</small></div>
      </header>
      <div className="burn-metrics"><span>CURRENT ORBIT <b>500 km LEO</b></span><span>REMAINING ΔV <b>{(budgetVMs / 1000).toFixed(2)} km/s</b></span><span>TRANSFER ΔV <b>{(deltaVMs / 1000).toFixed(3)} km/s</b></span></div>
      <div className="maneuver-board">
        <div className="orbit-diagram" aria-label={`Current orbit 500 km, target orbit ${targetAltitudeKm} km`}>
          <div className="orbit-earth"><i>EARTH</i></div>
          <div className="orbit-ring current-ring"><b>500</b></div>
          <div className="orbit-ring target-ring" style={{ transform: `translate(-50%, -50%) scale(${targetScale})` }}><b>{targetAltitudeKm}</b></div>
          <div className="orbit-satellite-mark" />
          <div
            className="maneuver-node"
            role="slider"
            aria-label="Drag maneuver node to change target altitude"
            aria-valuemin={200}
            aria-valuemax={5000}
            aria-valuenow={targetAltitudeKm}
            tabIndex={0}
            onPointerDown={(event) => { dragStart.current = { x: event.clientX, altitude: targetAltitudeKm }; event.currentTarget.setPointerCapture(event.pointerId); }}
            onKeyDown={(event) => { if (event.key === 'ArrowRight') adjustTarget(100); if (event.key === 'ArrowLeft') adjustTarget(-100); }}
          >
            <span>✦</span><i>NODE</i>
          </div>
        </div>
        <div className="maneuver-controls">
          <div className="burn-direction"><button type="button" className={targetAltitudeKm >= 500 ? 'active prograde' : ''} onClick={() => adjustTarget(100)}>PROGRADE <b>↗</b></button><button type="button" className={targetAltitudeKm < 500 ? 'active retrograde' : ''} onClick={() => adjustTarget(-100)}>RETROGRADE <b>↙</b></button></div>
          <label htmlFor="target-orbit">TARGET ALTITUDE <b>{targetAltitudeKm} km</b></label>
          <input id="target-orbit" aria-label="Target orbit altitude" type="range" min="200" max="5000" step="25" value={targetAltitudeKm} onChange={(event) => setTargetAltitudeKm(Number(event.target.value))} />
          <div className="delta-budget"><div><span>PROPELLANT USED</span><b>{budgetPercent.toFixed(0)}%</b></div><i><em style={{ width: `${budgetPercent}%`, background: budgetMarginMs >= 0 ? '#34d17a' : '#ff6b6b' }} /></i><small>{budgetMarginMs >= 0 ? `${(budgetMarginMs / 1000).toFixed(2)} km/s still in reserve` : 'Over budget · reduce the orbit change'}</small></div>
          <div className="maneuver-readout"><span>TRANSFER TYPE <b>{targetAltitudeKm > 500 ? 'RAISE / HOHMANN' : targetAltitudeKm < 500 ? 'LOWER / HOHMANN' : 'NO BURN'}</b></span><span>VIS-VIVA <b>{(deltaVMs / 1000).toFixed(3)} km/s</b></span></div>
        </div>
      </div>
      {result ? (
        <div className={`burn-result ${result.success ? 'passed' : 'failed'}`}>
          <div><b>{result.success ? 'ORBIT MATCHED' : 'PROPULSANT SHORTFALL'}</b><span>{result.reason}</span></div>
          <div className="burn-result-actions"><button className="game-button secondary" onClick={reset}>REPLAY BURN</button><button className="game-button primary" onClick={() => onComplete(result)}>NEXT / MISSION CONTROL <span>↗</span></button></div>
        </div>
      ) : (
        <div className="burn-footer"><span>{message}</span><button type="button" className="game-button primary" onClick={runBurn} disabled={running}>{running ? 'BURNING…' : 'EXECUTE BURN'} <span>↗</span></button></div>
      )}
    </motion.section>
  );
}