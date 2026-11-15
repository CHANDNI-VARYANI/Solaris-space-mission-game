import { AnimatePresence, motion } from 'framer-motion';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, Html, Stars, Text, Torus } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Atom, BatteryCharging, BookOpen, ChevronDown, CircleCheck, CircleHelp, CircleX, Home, Leaf, Magnet, Menu, Radio, RotateCcw, Satellite, Scale, Sparkles, Thermometer, Trophy, Volume2, VolumeX } from 'lucide-react';
import * as THREE from 'three';
import { DownlinkRush, type DownlinkResult } from './DownlinkRush';
import { EclipseEnergy } from './EclipseEnergy';
import { MissionSequencer } from './MissionSequencer';
import { OrbitBurn, type OrbitBurnResult } from './OrbitBurn';
import { MissionControlLive, type MissionControlResult } from './MissionControlLive';
import type { EclipseScheduleResult, MissionSequenceResult } from '@solaris/shared';
import {
  calculateLauncherDeltaVMs,
  calculateMissionDataMbPerOrbit,
  calculateMissionEclipseMinutes,
  calculateMissionOrbitPeriodMinutes,
  evaluateTesseractBuild,
  TESSERACT_LAUNCHERS,
  TESSERACT_MISSIONS,
  TESSERACT_PARTS,
  type TesseractPart,
} from '@solaris/shared';

type Stage = 'briefing' | 'build' | 'assembling' | 'launch-ready' | 'launch' | 'orbit' | 'downlink' | 'eclipse' | 'sequencer' | 'orbitburn' | 'missioncontrol' | 'result';
type AscentState = { elapsed: number; deltaVMs: number; altitudeKm: number; efficiency: number };
type KeyState = Record<string, boolean>;
type Difficulty = 'Explorer' | 'Engineer' | 'Mission Director' | 'Sandbox';
type AppScreen = 'landing' | 'hub' | 'game' | 'quiz';
type LeaderboardEntry = { mission: string; score: number; stars: number; date: string; difficulty: Difficulty };
type CrewRole = 'planner' | 'engineer' | 'science' | 'ops';

const CREW_ROLE_NAMES: Record<CrewRole, string> = {
  planner: 'Mission Planner',
  engineer: 'Spacecraft Engineer',
  science: 'Science Lead',
  ops: 'Ops / Comms Lead',
};
const ZONE_ROLES: Record<string, CrewRole> = {
  Frame: 'planner', Solar: 'engineer', Battery: 'engineer', Computer: 'engineer',
  Radio: 'ops', Pointing: 'ops', Payload: 'science',
};
const STAGE_ROLES: Partial<Record<Stage, CrewRole>> = {
  assembling: 'engineer', 'launch-ready': 'planner', launch: 'engineer', orbit: 'planner',
  downlink: 'ops', eclipse: 'science', sequencer: 'ops', orbitburn: 'engineer', missioncontrol: 'planner',
};

function assignCrewRoles(teamSize: number): Record<CrewRole, number> {
  if (teamSize === 1) return { planner: 0, engineer: 0, science: 0, ops: 0 };
  if (teamSize === 2) return { planner: 0, engineer: 1, science: 0, ops: 1 };
  if (teamSize === 3) return { planner: 0, engineer: 1, science: 2, ops: 2 };
  return { planner: 0, engineer: 1, science: 2, ops: 3 };
}

const CATEGORIES = ['Frame', 'Solar', 'Battery', 'Computer', 'Radio', 'Pointing', 'Payload'] as const;
const LANDING_STARS: readonly (readonly [number, number, number, number])[] = [
  [5, 12, 2, 38], [12, 35, 1, 44], [18, 72, 2, 50], [24, 19, 1, 36],
  [28, 88, 2, 55], [33, 52, 1, 42], [38, 11, 2, 49], [42, 79, 1, 58],
  [47, 26, 2, 40], [52, 65, 1, 52], [57, 14, 1, 39], [62, 40, 2, 57],
  [67, 84, 1, 46], [72, 25, 2, 54], [76, 58, 1, 43], [81, 11, 2, 60],
  [86, 74, 1, 47], [91, 33, 2, 38], [96, 62, 1, 51], [8, 56, 1, 47],
  [21, 44, 2, 53], [31, 70, 1, 45], [45, 90, 2, 59], [55, 47, 1, 41],
  [64, 6, 2, 50], [73, 91, 1, 56], [83, 46, 2, 42], [94, 88, 1, 53],
  [3, 83, 2, 39], [15, 8, 1, 57], [40, 35, 2, 44], [88, 16, 1, 48],
];
const ZONES: { category: (typeof CATEGORIES)[number]; position: [number, number, number] }[] = [
  { category: 'Frame', position: [0, 0, -13] },
  { category: 'Solar', position: [10, 0, -9] },
  { category: 'Battery', position: [14, 0, 2] },
  { category: 'Computer', position: [8, 0, 13] },
  { category: 'Radio', position: [-3, 0, 14] },
  { category: 'Pointing', position: [-13, 0, 8] },
  { category: 'Payload', position: [-14, 0, -3] },
];
const ZONE_COLORS: Record<string, string> = {
  Frame: '#e8a24d', Solar: '#4fd1ff', Battery: '#34d17a', Computer: '#f4f1ea', Radio: '#ffd23f', Pointing: '#ff6b6b', Payload: '#b36bff',
};
const TARGET_DV_MS = 9400;
const MISSION_NAMES = new Map(TESSERACT_MISSIONS.map((mission) => [mission.id, mission.name]));
const MISSION_ANALOGS: Record<string, { name: string; note: string; url: string }> = {
  'magnetic-probe': { name: 'NASA MAVEN', note: 'Measures the solar wind and magnetic environment around Mars.', url: 'https://science.nasa.gov/mission/maven/' },
  'crop-imager': { name: 'Copernicus Sentinel-2', note: 'Uses multispectral imaging to monitor land and vegetation.', url: 'https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2' },
  'heat-mapper': { name: 'Landsat 9', note: 'Maps Earth surface temperature with thermal infrared instruments.', url: 'https://landsat.gsfc.nasa.gov/satellites/landsat-9/' },
  'atmosphere-spectrometer': { name: 'NASA MAVEN', note: 'Studies Mars atmospheric composition with ultraviolet spectroscopy.', url: 'https://science.nasa.gov/mission/maven/' },
};
const DIFFICULTY_PROFILES: Record<Difficulty, { headline: string; objective: string; focus: string; help: string }> = {
  Explorer: {
    headline: 'Explorer mode',
    objective: 'Learn the mission as a first pass. You are building a workable satellite and watching how each subsystem changes the whole mission.',
    focus: 'Focus on mass, power, and launch fit. If one part is too heavy or underpowered, the whole spacecraft suffers.',
    help: 'Think in terms of four system questions: how much does it weigh, how much power does it consume, how much battery reserve stays after eclipse, and how much data can the radio return?',
  },
  Engineer: {
    headline: 'Engineer mode',
    objective: 'Design to the real margins. Each subsystem must survive eclipse, stay under the mass cap, and still support the mission payload.',
    focus: 'Watch the power budget, battery reserve, and structural mass. A small part can quietly break the mission if it is underpowered or too heavy.',
    help: 'Use the bars as a design audit: mass must stay under the launch limit, solar must cover load, and battery must survive eclipse without dropping below the 60% reserve.',
  },
  'Mission Director': {
    headline: 'Mission Director mode',
    objective: 'Run the mission under tighter operational constraints. You are not just choosing hardware; you are coordinating launch, data flow, and command timing.',
    focus: 'The timeline matters. Your sequence, contact windows, and battery reserve all need to line up or the mission loses science, data, or power.',
    help: 'The spacecraft does not fail from one bad decision alone. The weak point is usually a late command, a low battery reserve, or a radio pass that is missed because the queue was overloaded.',
  },
  Sandbox: {
    headline: 'Sandbox mode',
    objective: 'Experiment freely and learn from the system model without a hard build limit.',
    focus: 'Use this mode to test “what if” trades between power, payload, mass, and communication choices without being judged by the launch cap.',
    help: 'This mode is for exploration, not to judge a realistic mission. Change one part at a time and watch how the system-level requirements respond.',
  },
};
const SOURCE_LINKS = [
  { name: 'NASA Goddard Mission Design Lab', url: 'https://www.nasa.gov/centers-and-facilities/goddard/mission-design-lab/' },
  { name: 'JPL Concept Maturity Levels', url: 'https://www.nasa.gov/wp-content/uploads/2015/11/1400195main_2012jpltechnologymaturity.pdf' },
  { name: 'NASA GMAT', url: 'https://gmat.gsfc.nasa.gov/' },
  { name: 'NASA Eyes on the Solar System', url: 'https://eyes.nasa.gov/apps/solar-system/' },
  { name: 'NASA CubeSat 101', url: 'https://www.nasa.gov/wp-content/uploads/2017/03/nasa_csli_cubesat_101_508.pdf' },
  { name: 'NASA Small Spacecraft State of the Art', url: 'https://www.nasa.gov/smallsat-institute/sst-soa/' },
];
const HUB_GAMES = [
  { id: 'tesseract', title: 'TESSERACT: Mission Design', tag: 'LIVE', blurb: 'Build a satellite and learn how mass, power, battery, and data balance shape a real mission.', accent: '#4fd1ff' },
  { id: 'daily-quiz', title: 'Daily Learning Quiz', tag: 'LIVE', blurb: 'Test what you learned about mission design, eclipse energy, and spacecraft tradeoffs.', accent: '#ffd23f' },
  { id: 'signal-run', title: 'Signal Run', tag: 'COMING SOON', blurb: 'More radio and contact-window gameplay for tracking downlink quality and mission timing.', accent: '#b36bff' },
  { id: 'deep-space-lab', title: 'Deep Space Lab', tag: 'COMING SOON', blurb: 'A future mission plan for longer orbit physics, autonomy, and thermal constraints.', accent: '#34d17a' },
];
const QUIZ_PROMPTS = [
  {
    question: 'Why is a battery reserve important in eclipse?',
    options: ['It lets the spacecraft stay alive during the dark part of orbit', 'It reduces the payload size', 'It replaces the solar array', 'It increases gravity'],
    answer: 'It lets the spacecraft stay alive during the dark part of orbit',
    explanation: 'Solar arrays stop generating power in Earth’s shadow, so the battery runs essential systems until sunlight returns.',
    icon: BatteryCharging,
  },
  {
    question: 'What does a radio with higher rank usually improve?',
    options: ['Downlink data capacity', 'Earth gravity', 'Launch altitude', 'Frame strength'],
    answer: 'Downlink data capacity',
    explanation: 'A stronger communications subsystem can return more science data during a limited ground-station contact window.',
    icon: Radio,
  },
  {
    question: 'What is the key lesson from mass and power tradeoffs?',
    options: ['Every added subsystem shifts cost, mass, and mission viability', 'Only the payload matters', 'The launch pad is always free', 'The battery has no effect on orbit'],
    answer: 'Every added subsystem shifts cost, mass, and mission viability',
    explanation: 'Spacecraft design is a system problem: improving one capability can consume mass, power, budget, or time needed elsewhere.',
    icon: Scale,
  },
  {
    question: 'What should solar panels do while the spacecraft is in sunlight?',
    options: ['Power the spacecraft and recharge its battery', 'Transmit every science file to Earth', 'Change the spacecraft orbit', 'Reduce the launch vehicle mass'],
    answer: 'Power the spacecraft and recharge its battery',
    explanation: 'Solar arrays generate electrical power in sunlight. Any power left after the spacecraft load can recharge the battery for eclipse.',
    icon: BatteryCharging,
  },
  {
    question: 'Why does the spacecraft frame need to match the mission?',
    options: ['It must fit the hardware while staying inside mass and launch limits', 'It chooses the ground station schedule', 'It determines how much sunlight reaches Earth', 'It stores all downlinked data'],
    answer: 'It must fit the hardware while staying inside mass and launch limits',
    explanation: 'The structure carries the subsystems, but extra size and mass can exceed the launch vehicle or mission budget.',
    icon: Scale,
  },
  {
    question: 'What happens if a mission collects data faster than it can downlink it?',
    options: ['The onboard data queue can fill up', 'The spacecraft gains battery capacity', 'The orbit becomes lower', 'The payload turns into a solar panel'],
    answer: 'The onboard data queue can fill up',
    explanation: 'A payload can produce more data than a radio can return during contact windows, so the spacecraft must prioritize or store observations.',
    icon: Radio,
  },
  {
    question: 'Why does a science instrument need accurate pointing?',
    options: ['So it can aim at the intended target', 'So it can increase the battery voltage', 'So the frame weighs less', 'So the launcher reaches orbit sooner'],
    answer: 'So it can aim at the intended target',
    explanation: 'Attitude control turns and stabilizes the spacecraft. Without it, an instrument may miss its target or a radio may lose Earth contact.',
    icon: Satellite,
  },
  {
    question: 'When is a ground-station downlink possible?',
    options: ['During a planned contact window with the station in view', 'Any time the payload is powered', 'Only while the spacecraft is in eclipse', 'Before the spacecraft leaves the launch pad'],
    answer: 'During a planned contact window with the station in view',
    explanation: 'The spacecraft and ground station must have a usable line of sight. Mission teams schedule data return around those short windows.',
    icon: Radio,
  },
  {
    question: 'What does a flight command sequence help the team do?',
    options: ['Run actions in a safe, useful order', 'Increase the solar array area after launch', 'Ignore battery limits', 'Change the science goal automatically'],
    answer: 'Run actions in a safe, useful order',
    explanation: 'Commands have dependencies and timing: power the instrument, collect and store data, then transmit during contact.',
    icon: CircleHelp,
  },
  {
    question: 'What is the payload’s main job?',
    options: ['Collect the science or observation the mission was designed for', 'Keep the spacecraft pointed at Earth', 'Provide all electrical power', 'Protect the satellite during launch'],
    answer: 'Collect the science or observation the mission was designed for',
    explanation: 'The payload is the instrument that delivers the mission’s science objective. Its power, data, and mass needs shape the rest of the design.',
    icon: Satellite,
  },
];
type QuizPrompt = (typeof QUIZ_PROMPTS)[number];
const QUIZ_QUESTIONS_PER_ROUND = 3;

