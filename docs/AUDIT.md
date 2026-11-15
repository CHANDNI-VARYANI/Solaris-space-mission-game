# SOLARIS audit

## Scope
This audit covers the current app state before the Part A repair pass. It documents the screens and controls that were originally present, whether they worked, and the root cause of unresolved issues.

| Screen | Control | Status | Root cause |
|---|---|---:|---|
| Home | Mission / Scenarios / Sources links | Broken | Navigation used React Router links without a real app route setup, so the controls were decorative rather than stateful. |
| Home | Start mission button | Broken | It had no click handler and did not change application state. |
| Home | Explore scenarios button | Broken | It was a visual button with no state update or route transition. |
| Scenario selection | Scenario cards | Broken | Cards were static and not wired to mission selection logic; they never updated the chosen scenario. |
| Scenario detail | Requirements list | Broken | Requirements were hard-coded and not derived from the selected scenario or the engine. |
| Workbench | Instrument catalog | Broken | The catalog was decorative; no add/remove logic and no compatibility filtering. |
| Workbench | Component catalog | Broken | There was no central store or state mutation when choices changed. |
| Workbench | Launch vehicle selector | Broken | Values were static and the compatibility check was not connected to state. |
| Workbench | Orbit selector | Broken | Orbit selection did not affect any computed program state or validation. |
| Dashboard | Mass, power, budget, data bars | Broken | Metrics were mock values and were not recomputed from choices. |
| Dashboard | Warnings and reasons | Broken | There was no logic that linked a design change to a message explaining why a value moved. |
| Simulation | Launch button | Broken | It did not call the simulation engine and produced no report. |
| Report | Root cause summary | Broken | No report state existed; the final result was not connected to mission data. |
| Global app | Console noise | Broken | React Router future flags and static mock content were generating avoidable warnings and no real execution path. |

## Root cause summary
The primary issue was that the app had visual mock screens but no central state model, no simulation-driven data flow, and no real handlers. This meant the UI could render static content without ever reflecting the player's decisions in the mission model.
