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
  employeeNodeId: string,
  chart: OrgChart,
): ReportTargetNode[] {
  return getOutgoingConnections(employeeNodeId, chart)
    .filter((connection) => connection.connectionType === "reports_to")
    .map((connection) => getNodeById(connection.toNodeId, chart))
    .filter(isReportTargetNode);
}

export function getManager(
  employeeNodeId: string,
  chart: OrgChart,
): EmployeeNode | null {
  const managerConnection = getIncomingConnections(employeeNodeId, chart).find(
    (connection) => connection.connectionType === "reports_to",
  );

  if (!managerConnection) {
    return null;
  }

  const manager = getNodeById(managerConnection.fromNodeId, chart);
  return isEmployeeNode(manager) ? manager : null;
}

export function getOwnedVerticals(
  employeeNodeId: string,
  chart: OrgChart,
): VerticalNode[] {
  return getOutgoingConnections(employeeNodeId, chart)
    .filter((connection) => connection.connectionType === "owns_vertical")
    .map((connection) => getNodeById(connection.toNodeId, chart))
    .filter(isVerticalNode);
}

export function getVerticalOwner(
  verticalNodeId: string,
  chart: OrgChart,
): EmployeeNode | null {
  const ownerConnection = getIncomingConnections(verticalNodeId, chart).find(
    (connection) => connection.connectionType === "owns_vertical",
  );

  if (!ownerConnection) {
    return null;
  }

  const owner = getNodeById(ownerConnection.fromNodeId, chart);
  return isEmployeeNode(owner) ? owner : null;
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
