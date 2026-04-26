import type { OrgNode, OrgNodeType } from "../types/orgChart";
import { getNodeDisplayText } from "../utils/display";

interface AddNodePanelProps {
  selectedNode: OrgNode | null;
  onAddNode: (nodeType: OrgNodeType) => void;
}

const addNodeOptions: Array<{ label: string; value: OrgNodeType }> = [
  { label: "Employee", value: "employee" },
  { label: "Vertical", value: "vertical" },
  { label: "Open role", value: "open_role" },
  { label: "Approved role", value: "approved_role" },
];

export function AddNodePanel({ selectedNode, onAddNode }: AddNodePanelProps) {
  const selectedDisplayText = selectedNode
    ? getNodeDisplayText(selectedNode).primary
    : null;

  return (
    <section className="add-node-panel" aria-label="Add node">
      <select
        aria-label="Add New"
        defaultValue=""
        onChange={(event) => {
          const nodeType = event.target.value as OrgNodeType;

          if (!nodeType) {
            return;
          }

          onAddNode(nodeType);
          event.target.value = "";
        }}
      >
        <option value="" disabled>
          Add New...
        </option>
        {addNodeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p>
        {selectedDisplayText
          ? `New nodes will start from ${selectedDisplayText}.`
          : "New nodes will be added without a connection."}
      </p>
    </section>
  );
}
