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

interface JsonExportPayload {
  fileName: string;
  json: string;
}

interface BrowserFileWritable {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
}

interface BrowserFileHandle {
  createWritable: () => Promise<BrowserFileWritable>;
}

interface BrowserSaveFilePickerOptions {
  suggestedName: string;
  types: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}

type WindowWithSaveFilePicker = Window &
  typeof globalThis & {
    showSaveFilePicker?: (
      options: BrowserSaveFilePickerOptions,
    ) => Promise<BrowserFileHandle>;
  };

const EDITOR_STORAGE_KEY = "org-chart-v2:editor-state";

export function App() {
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [editorState, setEditorState] = useState<EditorSnapshot>(() =>
    loadEditorSnapshot(),
  );
  const [undoStack, setUndoStack] = useState<EditorSnapshot[]>([]);
  const [inspectorAutoFocusNodeId, setInspectorAutoFocusNodeId] = useState<
    string | null
  >(null);
  const [isChartTitleSelected, setIsChartTitleSelected] = useState(false);
  const [isNewChartDialogOpen, setIsNewChartDialogOpen] = useState(false);
  const [isPngExportDialogOpen, setIsPngExportDialogOpen] = useState(false);
  const [jsonExportPayload, setJsonExportPayload] =
    useState<JsonExportPayload | null>(null);
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
  const shouldShowStarterHelp = chart.nodes.length <= 1;

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
    ownerNodeId: string,
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
                  id: `owns-${ownerNodeId}-${verticalNodeId}`,
                  fromNodeId: ownerNodeId,
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
    const currentSelectedNode =
      chart.nodes.find((node) => node.id === selectedNodeId) ?? null;
    const newNode = createNewNode(nodeType, chart);
    const placementConnections = createPlacementConnections(
      currentSelectedNode,
      newNode,
      chart,
    );

    commitEditorState((currentState) => {
      return {
        ...currentState,
        selectedNodeId: newNode.id,
        selectedTextBoxId: null,
        chart: {
          ...currentState.chart,
          nodes: [...currentState.chart.nodes, newNode],
          connections:
            placementConnections.length > 0
              ? [...currentState.chart.connections, ...placementConnections]
              : currentState.chart.connections,
        },
      };
    });
    setInspectorAutoFocusNodeId(newNode.id);
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

  const reorderNodes = (orderedNodeIds: string[]) => {
    if (orderedNodeIds.length < 2) {
      return;
    }

    commitEditorState((currentState) => {
      const orderedNodeIdSet = new Set(orderedNodeIds);
      const nodesById = new Map(
        currentState.chart.nodes.map((node) => [node.id, node]),
      );

      if (orderedNodeIds.some((nodeId) => !nodesById.has(nodeId))) {
        return currentState;
      }

      let hasInsertedOrderedNodes = false;
      const nextNodes = currentState.chart.nodes.flatMap((node) => {
        if (!orderedNodeIdSet.has(node.id)) {
          return [node];
        }

        if (hasInsertedOrderedNodes) {
          return [];
        }

        hasInsertedOrderedNodes = true;
        return orderedNodeIds
          .map((nodeId) => nodesById.get(nodeId))
          .filter((orderedNode): orderedNode is OrgNode => Boolean(orderedNode));
      });

      if (
        nextNodes.length === currentState.chart.nodes.length &&
        nextNodes.every((node, index) => node.id === currentState.chart.nodes[index].id)
      ) {
        return currentState;
      }

      return {
        ...currentState,
        chart: {
          ...currentState.chart,
          nodes: nextNodes,
        },
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
    const json = JSON.stringify(serializeEditorSnapshot(editorState), null, 2);
    const jsonBlob = createJsonBlob(json);
    const fileName = `${slugifyFileName(chart.name)}.json`;

    setJsonExportPayload({ fileName, json });
    void saveBlob(jsonBlob, fileName, {
      description: "Org chart JSON",
      mimeType: "application/json",
      extension: ".json",
    }).catch((error: unknown) => {
      console.error(error);
      window.alert("The chart could not be exported as JSON.");
    });
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

  const exportChartPng = (dimensions: ExportDimensions) => {
    const canvasElement = document.querySelector<HTMLElement>(".org-chart-canvas");

    if (!canvasElement) {
      return;
    }

    try {
      const pngDataUrl = renderElementToPngDataUrl(canvasElement, dimensions);

      downloadDataUrl(pngDataUrl, `${slugifyFileName(chart.name)}.png`);
      setIsPngExportDialogOpen(false);
    } catch (error) {
      console.error(error);
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
            onReorderNodes={reorderNodes}
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
            <AddNodePanel
              selectedNode={selectedNode}
              showStarterHint={shouldShowStarterHelp}
              onAddItem={addItem}
            />
            <NodeInspector
              chart={chart}
              autoFocusNodeId={inspectorAutoFocusNodeId}
              node={selectedNode}
              textBox={selectedTextBox}
              onChange={updateNode}
              onChangeTextBox={updateTextBox}
              onChangeManager={updateManager}
              onChangeOwnedVertical={updateOwnedVertical}
              onAutoFocusHandled={() => setInspectorAutoFocusNodeId(null)}
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
      {jsonExportPayload ? (
        <JsonExportDialog
          fileName={jsonExportPayload.fileName}
          json={jsonExportPayload.json}
          onClose={() => setJsonExportPayload(null)}
          onDownload={() => {
            void saveBlob(createJsonBlob(jsonExportPayload.json), jsonExportPayload.fileName, {
              description: "Org chart JSON",
              mimeType: "application/json",
              extension: ".json",
            }).catch((error: unknown) => {
              console.error(error);
              window.alert("The chart could not be exported as JSON.");
            });
          }}
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

interface JsonExportDialogProps {
  fileName: string;
  json: string;
  onClose: () => void;
  onDownload: () => void;
}

function JsonExportDialog({
  fileName,
  json,
  onClose,
  onDownload,
}: JsonExportDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [copyStatus, setCopyStatus] = useState("");

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopyStatus("Copied JSON to clipboard.");
      return;
    } catch {
      const textarea = textareaRef.current;

      if (!textarea) {
        setCopyStatus("Select the JSON text and copy it manually.");
        return;
      }

      textarea.focus();
      textarea.select();
      const copied = document.execCommand("copy");
      setCopyStatus(
        copied
          ? "Copied JSON to clipboard."
          : "Select the JSON text and copy it manually.",
      );
    }
  };

  return (
    <div className="export-dialog-backdrop" role="presentation">
      <section
        className="export-dialog json-export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="json-export-heading"
      >
        <h2 id="json-export-heading">Export JSON</h2>
        <p>
          Your chart JSON is ready as <strong>{fileName}</strong>. If the browser
          does not download it automatically, use Download JSON again or copy the
          text below.
        </p>
        <textarea
          ref={textareaRef}
          className="json-export-textarea"
          readOnly
          value={json}
          aria-label="Exported chart JSON"
        />
        {copyStatus ? (
          <p className="json-export-status" aria-live="polite">
            {copyStatus}
          </p>
        ) : null}
        <div className="export-dialog-actions export-dialog-actions--three">
          <button type="button" onClick={onDownload}>
            Download JSON
          </button>
          <button type="button" onClick={() => void copyJson()}>
            Copy JSON
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
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
    return createBlankEditorSnapshot();
  }

  try {
    const storedSnapshot = window.localStorage.getItem(EDITOR_STORAGE_KEY);

    if (!storedSnapshot) {
      return createBlankEditorSnapshot();
    }

    const parsedSnapshot = JSON.parse(storedSnapshot) as Partial<
      PersistedEditorSnapshot
    >;

    if (
      !parsedSnapshot.chart ||
      !Array.isArray(parsedSnapshot.chart.nodes) ||
      !Array.isArray(parsedSnapshot.chart.connections)
    ) {
      return createBlankEditorSnapshot();
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
    return createBlankEditorSnapshot();
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

function createJsonBlob(json: string): Blob {
  return new Blob([json], {
    type: "application/json",
  });
}

async function saveBlob(
  blob: Blob,
  fileName: string,
  options: {
    description: string;
    extension: string;
    mimeType: string;
  },
): Promise<void> {
  const saveFilePicker = (window as WindowWithSaveFilePicker).showSaveFilePicker;

  if (saveFilePicker) {
    try {
      const fileHandle = await saveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: options.description,
            accept: {
              [options.mimeType]: [options.extension],
            },
          },
        ],
      });
      const writableFile = await fileHandle.createWritable();
      await writableFile.write(blob);
      await writableFile.close();
      return;
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
    }
  }

  downloadBlob(blob, fileName);

  if (options.mimeType === "application/json") {
    openBlobInNewTab(blob);
  }
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    }),
  );

  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

function downloadDataUrl(dataUrl: string, fileName: string): void {
  const link = document.createElement("a");

  link.href = dataUrl;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();

  window.setTimeout(() => {
    link.remove();
  }, 0);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function openBlobInNewTab(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const openedWindow = window.open(url, "_blank", "noopener");

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, openedWindow ? 60_000 : 1000);
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

function renderElementToPngDataUrl(
  element: HTMLElement,
  dimensions: ExportDimensions,
): string {
  const exportBounds = getExportContentBounds(element);
  const outputWidth = Math.max(Math.round(dimensions.width), 1);
  const outputHeight = Math.max(Math.round(dimensions.height), 1);
  const scaleX = outputWidth / exportBounds.width;
  const scaleY = outputHeight / exportBounds.height;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas rendering is unavailable.");
  }

  canvas.width = outputWidth;
  canvas.height = outputHeight;
  context.clearRect(0, 0, outputWidth, outputHeight);
  context.save();
  context.setTransform(
    scaleX,
    0,
    0,
    scaleY,
    -exportBounds.left * scaleX,
    -exportBounds.top * scaleY,
  );
  drawExportConnections(context, element);
  drawExportCells(context, element);
  context.restore();

  return canvas.toDataURL("image/png");
}

interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ExportTextLine {
  text: string;
  computedStyle: CSSStyleDeclaration;
  lineHeight: number;
}

function drawExportConnections(
  context: CanvasRenderingContext2D,
  element: HTMLElement,
): void {
  const connectionElements = element.querySelectorAll<SVGPathElement>(
    "path.connection-line",
  );

  connectionElements.forEach((connectionElement) => {
    const pathDefinition = connectionElement.getAttribute("d");

    if (!pathDefinition) {
      return;
    }

    const computedStyle = getComputedStyle(connectionElement);

    context.save();
    context.strokeStyle = computedStyle.stroke || "#000000";
    context.lineWidth = parseCssPixels(computedStyle.strokeWidth, 2);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.setLineDash(parseCssDashArray(computedStyle.strokeDasharray));

    try {
      context.stroke(new Path2D(pathDefinition));
    } catch {
      drawSimpleOrthogonalPath(context, pathDefinition);
    }

    context.restore();
  });
}

function drawExportCells(
  context: CanvasRenderingContext2D,
  element: HTMLElement,
): void {
  const canvasRect = element.getBoundingClientRect();
  const canvasZoom = getRenderedCanvasZoom(element);
  const cellElements = element.querySelectorAll<HTMLElement>(
    ".org-node-card, .canvas-text-box",
  );

  cellElements.forEach((cellElement) => {
    if (cellElement.classList.contains("canvas-text-box")) {
      drawExportTextBox(context, cellElement, canvasRect, canvasZoom);
      return;
    }

    drawExportNodeCard(context, cellElement, canvasRect, canvasZoom);
  });
}

function drawExportNodeCard(
  context: CanvasRenderingContext2D,
  element: HTMLElement,
  canvasRect: DOMRect,
  canvasZoom: number,
): void {
  const bounds = getElementCanvasRect(element, canvasRect, canvasZoom);
  const computedStyle = getComputedStyle(element);
  const radius = element.classList.contains("org-node-card--vertical")
    ? bounds.height / 2
    : Math.min(
        parseCssPixels(computedStyle.borderTopLeftRadius, 15),
        bounds.width / 2,
        bounds.height / 2,
      );

  drawRoundedRect(context, bounds, radius, {
    fillStyle: computedStyle.backgroundColor || "#ffffff",
    strokeStyle: computedStyle.borderTopColor || "#000000",
    lineWidth: parseCssPixels(computedStyle.borderTopWidth, 2),
  });

  if (element.classList.contains("org-node-card--report_list")) {
    drawExportReportList(context, element, canvasRect, canvasZoom);
    return;
  }

  drawExportTextStack(context, element, bounds, ".node-primary, .node-secondary");
}

function drawExportReportList(
  context: CanvasRenderingContext2D,
  element: HTMLElement,
  canvasRect: DOMRect,
  canvasZoom: number,
): void {
  element.querySelectorAll<HTMLElement>(".report-list-node-item").forEach((item) => {
    const bounds = getElementCanvasRect(item, canvasRect, canvasZoom);
    const computedStyle = getComputedStyle(item);

    drawRoundedRect(context, bounds, parseCssPixels(computedStyle.borderRadius, 8), {
      fillStyle: computedStyle.backgroundColor || "#ffffff",
      strokeStyle: computedStyle.borderTopColor || "#000000",
      lineWidth: parseCssPixels(computedStyle.borderTopWidth, 1),
    });

    drawExportTextStack(context, item, bounds, "span, small");
  });
}

function drawExportTextBox(
  context: CanvasRenderingContext2D,
  element: HTMLElement,
  canvasRect: DOMRect,
  canvasZoom: number,
): void {
  const bounds = getElementCanvasRect(element, canvasRect, canvasZoom);
  const computedStyle = getComputedStyle(element);
  const editorElement = element.querySelector<HTMLElement>(".canvas-text-box-editor");

  drawRoundedRect(context, bounds, parseCssPixels(computedStyle.borderRadius, 6), {
    fillStyle: computedStyle.backgroundColor || "#ffffff",
    strokeStyle: element.classList.contains("canvas-text-box--selected")
      ? "#9aa8b8"
      : computedStyle.borderTopColor || "#9aa8b8",
    lineWidth: parseCssPixels(computedStyle.borderTopWidth, 1),
  });

  if (editorElement) {
    drawTextBoxText(context, editorElement, bounds);
  }
}

function drawExportTextStack(
  context: CanvasRenderingContext2D,
  containerElement: HTMLElement,
  bounds: CanvasRect,
  selector: string,
): void {
  const containerStyle = getComputedStyle(containerElement);
  const paddingTop = parseCssPixels(containerStyle.paddingTop, 0);
  const paddingRight = parseCssPixels(containerStyle.paddingRight, 0);
  const paddingBottom = parseCssPixels(containerStyle.paddingBottom, 0);
  const paddingLeft = parseCssPixels(containerStyle.paddingLeft, 0);
  const fieldGap = parseCssPixels(containerStyle.gap, 3);
  const textWidth = Math.max(bounds.width - paddingLeft - paddingRight, 1);
  const textElements = Array.from(
    containerElement.querySelectorAll<HTMLElement>(selector),
  );
  const textBlocks = textElements
    .map((textElement) => getWrappedExportTextBlock(context, textElement, textWidth))
    .filter((textBlock) => textBlock.length > 0);

  if (textBlocks.length === 0) {
    return;
  }

  const textLines = textBlocks.flatMap((textBlock) => textBlock);
  const totalLineHeight = textLines.reduce(
    (height, line) => height + line.lineHeight,
    0,
  );
  const totalGapHeight = fieldGap * Math.max(textBlocks.length - 1, 0);
  const innerHeight = Math.max(bounds.height - paddingTop - paddingBottom, 1);
  const totalTextHeight = totalLineHeight + totalGapHeight;
  let y =
    bounds.top +
    paddingTop +
    Math.max((innerHeight - totalTextHeight) / 2, 0);

  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  textBlocks.forEach((textBlock, blockIndex) => {
    textBlock.forEach((line) => {
      applyCanvasTextStyle(context, line.computedStyle);
      context.fillText(
        line.text,
        bounds.left + paddingLeft + textWidth / 2,
        y + line.lineHeight / 2,
        textWidth,
      );
      y += line.lineHeight;
    });

    if (blockIndex < textBlocks.length - 1) {
      y += fieldGap;
    }
  });
  context.restore();
}

function getWrappedExportTextBlock(
  context: CanvasRenderingContext2D,
  element: HTMLElement,
  maxWidth: number,
): ExportTextLine[] {
  const text = getElementText(element).trim();

  if (!text) {
    return [];
  }

  const computedStyle = getComputedStyle(element);
  const fontSize = parseCssPixels(computedStyle.fontSize, 14);
  const lineHeight = parseLineHeight(computedStyle.lineHeight, fontSize);

  return wrapCanvasText(context, text, maxWidth, computedStyle).map((line) => ({
    text: line,
    computedStyle,
    lineHeight,
  }));
}

function drawTextBoxText(
  context: CanvasRenderingContext2D,
  editorElement: HTMLElement,
  textBoxBounds: CanvasRect,
): void {
  const text = getElementText(editorElement).trim();

  if (!text) {
    return;
  }

  const computedStyle = getComputedStyle(editorElement);
  const fontSize = parseCssPixels(computedStyle.fontSize, 14);
  const lineHeight = parseLineHeight(computedStyle.lineHeight, fontSize);
  const paddingTop = parseCssPixels(computedStyle.paddingTop, 10);
  const paddingRight = parseCssPixels(computedStyle.paddingRight, 12);
  const paddingBottom = parseCssPixels(computedStyle.paddingBottom, 10);
  const paddingLeft = parseCssPixels(computedStyle.paddingLeft, 12);
  const textLeft = textBoxBounds.left + paddingLeft;
  const textTop = textBoxBounds.top + paddingTop;
  const textWidth = Math.max(textBoxBounds.width - paddingLeft - paddingRight, 1);
  const maxTextBottom = textBoxBounds.top + textBoxBounds.height - paddingBottom;
  const lines = wrapCanvasText(context, text, textWidth, computedStyle);

  context.save();
  applyCanvasTextStyle(context, computedStyle);
  context.textAlign = "left";
  context.textBaseline = "middle";
  lines.forEach((line, index) => {
    const lineY = textTop + index * lineHeight + lineHeight / 2;

    if (lineY <= maxTextBottom) {
      context.fillText(line, textLeft, lineY, textWidth);
    }
  });
  context.restore();
}

function applyCanvasTextStyle(
  context: CanvasRenderingContext2D,
  computedStyle: CSSStyleDeclaration,
): void {
  const fontSize = parseCssPixels(computedStyle.fontSize, 14);
  const fontStyle = computedStyle.fontStyle || "normal";
  const fontWeight = computedStyle.fontWeight || "400";
  const fontFamily = computedStyle.fontFamily || "sans-serif";

  context.fillStyle = computedStyle.color || "#17202a";
  context.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  computedStyle: CSSStyleDeclaration,
): string[] {
  context.save();
  applyCanvasTextStyle(context, computedStyle);
  const lines = text.split(/\r?\n/).flatMap((line) =>
    wrapCanvasLine(context, line.trim(), maxWidth),
  );
  context.restore();

  return lines.length > 0 ? lines : [""];
}

function wrapCanvasLine(
  context: CanvasRenderingContext2D,
  line: string,
  maxWidth: number,
): string[] {
  if (!line) {
    return [""];
  }

  const words = line.split(/\s+/);
  const wrappedLines: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (context.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine;
      return;
    }

    if (currentLine) {
      wrappedLines.push(currentLine);
    }

    if (context.measureText(word).width <= maxWidth) {
      currentLine = word;
      return;
    }

    const brokenWordLines = breakLongWord(context, word, maxWidth);
    wrappedLines.push(...brokenWordLines.slice(0, -1));
    currentLine = brokenWordLines[brokenWordLines.length - 1] ?? "";
  });

  if (currentLine) {
    wrappedLines.push(currentLine);
  }

  return wrappedLines;
}

function breakLongWord(
  context: CanvasRenderingContext2D,
  word: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let currentLine = "";

  Array.from(word).forEach((character) => {
    const nextLine = `${currentLine}${character}`;

    if (!currentLine || context.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine;
      return;
    }

    lines.push(currentLine);
    currentLine = character;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  bounds: CanvasRect,
  radius: number,
  options: {
    fillStyle: string;
    strokeStyle: string;
    lineWidth: number;
  },
): void {
  const strokeInset = Math.max(options.lineWidth / 2, 0);
  const rect = {
    left: bounds.left + strokeInset,
    top: bounds.top + strokeInset,
    width: Math.max(bounds.width - options.lineWidth, 0),
    height: Math.max(bounds.height - options.lineWidth, 0),
  };
  const safeRadius = Math.max(
    Math.min(radius - strokeInset, rect.width / 2, rect.height / 2),
    0,
  );

  context.save();
  context.beginPath();
  context.moveTo(rect.left + safeRadius, rect.top);
  context.lineTo(rect.left + rect.width - safeRadius, rect.top);
  context.quadraticCurveTo(
    rect.left + rect.width,
    rect.top,
    rect.left + rect.width,
    rect.top + safeRadius,
  );
  context.lineTo(
    rect.left + rect.width,
    rect.top + rect.height - safeRadius,
  );
  context.quadraticCurveTo(
    rect.left + rect.width,
    rect.top + rect.height,
    rect.left + rect.width - safeRadius,
    rect.top + rect.height,
  );
  context.lineTo(rect.left + safeRadius, rect.top + rect.height);
  context.quadraticCurveTo(
    rect.left,
    rect.top + rect.height,
    rect.left,
    rect.top + rect.height - safeRadius,
  );
  context.lineTo(rect.left, rect.top + safeRadius);
  context.quadraticCurveTo(
    rect.left,
    rect.top,
    rect.left + safeRadius,
    rect.top,
  );
  context.closePath();
  context.fillStyle = options.fillStyle;
  context.fill();

  if (options.lineWidth > 0) {
    context.strokeStyle = options.strokeStyle;
    context.lineWidth = options.lineWidth;
    context.stroke();
  }

  context.restore();
}

function drawSimpleOrthogonalPath(
  context: CanvasRenderingContext2D,
  pathDefinition: string,
): void {
  const commands = pathDefinition.match(/[MLHV][^MLHV]*/g) ?? [];
  let currentX = 0;
  let currentY = 0;

  context.beginPath();
  commands.forEach((command) => {
    const type = command[0];
    const values = command
      .slice(1)
      .trim()
      .split(/\s+/)
      .map((value) => Number.parseFloat(value))
      .filter(Number.isFinite);

    if (type === "M" && values.length >= 2) {
      currentX = values[0];
      currentY = values[1];
      context.moveTo(values[0], values[1]);
      return;
    }

    if (type === "L" && values.length >= 2) {
      currentX = values[0];
      currentY = values[1];
      context.lineTo(values[0], values[1]);
      return;
    }

    if (type === "H" && values.length >= 1) {
      currentX = values[0];
      context.lineTo(currentX, currentY);
      return;
    }

    if (type === "V" && values.length >= 1) {
      currentY = values[0];
      context.lineTo(currentX, currentY);
    }
  });
  context.stroke();
}

function getElementCanvasRect(
  element: HTMLElement,
  canvasRect: DOMRect,
  canvasZoom: number,
): CanvasRect {
  const elementRect = element.getBoundingClientRect();

  return {
    left: (elementRect.left - canvasRect.left) / canvasZoom,
    top: (elementRect.top - canvasRect.top) / canvasZoom,
    width: elementRect.width / canvasZoom,
    height: elementRect.height / canvasZoom,
  };
}

function getElementText(element: HTMLElement): string {
  if (element instanceof HTMLTextAreaElement) {
    return element.value;
  }

  return element.innerText || element.textContent || "";
}

function parseCssDashArray(value: string): number[] {
  if (!value || value === "none") {
    return [];
  }

  return value
    .split(/[,\s]+/)
    .map((part) => Number.parseFloat(part))
    .filter((part) => Number.isFinite(part) && part > 0);
}

function parseCssPixels(value: string, fallback: number): number {
  const parsedValue = Number.parseFloat(value);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function parseLineHeight(value: string, fontSize: number): number {
  const parsedLineHeight = Number.parseFloat(value);

  return Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.2;
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
  const canvasZoom = getRenderedCanvasZoom(element);
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
        left: Math.min(bounds.left, (cellRect.left - canvasRect.left) / canvasZoom),
        top: Math.min(bounds.top, (cellRect.top - canvasRect.top) / canvasZoom),
        right: Math.max(
          bounds.right,
          (cellRect.right - canvasRect.left) / canvasZoom,
        ),
        bottom: Math.max(
          bounds.bottom,
          (cellRect.bottom - canvasRect.top) / canvasZoom,
        ),
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

function getRenderedCanvasZoom(element: HTMLElement): number {
  const zoomElement = element.closest<HTMLElement>("[data-canvas-zoom]");
  const zoom = Number.parseFloat(zoomElement?.dataset.canvasZoom ?? "1");

  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
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
      return isReportTargetType(fromNode) && toNode.type === "vertical";
    }

    if (connection.connectionType === "belongs_to_vertical") {
      return fromNode.type === "vertical" && isReportTargetType(toNode);
    }

    return isReportTargetType(fromNode) && isReportTargetType(toNode);
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
  if (isReportTargetType(parentNode) && childNode.type === "vertical") {
    return "owns_vertical";
  }

  if (isReportTargetType(parentNode) && isReportTargetType(childNode)) {
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

function createPlacementConnections(
  selectedNode: OrgNode | null,
  newNode: OrgNode,
  chart: OrgChart,
): OrgConnection[] {
  if (!selectedNode) {
    return [];
  }

  if (selectedNode.type === "employee") {
    const connectionType =
      newNode.type === "vertical" ? "owns_vertical" : "reports_to";

    return [
      {
        id: `${connectionType}-${selectedNode.id}-${newNode.id}`,
        fromNodeId: selectedNode.id,
        toNodeId: newNode.id,
        connectionType,
      },
    ];
  }

  if (selectedNode.type === "open_role" || selectedNode.type === "approved_role") {
    const connectionType =
      newNode.type === "vertical" ? "owns_vertical" : "reports_to";

    return [
      {
        id: `${connectionType}-${selectedNode.id}-${newNode.id}`,
        fromNodeId: selectedNode.id,
        toNodeId: newNode.id,
        connectionType,
      },
    ];
  }

  if (selectedNode.type === "vertical" && newNode.type !== "vertical") {
    const placementConnections: OrgConnection[] = [
      {
        id: `belongs-to-${selectedNode.id}-${newNode.id}`,
        fromNodeId: selectedNode.id,
        toNodeId: newNode.id,
        connectionType: "belongs_to_vertical",
      },
    ];
    const verticalOwnerConnection = chart.connections.find(
      (connection) =>
        connection.connectionType === "owns_vertical" &&
        connection.toNodeId === selectedNode.id,
    );
    const verticalOwnerNode = verticalOwnerConnection
      ? chart.nodes.find((node) => node.id === verticalOwnerConnection.fromNodeId)
      : null;

    if (newNode.type === "employee" && verticalOwnerNode?.type === "employee") {
      placementConnections.push({
        id: `reports-to-${verticalOwnerNode.id}-${newNode.id}`,
        fromNodeId: verticalOwnerNode.id,
        toNodeId: newNode.id,
        connectionType: "reports_to",
      });
    }

    return placementConnections;
  }

  return [];
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
