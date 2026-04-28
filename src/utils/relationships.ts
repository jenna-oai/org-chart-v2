import type {
  EmployeeNode,
  OrgChart,
  OrgConnection,
  OrgNode,
  ReportTargetNode,
  VerticalNode,
} from "../types/orgChart";

export function getNodeById(nodeId: string, chart: OrgChart): OrgNode | undefined {
  return chart.nodes.find((node) => node.id === nodeId);
}

export function getOutgoingConnections(
  nodeId: string,
  chart: OrgChart,
): OrgConnection[] {
  return chart.connections.filter((connection) => connection.fromNodeId === nodeId);
}

export function getIncomingConnections(
  nodeId: string,
  chart: OrgChart,
): OrgConnection[] {
  return chart.connections.filter((connection) => connection.toNodeId === nodeId);
}

export function getDirectReports(
  managerNodeId: string,
  chart: OrgChart,
): ReportTargetNode[] {
  return getOutgoingConnections(managerNodeId, chart)
    .filter((connection) => connection.connectionType === "reports_to")
    .map((connection) => getNodeById(connection.toNodeId, chart))
    .filter(isReportTargetNode);
}

export function getManager(
  nodeId: string,
  chart: OrgChart,
): ReportTargetNode | null {
  const managerConnection = getIncomingConnections(nodeId, chart).find(
    (connection) => connection.connectionType === "reports_to",
  );

  if (!managerConnection) {
    return null;
  }

  const manager = getNodeById(managerConnection.fromNodeId, chart);
  return isReportTargetNode(manager) ? manager : null;
}

export function getOwnedVerticals(
  ownerNodeId: string,
  chart: OrgChart,
): VerticalNode[] {
  return getOutgoingConnections(ownerNodeId, chart)
    .filter((connection) => connection.connectionType === "owns_vertical")
    .map((connection) => getNodeById(connection.toNodeId, chart))
    .filter(isVerticalNode);
}

export function getVerticalOwner(
  verticalNodeId: string,
  chart: OrgChart,
): ReportTargetNode | null {
  const ownerConnection = getIncomingConnections(verticalNodeId, chart).find(
    (connection) => connection.connectionType === "owns_vertical",
  );

  if (!ownerConnection) {
    return null;
  }

  const owner = getNodeById(ownerConnection.fromNodeId, chart);
  return isReportTargetNode(owner) ? owner : null;
}

export function getNodesBelongingToVertical(
  verticalNodeId: string,
  chart: OrgChart,
): ReportTargetNode[] {
  return getOutgoingConnections(verticalNodeId, chart)
    .filter((connection) => connection.connectionType === "belongs_to_vertical")
    .map((connection) => getNodeById(connection.toNodeId, chart))
    .filter(isReportTargetNode);
}

export function isEmployeeNode(node: OrgNode | undefined): node is EmployeeNode {
  return node?.type === "employee";
}

export function isVerticalNode(node: OrgNode | undefined): node is VerticalNode {
  return node?.type === "vertical";
}

export function isReportTargetNode(
  node: OrgNode | undefined,
): node is ReportTargetNode {
  return (
    node?.type === "employee" ||
    node?.type === "open_role" ||
    node?.type === "approved_role"
  );
}
