export type OrgNodeType =
  | "employee"
  | "vertical"
  | "open_role"
  | "approved_role";

export type OrgConnectionType =
  | "reports_to"
  | "owns_vertical"
  | "belongs_to_vertical";

export type UplineConnectionStyle = "solid" | "hashed";

export type OrgNodeBackgroundColor =
  | "#ffffff"
  | "#f5f3f3"
  | "#eef3ff"
  | "#edf7f1"
  | "#fff6dd"
  | "#f7efff"
  | "#fbeff2"
  | "#edf6f8";

export interface OrgChart {
  id: string;
  name: string;
  nodes: OrgNode[];
  connections: OrgConnection[];
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface CanvasTextBox {
  id: string;
  type: "text_box";
  x: number;
  y: number;
  width: number;
  height: number;
  html: string;
  backgroundColor?: OrgNodeBackgroundColor;
  notes?: string;
  metadata?: Record<string, unknown>;
}

interface OrgNodeBase {
  id: string;
  type: OrgNodeType;
  uplineConnectionStyle: UplineConnectionStyle;
  backgroundColor?: OrgNodeBackgroundColor;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface EmployeeNode extends OrgNodeBase {
  type: "employee";
  name: string;
  jobTitle: string;
}

export interface VerticalNode extends OrgNodeBase {
  type: "vertical";
  verticalName: string;
}

export interface OpenRoleNode extends OrgNodeBase {
  type: "open_role";
  statusLabel: string;
  roleTitle: string;
}

export interface ApprovedRoleNode extends OrgNodeBase {
  type: "approved_role";
  statusLabel: string;
  roleTitle: string;
}

export type OrgNode =
  | EmployeeNode
  | VerticalNode
  | OpenRoleNode
  | ApprovedRoleNode;

export interface OrgConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  connectionType: OrgConnectionType;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface NodeDisplayText {
  primary: string;
  secondary: string | null;
}

export type ReportTargetNode = EmployeeNode | OpenRoleNode | ApprovedRoleNode;

export interface OrgChartValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
  connectionId?: string;
}

export interface OrgChartValidationResult {
  isValid: boolean;
  issues: OrgChartValidationIssue[];
}
