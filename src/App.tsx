import {
  type ChangeEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AddNodePanel, type AddMenuItemType } from "./components/AddNodePanel";
import type { ConnectionHandlePosition } from "./components/OrgChartCanvas";
import { OrgChartCanvas } from "./components/OrgChartCanvas";
import { NodeInspector } from "./components/NodeInspector";
import { ToolbarPlaceholder } from "./components/ToolbarPlaceholder";
import { sampleChart } from "./data/sampleChart";
import type {
  CanvasTextBox,
  OrgChart,
  OrgConnection,
  OrgConnectionType,
  OrgNode,
  OrgNodeType,
} from "./types/orgChart";
import { validateOrgChart } from "./utils/validation";

interface EditorSnapshot {
  chart: OrgChart;
  selectedNodeId: string | null;
  selectedTextBoxId: string | null;
  listViewOwnerIds: Set<string>;
  textBoxes: CanvasTextBox[];
}

interface PersistedEditorSnapshot {
  version: 1;
  chart: OrgChart;
  selectedNodeId: string | null;
  selectedTextBoxId: string | null;
  listViewOwnerIds: string[];
  textBoxes: CanvasTextBox[];
}

const EDITOR_STORAGE_KEY = "org-chart-v2:editor-state";

export function App() {
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [editorState, setEditorState] = useState<EditorSnapshot>(() =>
    loadEditorSnapshot(),
  );
  const [undoStack, setUndoStack] = useState<EditorSnapshot[]>([]);
  const [isChartTitleSelected, setIsChartTitleSelected] = useState(false);
  const [isNewChartDialogOpen, setIsNewChartDialogOpen] = useState(false);
  const [isPngExportDialogOpen, setIsPngExportDialogOpen] = useState(false);
  const { chart, listViewOwnerIds, selectedNodeId, selectedTextBoxId, textBoxes } =
    editorState;
  const validation = validateOrgChart(chart);
  const selectedNode = useMemo(
    () => chart.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [chart.nodes, selectedNodeId],
  );
  const selectedTextBox = useMemo(
    () => textBoxes.find((textBox) => textBox.id === selectedTextBoxId) ?? null,
    [selectedTextBoxId, textBoxes],
  );

  useEffect(() => {
    saveEditorSnapshot(editorState);
  }, [editorState]);

  const commitEditorState = (
    updater: (currentState: EditorSnapshot) => EditorSnapshot,
  ) => {
    const nextState = updater(editorState);

    if (nextState === editorState) {
      return;
    }

    setUndoStack((currentUndoStack) => [
      ...currentUndoStack,
      cloneEditorSnapshot(editorState),
    ]);
    setEditorState(nextState);
  };

  const updateNode = (updatedNode: OrgNode) => {
    commitEditorState((currentState) => {
      const currentNode = currentState.chart.nodes.find(
        (node) => node.id === updatedNode.id,
      );
      const nextNodes = currentState.chart.nodes.map((node) =>
        node.id === updatedNode.id ? updatedNode : node,
      );
      const nextListViewOwnerIds = new Set(currentState.listViewOwnerIds);

      if (
        updatedNode.type !== "employee" &&
        updatedNode.type !== "vertical"
      ) {
        nextListViewOwnerIds.delete(updatedNode.id);
      }

      return {
        ...currentState,
        listViewOwnerIds: nextListViewOwnerIds,
        chart: {
          ...currentState.chart,
          nodes: nextNodes,
          connections:
            currentNode && currentNode.type !== updatedNode.type
              ? getConnectionsValidForNodes(
                  currentState.chart.connections,
                  nextNodes,
                )
              : currentState.chart.connections,
        },
      };
    });
  };

  const updateTextBox = (updatedTextBox: CanvasTextBox) => {
    commitEditorState((currentState) => ({
      ...currentState,
      textBoxes: currentState.textBoxes.map((textBox) =>
        textBox.id === updatedTextBox.id ? updatedTextBox : textBox,
      ),
    }));
  };

  const updateChartName = (name: string) => {
    commitEditorState((currentState) => ({
      ...currentState,
      chart: {
        ...currentState.chart,
        name,
      },
    }));
  };

  const updateManager = (nodeId: string, managerNodeId: string | null) => {
    commitEditorState((currentState) => ({
      ...currentState,
      chart: {
        ...currentState.chart,
        connections: replaceIncomingConnection(
          currentState.chart.connections,
          nodeId,
          "reports_to",
          managerNodeId
            ? {
                id: `reports-to-${managerNodeId}-${nodeId}`,
                fromNodeId: managerNodeId,
                toNodeId: nodeId,
                connectionType: "reports_to",
              }
            : null,
        ),
      },
    }));
  };

  const updateVertical = (nodeId: string, verticalNodeId: string | null) => {
    commitEditorState((currentState) => ({
      ...currentState,
      chart: {
        ...currentState.chart,
        connections: replaceIncomingConnection(
          currentState.chart.connections,
          nodeId,
          "belongs_to_vertical",
          verticalNodeId
            ? {
                id: `belongs-to-${verticalNodeId}-${nodeId}`,
                fromNodeId: verticalNodeId,
                toNodeId: nodeId,
                connectionType: "belongs_to_vertical",
              }
            : null,
        ),
      },
    }));
  };

  const updateOwnedVertical = (
    employeeNodeId: string,
    verticalNodeId: string,
    ownsVertical: boolean,
  ) => {
    commitEditorState((currentState) => {
      const connectionsWithoutVerticalOwner = currentState.chart.connections.filter(
        (connection) =>
          !(
            connection.connectionType === "owns_vertical" &&
            connection.toNodeId === verticalNodeId
          ),
      );

      return {
        ...currentState,
        chart: {
          ...currentState.chart,
          connections: ownsVertical
            ? [
                ...connectionsWithoutVerticalOwner,
                {
                  id: `owns-${employeeNodeId}-${verticalNodeId}`,
                  fromNodeId: employeeNodeId,
                  toNodeId: verticalNodeId,
                  connectionType: "owns_vertical",
                },
              ]
            : connectionsWithoutVerticalOwner,
        },
      };
    });
  };

  const addItem = (itemType: AddMenuItemType) => {
    if (itemType === "text_box") {
      addTextBox();
      return;
    }

    addNode(itemType);
  };

  const addNode = (nodeType: OrgNodeType) => {
    commitEditorState((currentState) => {
      const currentSelectedNode =
        currentState.chart.nodes.find(
          (node) => node.id === currentState.selectedNodeId,
        ) ?? null;
      const newNode = createNewNode(nodeType, currentState.chart);
      const placementConnection = createPlacementConnection(currentSelectedNode, newNode);

      return {
        ...currentState,
        selectedNodeId: newNode.id,
        selectedTextBoxId: null,
        chart: {
          ...currentState.chart,
          nodes: [...currentState.chart.nodes, newNode],
          connections: placementConnection
            ? [...currentState.chart.connections, placementConnection]
            : currentState.chart.connections,
        },
      };
    });
  };

  const addTextBox = () => {
    commitEditorState((currentState) => {
      const textBoxNumber = currentState.textBoxes.length + 1;
      const newTextBox: CanvasTextBox = {
        id: getUniqueTextBoxId(`text-box-${textBoxNumber}`, currentState.textBoxes),
        type: "text_box",
        x: 80 + (textBoxNumber - 1) * 24,
        y: 80 + (textBoxNumber - 1) * 24,
        width: 260,
        height: 150,
        html: "",
      };

      return {
        ...currentState,
        selectedNodeId: null,
        selectedTextBoxId: newTextBox.id,
        textBoxes: [...currentState.textBoxes, newTextBox],
      };
    });
  };

  const toggleListView = (ownerNodeId: string, viewAsList: boolean) => {
    commitEditorState((currentState) => {
      const nextOwnerIds = new Set(currentState.listViewOwnerIds);

      if (viewAsList) {
        nextOwnerIds.add(ownerNodeId);
      } else {
        nextOwnerIds.delete(ownerNodeId);
      }

      return {
        ...currentState,
        listViewOwnerIds: nextOwnerIds,
      };
    });
  };

  const undo = () => {
    const previousState = undoStack[undoStack.length - 1];

    if (!previousState) {
      return;
    }

    setEditorState(cloneEditorSnapshot(previousState));
    setUndoStack((currentUndoStack) => currentUndoStack.slice(0, -1));
  };

  const deleteSelectedNode = () => {
    if (!selectedNode && !selectedTextBoxId) {
      return;
    }

    commitEditorState((currentState) => {
      const nodeIdToDelete = currentState.selectedNodeId;
      const textBoxIdToDelete = currentState.selectedTextBoxId;

      if (!nodeIdToDelete && !textBoxIdToDelete) {
        return currentState;
      }

      if (textBoxIdToDelete) {
        return {
          ...currentState,
          selectedTextBoxId: null,
          textBoxes: currentState.textBoxes.filter(
            (textBox) => textBox.id !== textBoxIdToDelete,
          ),
        };
      }

      if (!nodeIdToDelete) {
        return currentState;
      }

      const nextListViewOwnerIds = new Set(currentState.listViewOwnerIds);
      nextListViewOwnerIds.delete(nodeIdToDelete);

      return {
        ...currentState,
        selectedNodeId: null,
        selectedTextBoxId: null,
        listViewOwnerIds: nextListViewOwnerIds,
        chart: {
          ...currentState.chart,
          nodes: currentState.chart.nodes.filter(
            (node) => node.id !== nodeIdToDelete,
          ),
          connections: currentState.chart.connections.filter(
            (connection) =>
              connection.fromNodeId !== nodeIdToDelete &&
              connection.toNodeId !== nodeIdToDelete,
          ),
        },
      };
    });
  };

  const createDraggedConnection = (
    fromNodeId: string,
    fromHandlePosition: ConnectionHandlePosition,
    toNodeId: string,
    toHandlePosition: ConnectionHandlePosition,
  ) => {
    if (fromNodeId === toNodeId) {
      return;
    }

    commitEditorState((currentState) => {
      const fromNode = currentState.chart.nodes.find((node) => node.id === fromNodeId);
      const toNode = currentState.chart.nodes.find((node) => node.id === toNodeId);
      const connection =
        fromNode && toNode
          ? inferConnectionFromHandles(
              fromNode,
              fromHandlePosition,
              toNode,
              toHandlePosition,
            )
          : null;

      if (!fromNode || !toNode || !connection) {
        return currentState;
      }

      const nextConnections = applyRelationshipConnection(
        currentState.chart.connections,
        connection,
      );
      const nextChart = {
        ...currentState.chart,
        connections: nextConnections,
      };

      if (!validateOrgChart(nextChart).isValid) {
        return currentState;
      }

      return {
        ...currentState,
        selectedNodeId: connection.toNodeId,
        chart: nextChart,
      };
    });
  };

  const exportChartJson = () => {
    downloadBlob(
      new Blob([JSON.stringify(serializeEditorSnapshot(editorState), null, 2)], {
        type: "application/json",
      }),
      `${slugifyFileName(chart.name)}.json`,
    );
  };

  const importChartJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const importedSnapshot = parseImportedEditorSnapshot(await file.text());

      setUndoStack((currentUndoStack) => [
        ...currentUndoStack,
        cloneEditorSnapshot(editorState),
      ]);
      setIsChartTitleSelected(false);
      setEditorState(importedSnapshot);
    } catch {
      window.alert("That JSON file could not be imported as an org chart.");
    } finally {
      event.target.value = "";
    }
  };

  const exportChartPng = async (dimensions: ExportDimensions) => {
    const canvasElement = document.querySelector<HTMLElement>(".org-chart-canvas");

    if (!canvasElement) {
      return;
    }

    try {
      const pngBlob = await renderElementToPngBlob(canvasElement, dimensions);
      downloadBlob(pngBlob, `${slugifyFileName(chart.name)}.png`);
      setIsPngExportDialogOpen(false);
    } catch {
      window.alert("The chart could not be exported as a PNG.");
    }
  };

  const createNewChart = () => {
    setUndoStack((currentUndoStack) => [
      ...currentUndoStack,
      cloneEditorSnapshot(editorState),
    ]);
    setIsChartTitleSelected(false);
    setIsNewChartDialogOpen(false);
    setEditorState(createBlankEditorSnapshot());
  };

  return (
    <main className="app-shell">
      <ToolbarPlaceholder
        chartName={chart.name}
        isTitleSelected={isChartTitleSelected}
        onChangeChartName={updateChartName}
        onSelectTitle={() => {
          setIsChartTitleSelected(true);
          setEditorState((currentState) => ({
            ...currentState,
            selectedNodeId: null,
            selectedTextBoxId: null,
          }));
        }}
      />
      <div className="workspace-layout">
        {validation.isValid ? (
          <OrgChartCanvas
            chart={chart}
            listViewOwnerIds={listViewOwnerIds}
            selectedNodeId={selectedNodeId}
            selectedTextBoxId={selectedTextBoxId}
            textBoxes={textBoxes}
            onCreateConnection={createDraggedConnection}
            onChangeNode={updateNode}
            onChangeTextBox={updateTextBox}
            onSelectNode={(nodeId) => {
              setIsChartTitleSelected(false);
              setEditorState((currentState) => ({
                ...currentState,
                selectedNodeId: nodeId,
                selectedTextBoxId: null,
              }));
            }}
            onSelectTextBox={(textBoxId) => {
              setIsChartTitleSelected(false);
              setEditorState((currentState) => ({
                ...currentState,
                selectedNodeId: null,
                selectedTextBoxId: textBoxId,
              }));
            }}
          />
        ) : (
          <section className="validation-panel" aria-live="polite">
            <h1>Chart validation failed</h1>
            <p>Fix these data issues before rendering the org chart.</p>
            <ul>
              {validation.issues.map((issue) => (
                <li key={`${issue.code}-${issue.connectionId ?? issue.nodeId}`}>
                  <strong>{issue.code}</strong>: {issue.message}
                </li>
              ))}
            </ul>
          </section>
        )}
        <aside className="sidebar" aria-label="Node details">
          <div className="sidebar-main">
            <EditorActionsPanel
              canDelete={Boolean(selectedNode || selectedTextBoxId)}
              canUndo={undoStack.length > 0}
              onDelete={deleteSelectedNode}
              onUndo={undo}
            />
            <AddNodePanel selectedNode={selectedNode} onAddItem={addItem} />
            <NodeInspector
              chart={chart}
              node={selectedNode}
              textBox={selectedTextBox}
              onChange={updateNode}
              onChangeTextBox={updateTextBox}
              onChangeManager={updateManager}
              onChangeOwnedVertical={updateOwnedVertical}
              onChangeVertical={updateVertical}
              listViewOwnerIds={listViewOwnerIds}
              onToggleListView={toggleListView}
            />
          </div>
          <ImportExportPanel
            fileInputRef={importFileInputRef}
            onExportJson={exportChartJson}
            onExportPng={() => setIsPngExportDialogOpen(true)}
            onImportClick={() => importFileInputRef.current?.click()}
            onImportJson={importChartJson}
            onNewChart={() => setIsNewChartDialogOpen(true)}
          />
        </aside>
      </div>
      {isNewChartDialogOpen ? (
        <NewChartDialog
          onCancel={() => setIsNewChartDialogOpen(false)}
          onConfirm={createNewChart}
        />
      ) : null}
      {isPngExportDialogOpen ? (
        <PngExportDialog
          onCancel={() => setIsPngExportDialogOpen(false)}
          onExport={exportChartPng}
        />
      ) : null}
    </main>
  );
}

