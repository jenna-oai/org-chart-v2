import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CanvasTextBox as CanvasTextBoxModel,
  OrgChart,
  OrgConnection,
  OrgNode,
  OrgNodeType,
} from "../types/orgChart";
import { calculateOrgChartLayout, type LayoutNode } from "../utils/layout";
import { CanvasTextBox } from "./CanvasTextBox";
import { OrgConnectionLine } from "./OrgConnectionLine";
import { OrgNodeCard } from "./OrgNodeCard";

interface CanvasPoint {
  x: number;
  y: number;
}

export type ConnectionHandlePosition = "top" | "bottom";

interface ConnectionDragState {
  fromNodeId: string;
  fromHandlePosition: ConnectionHandlePosition;
  start: CanvasPoint;
  current: CanvasPoint;
}

interface NodeOrderDragState {
  nodeId: string;
  pointerId: number;
  startClientX: number;
  currentClientX: number;
  hasMoved: boolean;
}

const MIN_CANVAS_ZOOM = 0.5;
const MAX_CANVAS_ZOOM = 1.5;
const DEFAULT_CANVAS_ZOOM = 1;
const CANVAS_ZOOM_STEP = 0.05;
type CanvasFilterNodeType = Extract<
  OrgNodeType,
  "employee" | "open_role" | "approved_role"
>;
const filterNodeTypes: Array<{
  label: string;
  value: CanvasFilterNodeType;
}> = [
  { label: "Employee", value: "employee" },
  { label: "Open Role", value: "open_role" },
  { label: "Approved Role", value: "approved_role" },
];

interface OrgChartCanvasProps {
  chart: OrgChart;
  listViewOwnerIds: Set<string>;
  selectedNodeId: string | null;
  selectedTextBoxId: string | null;
  textBoxes: CanvasTextBoxModel[];
  onCreateConnection: (
    fromNodeId: string,
    fromHandlePosition: ConnectionHandlePosition,
    toNodeId: string,
    toHandlePosition: ConnectionHandlePosition,
  ) => void;
  onChangeNode: (node: OrgNode) => void;
  onChangeTextBox: (textBox: CanvasTextBoxModel) => void;
  onReorderNodes: (orderedNodeIds: string[]) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectTextBox: (textBoxId: string) => void;
}

