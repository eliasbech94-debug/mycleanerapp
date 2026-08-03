import { useSyncExternalStore } from "react";
import {
  DEMO_MODE,
  getDemoScenario,
  getDemoScenarioId,
  setDemoScenario,
  subscribeDemoScenario,
  type DemoScenario,
  type DemoScenarioId,
} from "@/data/demo";

/**
 * Subscribes a component to the active demo scenario so fixture-driven
 * surfaces re-render instantly when the developer switches scenario.
 * Outside DEMO_MODE this is inert.
 */
export function useDemoScenario(): {
  enabled: boolean;
  scenarioId: DemoScenarioId;
  scenario: DemoScenario;
  setScenario: (id: DemoScenarioId) => void;
} {
  const scenarioId = useSyncExternalStore(
    subscribeDemoScenario,
    getDemoScenarioId,
    getDemoScenarioId,
  );

  return {
    enabled: DEMO_MODE,
    scenarioId,
    scenario: getDemoScenario(),
    setScenario: setDemoScenario,
  };
}
