import { useMemo, useState } from "react";
import { AddNodePanel } from "./components/AddNodePanel";
import type { ConnectionHandlePosition } from "./components/OrgChartCanvas";
import { OrgChartCanvas } from "./components/OrgChartCanvas";
import { NodeInspector } from "./components/NodeInspector";
import { ToolbarPlaceholder } from "./components/ToolbarPlaceholder";
import { sampleChart } from "./data/sampleChart";
import type {
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
  listViewOwnerIds: Set<string>;
}

export function App() {
  const [editorState, setEditorState] = useState<EditorSnapshot>({
    chart: sampleChart,
    selectedNodeId: null,
    listViewOwnerIds: new Set(),
  });
  const [undoStack, setUndoStack] = useState<EditorSnapshot[]>([]);
  const { chart, listViewOwnerIds, selectedNodeId } = editorState;
  const validation = validateOrgChart(chart);
  const selectedNode = useMemo(
    () => chart.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [chart.nodes, selectedNodeId],
  );

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
    commitEditorState((currentState) => ({
      ...currentState,
      chart: {
        ...currentState.chart,
        nodes: currentState.chart.nodes.map((node) =>
          node.id === updatedNode.id ? updatedNode : node,
        ),
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
    if (!selectedNode) {
      return;
    }

    commitEditorState((currentState) => {
      const nodeIdToDelete = currentState.selectedNodeId;

      if (!nodeIdToDelete) {
        return currentState;
      }

      const nextListViewOwnerIds = new Set(currentState.listViewOwnerIds);
      nextListViewOwnerIds.delete(nodeIdToDelete);

      return {
        ...currentState,
        selectedNodeId: null,
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

  return (
    <main className="app-shell">
      <ToolbarPlaceholder chartName={chart.name} />
      <div className="workspace-layout">
        {validation.isValid ? (
          <OrgChartCanvas
            chart={chart}
            listViewOwnerIds={listViewOwnerIds}
            selectedNodeId={selectedNodeId}
            onCreateConnection={createDraggedConnection}
            onSelectNode={(nodeId) =>
              setEditorState((currentState) => ({
                ...currentState,
                selectedNodeId: nodeId,
              }))
            }
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
          <EditorActionsPanel
            canDelete={Boolean(selectedNode)}
            canUndo={undoStack.length > 0}
            onDelete={deleteSelectedNode}
            onUndo={undo}
          />
          <AddNodePanel selectedNode={selectedNode} onAddNode={addNode} />
          <NodeInspector
            chart={chart}
            node={selectedNode}
            onChange={updateNode}
            onChangeManager={updateManager}
            onChangeOwnedVertical={updateOwnedVertical}
            onChangeVertical={updateVertical}
            listViewOwnerIds={listViewOwnerIds}
            onToggleListView={toggleListView}
          />
        </aside>
      </div>
    </main>
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
    listViewOwnerIds: new Set(snapshot.listViewOwnerIds),
  };
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
      name: `New Employee ${nodeNumber}`,
      jobTitle: "Job title",
    };
  }

  if (nodeType === "vertical") {
    return {
      id,
      type: "vertical",
      verticalName: `New Vertical ${nodeNumber}`,
    };
  }

  if (nodeType === "open_role") {
    return {
      id,
      type: "open_role",
      statusLabel: "Open Role",
      roleTitle: `New Role ${nodeNumber}`,
    };
  }

  return {
    id,
    type: "approved_role",
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
