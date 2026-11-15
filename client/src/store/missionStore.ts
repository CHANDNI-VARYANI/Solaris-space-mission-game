import { create } from 'zustand';
import { evaluateMissionDesign, type MissionDesignInput, type MissionReport } from '@solaris/shared';

export type Difficulty = 'Explorer' | 'Engineer' | 'Mission Director';

export interface MissionState {
  scenarioId: string;
  difficulty: Difficulty;
  launchVehicleId: string;
  orbitId: string;
  instrumentIds: string[];
  componentIds: string[];
  report: MissionReport | null;
  reason: string;
  setScenario: (id: string) => void;
  setDifficulty: (level: Difficulty) => void;
  setLaunchVehicle: (id: string) => void;
  setOrbit: (id: string) => void;
  setSelectedComponents: (componentIds: string[]) => void;
  toggleInstrument: (id: string) => void;
  toggleComponent: (id: string) => void;
  runSimulation: () => void;
  getDesign: () => MissionDesignInput;
}

const defaultMission = {
  scenarioId: 'student-cubesat',
  difficulty: 'Explorer' as const,
  launchVehicleId: 'pslv-xl',
  orbitId: 'leo-500',
  instrumentIds: ['camera'],
  componentIds: ['bus-small', 'array-body', 'radio-sband', 'battery-li-ion'],
  report: null,
  reason: 'Ready to evaluate the design.',
};

export const useMissionStore = create<MissionState>((set, get) => ({
  ...defaultMission,
  setScenario: (scenarioId) => set(() => ({ scenarioId, reason: `Scenario selected: ${scenarioId}.` })),
  setDifficulty: (difficulty) => set(() => ({ difficulty, reason: `Difficulty set to ${difficulty}.` })),
  setLaunchVehicle: (launchVehicleId) => set(() => ({ launchVehicleId, reason: `Launch vehicle set to ${launchVehicleId}.` })),
  setOrbit: (orbitId) => set(() => ({ orbitId, reason: `Orbit set to ${orbitId}.` })),
  setSelectedComponents: (componentIds) => set(() => ({ componentIds, reason: `Updated component set to ${componentIds.join(', ')}.` })),
  toggleInstrument: (instrumentId) =>
    set((state) => {
      const exists = state.instrumentIds.includes(instrumentId);
      const next = exists ? state.instrumentIds.filter((id) => id !== instrumentId) : [...state.instrumentIds, instrumentId];
      return {
        instrumentIds: next,
        reason: exists ? `Removed instrument ${instrumentId}.` : `Added instrument ${instrumentId}.`,
      };
    }),
  toggleComponent: (componentId) =>
    set((state) => {
      const exists = state.componentIds.includes(componentId);
      const next = exists ? state.componentIds.filter((id) => id !== componentId) : [...state.componentIds, componentId];
      return {
        componentIds: next,
        reason: exists ? `Removed subsystem ${componentId}.` : `Added subsystem ${componentId}.`,
      };
    }),
  runSimulation: () => {
    const design = get().getDesign();
    const report = evaluateMissionDesign(design);
    set(() => ({ report, reason: report.rootCause }));
  },
  getDesign: () => {
    const state = get();
    return {
      scenarioId: state.scenarioId,
      difficulty: state.difficulty,
      launchVehicleId: state.launchVehicleId,
      orbitId: state.orbitId,
      instrumentIds: state.instrumentIds,
      componentIds: state.componentIds,
    };
  },
}));