interface ImportExportPanelProps {
  fileInputRef: RefObject<HTMLInputElement>;
  onExportJson: () => void;
  onExportPng: () => void;
  onImportClick: () => void;
  onImportJson: (event: ChangeEvent<HTMLInputElement>) => void;
  onNewChart: () => void;
}

interface PngExportDialogProps {
  onCancel: () => void;
  onExport: (dimensions: ExportDimensions) => void;
}

interface NewChartDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
}

function NewChartDialog({ onCancel, onConfirm }: NewChartDialogProps) {
  return (
    <div className="export-dialog-backdrop" role="presentation">
      <section
        className="export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chart-heading"
      >
        <h2 id="new-chart-heading">Create new chart?</h2>
        <p>
          This will clear the current chart and start a blank one. You can still
          undo this during the current editing session.
        </p>
        <div className="export-dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="dialog-danger-button"
            onClick={onConfirm}
          >
            New chart
          </button>
        </div>
      </section>
    </div>
  );
}

function PngExportDialog({ onCancel, onExport }: PngExportDialogProps) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const exportPreview = useMemo(() => getCurrentExportPreview(), []);
  const [width, setWidth] = useState("1920");
  const [height, setHeight] = useState(() =>
    String(Math.max(Math.round(1920 / exportPreview.aspectRatio), 1)),
  );
  const parsedWidth = Number.parseInt(width, 10);
  const parsedHeight = Number.parseInt(height, 10);
  const canExport =
    Number.isFinite(parsedWidth) &&
    parsedWidth > 0 &&
    Number.isFinite(parsedHeight) &&
    parsedHeight > 0;

  useLayoutEffect(() => {
    const previewElement = previewRef.current;

    if (!previewElement) {
      return;
    }

    const previewClone = createExportPreviewClone(exportPreview);

    previewElement.replaceChildren(previewClone);
  }, [exportPreview]);

  const updateWidth = (nextWidth: string) => {
    setWidth(nextWidth);

    const nextParsedWidth = Number.parseInt(nextWidth, 10);

    if (Number.isFinite(nextParsedWidth) && nextParsedWidth > 0) {
      setHeight(
        String(Math.max(Math.round(nextParsedWidth / exportPreview.aspectRatio), 1)),
      );
    }
  };

  const updateHeight = (nextHeight: string) => {
    setHeight(nextHeight);

    const nextParsedHeight = Number.parseInt(nextHeight, 10);

    if (Number.isFinite(nextParsedHeight) && nextParsedHeight > 0) {
      setWidth(
        String(Math.max(Math.round(nextParsedHeight * exportPreview.aspectRatio), 1)),
      );
    }
  };

  return (
    <div className="export-dialog-backdrop" role="presentation">
      <section
        className="export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="png-export-heading"
      >
        <h2 id="png-export-heading">Export PNG</h2>
        <p>
          PNG export crops to the visible cells and omits the chart background.
        </p>
        <div
          ref={previewRef}
          className="export-preview"
          aria-label="PNG crop preview"
        />
        <div className="export-size-grid">
          <label className="inspector-field">
            <span>Width in pixels</span>
            <input
              autoFocus
              inputMode="numeric"
              min="1"
              type="number"
              value={width}
              onChange={(event) => updateWidth(event.target.value)}
            />
          </label>
          <label className="inspector-field">
            <span>Height in pixels</span>
            <input
              inputMode="numeric"
              min="1"
              type="number"
              value={height}
              onChange={(event) => updateHeight(event.target.value)}
            />
          </label>
        </div>
        <div className="export-dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!canExport}
            onClick={() =>
              onExport({
                width: parsedWidth,
                height: parsedHeight,
              })
            }
          >
            Export PNG
          </button>
        </div>
      </section>
    </div>
  );
}