export function OrgChartCanvas({
  chart,
  listViewOwnerIds,
  selectedNodeId,
  selectedTextBoxId,
  textBoxes,
  onCreateConnection,
  onChangeNode,
  onChangeTextBox,
  onReorderNodes,
  onSelectNode,
  onSelectTextBox,
}: OrgChartCanvasProps) {
  const shellRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_CANVAS_ZOOM);
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<
    Set<CanvasFilterNodeType>
  >(() => new Set(filterNodeTypes.map((option) => option.value)));
  const [connectionDrag, setConnectionDrag] = useState<ConnectionDragState | null>(
    null,
  );
  const [nodeOrderDrag, setNodeOrderDrag] = useState<NodeOrderDragState | null>(
    null,
  );
  const filteredChart = useMemo(
    () => getFilteredChart(chart, visibleNodeTypes),
    [chart, visibleNodeTypes],
  );
  const layout = useMemo(
    () => calculateOrgChartLayout(filteredChart, listViewOwnerIds),
    [filteredChart, listViewOwnerIds],
  );
  const canvasWidth = Math.max(
    layout.width,
    ...textBoxes.map((textBox) => textBox.x + textBox.width + 48),
  );
  const canvasHeight = Math.max(
    layout.height,
    ...textBoxes.map((textBox) => textBox.y + textBox.height + 48),
  );
  const shouldShowStarterHelp = chart.nodes.length <= 1;

  const changeZoom = (delta: number) => {
    setZoom((currentZoom) => clampZoom(currentZoom + delta));
  };

  useEffect(() => {
    if (!connectionDrag) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      setConnectionDrag((currentDrag) =>
        currentDrag
          ? {
              ...currentDrag,
              current: getCanvasPoint(
                event.clientX,
                event.clientY,
                canvasRef.current,
                zoom,
              ),
            }
          : null,
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      const dropTarget = getConnectionHandleAtPoint(event.clientX, event.clientY);
      const fromNodeId = connectionDrag.fromNodeId;

      setConnectionDrag(null);

      if (dropTarget && dropTarget.nodeId !== fromNodeId) {
        onCreateConnection(
          fromNodeId,
          connectionDrag.fromHandlePosition,
          dropTarget.nodeId,
          dropTarget.handlePosition,
        );
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [connectionDrag, onCreateConnection, zoom]);

  useEffect(() => {
    if (!nodeOrderDrag) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== nodeOrderDrag.pointerId) {
        return;
      }

      setNodeOrderDrag((currentDrag) => {
        if (!currentDrag) {
          return null;
        }

        const deltaX = (event.clientX - currentDrag.startClientX) / zoom;

        return {
          ...currentDrag,
          currentClientX: event.clientX,
          hasMoved: currentDrag.hasMoved || Math.abs(deltaX) > 6,
        };
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== nodeOrderDrag.pointerId) {
        return;
      }

      const completedDrag = {
        ...nodeOrderDrag,
        currentClientX: event.clientX,
        hasMoved:
          nodeOrderDrag.hasMoved ||
          Math.abs((event.clientX - nodeOrderDrag.startClientX) / zoom) > 6,
      };
      const orderedNodeIds = completedDrag.hasMoved
        ? getOrderedNodeIdsAfterHorizontalDrag(layout, completedDrag, zoom)
        : null;

      setNodeOrderDrag(null);

      if (orderedNodeIds) {
        onReorderNodes(orderedNodeIds);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [layout, nodeOrderDrag, onReorderNodes, zoom]);

  useEffect(() => {
    const handleKeyboardZoom = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableKeyboardTarget(event.target)
      ) {
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        changeZoom(CANVAS_ZOOM_STEP);
        return;
      }

      if (event.key === "-") {
        event.preventDefault();
        changeZoom(-CANVAS_ZOOM_STEP);
        return;
      }

      if (event.key === "1") {
        event.preventDefault();
        setZoom(DEFAULT_CANVAS_ZOOM);
      }
    };

    window.addEventListener("keydown", handleKeyboardZoom);

    return () => {
      window.removeEventListener("keydown", handleKeyboardZoom);
    };
  }, []);

  useEffect(() => {
    const shellElement = shellRef.current;

    if (!shellElement) {
      return;
    }

    const handlePinchZoom = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      event.preventDefault();
      const zoomDelta = event.deltaY < 0 ? CANVAS_ZOOM_STEP : -CANVAS_ZOOM_STEP;
      changeZoom(zoomDelta);
    };

    shellElement.addEventListener("wheel", handlePinchZoom, { passive: false });

    return () => {
      shellElement.removeEventListener("wheel", handlePinchZoom);
    };
  }, []);

  const startConnectionDrag = (
    layoutNode: LayoutNode,
    handlePosition: ConnectionHandlePosition,
    clientX: number,
    clientY: number,
  ) => {
    const start =
      handlePosition === "top"
        ? {
            x: layoutNode.x + layoutNode.width / 2,
            y: layoutNode.y,
          }
        : {
            x: layoutNode.x + layoutNode.width / 2,
            y: layoutNode.y + layoutNode.height,
          };

    setConnectionDrag({
      fromNodeId: layoutNode.node.id,
      fromHandlePosition: handlePosition,
      start,
      current: getCanvasPoint(clientX, clientY, canvasRef.current, zoom),
    });
  };

  const startNodeOrderDrag = (
    layoutNode: LayoutNode,
    pointerId: number,
    clientX: number,
  ) => {
    if (layoutNode.node.type === "report_list") {
      return;
    }

    setNodeOrderDrag({
      nodeId: layoutNode.node.id,
      pointerId,
      startClientX: clientX,
      currentClientX: clientX,
      hasMoved: false,
    });
  };

  const toggleFilterNodeType = (
    nodeType: CanvasFilterNodeType,
    isVisible: boolean,
  ) => {
    setVisibleNodeTypes((currentVisibleNodeTypes) => {
      const nextVisibleNodeTypes = new Set(currentVisibleNodeTypes);

      if (isVisible) {
        nextVisibleNodeTypes.add(nodeType);
      } else {
        nextVisibleNodeTypes.delete(nodeType);
      }

      return nextVisibleNodeTypes;
    });
  };

  return (
    <section
      ref={shellRef}
      className="canvas-shell"
      aria-label={`${chart.name} org chart`}
    >
      <div
        className="canvas-zoom-stage"
        data-canvas-zoom={zoom}
        style={{
          width: canvasWidth * zoom,
          height: canvasHeight * zoom,
        }}
      >
        <div
          className="canvas-zoom-content"
          style={{
            transform: `scale(${zoom})`,
          }}
        >
          <div
            ref={canvasRef}
            className={`org-chart-canvas ${
              connectionDrag ? "org-chart-canvas--dragging-connection" : ""
            } ${
              nodeOrderDrag ? "org-chart-canvas--ordering-node" : ""
            } ${
              shouldShowStarterHelp ? "org-chart-canvas--starter-help" : ""
            }`}
            style={{
              width: canvasWidth,
              height: canvasHeight,
            }}
          >
            <svg
              className="connection-layer"
              width={canvasWidth}
              height={canvasHeight}
              viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
              aria-hidden="true"
            >
              {layout.connections.map((connection) => (
                <OrgConnectionLine
                  key={connection.id}
                  connection={connection}
                  fromNode={layout.nodePositions.get(connection.fromNodeId)}
                  toNode={layout.nodePositions.get(connection.toNodeId)}
                />
              ))}
              {connectionDrag ? (
                <line
                  className="connection-drag-line"
                  x1={connectionDrag.start.x}
                  y1={connectionDrag.start.y}
                  x2={connectionDrag.current.x}
                  y2={connectionDrag.current.y}
                />
              ) : null}
            </svg>
            <div className="node-layer">
              {layout.nodes.map((layoutNode) => (
                <OrgNodeCard
                  key={layoutNode.node.id}
                  layoutNode={layoutNode}
                  isSelected={getSelectableNodeId(layoutNode.node) === selectedNodeId}
                  orderDragOffsetX={getNodeOrderDragOffsetX(
                    layoutNode,
                    nodeOrderDrag,
                    zoom,
                  )}
                  isOrderDragging={nodeOrderDrag?.nodeId === layoutNode.node.id}
                  onBeginConnectionDrag={startConnectionDrag}
                  onBeginNodeOrderDrag={startNodeOrderDrag}
                  onChangeNode={onChangeNode}
                  onSelect={onSelectNode}
                />
              ))}
              {textBoxes.map((textBox) => (
                <CanvasTextBox
                  key={textBox.id}
                  textBox={textBox}
                  isSelected={textBox.id === selectedTextBoxId}
                  zoom={zoom}
                  onChange={onChangeTextBox}
                  onSelect={onSelectTextBox}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      {shouldShowStarterHelp ? (
        <div className="canvas-starter-help" role="status">
          <h2>
            {chart.nodes.length === 0
              ? "Start in the sidebar"
              : "Keep going in the sidebar"}
          </h2>
          <p>
            {chart.nodes.length === 0
              ? "Use Add New in the sidebar and choose Employee."
              : "Use Add New in the sidebar to add another employee or role."}
          </p>
        </div>
      ) : null}
      <div className="canvas-controls" aria-label="Canvas controls">
        <details className="canvas-filter-control">
          <summary>Filter</summary>
          <fieldset>
            <legend>Node type</legend>
            {filterNodeTypes.map((option) => (
              <label key={option.value}>
                <input
                  checked={visibleNodeTypes.has(option.value)}
                  type="checkbox"
                  onChange={(event) =>
                    toggleFilterNodeType(option.value, event.target.checked)
                  }
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
        </details>
        <div
          className="canvas-zoom-control"
          role="group"
          aria-label="Canvas zoom"
        >
          <span>Zoom</span>
          <button
            aria-label="Zoom out"
            className="canvas-zoom-button"
            type="button"
            onClick={() => changeZoom(-CANVAS_ZOOM_STEP)}
          >
            -
          </button>
          <input
            aria-label="Canvas zoom"
            max={MAX_CANVAS_ZOOM}
            min={MIN_CANVAS_ZOOM}
            step={CANVAS_ZOOM_STEP}
            type="range"
            value={zoom}
            onChange={(event) => setZoom(clampZoom(Number(event.target.value)))}
            onInput={(event) =>
              setZoom(clampZoom(Number(event.currentTarget.value)))
            }
          />
          <output>{Math.round(zoom * 100)}%</output>
          <button
            aria-label="Zoom in"
            className="canvas-zoom-button"
            type="button"
            onClick={() => changeZoom(CANVAS_ZOOM_STEP)}
          >
            +
          </button>
        </div>
      </div>
    </section>
  );
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, zoom));
}

function getNodeOrderDragOffsetX(
  layoutNode: LayoutNode,
  nodeOrderDrag: NodeOrderDragState | null,
  zoom: number,
): number {
  if (!nodeOrderDrag || nodeOrderDrag.nodeId !== layoutNode.node.id) {
    return 0;
  }

  return (nodeOrderDrag.currentClientX - nodeOrderDrag.startClientX) / zoom;
}

function getOrderedNodeIdsAfterHorizontalDrag(
  layout: ReturnType<typeof calculateOrgChartLayout>,
  nodeOrderDrag: NodeOrderDragState,
  zoom: number,
): string[] | null {
  const siblingNodes = getReorderSiblingLayoutNodes(layout, nodeOrderDrag.nodeId);

  if (siblingNodes.length < 2) {
    return null;
  }

  const draggedNode = siblingNodes.find(
    (layoutNode) => layoutNode.node.id === nodeOrderDrag.nodeId,
  );

  if (!draggedNode) {
    return null;
  }

  const dragOffsetX =
    (nodeOrderDrag.currentClientX - nodeOrderDrag.startClientX) / zoom;
  const draggedCenterX = draggedNode.x + draggedNode.width / 2 + dragOffsetX;
  const orderedSiblingNodes = [...siblingNodes].sort(
    (firstNode, secondNode) => firstNode.x - secondNode.x,
  );
  const siblingNodesWithoutDragged = orderedSiblingNodes.filter(
    (layoutNode) => layoutNode.node.id !== nodeOrderDrag.nodeId,
  );
  const insertionIndex = siblingNodesWithoutDragged.findIndex((layoutNode) => {
    return draggedCenterX < layoutNode.x + layoutNode.width / 2;
  });
  const nextSiblingNodes = [...siblingNodesWithoutDragged];

  nextSiblingNodes.splice(
    insertionIndex === -1 ? nextSiblingNodes.length : insertionIndex,
    0,
    draggedNode,
  );

  const orderedNodeIds = nextSiblingNodes
    .map((layoutNode) => layoutNode.node.id)
    .filter((nodeId) => !nodeId.startsWith("report-list-"));
  const currentNodeIds = orderedSiblingNodes
    .map((layoutNode) => layoutNode.node.id)
    .filter((nodeId) => !nodeId.startsWith("report-list-"));

  return orderedNodeIds.every((nodeId, index) => nodeId === currentNodeIds[index])
    ? null
    : orderedNodeIds;
}

function getReorderSiblingLayoutNodes(
  layout: ReturnType<typeof calculateOrgChartLayout>,
  nodeId: string,
): LayoutNode[] {
  const incomingConnection = layout.connections.find(
    (connection) => connection.toNodeId === nodeId,
  );

  if (!incomingConnection) {
    const childNodeIds = new Set(
      layout.connections.map((connection) => connection.toNodeId),
    );

    return layout.nodes
      .filter(
        (layoutNode) =>
          !childNodeIds.has(layoutNode.node.id) &&
          layoutNode.node.type !== "report_list",
      )
      .sort((firstNode, secondNode) => firstNode.x - secondNode.x);
  }

  return layout.connections
    .filter((connection) => connection.fromNodeId === incomingConnection.fromNodeId)
    .map((connection) => layout.nodePositions.get(connection.toNodeId))
    .filter(
      (layoutNode): layoutNode is LayoutNode =>
        layoutNode !== undefined && layoutNode.node.type !== "report_list",
    )
    .sort((firstNode, secondNode) => firstNode.x - secondNode.x);
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  if (tagName === "textarea" || tagName === "select") {
    return true;
  }

  if (tagName === "input") {
    const input = target as HTMLInputElement;
    return [
      "email",
      "number",
      "password",
      "search",
      "tel",
      "text",
      "url",
    ].includes(input.type);
  }

  return target.isContentEditable;
}

function getFilteredChart(
  chart: OrgChart,
  visibleNodeTypes: Set<CanvasFilterNodeType>,
): OrgChart {
  const nodes = chart.nodes.filter(
    (node) => node.type === "vertical" || visibleNodeTypes.has(node.type),
  );
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const visibleConnections = chart.connections.filter(
    (connection) =>
      visibleNodeIds.has(connection.fromNodeId) &&
      visibleNodeIds.has(connection.toNodeId),
  );
  const bridgedConnections = getFilterBridgeConnections(chart, visibleNodeIds);
  const connectionsByKey = new Map<string, OrgConnection>();

  for (const connection of [...visibleConnections, ...bridgedConnections]) {
    connectionsByKey.set(getConnectionKey(connection), connection);
  }

  return {
    ...chart,
    nodes,
    connections: Array.from(connectionsByKey.values()),
  };
}

function getFilterBridgeConnections(
  chart: OrgChart,
  visibleNodeIds: Set<string>,
): OrgConnection[] {
  const hiddenReportTargetIds = new Set(
    chart.nodes
      .filter((node) => !visibleNodeIds.has(node.id) && isReportTargetNode(node))
      .map((node) => node.id),
  );

  if (hiddenReportTargetIds.size === 0) {
    return [];
  }

  const reportManagerByNodeId = new Map<string, string>();
  const reportChildrenByNodeId = new Map<string, string[]>();
  const ownedVerticalsByNodeId = new Map<string, string[]>();

  for (const connection of chart.connections) {
    if (connection.connectionType === "reports_to") {
      reportManagerByNodeId.set(connection.toNodeId, connection.fromNodeId);
      const reportChildren =
        reportChildrenByNodeId.get(connection.fromNodeId) ?? [];
      reportChildren.push(connection.toNodeId);
      reportChildrenByNodeId.set(connection.fromNodeId, reportChildren);
    }

    if (connection.connectionType === "owns_vertical") {
      const ownedVerticals = ownedVerticalsByNodeId.get(connection.fromNodeId) ?? [];
      ownedVerticals.push(connection.toNodeId);
      ownedVerticalsByNodeId.set(connection.fromNodeId, ownedVerticals);
    }
  }

  const bridgeConnections: OrgConnection[] = [];

  for (const hiddenNodeId of hiddenReportTargetIds) {
    const visibleManagerId = getNearestVisibleReportManager(
      hiddenNodeId,
      visibleNodeIds,
      reportManagerByNodeId,
    );

    if (!visibleManagerId) {
      continue;
    }

    for (const visibleReportId of getNearestVisibleReportsBelowHiddenNode(
      hiddenNodeId,
      visibleNodeIds,
      reportChildrenByNodeId,
      hiddenReportTargetIds,
    )) {
      bridgeConnections.push({
        id: `filter-bridge-reports-to-${visibleManagerId}-${visibleReportId}`,
        fromNodeId: visibleManagerId,
        toNodeId: visibleReportId,
        connectionType: "reports_to",
      });
    }

    for (const verticalId of ownedVerticalsByNodeId.get(hiddenNodeId) ?? []) {
      if (!visibleNodeIds.has(verticalId)) {
        continue;
      }

      bridgeConnections.push({
        id: `filter-bridge-owns-vertical-${visibleManagerId}-${verticalId}`,
        fromNodeId: visibleManagerId,
        toNodeId: verticalId,
        connectionType: "owns_vertical",
      });
    }
  }

  return bridgeConnections;
}

function getNearestVisibleReportManager(
  nodeId: string,
  visibleNodeIds: Set<string>,
  reportManagerByNodeId: Map<string, string>,
): string | null {
  const visitedNodeIds = new Set<string>();
  let currentManagerId = reportManagerByNodeId.get(nodeId);

  while (currentManagerId && !visitedNodeIds.has(currentManagerId)) {
    if (visibleNodeIds.has(currentManagerId)) {
      return currentManagerId;
    }

    visitedNodeIds.add(currentManagerId);
    currentManagerId = reportManagerByNodeId.get(currentManagerId);
  }

  return null;
}

function getNearestVisibleReportsBelowHiddenNode(
  nodeId: string,
  visibleNodeIds: Set<string>,
  reportChildrenByNodeId: Map<string, string[]>,
  hiddenReportTargetIds: Set<string>,
): string[] {
  const visibleReportIds: string[] = [];
  const visitedNodeIds = new Set<string>();
  const nodeIdsToVisit = [...(reportChildrenByNodeId.get(nodeId) ?? [])];

  while (nodeIdsToVisit.length > 0) {
    const currentNodeId = nodeIdsToVisit.shift();

    if (!currentNodeId || visitedNodeIds.has(currentNodeId)) {
      continue;
    }

    visitedNodeIds.add(currentNodeId);

    if (visibleNodeIds.has(currentNodeId)) {
      visibleReportIds.push(currentNodeId);
      continue;
    }

    if (hiddenReportTargetIds.has(currentNodeId)) {
      nodeIdsToVisit.push(...(reportChildrenByNodeId.get(currentNodeId) ?? []));
    }
  }

  return visibleReportIds;
}

function getConnectionKey(connection: OrgConnection): string {
  return `${connection.connectionType}:${connection.fromNodeId}:${connection.toNodeId}`;
}

function isReportTargetNode(node: OrgNode): boolean {
  return (
    node.type === "employee" ||
    node.type === "open_role" ||
    node.type === "approved_role"
  );
}

function getSelectableNodeId(layoutNode: { id: string; type: string }): string {
  if (
    layoutNode.type === "report_list" &&
    "ownerNodeId" in layoutNode &&
    typeof layoutNode.ownerNodeId === "string"
  ) {
    return layoutNode.ownerNodeId;
  }

  return layoutNode.id;
}

function getCanvasPoint(
  clientX: number,
  clientY: number,
  canvasElement: HTMLDivElement | null,
  zoom: number,
): CanvasPoint {
  if (!canvasElement) {
    return { x: clientX, y: clientY };
  }

  const canvasRect = canvasElement.getBoundingClientRect();

  return {
    x: (clientX - canvasRect.left) / zoom,
    y: (clientY - canvasRect.top) / zoom,
  };
}

function getConnectionHandleAtPoint(
  clientX: number,
  clientY: number,
): { nodeId: string; handlePosition: ConnectionHandlePosition } | null {
  const elementAtPoint = document.elementFromPoint(clientX, clientY);
  const handleElement = elementAtPoint?.closest("[data-connection-handle]");
  const nodeElement = handleElement?.closest("[data-node-id]");
  const nodeId = nodeElement?.getAttribute("data-node-id");
  const handlePosition = handleElement?.getAttribute("data-connection-handle");

  if (
    !nodeId ||
    (handlePosition !== "top" && handlePosition !== "bottom")
  ) {
    return null;
  }

  return {
    nodeId,
    handlePosition,
  };
}
