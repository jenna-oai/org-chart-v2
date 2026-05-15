import type { OrgConnection, UplineConnectionStyle } from "../types/orgChart";
import type { LayoutNode } from "../utils/layout";

interface OrgConnectionLineProps {
  connection: OrgConnection;
  fromNode: LayoutNode | undefined;
  toNode: LayoutNode | undefined;
}

export function OrgConnectionLine({
  connection,
  fromNode,
  toNode,
}: OrgConnectionLineProps) {
  if (!fromNode || !toNode) {
    return null;
  }

  const path = getConnectionPath(connection, fromNode, toNode);
  const uplineStyle = getUplineConnectionStyle(connection, toNode);

  return (
    <path
      className={`connection-line connection-line--${connection.connectionType} connection-line--style-${uplineStyle}`}
      d={path}
      fill="none"
    />
  );
}

function getConnectionPath(
  connection: OrgConnection,
  fromNode: LayoutNode,
  toNode: LayoutNode,
): string {
  if (connection.connectionType === "reports_to" && toNode.node.type === "ebp") {
    const branchesRight = toNode.x >= fromNode.x;
    const startX = branchesRight ? fromNode.x + fromNode.width : fromNode.x;
    const startY = fromNode.y + fromNode.height / 2;
    const endX = branchesRight ? toNode.x : toNode.x + toNode.width;
    const endY = toNode.y + toNode.height / 2;
    const midX = startX + (endX - startX) / 2;

    return `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`;
  }

  const startX = fromNode.x + fromNode.width / 2;
  const startY = fromNode.y + fromNode.height;
  const endX = toNode.x + toNode.width / 2;
  const endY = toNode.y;
  const midY = startY + Math.max((endY - startY) / 2, 24);

  return `M ${startX} ${startY} V ${midY} H ${endX} V ${endY}`;
}

function getUplineConnectionStyle(
  connection: OrgConnection,
  node: LayoutNode,
): UplineConnectionStyle {
  if (connection.connectionStyle) {
    return connection.connectionStyle;
  }

  if ("uplineConnectionStyle" in node.node) {
    return node.node.uplineConnectionStyle ?? "solid";
  }

  return "solid";
}
