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
  onAddFirstEmployee: () => void;
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
  onAddFirstEmployee,
  onSelectNode,
  onSelectTextBox,
}: OrgChartCanvasProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_CANVAS_ZOOM);
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<
    Set<CanvasFilterNodeType>
  >(() => new Set(filterNodeTypes.map((option) => option.value)));
  const [connectionDrag, setConnectionDrag] = useState<ConnectionDragState | null>(
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
    <section className="canvas-shell" aria-label={`${chart.name} org chart`}>
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
              {shouldShowStarterHelp ? (
                <div className="canvas-starter-help" role="status">
                  <h2>
                    {chart.nodes.length === 0
                      ? "Start your org chart"
                      : "Keep building"}
                  </h2>
                  <p>
                    {chart.nodes.length === 0
                      ? "Add the first employee to begin building reporting lines."
                      : "Add another employee to start defining the reporting line."}
                  </p>
                  <button type="button" onClick={onAddFirstEmployee}>
                    Add employee
                  </button>
                </div>
              ) : null}
              {layout.nodes.map((layoutNode) => (
                <OrgNodeCard
                  key={layoutNode.node.id}
                  layoutNode={layoutNode}
                  isSelected={getSelectableNodeId(layoutNode.node) === selectedNodeId}
                  onBeginConnectionDrag={startConnectionDrag}
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
