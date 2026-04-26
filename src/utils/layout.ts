import type {
  OrgChart,
  OrgConnection,
  OrgNode,
  ReportTargetNode,
} from "../types/orgChart";

export interface ReportListNode {
  id: string;
  type: "report_list";
  ownerNodeId: string;
  reports: ReportTargetNode[];
}

export type VisualOrgNode = OrgNode | ReportListNode;

export interface LayoutNode {
  node: VisualOrgNode;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OrgChartLayout {
  nodes: LayoutNode[];
  nodePositions: Map<string, LayoutNode>;
  connections: OrgConnection[];
  width: number;
  height: number;
}

const CARD_WIDTH = 220;
const CARD_HEIGHT = 86;
const VERTICAL_CARD_HEIGHT = 62;
const REPORT_LIST_CARD_WIDTH = 280;
const REPORT_LIST_BASE_HEIGHT = 44;
const REPORT_LIST_ROW_HEIGHT = 40;
const HORIZONTAL_GAP = 42;
const VERTICAL_GAP = 104;
const CANVAS_PADDING = 48;

export function calculateOrgChartLayout(
  chart: OrgChart,
  listViewOwnerIds = new Set<string>(),
): OrgChartLayout {
  const visualGraph = getVisualGraph(chart, listViewOwnerIds);
  const nodesById = new Map(visualGraph.nodes.map((node) => [node.id, node]));
  const visualConnections = visualGraph.connections;
  const childConnectionsByNodeId = getChildConnectionsByNodeId(visualConnections);
  const incomingConnectionCounts = getIncomingConnectionCounts(visualConnections);
  const positionedNodes = new Map<string, LayoutNode>();
  const measuring = new Set<string>();
  const measuredWidths = new Map<string, number>();

  const roots = visualGraph.nodes.filter(
    (node) => !incomingConnectionCounts.has(node.id),
  );
  const rootNodes = roots.length > 0 ? roots : visualGraph.nodes;

  const getNodeWidth = (node: VisualOrgNode): number =>
    node.type === "report_list" ? REPORT_LIST_CARD_WIDTH : CARD_WIDTH;

  const getNodeHeight = (node: VisualOrgNode): number => {
    if (node.type === "vertical") {
      return VERTICAL_CARD_HEIGHT;
    }

    if (node.type === "report_list") {
      return REPORT_LIST_BASE_HEIGHT + node.reports.length * REPORT_LIST_ROW_HEIGHT;
    }

    return CARD_HEIGHT;
  };

  const getChildren = (nodeId: string): VisualOrgNode[] =>
    (childConnectionsByNodeId.get(nodeId) ?? [])
      .map((connection) => nodesById.get(connection.toNodeId))
      .filter((node): node is VisualOrgNode => Boolean(node));

  const measureSubtree = (node: VisualOrgNode): number => {
    if (measuredWidths.has(node.id)) {
      return measuredWidths.get(node.id) ?? getNodeWidth(node);
    }

    if (measuring.has(node.id)) {
      return getNodeWidth(node);
    }

    measuring.add(node.id);

    const children = getChildren(node.id).filter(
      (child) => !positionedNodes.has(child.id),
    );

    if (children.length === 0) {
      measuring.delete(node.id);
      measuredWidths.set(node.id, getNodeWidth(node));
      return getNodeWidth(node);
    }

    const childrenWidth =
      children.reduce((total, child) => total + measureSubtree(child), 0) +
      HORIZONTAL_GAP * (children.length - 1);
    const width = Math.max(getNodeWidth(node), childrenWidth);

    measuring.delete(node.id);
    measuredWidths.set(node.id, width);
    return width;
  };

  const placeSubtree = (node: VisualOrgNode, left: number, depth: number): void => {
    if (positionedNodes.has(node.id)) {
      return;
    }

    const subtreeWidth = measureSubtree(node);
    const nodeWidth = getNodeWidth(node);
    const nodeX = left + (subtreeWidth - nodeWidth) / 2;
    const nodeY = CANVAS_PADDING + depth * (CARD_HEIGHT + VERTICAL_GAP);

    positionedNodes.set(node.id, {
      node,
      x: nodeX,
      y: nodeY,
      width: nodeWidth,
      height: getNodeHeight(node),
    });

    let childLeft = left;
    for (const child of getChildren(node.id)) {
      if (positionedNodes.has(child.id)) {
        continue;
      }

      const childWidth = measureSubtree(child);
      placeSubtree(child, childLeft, depth + 1);
      childLeft += childWidth + HORIZONTAL_GAP;
    }
  };

  let rootLeft = CANVAS_PADDING;
  for (const root of rootNodes) {
    const rootWidth = measureSubtree(root);
    placeSubtree(root, rootLeft, 0);
    rootLeft += rootWidth + HORIZONTAL_GAP;
  }

  for (const node of visualGraph.nodes) {
    if (!positionedNodes.has(node.id)) {
      placeSubtree(node, rootLeft, 0);
      rootLeft += getNodeWidth(node) + HORIZONTAL_GAP;
    }
  }

  const nodes = Array.from(positionedNodes.values());
  const width =
    Math.max(...nodes.map((node) => node.x + node.width), CANVAS_PADDING) +
    CANVAS_PADDING;
  const height =
    Math.max(...nodes.map((node) => node.y + node.height), CANVAS_PADDING) +
    CANVAS_PADDING;

  return {
    nodes,
    nodePositions: positionedNodes,
    connections: visualConnections,
    width,
    height,
  };
}

export function getVisualGraph(
  chart: OrgChart,
  listViewOwnerIds = new Set<string>(),
): { nodes: VisualOrgNode[]; connections: OrgConnection[] } {
  const hiddenNodeIds = getNodesHiddenByReportLists(chart, listViewOwnerIds);
  const reportListNodes = getReportListNodes(chart, listViewOwnerIds);
  const visibleChartNodes = chart.nodes.filter((node) => !hiddenNodeIds.has(node.id));
  const visualConnections = getVisualConnections(chart.connections).filter(
    (connection) =>
      !hiddenNodeIds.has(connection.fromNodeId) &&
      !hiddenNodeIds.has(connection.toNodeId),
  );
  const reportListConnections = reportListNodes.map((node): OrgConnection => {
    return {
      id: `report-list-connection-${node.ownerNodeId}`,
      fromNodeId: node.ownerNodeId,
      toNodeId: node.id,
      connectionType: "belongs_to_vertical",
    };
  });

  return {
    nodes: [...visibleChartNodes, ...reportListNodes],
    connections: [...visualConnections, ...reportListConnections],
  };
}

export function getVisualConnections(connections: OrgConnection[]): OrgConnection[] {
  const verticalOwnerByVerticalId = new Map<string, string>();
  const verticalByContainedNodeId = new Map<string, string>();

  for (const connection of connections) {
    if (connection.connectionType === "owns_vertical") {
      verticalOwnerByVerticalId.set(connection.toNodeId, connection.fromNodeId);
    }

    if (connection.connectionType === "belongs_to_vertical") {
      verticalByContainedNodeId.set(connection.toNodeId, connection.fromNodeId);
    }
  }

  return connections
    .filter((connection) => {
      if (connection.connectionType !== "reports_to") {
        return true;
      }

      const verticalId = verticalByContainedNodeId.get(connection.toNodeId);

      if (!verticalId) {
        return true;
      }

      return verticalOwnerByVerticalId.get(verticalId) !== connection.fromNodeId;
    })
    .sort((firstConnection, secondConnection) => {
      return (
        getConnectionLayoutPriority(firstConnection) -
        getConnectionLayoutPriority(secondConnection)
      );
    });
}

function getReportListNodes(
  chart: OrgChart,
  listViewOwnerIds: Set<string>,
): ReportListNode[] {
  return Array.from(listViewOwnerIds)
    .map((ownerNodeId) => {
      const reports = getListOccupantNodes(ownerNodeId, chart);

      if (reports.length === 0) {
        return null;
      }

      return {
        id: `report-list-${ownerNodeId}`,
        type: "report_list",
        ownerNodeId,
        reports,
      } satisfies ReportListNode;
    })
    .filter((node): node is ReportListNode => Boolean(node));
}

function getListOccupantNodes(
  ownerNodeId: string,
  chart: OrgChart,
): ReportTargetNode[] {
  const ownerNode = chart.nodes.find((node) => node.id === ownerNodeId);

  if (ownerNode?.type === "vertical") {
    return getContainedVerticalNodes(ownerNodeId, chart);
  }

  return getDirectReportNodes(ownerNodeId, chart);
}

function getDirectReportNodes(ownerNodeId: string, chart: OrgChart): ReportTargetNode[] {
  return chart.connections
    .filter(
      (connection) =>
        connection.connectionType === "reports_to" &&
        connection.fromNodeId === ownerNodeId,
    )
    .map((connection) => chart.nodes.find((node) => node.id === connection.toNodeId))
    .filter(isReportTargetNode);
}

function getContainedVerticalNodes(
  ownerNodeId: string,
  chart: OrgChart,
): ReportTargetNode[] {
  return chart.connections
    .filter(
      (connection) =>
        connection.connectionType === "belongs_to_vertical" &&
        connection.fromNodeId === ownerNodeId,
    )
    .map((connection) => chart.nodes.find((node) => node.id === connection.toNodeId))
    .filter(isReportTargetNode);
}

function getNodesHiddenByReportLists(
  chart: OrgChart,
  listViewOwnerIds: Set<string>,
): Set<string> {
  const hiddenNodeIds = new Set<string>();

  for (const ownerNodeId of listViewOwnerIds) {
    for (const report of getListOccupantNodes(ownerNodeId, chart)) {
      hideNodeBranch(report.id, chart, hiddenNodeIds);
    }
  }

  return hiddenNodeIds;
}

function isReportTargetNode(node: OrgNode | undefined): node is ReportTargetNode {
  return (
    node?.type === "employee" ||
    node?.type === "open_role" ||
    node?.type === "approved_role"
  );
}

function hideNodeBranch(
  nodeId: string,
  chart: OrgChart,
  hiddenNodeIds: Set<string>,
): void {
  if (hiddenNodeIds.has(nodeId)) {
    return;
  }

  hiddenNodeIds.add(nodeId);

  for (const connection of chart.connections) {
    if (connection.fromNodeId === nodeId) {
      hideNodeBranch(connection.toNodeId, chart, hiddenNodeIds);
    }
  }
}

function getConnectionLayoutPriority(connection: OrgConnection): number {
  if (connection.connectionType === "owns_vertical") {
    return 0;
  }

  if (connection.connectionType === "reports_to") {
    return 1;
  }

  return 2;
}

function getChildConnectionsByNodeId(
  connections: OrgConnection[],
): Map<string, OrgConnection[]> {
  const childConnectionsByNodeId = new Map<string, OrgConnection[]>();

  for (const connection of connections) {
    const childConnections = childConnectionsByNodeId.get(connection.fromNodeId) ?? [];
    childConnections.push(connection);
    childConnectionsByNodeId.set(connection.fromNodeId, childConnections);
  }

  return childConnectionsByNodeId;
}

function getIncomingConnectionCounts(
  connections: OrgConnection[],
): Map<string, number> {
  const incomingConnectionCounts = new Map<string, number>();

  for (const connection of connections) {
    incomingConnectionCounts.set(
      connection.toNodeId,
      (incomingConnectionCounts.get(connection.toNodeId) ?? 0) + 1,
    );
  }

  return incomingConnectionCounts;
}