function selectQuizPrompts(previous: QuizPrompt[] = []): QuizPrompt[] {
  const shuffled = [...QUIZ_PROMPTS];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  const round = shuffled.slice(0, QUIZ_QUESTIONS_PER_ROUND);
  if (previous.length && round.every((prompt) => previous.some((prior) => prior.question === prompt.question))) {
    const newPrompt = shuffled.find((prompt) => previous.every((prior) => prior.question !== prompt.question));
    if (newPrompt) round[round.length - 1] = newPrompt;
  }
  return round;
}
const HELP_TIPS = [
  { title: 'Start with mission fit', text: 'Check the payload, frame class, mass, and budget before adding hardware.' },
  { title: 'Track the power budget', text: 'Solar must cover the load during sunlight; the battery must carry the spacecraft through eclipse.' },
  { title: 'Think in tradeoffs', text: 'A bigger payload can improve science, but it also raises power demand, data volume, and launch mass.' },
  { title: 'Time the mission', text: 'Downlink when the contact window is open, then check battery state before the next eclipse.' },
];

function playTone(muted: boolean, frequency = 540, duration = 0.08) {
  if (muted || typeof window === 'undefined' || !window.AudioContext) return;
  const context = new window.AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.055, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
  oscillator.onended = () => void context.close();
}

function earthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  context.fillStyle = '#176f9f';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#277ca0';
  for (let index = 0; index < 8; index += 1) {
    context.globalAlpha = 0.12;
    context.fillRect(0, index * 36 + 10, 512, 8);
  }
  context.globalAlpha = 1;
  context.fillStyle = '#54865e';
  const continents = [
    [[67, 45], [96, 29], [119, 41], [113, 62], [137, 77], [126, 101], [109, 106], [102, 132], [82, 122], [76, 96], [56, 83]],
    [[146, 127], [169, 119], [184, 137], [176, 171], [164, 196], [150, 178], [153, 154]],
    [[235, 49], [263, 34], [282, 46], [303, 42], [322, 58], [342, 59], [352, 80], [334, 91], [321, 110], [295, 101], [279, 116], [261, 95], [243, 88]],
    [[287, 107], [313, 112], [324, 138], [313, 170], [294, 188], [279, 160], [281, 131]],
    [[376, 128], [405, 116], [438, 129], [451, 153], [432, 170], [401, 163], [382, 148]],
  ];
  continents.forEach((points) => {
    context.beginPath();
    context.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(([x, y]) => context.lineTo(x, y));
    context.closePath();
    context.fill();
  });
  context.globalAlpha = 0.16;
  context.fillStyle = '#d7e9ef';
  for (let index = 0; index < 32; index += 1) {
    context.beginPath();
    context.ellipse((index * 67) % 512, (index * 47) % 256, 24 + index % 20, 3 + index % 6, index, 0, Math.PI * 2);
    context.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

function Earth({ radius = 4, position = [0, 0, 0] as [number, number, number] }: { radius?: number; position?: [number, number, number] }) {
  const texture = useMemo(earthTexture, []);
  const globe = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (globe.current) globe.current.rotation.y += delta * 0.025;
  });
  return (
    <group position={position}>
      <mesh ref={globe}>
        <sphereGeometry args={[radius, 48, 32]} />
        <meshStandardMaterial map={texture} roughness={0.88} />
      </mesh>
      <mesh>
        <sphereGeometry args={[radius * 1.035, 32, 24]} />
        <meshBasicMaterial color="#4fd1ff" transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

function Astronaut({ player, yaw }: { player: React.MutableRefObject<THREE.Vector3>; yaw: React.MutableRefObject<number> }) {
  const body = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!body.current) return;
    body.current.position.set(player.current.x, 0, player.current.z);
    body.current.rotation.y = yaw.current;
  });
  return (
    <group ref={body}>
      <mesh position={[0, 1.05, 0]} castShadow>
        <boxGeometry args={[0.72, 0.88, 0.44]} />
        <meshStandardMaterial color="#d9e3e3" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.72, 0]} castShadow>
        <boxGeometry args={[0.56, 0.54, 0.5]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.68} />
      </mesh>
      <mesh position={[0, 1.74, 0.26]}>
        <boxGeometry args={[0.37, 0.2, 0.035]} />
        <meshStandardMaterial color="#4fd1ff" metalness={0.45} roughness={0.22} emissive="#1a6380" />
      </mesh>
      <mesh position={[-0.48, 1.08, 0]} castShadow>
        <boxGeometry args={[0.22, 0.64, 0.28]} />
        <meshStandardMaterial color="#e8a24d" />
      </mesh>
      <mesh position={[0.48, 1.08, 0]} castShadow>
        <boxGeometry args={[0.22, 0.64, 0.28]} />
        <meshStandardMaterial color="#e8a24d" />
      </mesh>
      <mesh position={[-0.2, 0.35, 0]} castShadow>
        <boxGeometry args={[0.27, 0.55, 0.34]} />
        <meshStandardMaterial color="#52616a" />
      </mesh>
      <mesh position={[0.2, 0.35, 0]} castShadow>
        <boxGeometry args={[0.27, 0.55, 0.34]} />
        <meshStandardMaterial color="#52616a" />
      </mesh>
      <mesh position={[0, 1.13, -0.29]}>
        <boxGeometry args={[0.42, 0.55, 0.12]} />
        <meshStandardMaterial color="#e8a24d" />
      </mesh>
    </group>
  );
}

function Crate({ category, position, selected, onSelect }: {
  category: string;
  position: [number, number, number];
  selected: boolean;
  onSelect: () => void;
}) {
  const color = ZONE_COLORS[category];
  return (
    <group position={position} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.15, 1.42, 40]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.9 : 0.48} side={THREE.DoubleSide} />
      </mesh>
      <Float speed={2} rotationIntensity={0.08} floatIntensity={0.22}>
        <mesh position={[0, 1.05, 0]} castShadow>
          <boxGeometry args={[1.28, 1.12, 1.05]} />
          <meshStandardMaterial color="#202b3a" roughness={0.66} metalness={0.18} emissive={color} emissiveIntensity={selected ? 0.34 : 0.12} />
        </mesh>
        <mesh position={[0, 1.05, 0.54]}>
          <boxGeometry args={[0.8, 0.54, 0.035]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <mesh position={[0, 1.05, 0.58]}>
          <boxGeometry args={[0.22, 0.22, 0.05]} />
          <meshBasicMaterial color="#070b1f" />
        </mesh>
      </Float>
      <Html position={[0, 2.1, 0]} center distanceFactor={18}>
        <div className="crate-label" style={{ borderColor: `${color}aa`, color }}>{category.toUpperCase()}</div>
      </Html>
      <pointLight position={[0, 1.2, 0]} color={color} intensity={selected ? 1.7 : 0.65} distance={5} />
    </group>
  );
}

function Pad() {
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <cylinderGeometry args={[3.8, 4.4, 0.28, 8]} />
        <meshStandardMaterial color="#2b3038" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.8, 3, 48]} />
        <meshBasicMaterial color="#ffd23f" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.16, 0.16, 5.3]} />
        <meshBasicMaterial color="#e8a24d" />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[5.3, 0.16, 0.16]} />
        <meshBasicMaterial color="#e8a24d" />
      </mesh>
    </group>
  );
}

function PopBlock({ part, index, visible }: { part: TesseractPart; index: number; visible: boolean }) {
  const block = useRef<THREE.Group>(null);
  const time = useRef(0);
  const panel = part.category === 'Solar';
  const positions: [number, number, number][] = panel
    ? [[-1.2, 1.4, 0], [1.2, 1.4, 0]]
    : part.category === 'Frame'
      ? [[0, 1, 0], [0.35, 1.4, 0.2], [-0.35, 1.4, -0.2]]
      : [[(index % 3 - 1) * 0.45, 1.7 + Math.floor(index / 3) * 0.42, 0.04]];
  useFrame((_, delta) => {
    if (!block.current) return;
    time.current = visible ? Math.min(1, time.current + delta * 3.8) : 0;
    const pop = Math.sin(time.current * Math.PI * 0.5);
    block.current.scale.setScalar(pop);
    block.current.position.y = 0.5 + pop * 0.5;
  });
  if (!visible) return null;
  return (
    <group ref={block}>
      {positions.map((position, blockIndex) => (
        <mesh key={`${part.id}-${blockIndex}`} position={position} castShadow>
          <boxGeometry args={panel ? [1.4, 0.12, 0.72] : [0.68, 0.68, 0.68]} />
          <meshStandardMaterial color={part.color} metalness={0.26} roughness={0.4} />
        </mesh>
      ))}
      {part.category === 'Frame' && <mesh position={[0, 1.45, 0]}><boxGeometry args={[0.28, 1.1, 0.28]} /><meshStandardMaterial color="#e8a24d" /></mesh>}
    </group>
  );
}

