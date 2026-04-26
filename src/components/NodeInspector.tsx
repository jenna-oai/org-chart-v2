import type { ReactNode } from "react";
import type {
  ApprovedRoleNode,
  CanvasTextBox,
  EmployeeNode,
  OpenRoleNode,
  OrgChart,
  OrgNodeBackgroundColor,
  OrgNode,
  OrgNodeType,
  ReportTargetNode,
  UplineConnectionStyle,
  VerticalNode,
} from "../types/orgChart";
import { getNodeDisplayText } from "../utils/display";
import {
  getDirectReports,
  getIncomingConnections,
  getNodesBelongingToVertical,
  getOwnedVerticals,
  getVerticalOwner,
  isReportTargetNode,
} from "../utils/relationships";

interface NodeInspectorProps {
  chart: OrgChart;
  node: OrgNode | null;
  textBox: CanvasTextBox | null;
  onChange: (node: OrgNode) => void;
  onChangeTextBox: (textBox: CanvasTextBox) => void;
  onChangeManager: (nodeId: string, managerNodeId: string | null) => void;
  onChangeOwnedVertical: (
    employeeNodeId: string,
    verticalNodeId: string,
    ownsVertical: boolean,
  ) => void;
  onChangeVertical: (nodeId: string, verticalNodeId: string | null) => void;
  onToggleListView: (ownerNodeId: string, viewAsList: boolean) => void;
  listViewOwnerIds: Set<string>;
}

const nodeTypeLabels: Record<OrgNode["type"], string> = {
  employee: "Employee",
  vertical: "Vertical",
  open_role: "Open role",
  approved_role: "Approved role",
};

const nodeTypeOptions: Array<{
  label: string;
  value: OrgNodeType;
}> = [
  { label: "Employee", value: "employee" },
  { label: "Vertical", value: "vertical" },
  { label: "Open role", value: "open_role" },
  { label: "Approved role", value: "approved_role" },
];

const backgroundColorOptions: Array<{
  label: string;
  value: OrgNodeBackgroundColor | "";
}> = [
  { label: "Default", value: "" },
  { label: "White", value: "#ffffff" },
  { label: "Warm grey", value: "#f5f3f3" },
  { label: "Blue", value: "#eef3ff" },
  { label: "Green", value: "#edf7f1" },
  { label: "Yellow", value: "#fff6dd" },
  { label: "Lavender", value: "#f7efff" },
  { label: "Rose", value: "#fbeff2" },
  { label: "Cyan", value: "#edf6f8" },
];

export function NodeInspector({
  chart,
  node,
  textBox,
  onChange,
  onChangeTextBox,
  onChangeManager,
  onChangeOwnedVertical,
  onChangeVertical,
  onToggleListView,
  listViewOwnerIds,
}: NodeInspectorProps) {
  if (textBox) {
    return (
      <section className="node-inspector">
        <div className="inspector-heading">
          <div>
            <p className="inspector-kicker">Text box</p>
            <h2>Text box inspector</h2>
          </div>
          <span className="inspector-type-dot inspector-type-dot--text_box" />
        </div>
        <div className="inspector-form">
          <BackgroundColorField
            selectedColor={textBox.backgroundColor ?? ""}
            onChange={(backgroundColor) =>
              onChangeTextBox(
                getTextBoxWithBackgroundColor(textBox, backgroundColor),
              )
            }
          />
        </div>
      </section>
    );
  }

  if (!node) {
    return (
      <section className="node-inspector node-inspector--empty">
        <h2>Node inspector</h2>
        <p>Select a node to edit its contents.</p>
      </section>
    );
  }

  return (
    <section className="node-inspector">
      <div className="inspector-heading">
        <div>
          <p className="inspector-kicker">{nodeTypeLabels[node.type]}</p>
          <h2>Node inspector</h2>
        </div>
        <span className={`inspector-type-dot inspector-type-dot--${node.type}`} />
      </div>
      <div className="inspector-form">
        <NodeTypeField node={node} onChange={onChange} />
        {node.type === "employee" ? (
          <EmployeeFields node={node} onChange={onChange} />
        ) : null}
        {node.type === "vertical" ? (
          <VerticalFields node={node} onChange={onChange} />
        ) : null}
        {node.type === "open_role" ? (
          <OpenRoleFields node={node} onChange={onChange} />
        ) : null}
        {node.type === "approved_role" ? (
          <ApprovedRoleFields node={node} onChange={onChange} />
        ) : null}
        <BackgroundColorField
          selectedColor={node.backgroundColor ?? ""}
          onChange={(backgroundColor) =>
            onChange(getNodeWithBackgroundColor(node, backgroundColor))
          }
        />
        {isReportTargetNode(node) ? (
          <RelationshipFields
            chart={chart}
            node={node}
            onChange={onChange}
            onChangeManager={onChangeManager}
            onChangeOwnedVertical={onChangeOwnedVertical}
            onChangeVertical={onChangeVertical}
          />
        ) : null}
        {node.type === "vertical" ? (
          <VerticalRelationshipFields node={node} onChange={onChange} />
        ) : null}
        <RelationshipSummary
          chart={chart}
          listViewOwnerIds={listViewOwnerIds}
          node={node}
          onToggleListView={onToggleListView}
        />
      </div>
    </section>
  );
}

