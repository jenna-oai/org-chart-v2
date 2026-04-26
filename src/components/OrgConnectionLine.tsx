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

  const startX = fromNode.x + fromNode.width / 2;
  const startY = fromNode.y + fromNode.height;
  const endX = toNode.x + toNode.width / 2;
  const endY = toNode.y;
  const midY = startY + Math.max((endY - startY) / 2, 24);
  const path = `M ${startX} ${startY} V ${midY} H ${endX} V ${endY}`;
  const uplineStyle = getUplineConnectionStyle(toNode);

  return (
    <path
      className={`connection-line connection-line--${connection.connectionType} connection-line--style-${uplineStyle}`}
      d={path}
      fill="none"
    />
  );
}

function getUplineConnectionStyle(node: LayoutNode): UplineConnectionStyle {
  if ("uplineConnectionStyle" in node.node) {
    return node.node.uplineConnectionStyle ?? "solid";
  }

  return "solid";
}
