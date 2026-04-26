import type { OrgNode, OrgNodeType } from "../types/orgChart";
import { getNodeDisplayText } from "../utils/display";

export type AddMenuItemType = OrgNodeType | "text_box";

interface AddNodePanelProps {
  selectedNode: OrgNode | null;
  onAddItem: (itemType: AddMenuItemType) => void;
}

const addNodeOptions: Array<{ label: string; value: AddMenuItemType }> = [
  { label: "Employee", value: "employee" },
  { label: "Vertical", value: "vertical" },
  { label: "Open role", value: "open_role" },
  { label: "Approved role", value: "approved_role" },
  { label: "Text box", value: "text_box" },
];

export function AddNodePanel({ selectedNode, onAddItem }: AddNodePanelProps) {
  const selectedDisplayText = selectedNode
    ? getNodeDisplayText(selectedNode).primary
    : null;

  return (
    <section className="add-node-panel" aria-label="Add node">
      <select
        aria-label="Add New"
        defaultValue=""
        onChange={(event) => {
          const itemType = event.target.value as AddMenuItemType;

          if (!itemType) {
            return;
          }

          onAddItem(itemType);
          event.target.value = "";
          event.target.blur();
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
