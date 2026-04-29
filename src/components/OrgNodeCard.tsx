import type {
  CSSProperties,
  ChangeEvent,
  KeyboardEvent,
  PointerEvent,
} from "react";
import type { OrgNode } from "../types/orgChart";
import { getNodeDisplayText } from "../utils/display";
import type { ConnectionHandlePosition } from "./OrgChartCanvas";
import type { LayoutNode } from "../utils/layout";

interface OrgNodeCardProps {
  layoutNode: LayoutNode;
  isSelected: boolean;
  isOrderDragging: boolean;
  orderDragOffsetX: number;
  onBeginConnectionDrag: (
    layoutNode: LayoutNode,
    handlePosition: ConnectionHandlePosition,
    clientX: number,
    clientY: number,
  ) => void;
  onBeginNodeOrderDrag: (
    layoutNode: LayoutNode,
    pointerId: number,
    clientX: number,
  ) => void;
  onChangeNode: (node: OrgNode) => void;
  onSelect: (nodeId: string) => void;
}

export function OrgNodeCard({
  layoutNode,
  isSelected,
  isOrderDragging,
  orderDragOffsetX,
  onBeginConnectionDrag,
  onBeginNodeOrderDrag,
  onChangeNode,
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
  const nodeBackgroundColor =
    layoutNode.node.type === "report_list"
      ? undefined
      : layoutNode.node.backgroundColor;

  return (
    <div
      role="button"
      tabIndex={0}
      className={`org-node-card org-node-card--${layoutNode.node.type} ${
        isSelected ? "org-node-card--selected" : ""
      } ${isOrderDragging ? "org-node-card--order-dragging" : ""}`}
      style={{
        transform: `translate(${layoutNode.x + orderDragOffsetX}px, ${layoutNode.y}px)`,
        width: layoutNode.width,
        height: layoutNode.height,
        ...(nodeBackgroundColor ? { backgroundColor: nodeBackgroundColor } : {}),
      }}
      aria-pressed={isSelected}
      data-node-id={
        layoutNode.node.type === "report_list" ? undefined : layoutNode.node.id
      }
      onPointerDown={(event) => {
        if (
          event.button !== 0 ||
          layoutNode.node.type === "report_list" ||
          isNodeOrderDragIgnoredTarget(event.target)
        ) {
          return;
        }

        onSelect(selectableNodeId);
        onBeginNodeOrderDrag(layoutNode, event.pointerId, event.clientX);
      }}
      onClick={() => onSelect(selectableNodeId)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(selectableNodeId);
        }
      }}
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
      {layoutNode.node.type === "report_list" ? (
        <ul className="report-list-node-items">
          {layoutNode.node.reports.map((report) => {
            const reportDisplayText = getNodeDisplayText(report);

            return (
              <li
                key={report.id}
                className={`report-list-node-item report-list-node-item--${report.type}`}
              >
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
          <NodeEditableFields
            isSelected={isSelected}
            node={layoutNode.node}
            onChangeNode={onChangeNode}
          />
        )
      )}
    </div>
  );
}

interface NodeEditableFieldsProps {
  isSelected: boolean;
  node: OrgNode;
  onChangeNode: (node: OrgNode) => void;
}

function NodeEditableFields({
  isSelected,
  node,
  onChangeNode,
}: NodeEditableFieldsProps) {
  if (node.type === "employee") {
    return (
      <>
        <EditableNodeField
          className="node-primary"
          isEditable={isSelected}
          label="Name"
          value={node.name}
          onChange={(name) => onChangeNode({ ...node, name })}
        />
        <EditableNodeField
          className="node-secondary"
          isEditable={isSelected}
          label="Job title"
          value={node.jobTitle}
          onChange={(jobTitle) => onChangeNode({ ...node, jobTitle })}
        />
      </>
    );
  }

  if (node.type === "vertical") {
    return (
      <EditableNodeField
        className="node-primary"
        isEditable={isSelected}
        label="Vertical name"
        value={node.verticalName}
        onChange={(verticalName) => onChangeNode({ ...node, verticalName })}
      />
    );
  }

  return (
    <>
      <EditableNodeField
        className="node-primary"
        isEditable={isSelected}
        label="Status label"
        value={node.statusLabel}
        onChange={(statusLabel) => onChangeNode({ ...node, statusLabel })}
      />
      <EditableNodeField
        className="node-secondary"
        isEditable={isSelected}
        label="Role title"
        value={node.roleTitle}
        onChange={(roleTitle) => onChangeNode({ ...node, roleTitle })}
      />
    </>
  );
}

interface EditableNodeFieldProps {
  className: string;
  isEditable: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function EditableNodeField({
  className,
  isEditable,
  label,
  value,
  onChange,
}: EditableNodeFieldProps) {
  const fieldStyle = getNodeFieldFitStyle(value, className);

  if (!isEditable) {
    return (
      <div className={className} style={fieldStyle}>
        {value}
      </div>
    );
  }

  return (
    <textarea
      aria-label={label}
      className={`${className} node-inline-input`}
      rows={estimateTextareaRows(value, className)}
      style={fieldStyle}
      value={value}
      onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
        onChange(event.target.value)
      }
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Escape") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function getNodeFieldFitStyle(value: string, className: string): CSSProperties {
  const lineCount = estimateTextareaRows(value, className);

  if (className.includes("node-primary")) {
    if (lineCount >= 3) {
      return {
        fontSize: 13,
        lineHeight: 1.08,
      };
    }

    if (lineCount === 2) {
      return {
        fontSize: 14,
        lineHeight: 1.1,
      };
    }

    return {};
  }

  if (lineCount >= 3) {
    return {
      fontSize: 10.5,
      lineHeight: 1.08,
    };
  }

  if (lineCount === 2) {
    return {
      fontSize: 12,
      lineHeight: 1.1,
    };
  }

  return {};
}

function estimateTextareaRows(value: string, className: string): number {
  const maxCharactersPerLine = className.includes("node-primary") ? 22 : 27;

  return value.split(/\r?\n/).reduce((rowCount, line) => {
    return rowCount + Math.max(Math.ceil(line.length / maxCharactersPerLine), 1);
  }, 0);
}

function isNodeOrderDragIgnoredTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return true;
  }

  return Boolean(
    target.closest(
      "button, input, select, textarea, [contenteditable='true'], [data-connection-handle]",
    ),
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