interface BackgroundColorFieldProps {
  selectedColor: OrgNodeBackgroundColor | "";
  onChange: (backgroundColor: OrgNodeBackgroundColor | "") => void;
}

function BackgroundColorField({
  selectedColor,
  onChange,
}: BackgroundColorFieldProps) {
  return (
    <fieldset className="inspector-color-field">
      <legend>Background color</legend>
      <div className="inspector-color-swatches">
        {backgroundColorOptions.map((option) => (
          <button
            key={option.label}
            type="button"
            className={`inspector-color-swatch ${
              selectedColor === option.value
                ? "inspector-color-swatch--selected"
                : ""
            }`}
            style={
              option.value
                ? { backgroundColor: option.value }
                : undefined
            }
            aria-label={option.label}
            aria-pressed={selectedColor === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.value === "" ? "Default" : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function getNodeWithBackgroundColor(
  node: OrgNode,
  backgroundColor: OrgNodeBackgroundColor | "",
): OrgNode {
  if (backgroundColor === "") {
    const { backgroundColor: _backgroundColor, ...nodeWithoutBackground } = node;
    return nodeWithoutBackground;
  }

  return {
    ...node,
    backgroundColor,
  };
}

function getTextBoxWithBackgroundColor(
  textBox: CanvasTextBox,
  backgroundColor: OrgNodeBackgroundColor | "",
): CanvasTextBox {
  if (backgroundColor === "") {
    const { backgroundColor: _backgroundColor, ...textBoxWithoutBackground } =
      textBox;
    return textBoxWithoutBackground;
  }

  return {
    ...textBox,
    backgroundColor,
  };
}

interface NodeTypeFieldProps {
  node: OrgNode;
  onChange: (node: OrgNode) => void;
}

function NodeTypeField({ node, onChange }: NodeTypeFieldProps) {
  return (
    <InspectorSelect
      label="Node type"
      value={node.type}
      onChange={(nodeType) =>
        onChange(convertNodeToType(node, nodeType as OrgNodeType))
      }
    >
      {nodeTypeOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </InspectorSelect>
  );
}

function convertNodeToType(node: OrgNode, targetType: OrgNodeType): OrgNode {
  if (node.type === targetType) {
    return node;
  }

  const sharedFields = {
    id: node.id,
    uplineConnectionStyle: node.uplineConnectionStyle,
    backgroundColor: node.backgroundColor,
    notes: node.notes,
    metadata: node.metadata,
  };
  const roleCopy = getRoleCopy(node);
  const primaryCopy = getNodeDisplayText(node).primary;

  if (targetType === "employee") {
    return {
      ...sharedFields,
      type: "employee",
      name: primaryCopy,
      jobTitle: roleCopy,
    };
  }

  if (targetType === "vertical") {
    return {
      ...sharedFields,
      type: "vertical",
      verticalName: roleCopy || primaryCopy,
    };
  }

  if (targetType === "open_role") {
    return {
      ...sharedFields,
      type: "open_role",
      statusLabel:
        node.type === "open_role" ? node.statusLabel : "Open Role",
      roleTitle: roleCopy || primaryCopy,
    };
  }

  return {
    ...sharedFields,
    type: "approved_role",
    statusLabel:
      node.type === "approved_role" ? node.statusLabel : "Approved HC",
    roleTitle: roleCopy || primaryCopy,
  };
}

function getRoleCopy(node: OrgNode): string {
  if (node.type === "employee") {
    return node.jobTitle;
  }

  if (node.type === "open_role" || node.type === "approved_role") {
    return node.roleTitle;
  }

  return node.verticalName;
}

interface ConnectionStyleFieldProps {
  node: OrgNode;
  onChange: (node: OrgNode) => void;
}

function ConnectionStyleField({
  node,
  onChange,
}: ConnectionStyleFieldProps) {
  return (
    <InspectorSelect
      label="Connection type"
      value={node.uplineConnectionStyle ?? "solid"}
      onChange={(uplineConnectionStyle) =>
        onChange({
          ...node,
          uplineConnectionStyle:
            uplineConnectionStyle as UplineConnectionStyle,
        })
      }
    >
      <option value="solid">Solid</option>
      <option value="hashed">Hashed</option>
    </InspectorSelect>
  );
}

interface EmployeeFieldsProps {
  node: EmployeeNode;
  onChange: (node: OrgNode) => void;
}

function EmployeeFields({ node, onChange }: EmployeeFieldsProps) {
  return (
    <>
      <InspectorInput
        label="Name"
        value={node.name}
        onChange={(name) => onChange({ ...node, name })}
      />
      <InspectorInput
        label="Job title"
        value={node.jobTitle}
        onChange={(jobTitle) => onChange({ ...node, jobTitle })}
      />
    </>
  );
}

interface VerticalFieldsProps {
  node: VerticalNode;
  onChange: (node: OrgNode) => void;
}

function VerticalFields({ node, onChange }: VerticalFieldsProps) {
  return (
    <InspectorInput
      label="Vertical name"
      value={node.verticalName}
      onChange={(verticalName) => onChange({ ...node, verticalName })}
    />
  );
}

interface OpenRoleFieldsProps {
  node: OpenRoleNode;
  onChange: (node: OrgNode) => void;
}

function OpenRoleFields({ node, onChange }: OpenRoleFieldsProps) {
  return (
    <>
      <InspectorInput
        label="Status label"
        value={node.statusLabel}
        onChange={(statusLabel) => onChange({ ...node, statusLabel })}
      />
      <InspectorInput
        label="Role title"
        value={node.roleTitle}
        onChange={(roleTitle) => onChange({ ...node, roleTitle })}
      />
    </>
  );
}

interface ApprovedRoleFieldsProps {
  node: ApprovedRoleNode;
  onChange: (node: OrgNode) => void;
}

function ApprovedRoleFields({ node, onChange }: ApprovedRoleFieldsProps) {
  return (
    <>
      <InspectorInput
        label="Status label"
        value={node.statusLabel}
        onChange={(statusLabel) => onChange({ ...node, statusLabel })}
      />
      <InspectorInput
        label="Role title"
        value={node.roleTitle}
        onChange={(roleTitle) => onChange({ ...node, roleTitle })}
      />
    </>
  );
}

interface InspectorInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function InspectorInput({ label, value, onChange }: InspectorInputProps) {
  return (
    <label className="inspector-field">
      <span>{label}</span>
      <textarea
        rows={estimateInspectorRows(value)}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function estimateInspectorRows(value: string): number {
  return value.split(/\r?\n/).reduce((rowCount, line) => {
    return rowCount + Math.max(Math.ceil(line.length / 34), 1);
  }, 0);
}

interface RelationshipFieldsProps {
  chart: OrgChart;
  node: ReportTargetNode;
  onChange: (node: OrgNode) => void;
  onChangeManager: (nodeId: string, managerNodeId: string | null) => void;
  onChangeOwnedVertical: (
    employeeNodeId: string,
    verticalNodeId: string,
    ownsVertical: boolean,
  ) => void;
  onChangeVertical: (nodeId: string, verticalNodeId: string | null) => void;
}

function RelationshipFields({
  chart,
  node,
  onChange,
  onChangeManager,
  onChangeOwnedVertical,
  onChangeVertical,
}: RelationshipFieldsProps) {
  const currentManagerId =
    getIncomingConnections(node.id, chart).find(
      (connection) => connection.connectionType === "reports_to",
    )?.fromNodeId ?? "";
  const currentVerticalId =
    getIncomingConnections(node.id, chart).find(
      (connection) => connection.connectionType === "belongs_to_vertical",
    )?.fromNodeId ?? "";
  const managerOptions = getEligibleManagers(node, chart);
  const verticalOptions = chart.nodes.filter(
    (chartNode): chartNode is VerticalNode => chartNode.type === "vertical",
  );

  return (
    <div className="inspector-section">
      <h3>Relationships</h3>
      <InspectorSelect
        label="Manager"
        value={currentManagerId}
        onChange={(managerNodeId) =>
          onChangeManager(node.id, managerNodeId === "" ? null : managerNodeId)
        }
      >
        <option value="">No manager</option>
        {managerOptions.map((manager) => (
          <option key={manager.id} value={manager.id}>
            {manager.name}
          </option>
        ))}
      </InspectorSelect>
      <InspectorSelect
        label="Vertical membership"
        value={currentVerticalId}
        onChange={(verticalNodeId) =>
          onChangeVertical(node.id, verticalNodeId === "" ? null : verticalNodeId)
        }
      >
        <option value="">No vertical</option>
        {verticalOptions.map((vertical) => (
          <option key={vertical.id} value={vertical.id}>
            {vertical.verticalName}
          </option>
        ))}
      </InspectorSelect>
      {node.type === "employee" ? (
        <OwnedVerticalFields
          chart={chart}
          employee={node}
          onChangeOwnedVertical={onChangeOwnedVertical}
        />
      ) : null}
      <ConnectionStyleField node={node} onChange={onChange} />
    </div>
  );
}

interface VerticalRelationshipFieldsProps {
  node: VerticalNode;
  onChange: (node: OrgNode) => void;
}

function VerticalRelationshipFields({
  node,
  onChange,
}: VerticalRelationshipFieldsProps) {
  return (
    <div className="inspector-section">
      <h3>Relationships</h3>
      <ConnectionStyleField node={node} onChange={onChange} />
    </div>
  );
}

interface OwnedVerticalFieldsProps {
  chart: OrgChart;
  employee: EmployeeNode;
  onChangeOwnedVertical: (
    employeeNodeId: string,
    verticalNodeId: string,
    ownsVertical: boolean,
  ) => void;
}

function OwnedVerticalFields({
  chart,
  employee,
  onChangeOwnedVertical,
}: OwnedVerticalFieldsProps) {
  const verticalOptions = chart.nodes.filter(
    (chartNode): chartNode is VerticalNode => chartNode.type === "vertical",
  );
  const ownedVerticalIds = new Set(
    getOwnedVerticals(employee.id, chart).map((vertical) => vertical.id),
  );

  return (
    <fieldset className="inspector-checkbox-group">
      <legend>Owned verticals</legend>
      {verticalOptions.map((vertical) => {
        const owner = getVerticalOwner(vertical.id, chart);
        const isOwnedByEmployee = ownedVerticalIds.has(vertical.id);

        return (
          <label key={vertical.id} className="inspector-checkbox">
            <input
              checked={isOwnedByEmployee}
              type="checkbox"
              onChange={(event) =>
                onChangeOwnedVertical(employee.id, vertical.id, event.target.checked)
              }
            />
            <span>
              {vertical.verticalName}
              {owner && owner.id !== employee.id ? (
                <small>Owned by {owner.name}</small>
              ) : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

interface InspectorSelectProps {
  children: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function InspectorSelect({
  children,
  label,
  value,
  onChange,
}: InspectorSelectProps) {
  return (
    <label className="inspector-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

interface RelationshipSummaryProps {
  chart: OrgChart;
  listViewOwnerIds: Set<string>;
  node: OrgNode;
  onToggleListView: (ownerNodeId: string, viewAsList: boolean) => void;
}

function RelationshipSummary({
  chart,
  listViewOwnerIds,
  node,
  onToggleListView,
}: RelationshipSummaryProps) {
  if (node.type === "employee") {
    return (
      <>
        <ListViewRelationshipSection
          emptyText="No direct reports"
          items={getDirectReports(node.id, chart)}
          ownerNodeId={node.id}
          title="Reports"
          viewAsList={listViewOwnerIds.has(node.id)}
          onToggleListView={onToggleListView}
        />
        <RelationshipList
          emptyText="No owned verticals"
          items={getOwnedVerticals(node.id, chart)}
          title="Owned verticals"
        />
      </>
    );
  }

  if (node.type === "vertical") {
    return (
      <ListViewRelationshipSection
        emptyText="No nodes in this vertical"
        items={getNodesBelongingToVertical(node.id, chart)}
        ownerNodeId={node.id}
        title="Nodes in vertical"
        viewAsList={listViewOwnerIds.has(node.id)}
        onToggleListView={onToggleListView}
      />
    );
  }

  return (
    <section className="inspector-section">
      <h3>Reports</h3>
      <p className="inspector-empty-text">Roles cannot have reports yet.</p>
    </section>
  );
}

interface ListViewRelationshipSectionProps {
  emptyText: string;
  items: OrgNode[];
  ownerNodeId: string;
  title: string;
  viewAsList: boolean;
  onToggleListView: (ownerNodeId: string, viewAsList: boolean) => void;
}

function ListViewRelationshipSection({
  emptyText,
  items,
  ownerNodeId,
  title,
  viewAsList,
  onToggleListView,
}: ListViewRelationshipSectionProps) {
  return (
    <section className="inspector-section">
      <div className="inspector-section-heading">
        <h3>{title}</h3>
        <label className="inspector-switch">
          <input
            checked={viewAsList}
            disabled={items.length === 0}
            type="checkbox"
            onChange={(event) => onToggleListView(ownerNodeId, event.target.checked)}
          />
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          <span>View as List</span>
        </label>
      </div>
      <RelationshipListContents emptyText={emptyText} items={items} />
    </section>
  );
}

interface RelationshipListProps {
  emptyText: string;
  items: OrgNode[];
  title: string;
}

function RelationshipList({ emptyText, items, title }: RelationshipListProps) {
  return (
    <section className="inspector-section">
      <h3>{title}</h3>
      <RelationshipListContents emptyText={emptyText} items={items} />
    </section>
  );
}

function RelationshipListContents({
  emptyText,
  items,
}: Pick<RelationshipListProps, "emptyText" | "items">) {
  return items.length > 0 ? (
    <ul className="relationship-list">
      {items.map((item) => {
        const displayText = getNodeDisplayText(item);

        return (
          <li key={item.id}>
            <span>{displayText.primary}</span>
            {displayText.secondary ? <small>{displayText.secondary}</small> : null}
          </li>
        );
      })}
    </ul>
  ) : (
    <p className="inspector-empty-text">{emptyText}</p>
  );
}

function getEligibleManagers(
  node: ReportTargetNode,
  chart: OrgChart,
): EmployeeNode[] {
  const descendantIds =
    node.type === "employee" ? getReportingDescendantIds(node.id, chart) : new Set();

  return chart.nodes.filter(
    (chartNode): chartNode is EmployeeNode =>
      chartNode.type === "employee" &&
      chartNode.id !== node.id &&
      !descendantIds.has(chartNode.id),
  );
}

function getReportingDescendantIds(nodeId: string, chart: OrgChart): Set<string> {
  const descendantIds = new Set<string>();
  const nodeIdsToVisit = chart.connections
    .filter(
      (connection) =>
        connection.connectionType === "reports_to" &&
        connection.fromNodeId === nodeId,
    )
    .map((connection) => connection.toNodeId);

  while (nodeIdsToVisit.length > 0) {
    const currentNodeId = nodeIdsToVisit.pop();

    if (!currentNodeId || descendantIds.has(currentNodeId)) {
      continue;
    }

    descendantIds.add(currentNodeId);

    for (const connection of chart.connections) {
      if (
        connection.connectionType === "reports_to" &&
        connection.fromNodeId === currentNodeId
      ) {
        nodeIdsToVisit.push(connection.toNodeId);
      }
    }
  }

  return descendantIds;
}