function AssembledSatellite({ parts, assembledCount }: { parts: TesseractPart[]; assembledCount: number }) {
  return (
    <group position={[0, 0.55, 0]}>
      {parts.map((part, index) => <PopBlock key={part.id} part={part} index={index} visible={index < assembledCount} />)}
      {assembledCount > 0 && <mesh position={[0, 1.28, 0]} castShadow>
        <boxGeometry args={[0.9, 0.95, 0.9]} />
        <meshStandardMaterial color="#dfd9c9" metalness={0.28} roughness={0.38} />
      </mesh>}
      {assembledCount > 1 && <mesh position={[0, 1.3, 0.48]}>
        <boxGeometry args={[0.38, 0.3, 0.08]} />
        <meshStandardMaterial color="#4fd1ff" emissive="#174e70" />
      </mesh>}
      <pointLight position={[0, 2.3, 0]} color="#ffd23f" intensity={assembledCount ? 1.1 : 0} distance={5} />
    </group>
  );
}

function Rocket({ altitudeKm, stage }: { altitudeKm: number; stage: Stage }) {
  const visible = stage === 'launch';
  return (
    <group position={[0, 1 + (altitudeKm / 500) * 32, 0]} visible={visible}>
      <mesh castShadow>
        <cylinderGeometry args={[0.55, 0.82, 5, 8]} />
        <meshStandardMaterial color="#e6e3d7" metalness={0.3} roughness={0.45} />
      </mesh>
      <mesh position={[0, 2.75, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.55, 1.5, 8]} />
        <meshStandardMaterial color="#ff6b6b" />
      </mesh>
      <mesh position={[0, -2.35, 0]}>
        <coneGeometry args={[0.42, 1.15, 8]} />
        <meshBasicMaterial color="#ffd23f" />
      </mesh>
      <pointLight position={[0, -2, 0]} color="#ff9a4e" intensity={3} distance={9} />
    </group>
  );
}

