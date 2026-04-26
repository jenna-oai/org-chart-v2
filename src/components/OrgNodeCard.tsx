import type { PointerEvent } from "react";
import { getNodeDisplayText } from "../utils/display";
import type { ConnectionHandlePosition } from "./OrgChartCanvas";
import type { LayoutNode } from "../utils/layout";

interface OrgNodeCardProps {
  layoutNode: LayoutNode;
  isSelected: boolean;
  onBeginConnectionDrag: (
    layoutNode: LayoutNode,
    handlePosition: ConnectionHandlePosition,
    clientX: number,
    clientY: number,
  ) => void;
  onSelect: (nodeId: string) => void;
}

const nodeTypeLabels: Record<LayoutNode["node"]["type"], string> = {
  employee: "Employee",
  vertical: "Vertical",
  open_role: "Open role",
  approved_role: "Approved role",
  report_list: "Reports",
};

export function OrgNodeCard({
  layoutNode,
  isSelected,
  onBeginConnectionDrag,
  onSelect,
}: OrgNodeCardProps) {
  const selectableNodeId =
    layoutNode.node.type === "report_list"
      ? layoutNode.node.ownerNodeId
      : layoutNode.node.id;
  const displayText =
    layoutNode.node.type === "report_list"
      ? undefined
      : getNodeDisplayText(layoutNode.node);

  return (
    <button
      type="button"
      className={`org-node-card org-node-card--${layoutNode.node.type} ${
        isSelected ? "org-node-card--selected" : ""
      }`}
      style={{
        transform: `translate(${layoutNode.x}px, ${layoutNode.y}px)`,
        width: layoutNode.width,
        minHeight: layoutNode.height,
      }}
      aria-pressed={isSelected}
      data-node-id={
        layoutNode.node.type === "report_list" ? undefined : layoutNode.node.id
      }
      onClick={() => onSelect(selectableNodeId)}
    >
      {layoutNode.node.type !== "report_list" ? (
        <>
          <ConnectionHandle
            position="top"
            onPointerDown={(event) => {
              onBeginConnectionDrag(
                layoutNode,
                "top",
                event.clientX,
                event.clientY,
              );
            }}
          />
          <ConnectionHandle
            position="bottom"
            onPointerDown={(event) => {
              onBeginConnectionDrag(
                layoutNode,
                "bottom",
                event.clientX,
                event.clientY,
              );
            }}
          />
        </>
      ) : null}
      <div className="node-type-label">{nodeTypeLabels[layoutNode.node.type]}</div>
      {layoutNode.node.type === "report_list" ? (
        <ul className="report-list-node-items">
          {layoutNode.node.reports.map((report) => {
            const reportDisplayText = getNodeDisplayText(report);

            return (
              <li key={report.id}>
                <span>{reportDisplayText.primary}</span>
                {reportDisplayText.secondary ? (
                  <small>{reportDisplayText.secondary}</small>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        displayText && (
          <>
          <div className="node-primary">{displayText.primary}</div>
          {displayText.secondary ? (
            <div className="node-secondary">{displayText.secondary}</div>
          ) : null}
          </>
        )
      )}
    </button>
  );
}

interface ConnectionHandleProps {
  position: ConnectionHandlePosition;
  onPointerDown: (event: PointerEvent<HTMLSpanElement>) => void;
}

function ConnectionHandle({ position, onPointerDown }: ConnectionHandleProps) {
  return (
    <span
      className={`connection-handle connection-handle--${position}`}
      data-connection-handle={position}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onPointerDown(event);
      }}
    />
  );
}
