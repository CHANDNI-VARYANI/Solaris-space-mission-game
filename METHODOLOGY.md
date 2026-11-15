# SOLARIS Mission Methodology

## Scope
SOLARIS models a mission design workflow inspired by NASA Mission Design Lab and JPL Concept Maturity Levels. It uses simplified orbital, power, communication, cost, and reliability models for teaching and gameplay.

## Core formulas
- Orbital period: T = 2π sqrt(a^3 / μ)
- Orbital speed: v = sqrt(μ / r)
- Tsiolkovsky rocket equation: Δv = Isp * g0 * ln(m0 / mf)
- Link margin: simplified using EIRP, free-space loss, receiver gain, and data-rate requirement
- Science score: weighted mission-driven score combining capability, coverage, revisit, data return, lifetime, pointing, and calibration

## Simplifications and limitations
- The model intentionally uses educational approximations rather than full flight dynamics.
- Detailed orbit perturbations, thermal cycling, and complete mission operations are simplified.
- Reliability estimates are not substitute for actual mission risk analysis.

## Design flow supported
- Mission objective and requirements definition
- Architecture trade studies
- Point design refinement
- Mission simulation and review
- Post-mission learning report

## Data handling
All numeric values used in the app are kept in editable data files under `shared/data` and are labelled as approximate where appropriate.