function GroundWorld({
  stage, keys, lookDelta, onNearby, onCrateTap, parts, assembledCount, altitudeKm,
}: {
  stage: Stage;
  keys: React.MutableRefObject<KeyState>;
  lookDelta: React.MutableRefObject<number>;
  onNearby: (target: string | null) => void;
  onCrateTap: (category: string, playerPosition: THREE.Vector3) => void;
  parts: TesseractPart[];
  assembledCount: number;
  altitudeKm: number;
}) {
  const player = useRef(new THREE.Vector3(0, 0, 8));
  const yaw = useRef(0);
  const { camera } = useThree();
  const lastNearby = useRef<string | null>(null);
  useFrame((_, delta) => {
    const canWalk = stage === 'briefing' || stage === 'build';
    if (canWalk) {
      const speed = 5 * Math.min(delta, 0.04);
      yaw.current += (keys.current.ArrowLeft ? 1 : 0) * delta * 1.8;
      yaw.current -= (keys.current.ArrowRight ? 1 : 0) * delta * 1.8;
      yaw.current += lookDelta.current;
      lookDelta.current = 0;
      const forwardX = Math.sin(yaw.current);
      const forwardZ = -Math.cos(yaw.current);
      const sideX = Math.cos(yaw.current);
      const sideZ = Math.sin(yaw.current);
      if (keys.current.w || keys.current.W) { player.current.x += forwardX * speed; player.current.z += forwardZ * speed; }
      if (keys.current.s || keys.current.S) { player.current.x -= forwardX * speed; player.current.z -= forwardZ * speed; }
      if (keys.current.a || keys.current.A) { player.current.x -= sideX * speed; player.current.z += sideZ * speed; }
      if (keys.current.d || keys.current.D) { player.current.x += sideX * speed; player.current.z -= sideZ * speed; }
      player.current.x = THREE.MathUtils.clamp(player.current.x, -22, 22);
      player.current.z = THREE.MathUtils.clamp(player.current.z, -22, 22);
    }
    const cameraOffset = stage === 'launch'
      ? new THREE.Vector3(10, 7, 17)
      : new THREE.Vector3(-Math.sin(yaw.current) * 8, 1.6, Math.cos(yaw.current) * 8);
    const cameraTarget = stage === 'launch'
      ? new THREE.Vector3(0, 1 + (altitudeKm / 500) * 32, 0)
      : new THREE.Vector3(player.current.x, 2, player.current.z);
    camera.position.lerp(cameraTarget.clone().add(cameraOffset), 1 - Math.exp(-delta * 5));
    camera.lookAt(cameraTarget);

    let target: string | null = null;
    const padDistance = Math.hypot(player.current.x, player.current.z);
    if (padDistance < 3.7) target = 'pad';
    else {
      let closestDistance = 4.5;
      for (const zone of ZONES) {
        const distance = Math.hypot(player.current.x - zone.position[0], player.current.z - zone.position[2]);
        if (distance < closestDistance) { closestDistance = distance; target = zone.category; }
      }
    }
    if (target !== lastNearby.current) {
      lastNearby.current = target;
      onNearby(target);
    }
  });

  const handleCrateTap = (category: string) => onCrateTap(category, player.current);
  const earthMap = useMemo(earthTexture, []);
  return (
    <>
      <color attach="background" args={['#10182b']} />
      <fog attach="fog" args={['#10182b', 34, 100]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[14, 24, 8]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
      <hemisphereLight args={['#a8e9ff', '#843d2d', 0.8]} />
      <Stars radius={90} depth={65} count={3600} factor={3.5} saturation={0.25} fade speed={0.35} />
      <Earth radius={12} position={[-8, 9, -38]} />
      <mesh position={[18, 19, -72]}>
        <sphereGeometry args={[1.25, 28, 20]} />
        <meshStandardMaterial color="#b7c5ca" roughness={0.92} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow>
        <planeGeometry args={[180, 180, 1, 1]} />
        <meshStandardMaterial color="#9e5139" roughness={1} />
      </mesh>
      {Array.from({ length: 28 }, (_, index) => (
        <mesh key={`rock-${index}`} position={[Math.sin(index * 17.4) * 25, 0.12, Math.cos(index * 7.7) * 25]} rotation={[0, index, 0]}>
          <dodecahedronGeometry args={[0.25 + (index % 4) * 0.13, 0]} />
          <meshStandardMaterial color={index % 3 ? '#774137' : '#bd7650'} roughness={1} />
        </mesh>
      ))}
      <Pad />
      {stage === 'briefing' || stage === 'build' ? ZONES.map((zone) => (
        <Crate
          key={zone.category}
          category={zone.category}
          position={zone.position}
          selected={false}
          onSelect={() => handleCrateTap(zone.category)}
        />
      )) : null}
      {(stage === 'assembling' || stage === 'launch-ready' || stage === 'launch') && (
        <AssembledSatellite parts={parts} assembledCount={stage === 'assembling' ? assembledCount : 7} />
      )}
      <Astronaut player={player} yaw={yaw} />
      <Rocket altitudeKm={altitudeKm} stage={stage} />
      {stage === 'launch' && <Text position={[0, 11, -1]} fontSize={0.9} color="#f4f1ea" anchorX="center">ASCENT / 500 KM</Text>}
      {stage === 'launch' && <mesh position={[0, -0.01, 0]}><cylinderGeometry args={[0.3, 1.25, 1.2, 8]} /><meshStandardMaterial color="#49545d" /></mesh>}
      <mesh position={[0, -0.55, -34]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[16, 48]} />
        <meshBasicMaterial map={earthMap} color="#ffffff" transparent opacity={0} />
      </mesh>
    </>
  );
}

function OrbitWorld() {
  const orbit = useRef<THREE.Group>(null);
  const satellite = useRef<THREE.Group>(null);
  const previousDark = useRef(false);
  const [dark, setDark] = useState(false);
  const texture = useMemo(earthTexture, []);
  useFrame((_, delta) => {
    if (orbit.current) orbit.current.rotation.y += delta * 0.18;
    if (satellite.current) satellite.current.rotation.z += delta * 0.4;
    const nowDark = Math.cos(orbit.current?.rotation.y ?? 0) < -0.37;
    if (nowDark !== previousDark.current) {
      previousDark.current = nowDark;
      setDark(nowDark);
    }
  });
  return (
    <>
      <color attach="background" args={['#070b1f']} />
      <ambientLight intensity={dark ? 0.1 : 0.38} />
      <directionalLight position={[12, 15, 9]} intensity={dark ? 0.18 : 2.5} color="#fff0c1" />
      <Stars radius={75} depth={60} count={3600} factor={3} saturation={0.35} fade speed={0.5} />
      <mesh>
        <sphereGeometry args={[5, 48, 32]} />
        <meshStandardMaterial map={texture} roughness={0.85} emissive={dark ? '#001423' : '#061d31'} emissiveIntensity={0.6} />
      </mesh>
      <mesh>
        <sphereGeometry args={[5.18, 32, 24]} />
        <meshBasicMaterial color="#4fd1ff" transparent opacity={0.12} side={THREE.BackSide} />
      </mesh>
      <group ref={orbit}>
        <Torus args={[8, 0.035, 6, 160]} rotation={[Math.PI / 2.8, 0.14, 0]}>
          <meshBasicMaterial color="#4fd1ff" transparent opacity={0.7} />
        </Torus>
        <group ref={satellite} position={[8, 0, 0]} rotation={[0.25, 0, 0]}>
          <mesh>
            <boxGeometry args={[0.75, 0.75, 0.8]} />
            <meshStandardMaterial color="#e8a24d" emissive={dark ? '#000000' : '#39240b'} />
          </mesh>
          <mesh position={[-1.2, 0, 0]}><boxGeometry args={[1.7, 0.12, 0.8]} /><meshStandardMaterial color={dark ? '#233242' : '#4fd1ff'} emissive={dark ? '#000000' : '#0f4055'} /></mesh>
          <mesh position={[1.2, 0, 0]}><boxGeometry args={[1.7, 0.12, 0.8]} /><meshStandardMaterial color={dark ? '#233242' : '#4fd1ff'} emissive={dark ? '#000000' : '#0f4055'} /></mesh>
          <pointLight intensity={dark ? 0.05 : 1.2} color="#ffd23f" distance={5} />
        </group>
      </group>
      <mesh position={[0, 0, -38]}>
        <sphereGeometry args={[1.2, 24, 18]} />
        <meshStandardMaterial color="#aaaeb2" roughness={0.96} />
      </mesh>
    </>
  );
}

function PartIcon({ part }: { part: TesseractPart }) {
  return <span className="part-icon" style={{ backgroundColor: part.color }}>{part.category === 'Solar' ? '▤' : part.category === 'Frame' ? '▦' : part.category === 'Payload' ? '◈' : '◆'}</span>;
}

function ResourceBar({ label, value, max, unit, kind }: { label: string; value: number; max: number; unit: string; kind: 'nominal' | 'warning' | 'critical' }) {
  const width = Math.min(100, max <= 0 ? 0 : (value / max) * 100);
  return (
    <div className="resource-row">
      <div className="resource-line"><span>{label}</span><b>{value.toFixed(label === 'COST' ? 0 : 1)}{unit}</b></div>
      <div className="resource-track"><motion.i animate={{ width: `${width}%` }} transition={{ duration: 0.42 }} data-state={kind} /></div>
    </div>
  );
}

export default function TesseractGame() {
  const [appScreen, setAppScreen] = useState<AppScreen>('landing');
  const [stage, setStage] = useState<Stage>('briefing');
  const [missionId, setMissionId] = useState(TESSERACT_MISSIONS[0].id);
  const [launcherId, setLauncherId] = useState(TESSERACT_LAUNCHERS[0].id);
  const [difficulty, setDifficulty] = useState<Difficulty>('Explorer');
  const [dailySeed, setDailySeed] = useState('');
  const [teamSize, setTeamSize] = useState(1);
  const [activePlayer, setActivePlayer] = useState(0);
  const [handoffTarget, setHandoffTarget] = useState<number | null>(null);
  const [partApproval, setPartApproval] = useState<{ part: TesseractPart; requester: number } | null>(null);
  const [approvedPartChanges, setApprovedPartChanges] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(window.localStorage.getItem('tesseract-leaderboard') ?? '[]') as LeaderboardEntry[]; }
    catch { return []; }
  });
  const [entrySaved, setEntrySaved] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inventory, setInventory] = useState<Record<string, string>>({});
  const [activeZone, setActiveZone] = useState<string | null>(null);
  const [nearby, setNearby] = useState<string | null>(null);
  const nearbyRef = useRef<string | null>(null);
  const [message, setMessage] = useState('Choose a mission, then walk to a glowing supply crate.');
  const [assembledCount, setAssembledCount] = useState(0);
  const [throttle, setThrottle] = useState(100);
  const [pitch, setPitch] = useState(90);
  const [launched, setLaunched] = useState(false);
  const [ascent, setAscent] = useState<AscentState>({ elapsed: 0, deltaVMs: 0, altitudeKm: 0, efficiency: 1 });
  const [resultMessage, setResultMessage] = useState('');
  const [downlinkResult, setDownlinkResult] = useState<DownlinkResult | null>(null);
  const [powerResult, setPowerResult] = useState<EclipseScheduleResult | null>(null);
  const [sequenceResult, setSequenceResult] = useState<MissionSequenceResult | null>(null);
  const [burnResult, setBurnResult] = useState<OrbitBurnResult | null>(null);
  const [missionControlResult, setMissionControlResult] = useState<MissionControlResult | null>(null);
  const [muted, setMuted] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizSelection, setQuizSelection] = useState<string | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<QuizPrompt[]>([]);
  const [homeHelpOpen, setHomeHelpOpen] = useState(false);
  const keys = useRef<KeyState>({});
  const lookDelta = useRef(0);
  const drag = useRef<{ active: boolean; x: number }>({ active: false, x: 0 });
  const [interactionTick, setInteractionTick] = useState(0);
  const ascentRef = useRef(ascent);
  const mission = TESSERACT_MISSIONS.find((item) => item.id === missionId) ?? TESSERACT_MISSIONS[0];
  const launcher = TESSERACT_LAUNCHERS.find((item) => item.id === launcherId) ?? TESSERACT_LAUNCHERS[0];
  const crewRoles = assignCrewRoles(teamSize);
  const activeRoles = (Object.entries(crewRoles) as [CrewRole, number][]).filter(([, player]) => player === activePlayer).map(([role]) => CREW_ROLE_NAMES[role]);
  const parts = CATEGORIES.map((category) => TESSERACT_PARTS.find((part) => part.id === inventory[category])).filter((part): part is TesseractPart => Boolean(part));
  const evaluation = evaluateTesseractBuild(missionId, Object.values(inventory));
  const marginFactor = difficulty === 'Mission Director' ? 0.8 : difficulty === 'Engineer' ? 0.9 : 1;
  const powerFactor = difficulty === 'Mission Director' ? 1.2 : difficulty === 'Engineer' ? 1.1 : 1.05;
  const massLimitKg = difficulty === 'Sandbox' ? Number.MAX_SAFE_INTEGER : mission.maxMassKg * marginFactor;
  const budgetLimitK = difficulty === 'Sandbox' ? Number.MAX_SAFE_INTEGER : mission.budgetK * marginFactor;
  const missionViable = difficulty === 'Sandbox' || (
    evaluation.massKg <= massLimitKg && evaluation.costK <= budgetLimitK &&
    (difficulty === 'Explorer' || (evaluation.solarW >= evaluation.loadW * powerFactor && evaluation.batteryWh >= evaluation.batteryNeedWh * powerFactor))
  );
  const selectedBattery = TESSERACT_PARTS.find((part) => part.id === inventory.Battery);
  const batteryCapacityWh = selectedBattery && 'energyWh' in selectedBattery ? selectedBattery.energyWh ?? 0 : 0;
  const selectedPayload = TESSERACT_PARTS.find((part) => part.id === inventory.Payload);
  const instrumentLoadW = selectedPayload && 'loadW' in selectedPayload ? selectedPayload.loadW ?? 0 : 0;
  const selectedRadio = TESSERACT_PARTS.find((part) => part.id === inventory.Radio);
  const radioLoadW = selectedRadio && 'loadW' in selectedRadio ? selectedRadio.loadW ?? 0 : 0;
  const dataMbPerOrbit = calculateMissionDataMbPerOrbit(inventory.Payload ?? mission.payloadId);
  const launcherDeltaV = calculateLauncherDeltaVMs(launcher);
  const orbitMinutes = calculateMissionOrbitPeriodMinutes();
  const eclipseMinutes = calculateMissionEclipseMinutes();
  const pickedUp = Object.keys(inventory).length;
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    const role = STAGE_ROLES[stage];
    if (role) setActivePlayer(crewRoles[role]);
  }, [stage, teamSize]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && stage !== 'briefing') {
        setMenuOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stage]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(key)) event.preventDefault();
      keys.current[key] = true;
      if (key.toLowerCase() === 'e' && activeZone === null && stage === 'build') {
        setInteractionTick((value) => value + 1);
      }
      if (stage === 'launch') {
        if (key === 'ArrowUp') setThrottle((value) => Math.min(100, value + 5));
        if (key === 'ArrowDown') setThrottle((value) => Math.max(20, value - 5));
        if (key === 'ArrowLeft') setPitch((value) => Math.max(0, value - 3));
        if (key === 'ArrowRight') setPitch((value) => Math.min(90, value + 3));
      }
    };
    const up = (event: KeyboardEvent) => { keys.current[event.key] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [activeZone, stage]);

  useEffect(() => {
    if (stage !== 'assembling') return;
    setAssembledCount(0);
    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      setAssembledCount(count);
      playTone(muted, 310 + count * 42, 0.07);
      if (count >= 7) {
        window.clearInterval(timer);
        window.setTimeout(() => {
          setStage('launch-ready');
          setMessage('Satellite assembled. Tune your gravity turn, then light the engines.');
        }, 420);
      }
    }, 260);
    return () => window.clearInterval(timer);
  }, [stage, muted]);

  useEffect(() => {
    if (stage !== 'launch' || !launched) return;
    const timer = window.setInterval(() => {
      const previous = ascentRef.current;
      const elapsed = previous.elapsed + 0.5;
      const targetPitch = Math.max(0, 90 - elapsed * 2.1);
      const steeringEfficiency = Math.max(0.18, 1 - Math.abs(pitch - targetPitch) / 115);
      const nextDv = previous.deltaVMs + launcherDeltaV / 44 * (throttle / 100) * steeringEfficiency * 0.5;
      const next: AscentState = {
        elapsed,
        deltaVMs: nextDv,
        altitudeKm: Math.min(500, Math.pow(Math.min(1, nextDv / TARGET_DV_MS), 1.14) * 500),
        efficiency: (previous.efficiency * previous.elapsed + steeringEfficiency * 0.5) / elapsed,
      };
      ascentRef.current = next;
      setAscent(next);
      if (elapsed >= 44 || nextDv >= TARGET_DV_MS) {
        window.clearInterval(timer);
        window.setTimeout(() => {
          const passed = nextDv >= TARGET_DV_MS && next.efficiency >= 0.58;
          const margin = Math.max(0, (launcherDeltaV - nextDv) / 1000);
          const finalLine = passed
            ? `Orbit insertion clean. ${margin.toFixed(2)} km/s of ideal propellant margin remains.`
            : `Ascent shortfall: ${((TARGET_DV_MS - nextDv) / 1000).toFixed(2)} km/s below orbital speed. Pitch efficiency ${(next.efficiency * 100).toFixed(0)}%.`;
          setResultMessage(finalLine);
          setStage(passed ? 'orbit' : 'result');
        }, 550);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [stage, launched, pitch, throttle, launcherDeltaV]);

  useEffect(() => {
    const onGlobalPointerMove = (event: PointerEvent) => {
      if (!drag.current.active) return;
      lookDelta.current += (event.clientX - drag.current.x) * -0.004;
      drag.current.x = event.clientX;
    };
    const onGlobalPointerUp = () => { drag.current.active = false; };
    window.addEventListener('pointermove', onGlobalPointerMove);
    window.addEventListener('pointerup', onGlobalPointerUp);
    return () => { window.removeEventListener('pointermove', onGlobalPointerMove); window.removeEventListener('pointerup', onGlobalPointerUp); };
  }, []);

  const openMission = () => {
    setAppScreen('game');
    setActivePlayer(crewRoles.planner);
    setInventory({});
    setApprovedPartChanges(0);
    setEntrySaved(false);
    setStage('build');
    setMessage('Find the FRAME crate. Walk with WASD, turn with ← →, interact with E.');
  };

  const startMission = () => {
    openMission();
  };

  const openZone = (category: string) => {
    const role = ZONE_ROLES[category];
    const owner = role ? crewRoles[role] : activePlayer;
    if (teamSize > 1 && owner !== activePlayer) {
      setHandoffTarget(owner);
      setMessage(`Player ${owner + 1} / ${role ? CREW_ROLE_NAMES[role] : 'crew'} owns this station. Pass controls to continue.`);
      return;
    }
    setHandoffTarget(null);
    setActiveZone(category);
  };

  const handleCrateTap = (category: string, playerPosition: THREE.Vector3) => {
    if (stage !== 'build') return;
    const zone = ZONES.find((entry) => entry.category === category);
    if (!zone || Math.hypot(playerPosition.x - zone.position[0], playerPosition.z - zone.position[2]) > 4.5) {
      setMessage(`Walk closer to the ${category.toLowerCase()} crate.`);
      return;
    }
    openZone(category);
    playTone(muted, 420, 0.09);
  };

  const interact = () => {
    const target = nearbyRef.current;
    if (target === 'pad') {
      if (pickedUp < CATEGORIES.length) {
        setMessage(`Pad check: ${pickedUp}/7 parts collected. Visit the glowing zones first.`);
      } else if (teamSize > 1 && activePlayer !== crewRoles.engineer) {
        setHandoffTarget(crewRoles.engineer);
        setMessage(`Player ${crewRoles.engineer + 1} / Spacecraft Engineer must approve satellite assembly.`);
      } else {
        setStage('assembling');
        setMessage('Assembly in progress. Flight computer booting.');
      }
      return;
    }
    if (target) openZone(target);
    else setMessage('No station in reach. Follow the glowing beacons.');
  };

  const updateNearby = (target: string | null) => {
    nearbyRef.current = target;
    setNearby(target);
  };

  useEffect(() => {
    if (stage === 'build' && activeZone === null && interactionTick > 0) interact();
  }, [interactionTick]);

  const commitPart = (part: TesseractPart, requester = activePlayer) => {
    setInventory((current) => ({ ...current, [part.category]: part.id }));
    setActiveZone(null);
    setHandoffTarget(null);
    setActivePlayer(requester);
    setMessage(`${part.name} secured in hotbar.`);
    playTone(muted, 740, 0.08);
  };

  const choosePart = (part: TesseractPart) => {
    if (teamSize > 1 && activePlayer !== crewRoles.engineer) {
      setPartApproval({ part, requester: activePlayer });
      setActivePlayer(crewRoles.engineer);
      setMessage(`Resource change requested: ${part.massKg.toFixed(2)} kg / $${part.costK}k. Engineer approval required.`);
      return;
    }
    commitPart(part);
  };

  const reviewPartChange = (approved: boolean) => {
    if (!partApproval) return;
    const { part, requester } = partApproval;
    if (approved) {
      setApprovedPartChanges((count) => count + 1);
      commitPart(part, requester);
      setMessage(`Engineer approved ${part.name}: +${part.massKg.toFixed(2)} kg, $${part.costK}k.`);
    } else {
      setActiveZone(null);
      setActivePlayer(requester);
      setMessage(`Engineer countered ${part.name}. The shared design and budget are unchanged.`);
    }
    setPartApproval(null);
  };

  const startLaunch = () => {
    if (!missionViable) {
      const reason = evaluation.massKg > massLimitKg
        ? `Vehicle did not lift: ${evaluation.massKg.toFixed(2)} kg exceeds the ${massLimitKg.toFixed(1)} kg ${difficulty} limit.`
        : evaluation.reasons[0] ?? `${difficulty} margins are not met; adjust power, battery, budget, or hardware.`;
      setResultMessage(reason);
      setStage('result');
      return;
    }
    setAscent({ elapsed: 0, deltaVMs: 0, altitudeKm: 0, efficiency: 1 });
    ascentRef.current = { elapsed: 0, deltaVMs: 0, altitudeKm: 0, efficiency: 1 };
    setPitch(90);
    setThrottle(100);
    setLaunched(true);
    setStage('launch');
    setMessage('Keep the nose on the cyan gravity-turn marker. Throttle up, then pitch east.');
    playTone(muted, 170, 0.4);
  };

  const retryDesign = () => {
    setStage('build');
    setLaunched(false);
    setMenuOpen(false);
    setDownlinkResult(null);
    setPowerResult(null);
    setSequenceResult(null);
    setBurnResult(null);
    setMissionControlResult(null);
    setEntrySaved(false);
    setAscent({ elapsed: 0, deltaVMs: 0, altitudeKm: 0, efficiency: 1 });
    setResultMessage('');
    setMessage('Design retained. Swap a component, reassemble, and fly again.');
  };

  const quitToMenu = () => {
    setMenuOpen(false);
    setAppScreen('hub');
    setStage('briefing');
    setLaunched(false);
    setInventory({});
    setActiveZone(null);
    setNearby(null);
    setAssembledCount(0);
    setResultMessage('');
    setDownlinkResult(null);
    setPowerResult(null);
    setSequenceResult(null);
    setBurnResult(null);
    setMissionControlResult(null);
    setEntrySaved(false);
    setAscent({ elapsed: 0, deltaVMs: 0, altitudeKm: 0, efficiency: 1 });
    setMessage('Choose a mission, then walk to a glowing supply crate.');
  };

  const orbitSuccess = ascent.deltaVMs >= TARGET_DV_MS && ascent.efficiency >= 0.58;
  const score = Math.max(0, Math.min(100, Math.round(evaluation.scienceScore * 0.25 + (downlinkResult?.score ?? 0) * 0.15 + (powerResult?.score ?? 0) * 0.13 + (sequenceResult?.score ?? 0) * 0.13 + (burnResult?.score ?? 0) * 0.13 + ascent.efficiency * 100 * 0.11 + (missionControlResult?.score ?? 0) * 0.1 + Math.min(5, approvedPartChanges) * 0.5)));
  const stars = orbitSuccess && missionViable && Boolean(downlinkResult?.success && powerResult?.success && sequenceResult?.success && burnResult?.success && (missionControlResult?.score ?? 0) >= 15) ? (score >= 75 ? 3 : score >= 55 ? 2 : 1) : 0;
  useEffect(() => {
    if (stage !== 'result' || entrySaved) return;
    const entry: LeaderboardEntry = { mission: mission.name, score, stars, date: new Date().toISOString().slice(0, 10), difficulty };
    const next = [...leaderboard, entry].sort((left, right) => right.score - left.score).slice(0, 5);
    setLeaderboard(next);
    window.localStorage.setItem('tesseract-leaderboard', JSON.stringify(next));
    setEntrySaved(true);
  }, [stage, entrySaved, leaderboard, mission.name, score, stars, difficulty]);
  const analog = MISSION_ANALOGS[missionId];
  const learnExplanation = !evaluation.checks.mass
    ? `This stack is ${evaluation.massKg.toFixed(2)} kg, over the ${mission.maxMassKg.toFixed(1)} kg limit. Removing or swapping a component lowers launch mass and the force needed to reach orbit.`
    : downlinkResult && !downlinkResult.success
      ? `Only ${downlinkResult.sentMb.toFixed(1)} MB of ${calculateMissionDataMbPerOrbit(inventory.Payload ?? mission.payloadId).toFixed(1)} MB returned, so the science score fell. Keep the antenna linked during contact and send the highest-value packets before the pass closes.`
      : powerResult && !powerResult.success
        ? `The schedule ${powerResult.batterySafe ? 'missed its observation quota' : `crossed the 60% battery reserve at segment ${(powerResult.criticalSegment ?? 0) + 1}`}. Instrument and heater load continues while the spacecraft is in Earth's shadow.`
        : sequenceResult && !sequenceResult.success
          ? `${sequenceResult.reason} Flight commands are time-ordered: the payload must be powered before observing, data must be stored before contact, and downlinks only work in station windows.`
          : burnResult && !burnResult.success
            ? `${burnResult.reason} The Hohmann transfer needs two velocity changes; target a smaller altitude change to stay within the propellant saved by ascent.`
            : missionControlResult && missionControlResult.score < 15
              ? `Risk score ${missionControlResult.score}/25. The incident choices spent ${missionControlResult.batteryDeltaWh.toFixed(1)} Wh and put ${missionControlResult.dataLossMb.toFixed(1)} MB at risk; protect safe mode, buffer, and reserve when a fault occurs.`
        : !orbitSuccess
          ? `The ascent did not reach the 9.4 km/s game target with a steady gravity turn. A shallow or late pitch wastes propellant and can leave the vehicle below orbital speed.`
          : `The satellite survived a ${eclipseMinutes.toFixed(1)} minute eclipse with a ${powerResult?.minimumBatteryPct.toFixed(0) ?? 'measured'}% battery floor. Returned data and power margins determine how much of the payload's science reaches the ground.`;
  const loadState = evaluation.solarW >= evaluation.loadW ? 'nominal' : evaluation.solarW >= evaluation.loadW * 0.75 ? 'warning' : 'critical';
  const batteryState = evaluation.batteryWh >= evaluation.batteryNeedWh ? 'nominal' : evaluation.batteryWh >= evaluation.batteryNeedWh * 0.7 ? 'warning' : 'critical';
  const messagePrompt = stage === 'build' && nearby === 'pad'
    ? pickedUp === 7 ? 'E · ASSEMBLE SATELLITE' : `PAD · ${pickedUp}/7 COMPONENTS`
    : stage === 'build' && nearby ? `E · OPEN ${nearby.toUpperCase()} CRATE`
      : stage === 'build' ? 'WASD MOVE · ← → LOOK · E INTERACT'
        : stage === 'launch' ? '↑ ↓ THROTTLE · ← → PITCH · HOLD A STEADY TURN'
          : stage === 'orbit' ? 'ECLIPSE IS LIVE · POWER AND BATTERY CHECKED' : message;

  const startDailyChallenge = () => {
    const seed = new Date().toISOString().slice(0, 10);
    const index = [...seed].reduce((sum, character) => sum + character.charCodeAt(0), 0) % TESSERACT_MISSIONS.length;
    setMissionId(TESSERACT_MISSIONS[index].id);
    setDifficulty('Mission Director');
    setDailySeed(seed);
    setAppScreen('game');
    setStage('briefing');
  };

  const goToHub = () => {
    setAppScreen('hub');
    setStage('briefing');
    setMenuOpen(false);
    setActiveZone(null);
    setNearby(null);
  };

  const startQuiz = () => {
    setQuizQuestions(selectQuizPrompts(quizQuestions));
    setQuizIndex(0);
    setQuizScore(0);
    setQuizSelection(null);
    setAppScreen('quiz');
    setStage('briefing');
  };

  const goHome = () => {
    setAppScreen('landing');
    setStage('briefing');
    setMenuOpen(false);
    setActiveZone(null);
    setNearby(null);
    setSourcesOpen(false);
    setHomeHelpOpen(false);
  };

  const answerQuiz = (option: string) => {
    if (quizSelection !== null || quizIndex >= quizQuestions.length) return;
    setQuizSelection(option);
    if (option === quizQuestions[quizIndex].answer) setQuizScore((score) => score + 1);
  };

  const advanceQuiz = () => {
    setQuizSelection(null);
    setQuizIndex((index) => index + 1);
  };

  const exportDesign = () => {
    const payload = {
      app: 'SOLARIS: Mission Design', version: 1, mission: mission.name, missionId,
      difficulty, dailySeed: dailySeed || null, launchVehicle: launcher.name, parts,
      metrics: { massKg: evaluation.massKg, costK: evaluation.costK, solarW: evaluation.solarW, loadW: evaluation.loadW, batteryWh: evaluation.batteryWh, batteryNeedWh: evaluation.batteryNeedWh },
      results: { ascent, downlink: downlinkResult, eclipse: powerResult, sequence: sequenceResult, orbitBurn: burnResult, missionControl: missionControlResult, score, stars },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tesseract-${missionId}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const difficultyProfile = DIFFICULTY_PROFILES[difficulty];
  const partTeaching = (part: TesseractPart) => {
    const loaded = part.category === 'Payload' ? `This payload produces ${part.dataMbPerOrbit ?? 'mission'} MB per orbit and drives the amount of data your radio must return.` :
      part.category === 'Solar' ? `This generates ${part.powerW ?? 0} W of electrical power. It helps keep the battery above the eclipse floor.` :
      part.category === 'Battery' ? `This stores ${part.energyWh ?? 0} Wh and is the reserve you need for eclipse. A weak battery will flatten during darkness.` :
      part.category === 'Radio' ? `This radio sets the downlink capacity and dictates how much data can be returned before the station pass closes.` :
      part.category === 'Pointing' ? `This keeps the vehicle pointed correctly. Poor attitude control hurts science and can force a safe-mode decision.` :
      part.category === 'Computer' ? `This adds computing load and can influence mission timing, command safety, and the quality of onboard autonomy.` :
      `This structural element sets the bus size and mass. A larger frame can hold more hardware but costs launch margin.`;
    const trade = part.category === 'Battery' ? `More battery means more eclipse survival but more mass and cost.` :
      part.category === 'Solar' ? `More solar output helps the mission but adds mass and cost, and it only helps if the spacecraft is pointed correctly.` :
      part.category === 'Radio' ? `A stronger radio improves downlink performance but increases power demand and mass.` :
      part.category === 'Payload' ? `A bigger payload raises science value but usually increases power, data, and launch mass.` :
      part.category === 'Pointing' ? `More accurate pointing improves the mission but increases power use and can make command logic more sensitive.` :
      `Every added subsystem changes the balance between mission capability and launch margins.`;
    return `${loaded} ${trade}`;
  };

  const setTouchKey = (key: string, pressed: boolean) => { keys.current[key] = pressed; };
  const beginDragLook = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLCanvasElement) || stage === 'orbit' || stage === 'launch') return;
    drag.current = { active: true, x: event.clientX };
  };

  return (
    <div className="tesseract-app" onPointerDown={beginDragLook}>
      <div className="nebula-backdrop" aria-hidden="true" />
      {appScreen === 'landing' && (
        <div className="home-starfield" aria-hidden="true">
          {LANDING_STARS.map(([x, y, size, duration], index) => (
            <i key={`${x}-${y}`} style={{ left: `${x}%`, top: `${y}%`, '--star-size': `${size}px`, '--star-duration': `${duration}s`, '--star-delay': `${-index * 1.37}s` } as React.CSSProperties} />
          ))}
        </div>
      )}
      {appScreen !== 'landing' && appScreen !== 'hub' && appScreen !== 'quiz' && (
        <Canvas className="game-canvas" camera={{ position: [0, 6, 17], fov: 56 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: false }} shadows>
          {stage === 'orbit' || stage === 'downlink' || stage === 'eclipse' || stage === 'sequencer' || stage === 'orbitburn' || stage === 'missioncontrol' || (stage === 'result' && orbitSuccess) ? <OrbitWorld /> : (
            <GroundWorld
              stage={stage}
              keys={keys}
              lookDelta={lookDelta}
              onNearby={updateNearby}
              onCrateTap={handleCrateTap}
              parts={parts}
              assembledCount={assembledCount}
              altitudeKm={ascent.altitudeKm}
            />
          )}
        </Canvas>
      )}

      {appScreen !== 'landing' && appScreen !== 'hub' && appScreen !== 'quiz' && (
        <header className="game-topbar">
          <div className="brand-mark"><img className="brand-emblem" src="/solaris-emblem.svg" alt="" /><div><b>SOLARIS</b><small>MISSION DESIGN</small></div></div>
          <div className="top-mission"><span className="status-dot" />{MISSION_NAMES.get(missionId)}<i>·</i>{launcher.name}</div>
          <div className="top-actions">
            <button type="button" className="home-nav" onClick={goHome} aria-label="Go to home"><Home size={18} /><span>HOME</span></button>
            {stage !== 'briefing' && (
              <button type="button" className="icon-button" onClick={() => setMenuOpen((value) => !value)} aria-label="Open mission menu"><Menu size={19} /></button>
            )}
            <button type="button" className="icon-button" onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Unmute sound' : 'Mute sound'}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
            <button type="button" className="icon-button" onClick={() => setSourcesOpen(true)} aria-label="Open mission hints"><CircleHelp size={18} /></button>
            <span className="approx-tag">APPROX. / GAME-CALIBRATED</span>
          </div>
        </header>
      )}

      {appScreen !== 'game' && (
        <header className="shell-topbar">
          <div className="brand-mark"><img className="brand-emblem" src="/solaris-emblem.svg" alt="" /><div><b>SOLARIS</b><small>MISSION DESIGN</small></div></div>
          {appScreen !== 'landing' && <button type="button" className="home-nav" onClick={goHome} aria-label="Go to home"><Home size={18} /><span>HOME</span></button>}
        </header>
      )}

      {appScreen === 'landing' && (
        <motion.section className="briefing-panel game-panel landing-panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38 }}>
          <img className="landing-emblem" src="/solaris-emblem.svg" alt="Solaris orbital emblem" />
          <div className="panel-kicker">MISSION DESIGN LAB</div>
          <h1>SOLARIS</h1>
          <p className="briefing-lede">Learn how spacecraft choices change mission success, power, and data return before you launch.</p>
          <div className="landing-cta-row">
            <button type="button" className="game-button primary" onClick={() => setAppScreen('hub')}><Sparkles size={18} /> START <ArrowRight size={19} /></button>
          </div>
          <button type="button" className="how-it-works-toggle" aria-expanded={homeHelpOpen} onClick={() => setHomeHelpOpen((open) => !open)}>
            <BookOpen size={21} /><span>How this works</span><ChevronDown className={homeHelpOpen ? 'expanded' : ''} size={19} />
          </button>
          <AnimatePresence initial={false}>
            {homeHelpOpen && (
              <motion.div className="home-help-content" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}>
                <p>Pick a mission and test the tradeoffs real teams make when balancing mass, power, battery reserve, and science.</p>
                <p>Start with the live satellite mission, take the daily learning quiz, or explore new mission lanes as they arrive.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      )}

      {appScreen === 'hub' && (
        <motion.section className="briefing-panel game-panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.38 }}>
          <div className="panel-kicker">MISSION HUB / 01</div>
          <h1>Choose your mission lane.</h1>
          <div className="mission-grid">
            {HUB_GAMES.map((game) => {
              const GameIcon = game.id === 'tesseract' ? Satellite : game.id === 'daily-quiz' ? Sparkles : game.id === 'signal-run' ? Radio : CircleHelp;
              return <button key={game.id} type="button" className={`mission-card ${game.id === 'tesseract' ? 'selected' : ''}`} onClick={() => {
                if (game.id === 'tesseract') {
                  setAppScreen('game');
                  setStage('briefing');
                } else if (game.id === 'daily-quiz') {
                  startQuiz();
                }
              }}>
                <span className="hub-game-icon" style={{ '--icon-accent': game.accent } as React.CSSProperties}><GameIcon size={28} strokeWidth={1.8} /></span>
                <span className="mission-card-title">{game.title}</span>
                <span className="mission-tagline">{game.blurb}</span>
                <span className="mission-tagline"><b>{game.tag}</b></span>
              </button>;
            })}
          </div>
          <div className="briefing-footer">
            <span><b>LEADERBOARD</b><i>·</i>{leaderboard.length ? `${leaderboard[0].score} pts` : 'No runs yet'}</span>
            <button type="button" className="game-button primary" onClick={() => setAppScreen('game')}><Satellite size={18} /> PLAY TESSERACT <ArrowRight size={18} /></button>
          </div>
        </motion.section>
      )}

      {appScreen === 'quiz' && (
        <motion.section className="briefing-panel game-panel quiz-panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38 }}>
          <div className="quiz-topline">
            <div><div className="panel-kicker">DAILY CHALLENGE</div><h1>Mission quiz</h1></div>
            <div className="quiz-score"><Trophy size={22} /><span>SCORE</span><b>{quizScore}<small>/{quizQuestions.length}</small></b></div>
          </div>
          {quizIndex < quizQuestions.length ? (() => {
            const prompt = quizQuestions[quizIndex];
            const QuestionIcon = prompt.icon;
            return (
              <>
                <div className="quiz-progress-line"><span>QUESTION {quizIndex + 1} OF {quizQuestions.length}</span><b>{Math.round(((quizIndex + 1) / quizQuestions.length) * 100)}%</b></div>
                <div className="quiz-progress" role="progressbar" aria-label="Quiz progress" aria-valuemin={0} aria-valuemax={quizQuestions.length} aria-valuenow={quizIndex + 1}><i style={{ width: `${((quizIndex + 1) / quizQuestions.length) * 100}%` }} /></div>
                <div className="quiz-question"><span className="quiz-question-icon"><QuestionIcon size={28} /></span><h2>{prompt.question}</h2></div>
                <div className="quiz-options">
                  {prompt.options.map((option, optionIndex) => {
                    const chosen = quizSelection === option;
                    const correct = quizSelection !== null && option === prompt.answer;
                    const incorrect = chosen && option !== prompt.answer;
                    return (
                      <button key={option} type="button" className={`quiz-option ${correct ? 'correct' : ''} ${incorrect ? 'incorrect' : ''} ${chosen ? 'chosen' : ''}`} onClick={() => answerQuiz(option)} disabled={quizSelection !== null} aria-pressed={chosen}>
                        <span className="quiz-option-letter">{String.fromCharCode(65 + optionIndex)}</span><span>{option}</span>
                        {correct && <CircleCheck size={21} aria-label="Correct answer" />}{incorrect && <CircleX size={21} aria-label="Incorrect answer" />}
                      </button>
                    );
                  })}
                </div>
                {quizSelection !== null && <div className={`quiz-feedback ${quizSelection === prompt.answer ? 'is-correct' : 'is-incorrect'}`} role="status"><b>{quizSelection === prompt.answer ? 'Correct!' : 'Not quite'}</b><span>{prompt.explanation}</span></div>}
                <div className="quiz-footer">
                  <button type="button" className="game-button secondary" onClick={goToHub}><Home size={17} /> HUB</button>
                  {quizSelection !== null && <button type="button" className="game-button primary" onClick={advanceQuiz}>{quizIndex === quizQuestions.length - 1 ? 'SEE RESULTS' : 'NEXT QUESTION'} <ArrowRight size={18} /></button>}
                </div>
              </>
            );
          })() : (
            <div className="quiz-result" role="status">
              <span className="quiz-result-icon"><Trophy size={38} /></span>
              <div className="panel-kicker">ROUND COMPLETE</div>
              <h2>{quizScore === quizQuestions.length ? 'Mission ready!' : quizScore > 0 ? 'Good flight!' : 'Keep training!'}</h2>
              <p>You scored <b>{quizScore} out of {quizQuestions.length}</b>. Every answer is a mission tradeoff worth remembering.</p>
              <div className="quiz-result-actions"><button type="button" className="game-button primary" onClick={startQuiz}><RotateCcw size={17} /> PLAY AGAIN</button><button type="button" className="game-button secondary" onClick={goToHub}><Home size={17} /> BACK TO HUB</button></div>
            </div>
          )}
        </motion.section>
      )}

      {appScreen === 'game' && (
        <>
          <AnimatePresence mode="wait">
            {stage === 'briefing' && (
              <motion.section key="briefing" className="briefing-panel game-panel mission-select-panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.38 }}>
                <div className="panel-kicker">MISSION SELECT / 01</div>
                <h1>Build for the <em>unknown.</em></h1>
                <p className="briefing-lede">Choose a payload. Your hardware is waiting out there.</p>
                <div className="mission-grid">
                  {TESSERACT_MISSIONS.map((entry, index) => {
                    const MissionIcon = [Magnet, Leaf, Thermometer, Atom][index];
                    const iconAccent = ['#4fd1ff', '#34d17a', '#ff9d67', '#d2adff'][index];
                    return (
                      <button key={entry.id} className={`mission-card ${missionId === entry.id ? 'selected' : ''}`} onClick={() => { setMissionId(entry.id); setDailySeed(''); }} type="button">
                        <span className="mission-orb" style={{ '--mission-accent': iconAccent } as React.CSSProperties}><MissionIcon size={28} strokeWidth={1.8} /></span>
                        <span className="mission-card-title">{entry.name}</span>
                        <span className="mission-tagline">{entry.tagline}</span>
                        <span className="mission-reqs"><b>{entry.frameClass}</b><b>≤{entry.maxMassKg} kg</b><b>${entry.budgetK}k</b><b>R{entry.radioRank} / P{entry.pointingRank}</b></span>
                      </button>
                    );
                  })}
                </div>
                <div className="difficulty-pick">
                  <span>FLIGHT RULES <small>{difficulty === 'Sandbox' ? 'LIMITS OFF' : difficulty.toUpperCase()}</small></span>
                  <div>{(['Explorer', 'Engineer', 'Mission Director', 'Sandbox'] as Difficulty[]).map((level) => <button key={level} type="button" className={difficulty === level ? 'active' : ''} onClick={() => { setDifficulty(level); setDailySeed(''); }}>{level}</button>)}</div>
                  <button type="button" className={`daily-challenge ${dailySeed ? 'active' : ''}`} onClick={startDailyChallenge}>DAILY CHALLENGE <b>{new Date().toISOString().slice(0, 10)}</b></button>
                </div>
                <div className="mode-teach">
                  <b>{difficultyProfile.headline}</b>
                  <p>{difficultyProfile.objective}</p>
                  <span>{difficultyProfile.focus}</span>
                  <small>{difficultyProfile.help}</small>
                </div>
                <div className="briefing-footer">
                  <span><b>500 km LEO</b><i>·</i>{orbitMinutes.toFixed(1)} min orbit<i>·</i>{eclipseMinutes.toFixed(1)} min eclipse</span>
                  <button type="button" className="game-button primary" onClick={startMission}>DROP IN <span>↗</span></button>
                </div>
                <div className="crew-select">
                  <span>CREW <small>{teamSize > 1 ? 'LOCAL HOT-SEAT' : 'SOLO'}</small></span>
                  <div>{[1, 2, 3, 4].map((size) => <button key={size} type="button" className={teamSize === size ? 'active' : ''} onClick={() => setTeamSize(size)} aria-label={size === 1 ? 'Solo mode' : `${size} players`}>{size === 1 ? '1 / SOLO' : `${size} PLAYERS`}</button>)}</div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {(stage === 'build' || stage === 'assembling' || stage === 'launch-ready') && (
            <>
              <aside className="left-hud">
                <div className="hud-heading"><span>{difficulty === 'Sandbox' ? 'SANDBOX / NO LIMITS' : 'FLIGHT DESIGN'}</span><b>{pickedUp}/7</b></div>
                <ResourceBar label="MASS" value={evaluation.massKg} max={massLimitKg} unit="kg" kind={evaluation.massKg <= massLimitKg ? 'nominal' : 'critical'} />
                <ResourceBar label="COST" value={evaluation.costK} max={budgetLimitK} unit="k" kind={evaluation.costK <= budgetLimitK ? 'nominal' : 'critical'} />
                <ResourceBar label="SOLAR / LOAD" value={evaluation.solarW} max={Math.max(evaluation.loadW * powerFactor, 0.1)} unit=" W" kind={evaluation.solarW >= evaluation.loadW * powerFactor ? 'nominal' : evaluation.solarW >= evaluation.loadW ? 'warning' : 'critical'} />
                <ResourceBar label="BATTERY / ECLIPSE" value={evaluation.batteryWh} max={Math.max(evaluation.batteryNeedWh * powerFactor, 0.1)} unit=" Wh" kind={evaluation.batteryWh >= evaluation.batteryNeedWh * powerFactor ? 'nominal' : evaluation.batteryWh >= evaluation.batteryNeedWh ? 'warning' : 'critical'} />
                <div className="hud-divider" />
                <label className="tiny-label" htmlFor="launcher">RIDE / APPROXIMATE</label>
                <select id="launcher" className="launcher-select" value={launcherId} onChange={(event) => setLauncherId(event.target.value)}>
                  {TESSERACT_LAUNCHERS.map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicle.name} · {vehicle.costUsdM}M</option>)}
                </select>
                <div className="launcher-stat">{(launcher.capacityKg / 1000).toFixed(1)} t LEO <span>·</span>{(launcherDeltaV / 1000).toFixed(1)} km/s ideal</div>
              </aside>

              <div className="hotbar" aria-label="Collected mission components">
                {CATEGORIES.map((category, index) => {
                  const part = TESSERACT_PARTS.find((entry) => entry.id === inventory[category]);
                  return <div key={category} className={`hotbar-slot ${part ? 'filled' : ''}`} style={{ '--slot-color': ZONE_COLORS[category] } as React.CSSProperties}>
                    <small>{index + 1}</small>{part ? <PartIcon part={part} /> : <i />}
                    <span>{part ? part.name : category}</span>
                  </div>;
                })}
              </div>
              <div className="build-copy"><b>{stage === 'assembling' ? 'ASSEMBLY SEQUENCE' : stage === 'launch-ready' ? 'SATELLITE READY' : 'FIELD ASSEMBLY'}</b><span>{message}</span></div>
              {stage === 'launch-ready' && (
                <motion.button type="button" className="game-button launch-ready-button" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={startLaunch}>BEGIN ASCENT <span>↗</span></motion.button>
              )}
              <div className="interaction-hint"><span className="keycap">{nearby === 'pad' || nearby ? 'E' : 'WASD'}</span><span>{messagePrompt}</span></div>
              <div className="touch-controls">
                <div className="touch-dpad">
                  <button onPointerDown={() => setTouchKey('w', true)} onPointerUp={() => setTouchKey('w', false)} onPointerLeave={() => setTouchKey('w', false)}>↑</button>
                  <div><button onPointerDown={() => setTouchKey('a', true)} onPointerUp={() => setTouchKey('a', false)} onPointerLeave={() => setTouchKey('a', false)}>←</button><button onPointerDown={() => setTouchKey('s', true)} onPointerUp={() => setTouchKey('s', false)} onPointerLeave={() => setTouchKey('s', false)}>↓</button><button onPointerDown={() => setTouchKey('d', true)} onPointerUp={() => setTouchKey('d', false)} onPointerLeave={() => setTouchKey('d', false)}>→</button></div>
                </div>
                <button className="touch-action" onClick={interact}>E<br /><small>USE</small></button>
              </div>
            </>
          )}

          {stage === 'build' && nearby === 'pad' && pickedUp === 7 && (
            <motion.button className="game-button assemble-button" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={interact} type="button">ASSEMBLE SATELLITE <span>▣</span></motion.button>
          )}

          {teamSize > 1 && stage !== 'briefing' && stage !== 'result' && (
            <div className="crew-turn"><span>PLAYER {activePlayer + 1}</span><b>{activeRoles.join(' / ')}</b>
              {handoffTarget !== null && <button type="button" onClick={() => { setActivePlayer(handoffTarget); setHandoffTarget(null); setMessage(`Player ${handoffTarget + 1} has control.`); }}>PASS CONTROLS TO PLAYER {handoffTarget + 1}</button>}
            </div>
          )}

          <AnimatePresence>
            {activeZone && (
              <motion.div className="choice-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.section className="choice-panel game-panel" initial={{ y: 24, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 16, scale: 0.97 }}>
                  <div className="choice-header"><div><div className="panel-kicker">SUPPLY CRATE / {activeZone.toUpperCase()}</div><h2>Choose one part</h2></div><button className="icon-button" onClick={() => setActiveZone(null)} aria-label="Close crate">×</button></div>
                  <div className="part-learn"><strong>What this means:</strong> {activeZone === 'Payload' ? 'The payload is the science driver; it increases the data volume and mission value, but also powers and mass.' : activeZone === 'Battery' ? 'Battery is your eclipse reserve; running out here means the spacecraft cannot keep instruments alive through the night side.' : activeZone === 'Solar' ? 'Solar power is the steady energy source. It keeps the mission alive and recharges the battery during sunlight.' : activeZone === 'Radio' ? 'The radio controls how much science you can downlink during a pass. If it is weak, the data queue piles up.' : activeZone === 'Frame' ? 'The frame defines the bus size and launch fit. A larger structure can carry more hardware but eats your launch margin.' : activeZone === 'Pointing' ? 'Pointing keeps the instrument aimed and the bus stable, which matters in both science and thermal control.' : 'The computer handles command timing and safe-mode logic. A weak processor can make a good mission fail from bad sequencing.'}</div>
                  <div className="part-choices">
                    {TESSERACT_PARTS.filter((part) => part.category === activeZone).map((part) => {
                      const selected = inventory[activeZone] === part.id;
                      const supported = activeZone === 'Payload' ? part.id === mission.payloadId : activeZone === 'Frame' ? 'class' in part && part.class === mission.frameClass : true;
                      return (
                        <button className={`part-choice ${selected ? 'selected' : ''}`} key={part.id} onClick={() => choosePart(part)} type="button">
                          <PartIcon part={part} /><span className="choice-name">{part.name}{supported && <i>MISSION FIT</i>}</span>
                          <span className="choice-stats">{part.massKg} kg<i>·</i>${part.costK}k{'powerW' in part && <><i>·</i>{part.powerW} W</>}{'energyWh' in part && <><i>·</i>{part.energyWh} Wh</>}{'rank' in part && <><i>·</i>rank {part.rank}</>}</span>
                          <span className="choice-why">{partTeaching(part)}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="choice-footnote">Click a part to stow it in the hotbar. The system will tell you whether it is helping or hurting the mission trajectory.</div>
                </motion.section>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {menuOpen && (
              <motion.div className="choice-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.section className="menu-panel game-panel" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }}>
                  <div className="panel-kicker">MISSION MENU</div>
                  <h2>Paused</h2>
                  <p>Resume the current mission, return to the briefing, or reset the active design.</p>
                  <div className="menu-actions">
                    <button type="button" className="game-button primary" onClick={() => setMenuOpen(false)}>RESUME <span>↗</span></button>
                    <button type="button" className="game-button secondary" onClick={quitToMenu}>QUIT TO MENU</button>
                    <button type="button" className="game-button" onClick={() => { setMenuOpen(false); retryDesign(); }}>RESTART MISSION</button>
                  </div>
                </motion.section>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {partApproval && (
              <motion.div className="choice-scrim crew-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.section className="approval-panel game-panel" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                  <div className="panel-kicker">SHARED RESOURCE REQUEST</div>
                  <h2>Engineer review</h2>
                  <p>Player {partApproval.requester + 1} requests <b>{partApproval.part.name}</b> for the shared satellite.</p>
                  <div className="approval-delta"><span>MASS CHANGE <b>{partApproval.part.massKg.toFixed(2)} kg</b></span><span>BUDGET CHANGE <b>${partApproval.part.costK}k</b></span></div>
                  <div className="approval-actions"><button className="game-button secondary" onClick={() => reviewPartChange(false)}>COUNTER REQUEST</button><button className="game-button primary" onClick={() => reviewPartChange(true)}>APPROVE CHANGE <span>✓</span></button></div>
                </motion.section>
              </motion.div>
            )}
          </AnimatePresence>

          {stage === 'launch' && (
            <motion.section className="launch-hud game-panel" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
              <div className="panel-kicker">ASCENT / {launcher.name.toUpperCase()}</div>
              <div className="ascent-meters"><div><b>{(ascent.deltaVMs / 1000).toFixed(2)}</b><small>km/s</small></div><div><b>{ascent.altitudeKm.toFixed(0)}</b><small>km altitude</small></div><div><b>{(ascent.efficiency * 100).toFixed(0)}%</b><small>steering</small></div></div>
              <div className="flight-track"><motion.i animate={{ width: `${Math.min(100, (ascent.deltaVMs / TARGET_DV_MS) * 100)}%` }} /><span style={{ left: `${pitch / 90 * 100}%` }} /></div>
              <div className="control-row"><label>THROTTLE <b>{throttle}%</b></label><input aria-label="Rocket throttle" type="range" min="20" max="100" value={throttle} onChange={(event) => setThrottle(Number(event.target.value))} /></div>
              <div className="control-row"><label>PITCH <b>{pitch}°</b></label><input aria-label="Rocket pitch" type="range" min="0" max="90" value={pitch} onChange={(event) => setPitch(Number(event.target.value))} /></div>
              <div className="launch-controls"><button onClick={() => setThrottle((value) => Math.max(20, value - 5))}>− THROTTLE</button><button onClick={() => setThrottle((value) => Math.min(100, value + 5))}>+ THROTTLE</button><button onClick={() => setPitch((value) => Math.max(0, value - 5))}>PITCH ◀</button><button onClick={() => setPitch((value) => Math.min(90, value + 5))}>PITCH ▶</button></div>
              <div className="launch-tip">Aim for the cyan marker. Orbit needs { (TARGET_DV_MS / 1000).toFixed(1) } km/s.</div>
            </motion.section>
          )}

          {stage === 'orbit' && (
            <motion.section className="orbit-panel game-panel" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}>
              <div className="panel-kicker">ORBIT INSERTION / VERIFIED</div>
              <h2>We have orbit.</h2>
              <p>{resultMessage}</p>
              <div className="orbit-readouts"><span>PERIOD <b>{orbitMinutes.toFixed(1)} min</b></span><span>ECLIPSE <b>{eclipseMinutes.toFixed(1)} min</b></span><span>POWER <b>{evaluation.solarW} / {evaluation.loadW.toFixed(1)} W</b></span></div>
              <div className="orbit-feedback">{evaluation.success ? 'All spacecraft requirements met.' : evaluation.reasons[0]}</div>
              <button type="button" className="game-button primary" onClick={() => setStage('downlink')}>START DATA RUN <span>↗</span></button>
            </motion.section>
          )}

          {stage === 'downlink' && (
            <DownlinkRush
              payloadId={inventory.Payload ?? mission.payloadId}
              radioId={inventory.Radio ?? ''}
              onComplete={(result) => {
                setDownlinkResult(result);
                setMessage(`${result.sentMb.toFixed(1)} MB returned. Schedule power through eclipse next.`);
                setStage('eclipse');
              }}
            />
          )}

          {stage === 'eclipse' && (
            <EclipseEnergy
              missionId={missionId}
              solarW={evaluation.solarW}
              totalLoadW={evaluation.loadW}
              instrumentLoadW={instrumentLoadW}
              batteryCapacityWh={batteryCapacityWh}
              onComplete={(result) => {
                setPowerResult(result);
                setMessage(`${result.reason} Plan the flight computer's next orbit.`);
                setStage('sequencer');
              }}
            />
          )}

          {stage === 'sequencer' && (
            <MissionSequencer
              solarW={evaluation.solarW}
              totalLoadW={evaluation.loadW}
              instrumentLoadW={instrumentLoadW}
              radioLoadW={radioLoadW}
              batteryCapacityWh={batteryCapacityWh}
              dataMbPerOrbit={dataMbPerOrbit}
              radioId={inventory.Radio ?? ''}
              observationQuotaMinutes={mission.observationQuotaMinutes}
              onComplete={(result) => {
                setSequenceResult(result);
                setMessage(`${result.reason} Plan one final transfer burn.`);
                setStage('orbitburn');
              }}
            />
          )}

          {stage === 'orbitburn' && (
            <OrbitBurn
              budgetVMs={Math.max(50, launcherDeltaV - ascent.deltaVMs)}
              onComplete={(result) => {
                setBurnResult(result);
                setMessage(`${result.reason} Mission Control is requesting a final risk review.`);
                setStage('missioncontrol');
              }}
            />
          )}

          {stage === 'missioncontrol' && (
            <MissionControlLive
              radioId={inventory.Radio ?? ''}
              batteryWh={batteryCapacityWh + (powerResult ? powerResult.minimumBatteryWh - batteryCapacityWh : 0)}
              dataMb={downlinkResult?.sentMb ?? 0}
              onComplete={(result) => {
                setMissionControlResult(result);
                setResultMessage(`${result.summary} Burn ${burnResult?.score ?? 0}/100 · data ${downlinkResult?.score ?? 0}/100.`);
                setStage('result');
              }}
            />
          )}

          {stage === 'result' && (
            <motion.section className="result-panel game-panel" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <div className="panel-kicker">FLIGHT RESULT / {evaluation.success && ascent.deltaVMs >= TARGET_DV_MS ? 'MISSION ON ORBIT' : 'FLIGHT REVIEW'}</div>
              <h2>{evaluation.success && ascent.deltaVMs >= TARGET_DV_MS ? 'A world, watched.' : 'Flight test complete.'}</h2>
              <div className="result-stars" aria-label={`${stars} stars`}>{'★'.repeat(stars)}<span>{'☆'.repeat(3 - stars)}</span></div>
              <p className="result-reason">{resultMessage || evaluation.reasons[0] || `On-orbit insertion at ${ascent.altitudeKm.toFixed(0)} km.`}</p>
              <div className="result-stats"><span>MASS<b>{evaluation.massKg.toFixed(2)} kg</b></span><span>SCIENCE<b>{score}</b></span><span>ASCENT<b>{(ascent.deltaVMs / 1000).toFixed(2)} km/s</b></span><span>DATA<b>{downlinkResult?.score ?? '--'}</b></span><span>POWER<b>{powerResult?.score ?? '--'}</b></span><span>CONOPS<b>{sequenceResult?.score ?? '--'}</b></span><span>BURN<b>{burnResult?.score ?? '--'}</b></span><span>RISK<b>{missionControlResult?.score ?? '--'}</b></span></div>
              <div className="leaderboard-strip"><span>LOCAL LEADERBOARD / {difficulty.toUpperCase()}</span>{leaderboard.slice(0, 3).map((entry, index) => <b key={`${entry.date}-${index}`}>{index + 1}. {entry.mission} · {entry.score}</b>)}</div>
              <a className="mission-analog" href={analog.url} target="_blank" rel="noreferrer"><span>MISSION ANALOG / {analog.name}</span><b>{analog.note}</b><i>OPEN MISSION ↗</i></a>
              <div className="result-actions"><button className="game-button primary" onClick={retryDesign}>FIX & RETRY</button><button className="game-button secondary" onClick={() => setLearnOpen((value) => !value)}>LEARN WHY</button></div>
              <div className="result-links"><button onClick={() => setMappingOpen((value) => !value)}>HOW GAMES MAP TO MISSION DESIGN</button><button onClick={() => setGlossaryOpen((value) => !value)}>GLOSSARY</button><button onClick={exportDesign}>EXPORT JSON</button><button onClick={() => setSourcesOpen(true)}>SOURCES</button></div>
              {learnOpen && <div className="learn-note">{learnExplanation}</div>}
              {mappingOpen && <div className="learn-note mapping-note"><b>BUILD</b> mass, power, budget, payload compatibility. <b>ASCENT</b> launch fit, delta-v, time. <b>DOWNLINK RUSH</b> data volume, radio capacity, contact windows. <b>ECLIPSE ENERGY</b> orbit period, shadow time, battery depth of discharge. <b>MISSION SEQUENCER</b> command order, buffer, and contact timing. <b>ORBIT BURN</b> vis-viva transfer velocity and propellant margin.</div>}
              {glossaryOpen && <div className="learn-note glossary-note"><b>ECLIPSE</b> time in Earth's shadow. <b>DELTA-V</b> velocity change a burn can provide. <b>LINK BUDGET</b> received signal strength versus what a radio needs. <b>DEPTH OF DISCHARGE</b> share of battery capacity used. <b>TRL</b> technology readiness level. <b>CONOPS</b> concept of operations: the planned command sequence.</div>}
            </motion.section>
          )}

          {sourcesOpen && (
            <div className="choice-scrim sources-scrim" role="presentation" onClick={() => setSourcesOpen(false)}>
              <motion.section className="sources-panel game-panel" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={(event) => event.stopPropagation()}>
                <div className="choice-header"><div><div className="panel-kicker">MISSION HINTS</div><h2>Mission sources</h2></div><button className="icon-button" onClick={() => setSourcesOpen(false)} aria-label="Close hints">×</button></div>
                <div className="source-list">{HELP_TIPS.map((tip) => <div key={tip.title} className="help-tip"><b>{tip.title}</b><p>{tip.text}</p></div>)}</div>
                <p>Focus on the main system driver: mass, power, communications, and eclipse planning. Every hardware choice affects the mission in more than one way.</p>
              </motion.section>
            </div>
          )}

          {appScreen === 'game' && stage !== 'briefing' && stage !== 'result' && <div className="stage-chip"><i />{stage === 'orbit' ? 'ON ORBIT' : stage === 'downlink' ? 'CONTACT PASS' : stage === 'eclipse' ? 'ECLIPSE SIM' : stage === 'sequencer' ? 'FLIGHT SOFTWARE' : stage === 'orbitburn' ? 'MANEUVER NODE' : stage === 'missioncontrol' ? 'FLIGHT DIRECTOR' : stage === 'launch' ? 'ASCENT LIVE' : 'MARS / PAD 07'}</div>}
          {appScreen === 'game' && <div className="bottom-status"><span className="status-dot" />{messagePrompt}</div>}
          {appScreen === 'game' && isTouch && stage === 'launch' && <div className="touch-flight"><button onClick={() => setPitch((value) => Math.max(0, value - 5))}>PITCH −</button><button onClick={() => setPitch((value) => Math.min(90, value + 5))}>PITCH +</button><button onClick={() => setThrottle((value) => Math.max(20, value - 5))}>THR −</button><button onClick={() => setThrottle((value) => Math.min(100, value + 5))}>THR +</button></div>}
        </>
      )}
    </div>
  );
}