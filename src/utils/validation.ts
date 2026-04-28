import type {
  OrgChart,
  OrgChartValidationIssue,
  OrgChartValidationResult,
  OrgConnection,
  OrgNode,
} from "../types/orgChart";
import { isReportTargetNode } from "./relationships";

export function validateOrgChart(chart: OrgChart): OrgChartValidationResult {
  const issues: OrgChartValidationIssue[] = [];
  const nodesById = new Map<string, OrgNode>();
  const connectionIds = new Set<string>();

  for (const node of chart.nodes) {
    if (nodesById.has(node.id)) {
      issues.push({
        code: "duplicate_node_id",
        message: `Node id "${node.id}" is used more than once.`,
        nodeId: node.id,
      });
      continue;
    }

    nodesById.set(node.id, node);
  }

  for (const connection of chart.connections) {
    if (connectionIds.has(connection.id)) {
      issues.push({
        code: "duplicate_connection_id",
        message: `Connection id "${connection.id}" is used more than once.`,
        connectionId: connection.id,
      });
    }

    connectionIds.add(connection.id);

    const fromNode = nodesById.get(connection.fromNodeId);
    const toNode = nodesById.get(connection.toNodeId);

    if (!fromNode) {
      issues.push({
        code: "missing_from_node",
        message: `Connection "${connection.id}" references missing fromNodeId "${connection.fromNodeId}".`,
        connectionId: connection.id,
      });
    }

    if (!toNode) {
      issues.push({
        code: "missing_to_node",
        message: `Connection "${connection.id}" references missing toNodeId "${connection.toNodeId}".`,
        connectionId: connection.id,
      });
    }

    if (!fromNode || !toNode) {
      continue;
    }

    validateConnectionShape(connection, fromNode, toNode, issues);
  }

  issues.push(...findCircularReportingIssues(chart.connections, nodesById));

  return {
    isValid: issues.length === 0,
    issues,
  };
}

function validateConnectionShape(
  connection: OrgConnection,
  fromNode: OrgNode,
  toNode: OrgNode,
  issues: OrgChartValidationIssue[],
): void {
  if (connection.connectionType === "owns_vertical") {
    if (!isReportTargetNode(fromNode) || toNode.type !== "vertical") {
      issues.push({
        code: "invalid_owns_vertical_connection",
        message:
          "owns_vertical connections must go from employee, open_role, or approved_role to vertical.",
        connectionId: connection.id,
      });
    }

    return;
  }

  if (connection.connectionType === "belongs_to_vertical") {
    if (fromNode.type !== "vertical" || !isReportTargetNode(toNode)) {
      issues.push({
        code: "invalid_belongs_to_vertical_connection",
        message:
          "belongs_to_vertical connections must go from vertical to employee, open_role, or approved_role.",
        connectionId: connection.id,
      });
    }

    return;
  }

  if (connection.connectionType === "reports_to") {
    if (!isReportTargetNode(fromNode) || !isReportTargetNode(toNode)) {
      issues.push({
        code: "invalid_reports_to_connection",
        message:
          "reports_to connections must go from employee, open_role, or approved_role to employee, open_role, or approved_role. Use owns_vertical for vertical ownership.",
        connectionId: connection.id,
      });
    }
  }
}

function findCircularReportingIssues(
  connections: OrgConnection[],
  nodesById: Map<string, OrgNode>,
): OrgChartValidationIssue[] {
  const issues: OrgChartValidationIssue[] = [];
  const adjacency = new Map<string, string[]>();

  for (const connection of connections) {
    if (connection.connectionType !== "reports_to") {
      continue;
    }

    if (!nodesById.has(connection.fromNodeId) || !nodesById.has(connection.toNodeId)) {
      continue;
    }

    const fromConnections = adjacency.get(connection.fromNodeId) ?? [];
    fromConnections.push(connection.toNodeId);
    adjacency.set(connection.fromNodeId, fromConnections);
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const path: string[] = [];
  const reportedCycles = new Set<string>();

  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      const cyclePath = [...path.slice(cycleStart), nodeId];
      const cycleKey = cyclePath.join(">");

      if (!reportedCycles.has(cycleKey)) {
        reportedCycles.add(cycleKey);
        issues.push({
          code: "circular_reporting_relationship",
          message: `reports_to connections create a circular reporting loop: ${cyclePath.join(" -> ")}.`,
          nodeId,
        });
      }

      return;
    }

    if (visited.has(nodeId)) {
      return;
    }

    visiting.add(nodeId);
    path.push(nodeId);

    for (const nextNodeId of adjacency.get(nodeId) ?? []) {
      visit(nextNodeId);
    }

    path.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const nodeId of adjacency.keys()) {
    visit(nodeId);
  }

  return issues;
}
