# Mununu UI

**Web interface for the [Mununu](https://github.com/Mumunu-team/mununu) CLTS verification tool**

[![CI](https://github.com/Mumunu-team/mununu-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/Mumunu-team/mununu-ui/actions/workflows/ci.yml)
[![Node.js 20+](https://img.shields.io/badge/node-20%2B-green.svg)](https://nodejs.org/)

<!-- TODO: Add screenshot of the editor with graph visualization -->

**[Live Demo](https://mumunu-team.github.io/mununu-ui/)** | **[Mununu Backend](https://github.com/Mumunu-team/mununu)**

## Features

- **DSL Editor** &mdash; Monaco-based editor with CTXDSL syntax highlighting and validation
- **Graph Visualization** &mdash; Interactive Cytoscape/Dagre views with controllable (blue) / uncontrollable (red dashed) edge styling and green diamond initial states
- **Unified Verification** &mdash; Evaluate mu-calculus and LTL formulas, with inline counterstrategy graphs and counterexample traces per unsatisfied formula
- **Internationalization** &mdash; English, Spanish, Portuguese

## Quick Start

```bash
# 1. Start the Mununu API server
cd /path/to/mununu
cargo run --features api -- server --addr 127.0.0.1:8080

# 2. Start the UI
cd /path/to/mununu-ui
npm install
npm run dev
# Open http://localhost:5173
```

## Prerequisites

- Node.js 20+ and npm
- [Mununu](https://github.com/Mumunu-team/mununu) backend running for API features

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run format:check` | Check code formatting |
| `npm run test` | Run tests |
| `npm run test:coverage` | Run tests with coverage |
| `npm run type-check` | TypeScript type checking |

## Tech Stack

React 19, TypeScript, Vite 7, TailwindCSS, Monaco Editor, Cytoscape/Dagre, Zustand, Vitest

## Project Structure

```
src/
├── api/              # API client and endpoint definitions
├── components/
│   ├── common/       # Shared UI components (Button, Modal, Tabs, etc.)
│   ├── editors/      # CTXDSL editor (Monaco-based)
│   ├── layout/       # App layout, header, sidebar
│   └── visualization/# Graph views, summary tables
├── hooks/            # Custom React hooks
├── i18n/             # Internationalization (en, es, pt)
├── monaco/           # Monaco editor CTXDSL language support
├── store/            # Zustand state management
└── styles/           # CSS variables and themes
```

## Documentation

- [Phase B local-testing guide](docs/phase-b-local-testing.md) — exercise the `Suggest from source` auto-detection feature end-to-end (CLI, HTTP, UI flow).

## License

[Mununu Non-Commercial License](LICENSE)
