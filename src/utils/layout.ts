import type {
  OrgChart,
  OrgConnection,
  OrgNode,
  ReportTargetNode,
} from "../types/orgChart";
import { getNodeDisplayText } from "./display";

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

interface OrgChartLayoutOptions {
  listViewReportOrders?: Record<string, string[]>;
  showJobTitles?: boolean;
}

const CARD_WIDTH = 220;
const CARD_HEIGHT = 70;
const VERTICAL_CARD_HEIGHT = 44;
const CARD_HORIZONTAL_PADDING = 28;
const VERTICAL_CARD_HORIZONTAL_PADDING = 32;
const PRIMARY_LINE_HEIGHT = 18;
const SECONDARY_LINE_HEIGHT = 14;
const CARD_VERTICAL_CHROME = 28;
const VERTICAL_CARD_VERTICAL_CHROME = 16;
const AVERAGE_PRIMARY_CHARACTER_WIDTH = 8.8;
const AVERAGE_SECONDARY_CHARACTER_WIDTH = 7;
const REPORT_LIST_CARD_WIDTH = 280;
const REPORT_LIST_CARD_VERTICAL_PADDING = 24;
const REPORT_LIST_ROW_HORIZONTAL_CHROME = 40;
const REPORT_LIST_ROW_VERTICAL_CHROME = 16;
const REPORT_LIST_ROW_GAP = 8;
const HORIZONTAL_GAP = 42;
const VERTICAL_GAP = 78;
const SIDE_BRANCH_GAP = 28;
const SIDE_BRANCH_VERTICAL_GAP = 16;
const CANVAS_PADDING = 48;
const REPORT_LIST_TYPE_ORDER: Record<ReportTargetNode["type"], number> = {
  employee: 0,
  ebp: 1,
  open_role: 2,
  approved_role: 3,
};

