import { useEffect, useMemo, useRef, useState } from "react";
import type { OrgChart } from "../types/orgChart";
import { calculateOrgChartLayout, type LayoutNode } from "../utils/layout";
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

interface OrgChartCanvasProps {
  chart: OrgChart;
  listViewOwnerIds: Set<string>;
  selectedNodeId: string | null;
  onCreateConnection: (
    fromNodeId: string,
    fromHandlePosition: ConnectionHandlePosition,
    toNodeId: string,
    toHandlePosition: ConnectionHandlePosition,
  ) => void;
  onSelectNode: (nodeId: string) => void;
}

export function OrgChartCanvas({
  chart,
  listViewOwnerIds,
  selectedNodeId,
  onCreateConnection,
  onSelectNode,
}: OrgChartCanvasProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [connectionDrag, setConnectionDrag] = useState<ConnectionDragState | null>(
    null,
  );
  const layout = useMemo(
    () => calculateOrgChartLayout(chart, listViewOwnerIds),
    [chart, listViewOwnerIds],
  );

  useEffect(() => {
    if (!connectionDrag) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      setConnectionDrag((currentDrag) =>
        currentDrag
          ? {
              ...currentDrag,
              current: getCanvasPoint(event.clientX, event.clientY, canvasRef.current),
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
  }, [connectionDrag, onCreateConnection]);

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
      current: getCanvasPoint(clientX, clientY, canvasRef.current),
    });
  };

  return (
    <section className="canvas-shell" aria-label={`${chart.name} org chart`}>
      <div
        ref={canvasRef}
        className="org-chart-canvas"
        style={{
          width: layout.width,
          height: layout.height,
        }}
      >
        <svg
          className="connection-layer"
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
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
              onBeginConnectionDrag={startConnectionDrag}
              onSelect={onSelectNode}
            />
          ))}
        </div>
      </div>
    </section>
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
): CanvasPoint {
  if (!canvasElement) {
    return { x: clientX, y: clientY };
  }

  const canvasRect = canvasElement.getBoundingClientRect();

  return {
    x: clientX - canvasRect.left,
    y: clientY - canvasRect.top,
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
