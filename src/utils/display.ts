import type { NodeDisplayText, OrgNode } from "../types/orgChart";

export function getNodeDisplayText(node: OrgNode): NodeDisplayText {
  switch (node.type) {
    case "employee":
      return {
        primary: node.name,
        secondary: node.jobTitle,
      };
    case "vertical":
      return {
        primary: node.verticalName,
        secondary: null,
      };
    case "open_role":
    case "approved_role":
      return {
        primary: node.statusLabel,
        secondary: node.roleTitle,
      };
  }
}