function ImportExportPanel({
  fileInputRef,
  onExportJson,
  onExportPng,
  onImportClick,
  onImportJson,
  onNewChart,
}: ImportExportPanelProps) {
  return (
    <section className="import-export-panel" aria-label="Import export">
      <h2>Chart management</h2>
      <div className="import-export-actions">
        <button type="button" onClick={onExportJson}>
          Export JSON
        </button>
        <button type="button" onClick={onImportClick}>
          Import JSON
        </button>
        <button type="button" onClick={onExportPng}>
          Export PNG
        </button>
        <button
          type="button"
          className="new-chart-button"
          onClick={onNewChart}
        >
          New chart
        </button>
      </div>
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={onImportJson}
      />
    </section>
  );
}

interface EditorActionsPanelProps {
  canDelete: boolean;
  canUndo: boolean;
  onDelete: () => void;
  onUndo: () => void;
}

function EditorActionsPanel({
  canDelete,
  canUndo,
  onDelete,
  onUndo,
}: EditorActionsPanelProps) {
  return (
    <section className="editor-actions-panel" aria-label="Editor actions">
      <button type="button" disabled={!canUndo} onClick={onUndo}>
        Undo
      </button>
      <button
        type="button"
        className="editor-danger-button"
        disabled={!canDelete}
        onClick={onDelete}
      >
        Delete
      </button>
    </section>
  );
}

function cloneEditorSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    chart: snapshot.chart,
    selectedNodeId: snapshot.selectedNodeId,
    selectedTextBoxId: snapshot.selectedTextBoxId,
    listViewOwnerIds: new Set(snapshot.listViewOwnerIds),
    textBoxes: snapshot.textBoxes,
  };
}

function createDefaultEditorSnapshot(): EditorSnapshot {
  return {
    chart: sampleChart,
    selectedNodeId: null,
    selectedTextBoxId: null,
    listViewOwnerIds: new Set(),
    textBoxes: [],
  };
}

function createBlankEditorSnapshot(): EditorSnapshot {
  return {
    chart: {
      id: `chart-${Date.now()}`,
      name: "Untitled Org Chart",
      nodes: [],
      connections: [],
    },
    selectedNodeId: null,
    selectedTextBoxId: null,
    listViewOwnerIds: new Set(),
    textBoxes: [],
  };
}

function loadEditorSnapshot(): EditorSnapshot {
  if (typeof window === "undefined") {
    return createDefaultEditorSnapshot();
  }

  try {
    const storedSnapshot = window.localStorage.getItem(EDITOR_STORAGE_KEY);

    if (!storedSnapshot) {
      return createDefaultEditorSnapshot();
    }

    const parsedSnapshot = JSON.parse(storedSnapshot) as Partial<
      PersistedEditorSnapshot
    >;

    if (
      !parsedSnapshot.chart ||
      !Array.isArray(parsedSnapshot.chart.nodes) ||
      !Array.isArray(parsedSnapshot.chart.connections)
    ) {
      return createDefaultEditorSnapshot();
    }

    return {
      chart: parsedSnapshot.chart,
      selectedNodeId:
        typeof parsedSnapshot.selectedNodeId === "string"
          ? parsedSnapshot.selectedNodeId
          : null,
      selectedTextBoxId:
        typeof parsedSnapshot.selectedTextBoxId === "string"
          ? parsedSnapshot.selectedTextBoxId
          : null,
      listViewOwnerIds: new Set(
        Array.isArray(parsedSnapshot.listViewOwnerIds)
          ? parsedSnapshot.listViewOwnerIds.filter(
              (ownerNodeId): ownerNodeId is string =>
                typeof ownerNodeId === "string",
            )
          : [],
      ),
      textBoxes: Array.isArray(parsedSnapshot.textBoxes)
        ? parsedSnapshot.textBoxes
        : [],
    };
  } catch {
    return createDefaultEditorSnapshot();
  }
}

