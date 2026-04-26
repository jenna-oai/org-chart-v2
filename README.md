# Org Chart Visualizer

Stage 2 creates a local, browser-based org chart visualizer using React, TypeScript, and Vite. It renders sample org chart data onto a canvas with simple node cards, SVG connector lines, sidebar node creation, and a node inspector for editing selected node contents and basic relationships.

## Run Locally

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

The npm scripts point Vite at `esbuild-wasm` so the local app can run even in environments where native esbuild binaries are blocked.

## Data Model

The model is graph-based:

- `OrgChart` owns a flat list of `nodes` and a flat list of `connections`.
- `OrgNode` is a discriminated union of `employee`, `vertical`, `open_role`, and `approved_role`.
- `OrgConnection` is directed and uses `reports_to`, `owns_vertical`, or `belongs_to_vertical`.

Nodes do not store their children. This keeps the foundation flexible for later editing, drag-and-drop, imports, saved charts, and collaboration.

## Layout

`src/utils/layout.ts` calculates positions from the flat node and connection lists. It finds root nodes, walks directed child connections, spaces siblings horizontally, and places each level below the previous level. The layout is deterministic but intentionally simple.

## Known Limitations

- Node contents can be edited from the inspector.
- Nodes can be created from the sidebar, with simple automatic placement from the current selection.
- The selected node can be deleted, and local edits can be undone.
- Relationships can be created by dragging from one node connection handle to another; bottom-to-top places the source above the target, while top-to-bottom places the target above the source.
- Connections cannot be deleted directly yet.
- Employee reports and vertical occupants can be shown as generated condensed visual list nodes.
- No drag-and-drop or manual position overrides.
- No persistence, backend, auth, sharing, import, or export.
- Layout is basic and does not optimize dense or unusual graphs.
- Connectors are simple SVG elbow paths.
- Relationship edits are local only and reset on reload.

## Suggested Next Stage

Add connection creation/deletion controls, with validation visible while changes are made.
