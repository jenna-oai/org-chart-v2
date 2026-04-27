# Org Chart v2

Org Chart v2 is a work-in-progress browser-based org chart visualizer and editor. The goal is to build a lightweight tool for creating, editing, presenting, and eventually sharing flexible org charts.

The project is intentionally still local-first and frontend-only. It is being built in stages so the data model, canvas behavior, editing interactions, and export paths can mature before adding accounts, collaboration, or a backend.

## Current Status

This app currently supports:

- A React + TypeScript + Vite web app.
- A graph-based org chart model with nodes and directed connections.
- Four core org chart node types: employee, vertical, open role, and approved role.
- Canvas rendering with simple top-down automatic layout.
- Editable node content from both the sidebar inspector and directly inside nodes.
- Relationship editing through inspector controls and drag-to-connect handles.
- Vertical ownership and vertical membership.
- Condensed list views for reports or vertical occupants.
- Notes/text boxes that can be dragged, resized, colored, and edited with basic rich text shortcuts.
- Undo and delete.
- Local persistence through browser storage.
- JSON import/export.
- PNG export with a crop preview and configurable export dimensions.
- GitHub Pages deployment through GitHub Actions.

## Live Build

When GitHub Pages is enabled for this repository, the app is expected to be available at:

[https://jenna-oai.github.io/org-chart-v2/](https://jenna-oai.github.io/org-chart-v2/)

## Run Locally

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal, usually:

```text
http://127.0.0.1:5173/
```

## Build

```bash
npm run build
```

The npm scripts point Vite at `esbuild-wasm` so the app can run in environments where native esbuild binaries are blocked.

For GitHub Pages, the workflow sets `GITHUB_PAGES=true`, which makes Vite build assets under `/org-chart-v2/`. Local development still serves from `/`.

## Data Model

The org chart is graph-based rather than tree-based:

- `OrgChart` owns a flat list of `nodes` and a flat list of `connections`.
- `OrgNode` is a discriminated union of `employee`, `vertical`, `open_role`, and `approved_role`.
- `OrgConnection` is directed and uses `reports_to`, `owns_vertical`, or `belongs_to_vertical`.

Nodes do not store child nodes directly. This keeps the model flexible enough for people to connect above and below, for employees to own multiple verticals, and for roles to sit under either employees or verticals.

## Project Structure

```text
src/types/orgChart.ts        Core TypeScript model
src/data/sampleChart.ts      Sample org chart data
src/utils/layout.ts          Automatic layout logic
src/utils/validation.ts      Chart validation utilities
src/utils/relationships.ts   Relationship helpers
src/components/              Canvas, node, inspector, and text box UI
src/App.tsx                  Editor state and app orchestration
```

## Known Limitations

This is not a finished product yet.

- No backend.
- No authentication.
- No multi-user collaboration.
- No cloud save or sharing permissions.
- Layout is automatic and basic.
- Connections cannot be selected and deleted directly yet.
- The canvas is not designed for massive charts yet.
- Local persistence is browser-local only.
- Import/export is JSON and PNG only.

## Roadmap

Likely next stages:

- Better connection management, including selecting and deleting connections.
- Manual position overrides without making nodes fully drag-and-drop.
- Better layout behavior for dense or unusual charts.
- More polished presentation mode.
- CSV or spreadsheet import.
- Cloud-backed saved charts.
- Multi-user collaboration and sharing.
- More robust export options.

## Deployment

GitHub Pages deploys from `.github/workflows/deploy.yml` on pushes to `main`.

If Pages does not appear after pushing, check the repository settings:

```text
Settings -> Pages -> Build and deployment -> Source -> GitHub Actions
```
