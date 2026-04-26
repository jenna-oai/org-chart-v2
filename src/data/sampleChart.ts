import type { OrgChart } from "../types/orgChart";

export const sampleChart: OrgChart = {
  id: "nimbus-robotics-finance",
  name: "Nimbus Robotics Finance",
  nodes: [
    {
      id: "maya-chen",
      type: "employee",
      name: "Maya Chen",
      jobTitle: "VP, Finance",
    },
    {
      id: "daniel-brooks",
      type: "employee",
      name: "Daniel Brooks",
      jobTitle: "Director, Business Finance",
    },
    {
      id: "sam-patel",
      type: "employee",
      name: "Sam Patel",
      jobTitle: "Senior Finance Manager",
    },
    {
      id: "revenue-finance",
      type: "vertical",
      verticalName: "Revenue Finance",
    },
    {
      id: "product-finance",
      type: "vertical",
      verticalName: "Product Finance",
    },
    {
      id: "corporate-finance",
      type: "vertical",
      verticalName: "Corporate Finance",
    },
    {
      id: "priya-shah",
      type: "employee",
      name: "Priya Shah",
      jobTitle: "Revenue Finance Lead",
    },
    {
      id: "revenue-finance-analyst",
      type: "open_role",
      statusLabel: "Open Role",
      roleTitle: "Revenue Finance Analyst",
    },
    {
      id: "lucas-romero",
      type: "employee",
      name: "Lucas Romero",
      jobTitle: "Product Finance Lead",
    },
    {
      id: "product-finance-analyst",
      type: "approved_role",
      statusLabel: "Approved HC",
      roleTitle: "Product Finance Analyst",
    },
    {
      id: "corporate-finance-manager",
      type: "open_role",
      statusLabel: "Open Role",
      roleTitle: "Corporate Finance Manager",
    },
  ],
  connections: [
    {
      id: "maya-to-daniel",
      fromNodeId: "maya-chen",
      toNodeId: "daniel-brooks",
      connectionType: "reports_to",
    },
    {
      id: "daniel-to-sam",
      fromNodeId: "daniel-brooks",
      toNodeId: "sam-patel",
      connectionType: "reports_to",
    },
    {
      id: "daniel-owns-revenue-finance",
      fromNodeId: "daniel-brooks",
      toNodeId: "revenue-finance",
      connectionType: "owns_vertical",
    },
    {
      id: "daniel-owns-product-finance",
      fromNodeId: "daniel-brooks",
      toNodeId: "product-finance",
      connectionType: "owns_vertical",
    },
    {
      id: "daniel-owns-corporate-finance",
      fromNodeId: "daniel-brooks",
      toNodeId: "corporate-finance",
      connectionType: "owns_vertical",
    },
    {
      id: "revenue-finance-to-priya",
      fromNodeId: "revenue-finance",
      toNodeId: "priya-shah",
      connectionType: "belongs_to_vertical",
    },
    {
      id: "revenue-finance-to-analyst",
      fromNodeId: "revenue-finance",
      toNodeId: "revenue-finance-analyst",
      connectionType: "belongs_to_vertical",
    },
    {
      id: "product-finance-to-lucas",
      fromNodeId: "product-finance",
      toNodeId: "lucas-romero",
      connectionType: "belongs_to_vertical",
    },
    {
      id: "product-finance-to-analyst",
      fromNodeId: "product-finance",
      toNodeId: "product-finance-analyst",
      connectionType: "belongs_to_vertical",
    },
    {
      id: "corporate-finance-to-manager",
      fromNodeId: "corporate-finance",
      toNodeId: "corporate-finance-manager",
      connectionType: "belongs_to_vertical",
    },
  ],
};