export function calculateOrgChartLayout(
  chart: OrgChart,
  listViewOwnerIds = new Set<string>(),
  options: OrgChartLayoutOptions = {},
): OrgChartLayout {
  const showJobTitles = options.showJobTitles ?? true;
  const visualGraph = getVisualGraph(
    chart,
    listViewOwnerIds,
    options.listViewReportOrders ?? {},
  );
  const nodesById = new Map(visualGraph.nodes.map((node) => [node.id, node]));
  const visualNodeOrderById = new Map(
    visualGraph.nodes.map((node, index) => [node.id, index]),
  );
  const visualConnections = visualGraph.connections;
  const layoutConnections = visualConnections.filter(isStructuralLayoutConnection);
  const childConnectionsByNodeId = getChildConnectionsByNodeId(layoutConnections);
  const incomingConnectionCounts = getIncomingConnectionCounts(layoutConnections);
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
      const displayText = getNodeDisplayText(node);
      const contentWidth = CARD_WIDTH - VERTICAL_CARD_HORIZONTAL_PADDING;
      const primaryLines = estimateWrappedLineCount(
        displayText.primary,
        contentWidth,
        AVERAGE_PRIMARY_CHARACTER_WIDTH,
      );

      return Math.max(
        VERTICAL_CARD_HEIGHT,
        Math.ceil(primaryLines * PRIMARY_LINE_HEIGHT + VERTICAL_CARD_VERTICAL_CHROME),
      );
    }

    if (node.type === "report_list") {
      const rowContentWidth =
        REPORT_LIST_CARD_WIDTH - REPORT_LIST_ROW_HORIZONTAL_CHROME;
      const rowsHeight = node.reports.reduce((height, report) => {
        const displayText = getNodeDisplayText(report);
        const primaryLines = estimateWrappedLineCount(
          displayText.primary,
          rowContentWidth,
          AVERAGE_PRIMARY_CHARACTER_WIDTH,
        );
        const secondaryLines = showJobTitles && displayText.secondary
          ? estimateWrappedLineCount(
              displayText.secondary,
              rowContentWidth,
              AVERAGE_SECONDARY_CHARACTER_WIDTH,
            )
          : 0;

        return (
          height +
          Math.ceil(
            primaryLines * PRIMARY_LINE_HEIGHT +
              secondaryLines * SECONDARY_LINE_HEIGHT +
              REPORT_LIST_ROW_VERTICAL_CHROME,
          )
        );
      }, 0);
      const rowGaps = Math.max(node.reports.length - 1, 0) * REPORT_LIST_ROW_GAP;

      return Math.ceil(REPORT_LIST_CARD_VERTICAL_PADDING + rowsHeight + rowGaps);
    }

    const displayText = getNodeDisplayText(node);
    const contentWidth = CARD_WIDTH - CARD_HORIZONTAL_PADDING;
    const primaryLines = estimateWrappedLineCount(
      displayText.primary,
      contentWidth,
      AVERAGE_PRIMARY_CHARACTER_WIDTH,
    );
    const secondaryLines = showJobTitles && displayText.secondary
      ? estimateWrappedLineCount(
          displayText.secondary,
          contentWidth,
          AVERAGE_SECONDARY_CHARACTER_WIDTH,
        )
      : 0;

    return Math.max(
      CARD_HEIGHT,
      Math.ceil(
        primaryLines * PRIMARY_LINE_HEIGHT +
          secondaryLines * SECONDARY_LINE_HEIGHT +
          CARD_VERTICAL_CHROME,
      ),
    );
  };

  const getChildEntries = (
    nodeId: string,
  ): Array<{ connection: OrgConnection; node: VisualOrgNode }> =>
    (childConnectionsByNodeId.get(nodeId) ?? [])
      .map((connection) => {
        const node = nodesById.get(connection.toNodeId);

        return node ? { connection, node } : null;
      })
      .filter(
        (entry): entry is { connection: OrgConnection; node: VisualOrgNode } =>
          Boolean(entry),
      )
      .sort(
        (firstEntry, secondEntry) =>
          (visualNodeOrderById.get(firstEntry.node.id) ?? 0) -
          (visualNodeOrderById.get(secondEntry.node.id) ?? 0),
      );

  const getNormalChildren = (nodeId: string): VisualOrgNode[] =>
    getChildEntries(nodeId)
      .filter((entry) => !isSideBranchEntry(entry))
      .map((entry) => entry.node);

  const getSideBranchChildren = (nodeId: string): VisualOrgNode[] =>
    getChildEntries(nodeId)
      .filter(isSideBranchEntry)
      .map((entry) => entry.node);

  const measureSubtree = (node: VisualOrgNode): number => {
    if (measuredWidths.has(node.id)) {
      return measuredWidths.get(node.id) ?? getNodeWidth(node);
    }

    if (measuring.has(node.id)) {
      return getNodeWidth(node);
    }

    measuring.add(node.id);

    const normalChildren = getNormalChildren(node.id).filter(
      (child) => !positionedNodes.has(child.id),
    );
    const sideBranchChildren = getSideBranchChildren(node.id).filter(
      (child) => !positionedNodes.has(child.id),
    );
    const sideBranchWidth = sideBranchChildren.reduce(
      (width, child) => Math.max(width, measureSubtree(child)),
      0,
    );
    const localGroupWidth =
      getNodeWidth(node) +
      (sideBranchWidth > 0 ? SIDE_BRANCH_GAP + sideBranchWidth : 0);

    if (normalChildren.length === 0) {
      measuring.delete(node.id);
      measuredWidths.set(node.id, localGroupWidth);
      return localGroupWidth;
    }

    const childrenWidth =
      normalChildren.reduce((total, child) => total + measureSubtree(child), 0) +
      HORIZONTAL_GAP * (normalChildren.length - 1);
    const width = Math.max(localGroupWidth, childrenWidth);

    measuring.delete(node.id);
    measuredWidths.set(node.id, width);
    return width;
  };

  const placeSubtree = (node: VisualOrgNode, left: number, y: number): void => {
    if (positionedNodes.has(node.id)) {
      return;
    }

    const subtreeWidth = measureSubtree(node);
    const nodeWidth = getNodeWidth(node);
    const nodeHeight = getNodeHeight(node);
    const sideBranchChildren = getSideBranchChildren(node.id).filter(
      (child) => !positionedNodes.has(child.id),
    );
    const sideBranchWidth = sideBranchChildren.reduce(
      (width, child) => Math.max(width, measureSubtree(child)),
      0,
    );
    const localGroupWidth =
      nodeWidth + (sideBranchWidth > 0 ? SIDE_BRANCH_GAP + sideBranchWidth : 0);
    const nodeX = left + (subtreeWidth - localGroupWidth) / 2;

    positionedNodes.set(node.id, {
      node,
      x: nodeX,
      y,
      width: nodeWidth,
      height: nodeHeight,
    });

    let sideBranchY = y;
    const sideBranchLeft = nodeX + nodeWidth + SIDE_BRANCH_GAP;

    for (const sideBranchChild of sideBranchChildren) {
      if (positionedNodes.has(sideBranchChild.id)) {
        continue;
      }

      placeSubtree(sideBranchChild, sideBranchLeft, sideBranchY);
      sideBranchY += getNodeHeight(sideBranchChild) + SIDE_BRANCH_VERTICAL_GAP;
    }

    let childLeft = left;
    const childY = y + nodeHeight + VERTICAL_GAP;

    for (const child of getNormalChildren(node.id)) {
      if (positionedNodes.has(child.id)) {
        continue;
      }

      const childWidth = measureSubtree(child);
      placeSubtree(child, childLeft, childY);
      childLeft += childWidth + HORIZONTAL_GAP;
    }
  };

  let rootLeft = CANVAS_PADDING;
  for (const root of rootNodes) {
    const rootWidth = measureSubtree(root);
    placeSubtree(root, rootLeft, CANVAS_PADDING);
    rootLeft += rootWidth + HORIZONTAL_GAP;
  }

  for (const node of visualGraph.nodes) {
    if (!positionedNodes.has(node.id)) {
      placeSubtree(node, rootLeft, CANVAS_PADDING);
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
  listViewReportOrders: Record<string, string[]> = {},
): { nodes: VisualOrgNode[]; connections: OrgConnection[] } {
  const hiddenNodeIds = getNodesHiddenByReportLists(chart, listViewOwnerIds);
  const reportListNodes = getReportListNodes(
    chart,
    listViewOwnerIds,
    listViewReportOrders,
  );
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
  const managerByReportNodeId = new Map<string, string>();

  for (const connection of connections) {
    if (connection.connectionType === "owns_vertical") {
      verticalOwnerByVerticalId.set(connection.toNodeId, connection.fromNodeId);
    }

    if (connection.connectionType === "belongs_to_vertical") {
      verticalByContainedNodeId.set(connection.toNodeId, connection.fromNodeId);
    }

    if (
      connection.connectionType === "reports_to" &&
      isStructuralLayoutConnection(connection)
    ) {
      managerByReportNodeId.set(connection.toNodeId, connection.fromNodeId);
    }
  }

  return connections
    .filter((connection) => {
      if (
        connection.connectionType === "belongs_to_vertical" &&
        hasManagerInSameVertical(
          connection.toNodeId,
          connection.fromNodeId,
          managerByReportNodeId,
          verticalByContainedNodeId,
        )
      ) {
        return false;
      }

      if (connection.connectionType !== "reports_to") {
        return true;
      }

      if (!isStructuralLayoutConnection(connection)) {
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

function hasManagerInSameVertical(
  nodeId: string,
  verticalId: string,
  managerByReportNodeId: Map<string, string>,
  verticalByContainedNodeId: Map<string, string>,
): boolean {
  const managerNodeId = managerByReportNodeId.get(nodeId);

  if (!managerNodeId) {
    return false;
  }

  return verticalByContainedNodeId.get(managerNodeId) === verticalId;
}

function getReportListNodes(
  chart: OrgChart,
  listViewOwnerIds: Set<string>,
  listViewReportOrders: Record<string, string[]>,
): ReportListNode[] {
  return Array.from(listViewOwnerIds)
    .map((ownerNodeId) => {
      const reports = getListOccupantNodes(
        ownerNodeId,
        chart,
        listViewReportOrders[ownerNodeId],
      );

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
  orderedNodeIds?: string[],
): ReportTargetNode[] {
  const ownerNode = chart.nodes.find((node) => node.id === ownerNodeId);
  const occupantNodes =
    ownerNode?.type === "vertical"
      ? getContainedVerticalNodes(ownerNodeId, chart)
      : getDirectReportNodes(ownerNodeId, chart);

  return sortReportListOccupants(occupantNodes, orderedNodeIds);
}

function sortReportListOccupants(
  nodes: ReportTargetNode[],
  orderedNodeIds?: string[],
): ReportTargetNode[] {
  const orderedNodeIndexById = new Map(
    (orderedNodeIds ?? []).map((nodeId, index) => [nodeId, index]),
  );

  return nodes
    .map((node, index) => ({ node, index }))
    .sort((first, second) => {
      const firstOrderedIndex = orderedNodeIndexById.get(first.node.id);
      const secondOrderedIndex = orderedNodeIndexById.get(second.node.id);

      if (firstOrderedIndex !== undefined || secondOrderedIndex !== undefined) {
        if (firstOrderedIndex === undefined) {
          return 1;
        }

        if (secondOrderedIndex === undefined) {
          return -1;
        }

        return firstOrderedIndex - secondOrderedIndex;
      }

      const typeDifference =
        REPORT_LIST_TYPE_ORDER[first.node.type] -
        REPORT_LIST_TYPE_ORDER[second.node.type];

      return typeDifference === 0 ? first.index - second.index : typeDifference;
    })
    .map(({ node }) => node);
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
    node?.type === "ebp" ||
    node?.type === "open_role" ||
    node?.type === "approved_role"
  );
}

function isSideBranchEntry({
  connection,
  node,
}: {
  connection: OrgConnection;
  node: VisualOrgNode;
}): boolean {
  return connection.connectionType === "reports_to" && node.type === "ebp";
}

function estimateWrappedLineCount(
  text: string,
  contentWidth: number,
  averageCharacterWidth: number,
): number {
  const maxCharactersPerLine = Math.max(
    Math.floor(contentWidth / averageCharacterWidth),
    1,
  );
  const explicitLines = text.split(/\r?\n/);

  return explicitLines.reduce((totalLines, line) => {
    const words = line.trim().split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      return totalLines + 1;
    }

    let lineCount = 1;
    let currentLineLength = 0;

    for (const word of words) {
      const wordLength = word.length;

      if (wordLength > maxCharactersPerLine) {
        lineCount += Math.ceil(wordLength / maxCharactersPerLine) - 1;
        currentLineLength = wordLength % maxCharactersPerLine;
        continue;
      }

      const nextLineLength =
        currentLineLength === 0
          ? wordLength
          : currentLineLength + 1 + wordLength;

      if (nextLineLength > maxCharactersPerLine) {
        lineCount += 1;
        currentLineLength = wordLength;
      } else {
        currentLineLength = nextLineLength;
      }
    }

    return totalLines + lineCount;
  }, 0);
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

function isStructuralLayoutConnection(connection: OrgConnection): boolean {
  return !(
    connection.connectionType === "reports_to" &&
    connection.connectionStyle === "hashed"
  );
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