function saveEditorSnapshot(snapshot: EditorSnapshot): void {
  if (typeof window === "undefined") {
    return;
  }

  const persistedSnapshot = serializeEditorSnapshot(snapshot);

  try {
    window.localStorage.setItem(
      EDITOR_STORAGE_KEY,
      JSON.stringify(persistedSnapshot),
    );
  } catch {
    // Local persistence is best-effort; the editor should keep working in memory.
  }
}

function serializeEditorSnapshot(
  snapshot: EditorSnapshot,
): PersistedEditorSnapshot {
  return {
    version: 1,
    chart: snapshot.chart,
    selectedNodeId: snapshot.selectedNodeId,
    selectedTextBoxId: snapshot.selectedTextBoxId,
    listViewOwnerIds: Array.from(snapshot.listViewOwnerIds),
    textBoxes: snapshot.textBoxes,
  };
}

function parseImportedEditorSnapshot(fileContents: string): EditorSnapshot {
  const parsedSnapshot = JSON.parse(fileContents) as unknown;

  if (isOrgChart(parsedSnapshot)) {
    return {
      chart: parsedSnapshot,
      selectedNodeId: null,
      selectedTextBoxId: null,
      listViewOwnerIds: new Set(),
      textBoxes: [],
    };
  }

  if (typeof parsedSnapshot !== "object" || parsedSnapshot === null) {
    throw new Error("Invalid org chart JSON.");
  }

  const persistedSnapshot = parsedSnapshot as Partial<PersistedEditorSnapshot>;

  if (
    !("chart" in persistedSnapshot) ||
    !persistedSnapshot.chart ||
    !isOrgChart(persistedSnapshot.chart)
  ) {
    throw new Error("Invalid org chart JSON.");
  }

  return {
    chart: persistedSnapshot.chart,
    selectedNodeId:
      typeof persistedSnapshot.selectedNodeId === "string"
        ? persistedSnapshot.selectedNodeId
        : null,
    selectedTextBoxId:
      typeof persistedSnapshot.selectedTextBoxId === "string"
        ? persistedSnapshot.selectedTextBoxId
        : null,
    listViewOwnerIds: new Set(
      Array.isArray(persistedSnapshot.listViewOwnerIds)
        ? persistedSnapshot.listViewOwnerIds.filter(
            (ownerNodeId): ownerNodeId is string =>
              typeof ownerNodeId === "string",
          )
        : [],
    ),
    textBoxes: Array.isArray(persistedSnapshot.textBoxes)
      ? persistedSnapshot.textBoxes.filter(isCanvasTextBox)
      : [],
  };
}

