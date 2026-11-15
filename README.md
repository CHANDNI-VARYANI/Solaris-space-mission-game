# SOLARIS

SOLARIS is a serious mission-design game and simulation platform inspired by NASA mission design workflows, JPL concept maturity levels, and small spacecraft engineering practices.

## Overview

This monorepo includes:

- `client`: Vite + React + TypeScript + Tailwind UI
- `server`: Express + Socket.IO multiplayer backend
- `shared`: shared mission engine, types, and datasets

## Quick start

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 22
npm install
npm run dev
```

Open the app at http://localhost:5173 and the API at http://localhost:3001/api/health.

## Build and test

```bash
npm run build
npm test --workspace shared
```

## Documentation

- `DATA_SOURCES.md`: references and data verification guidance
- `METHODOLOGY.md`: formulas, assumptions, limitations, and design flow
- `docs/DEMO_SCRIPT.md`: 3-minute presentation walkthrough
- `examples/`: example mission designs and seeds

## Notes

- This is an educational simulation and not flight-certified software.
- Mission values are intentionally approximate and game-calibrated.
- The app includes a serious mission lens while remaining accessible to students and early-career engineers.