function isOrgChart(value: unknown): value is OrgChart {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value &&
    "nodes" in value &&
    "connections" in value &&
    Array.isArray((value as OrgChart).nodes) &&
    Array.isArray((value as OrgChart).connections)
  );
}

function isCanvasTextBox(value: unknown): value is CanvasTextBox {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as CanvasTextBox).type === "text_box" &&
    typeof (value as CanvasTextBox).id === "string" &&
    typeof (value as CanvasTextBox).x === "number" &&
    typeof (value as CanvasTextBox).y === "number" &&
    typeof (value as CanvasTextBox).width === "number" &&
    typeof (value as CanvasTextBox).height === "number" &&
    typeof (value as CanvasTextBox).html === "string"
  );
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function slugifyFileName(fileName: string): string {
  const slug = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "org-chart";
}

interface ExportBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ExportDimensions {
  width: number;
  height: number;
}

interface ExportPreview {
  bounds: ExportBounds;
  element: HTMLElement | null;
  sourceWidth: number;
  sourceHeight: number;
  previewWidth: number;
  previewHeight: number;
  aspectRatio: number;
}

async function renderElementToPngBlob(
  element: HTMLElement,
  dimensions: ExportDimensions,
): Promise<Blob> {
  const sourceWidth = Math.ceil(element.offsetWidth);
  const sourceHeight = Math.ceil(element.offsetHeight);
  const exportBounds = getExportContentBounds(element);
  const outputWidth = Math.max(Math.round(dimensions.width), 1);
  const outputHeight = Math.max(Math.round(dimensions.height), 1);
  const scaleX = outputWidth / exportBounds.width;
  const scaleY = outputHeight / exportBounds.height;
  const clone = element.cloneNode(true) as HTMLElement;
  const wrapper = document.createElement("div");
  const style = document.createElement("style");

  clone.classList.add("org-chart-canvas--exporting");
  clone.style.position = "absolute";
  clone.style.top = `${-exportBounds.top * scaleY}px`;
  clone.style.left = `${-exportBounds.left * scaleX}px`;
  clone.style.width = `${sourceWidth}px`;
  clone.style.height = `${sourceHeight}px`;
  clone.style.transform = `scale(${scaleX}, ${scaleY})`;
  clone.style.transformOrigin = "top left";
  clone.querySelectorAll("[contenteditable]").forEach((editableElement) => {
    editableElement.removeAttribute("contenteditable");
  });

  style.textContent = getDocumentStyleText();
  wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  wrapper.style.position = "relative";
  wrapper.style.width = `${outputWidth}px`;
  wrapper.style.height = `${outputHeight}px`;
  wrapper.style.overflow = "hidden";
  wrapper.style.background = "transparent";
  wrapper.append(style, clone);

  const serializedMarkup = new XMLSerializer().serializeToString(wrapper);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${outputWidth} ${outputHeight}">
      <foreignObject width="100%" height="100%">${serializedMarkup}</foreignObject>
    </svg>
  `;
  const imageUrl = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );

  try {
    const image = new Image();
    image.decoding = "async";
    image.src = imageUrl;
    await image.decode();

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas rendering is unavailable.");
    }

    canvas.width = outputWidth;
    canvas.height = outputHeight;
    context.clearRect(0, 0, outputWidth, outputHeight);
    context.drawImage(image, 0, 0);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("PNG export failed."));
        }
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function getCurrentExportPreview(): ExportPreview {
  const element = document.querySelector<HTMLElement>(".org-chart-canvas");

  if (!element) {
    return {
      bounds: {
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
      },
      element: null,
      sourceWidth: 1920,
      sourceHeight: 1080,
      previewWidth: 360,
      previewHeight: 203,
      aspectRatio: 16 / 9,
    };
  }

  const bounds = getExportContentBounds(element);
  const sourceWidth = Math.max(Math.ceil(element.offsetWidth), 1);
  const sourceHeight = Math.max(Math.ceil(element.offsetHeight), 1);
  const aspectRatio = bounds.width / bounds.height;
  const previewScale = Math.min(420 / bounds.width, 220 / bounds.height);
  const previewWidth = Math.max(Math.round(bounds.width * previewScale), 1);
  const previewHeight = Math.max(Math.round(bounds.height * previewScale), 1);

  return {
    bounds,
    element,
    sourceWidth,
    sourceHeight,
    previewWidth,
    previewHeight,
    aspectRatio,
  };
}

function createExportPreviewClone(preview: ExportPreview): HTMLElement {
  const wrapper = document.createElement("div");

  wrapper.className = "export-preview-inner";
  wrapper.style.width = `${preview.previewWidth}px`;
  wrapper.style.height = `${preview.previewHeight}px`;

  if (!preview.element) {
    return wrapper;
  }

  const clone = preview.element.cloneNode(true) as HTMLElement;
  const scaleX = preview.previewWidth / preview.bounds.width;
  const scaleY = preview.previewHeight / preview.bounds.height;

  clone.classList.add("org-chart-canvas--exporting");
  clone.style.position = "absolute";
  clone.style.top = `${-preview.bounds.top * scaleY}px`;
  clone.style.left = `${-preview.bounds.left * scaleX}px`;
  clone.style.width = `${preview.sourceWidth}px`;
  clone.style.height = `${preview.sourceHeight}px`;
  clone.style.transform = `scale(${scaleX}, ${scaleY})`;
  clone.style.transformOrigin = "top left";
  clone.querySelectorAll("[contenteditable]").forEach((editableElement) => {
    editableElement.removeAttribute("contenteditable");
  });

  wrapper.append(clone);

  return wrapper;
}

function getExportContentBounds(element: HTMLElement): ExportBounds {
  const canvasRect = element.getBoundingClientRect();
  const cellElements = Array.from(
    element.querySelectorAll<HTMLElement>(".org-node-card, .canvas-text-box"),
  );

  if (cellElements.length === 0) {
    return {
      left: 0,
      top: 0,
      width: Math.max(Math.ceil(element.offsetWidth), 1),
      height: Math.max(Math.ceil(element.offsetHeight), 1),
    };
  }

  const contentBounds = cellElements.reduce(
    (bounds, cellElement) => {
      const cellRect = cellElement.getBoundingClientRect();

      return {
        left: Math.min(bounds.left, cellRect.left - canvasRect.left),
        top: Math.min(bounds.top, cellRect.top - canvasRect.top),
        right: Math.max(bounds.right, cellRect.right - canvasRect.left),
        bottom: Math.max(bounds.bottom, cellRect.bottom - canvasRect.top),
      };
    },
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    },
  );

  const left = Math.floor(Math.max(contentBounds.left, 0));
  const top = Math.floor(Math.max(contentBounds.top, 0));
  const right = Math.ceil(Math.min(contentBounds.right, element.offsetWidth));
  const bottom = Math.ceil(Math.min(contentBounds.bottom, element.offsetHeight));

  return {
    left,
    top,
    width: Math.max(right - left, 1),
    height: Math.max(bottom - top, 1),
  };
}

function getDocumentStyleText(): string {
  return Array.from(document.styleSheets)
    .map((styleSheet) => {
      try {
        return Array.from(styleSheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");
}

function replaceIncomingConnection(
  connections: OrgConnection[],
  nodeId: string,
  connectionType: OrgConnection["connectionType"],
  replacement: OrgConnection | null,
): OrgConnection[] {
  const remainingConnections = connections.filter(
    (connection) =>
      !(
        connection.toNodeId === nodeId &&
        connection.connectionType === connectionType
      ),
  );

  return replacement ? [...remainingConnections, replacement] : remainingConnections;
}

function getConnectionsValidForNodes(
  connections: OrgConnection[],
  nodes: OrgNode[],
): OrgConnection[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  return connections.filter((connection) => {
    const fromNode = nodesById.get(connection.fromNodeId);
    const toNode = nodesById.get(connection.toNodeId);

    if (!fromNode || !toNode) {
      return false;
    }

    if (connection.connectionType === "owns_vertical") {
      return fromNode.type === "employee" && toNode.type === "vertical";
    }

    if (connection.connectionType === "belongs_to_vertical") {
      return fromNode.type === "vertical" && isReportTargetType(toNode);
    }

    return fromNode.type === "employee" && isReportTargetType(toNode);
  });
}

function isReportTargetType(node: OrgNode): boolean {
  return (
    node.type === "employee" ||
    node.type === "open_role" ||
    node.type === "approved_role"
  );
}

function applyRelationshipConnection(
  connections: OrgConnection[],
  connection: OrgConnection,
): OrgConnection[] {
  if (connection.connectionType === "owns_vertical") {
    return [
      ...connections.filter(
        (existingConnection) =>
          !(
            existingConnection.connectionType === "owns_vertical" &&
            existingConnection.toNodeId === connection.toNodeId
          ),
      ),
      connection,
    ];
  }

  if (connection.connectionType === "reports_to") {
    return [
      ...connections.filter(
        (existingConnection) =>
          !(
            existingConnection.toNodeId === connection.toNodeId &&
            (existingConnection.connectionType === "reports_to" ||
              existingConnection.connectionType === "belongs_to_vertical")
          ),
      ),
      connection,
    ];
  }

  if (connection.connectionType === "belongs_to_vertical") {
    return [
      ...connections.filter(
        (existingConnection) =>
          !(
            existingConnection.toNodeId === connection.toNodeId &&
            (existingConnection.connectionType === "belongs_to_vertical" ||
              existingConnection.connectionType === "reports_to")
          ),
      ),
      connection,
    ];
  }

  return replaceIncomingConnection(
    connections,
    connection.toNodeId,
    connection.connectionType,
    connection,
  );
}

function inferConnectionFromHandles(
  fromNode: OrgNode,
  fromHandlePosition: ConnectionHandlePosition,
  toNode: OrgNode,
  toHandlePosition: ConnectionHandlePosition,
): OrgConnection | null {
  const connectsSourceAboveTarget =
    fromHandlePosition === "bottom" && toHandlePosition === "top";
  const connectsTargetAboveSource =
    fromHandlePosition === "top" && toHandlePosition === "bottom";

  if (connectsSourceAboveTarget) {
    return createInferredConnection(fromNode, toNode);
  }

  if (connectsTargetAboveSource) {
    return createInferredConnection(toNode, fromNode);
  }

  return null;
}

function createInferredConnection(
  parentNode: OrgNode,
  childNode: OrgNode,
): OrgConnection | null {
  const connectionType = inferConnectionType(parentNode, childNode);

  if (!connectionType) {
    return null;
  }

  return {
    id: `${connectionType}-${parentNode.id}-${childNode.id}`,
    fromNodeId: parentNode.id,
    toNodeId: childNode.id,
    connectionType,
  };
}

function inferConnectionType(
  parentNode: OrgNode,
  childNode: OrgNode,
): OrgConnectionType | null {
  if (parentNode.type === "employee" && childNode.type === "vertical") {
    return "owns_vertical";
  }

  if (
    parentNode.type === "employee" &&
    (childNode.type === "employee" ||
      childNode.type === "open_role" ||
      childNode.type === "approved_role")
  ) {
    return "reports_to";
  }

  if (
    parentNode.type === "vertical" &&
    (childNode.type === "employee" ||
      childNode.type === "open_role" ||
      childNode.type === "approved_role")
  ) {
    return "belongs_to_vertical";
  }

  return null;
}

function createNewNode(nodeType: OrgNodeType, chart: OrgChart): OrgNode {
  const nodeNumber = getNextNodeNumber(nodeType, chart);
  const id = getUniqueNodeId(`${nodeType}-${nodeNumber}`, chart);

  if (nodeType === "employee") {
    return {
      id,
      type: "employee",
      uplineConnectionStyle: "solid",
      name: `New Employee ${nodeNumber}`,
      jobTitle: "Job title",
    };
  }

  if (nodeType === "vertical") {
    return {
      id,
      type: "vertical",
      uplineConnectionStyle: "solid",
      verticalName: `New Vertical ${nodeNumber}`,
    };
  }

  if (nodeType === "open_role") {
    return {
      id,
      type: "open_role",
      uplineConnectionStyle: "solid",
      statusLabel: "Open Role",
      roleTitle: `New Role ${nodeNumber}`,
    };
  }

  return {
    id,
    type: "approved_role",
    uplineConnectionStyle: "solid",
    statusLabel: "Approved HC",
    roleTitle: `New Role ${nodeNumber}`,
  };
}

function createPlacementConnection(
  selectedNode: OrgNode | null,
  newNode: OrgNode,
): OrgConnection | null {
  if (!selectedNode) {
    return null;
  }

  if (selectedNode.type === "employee") {
    const connectionType =
      newNode.type === "vertical" ? "owns_vertical" : "reports_to";

    return {
      id: `${connectionType}-${selectedNode.id}-${newNode.id}`,
      fromNodeId: selectedNode.id,
      toNodeId: newNode.id,
      connectionType,
    };
  }

  if (selectedNode.type === "vertical" && newNode.type !== "vertical") {
    return {
      id: `belongs-to-${selectedNode.id}-${newNode.id}`,
      fromNodeId: selectedNode.id,
      toNodeId: newNode.id,
      connectionType: "belongs_to_vertical",
    };
  }

  return null;
}

function getNextNodeNumber(nodeType: OrgNodeType, chart: OrgChart): number {
  return chart.nodes.filter((node) => node.type === nodeType).length + 1;
}

function getUniqueNodeId(baseId: string, chart: OrgChart): string {
  const existingNodeIds = new Set(chart.nodes.map((node) => node.id));
  let candidateId = baseId;
  let suffix = 2;

  while (existingNodeIds.has(candidateId)) {
    candidateId = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return candidateId;
}

function getUniqueTextBoxId(
  baseId: string,
  textBoxes: CanvasTextBox[],
): string {
  const existingTextBoxIds = new Set(textBoxes.map((textBox) => textBox.id));
  let candidateId = baseId;
  let suffix = 2;

  while (existingTextBoxIds.has(candidateId)) {
    candidateId = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return candidateId;
}
