import { useEffect, useRef, useState } from "react";

interface ToolbarPlaceholderProps {
  chartName: string;
  isTitleSelected: boolean;
  onChangeChartName: (chartName: string) => void;
  onSelectTitle: () => void;
}

export function ToolbarPlaceholder({
  chartName,
  isTitleSelected,
  onChangeChartName,
  onSelectTitle,
}: ToolbarPlaceholderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isTitleSelected) {
      setIsEditingTitle(false);
    }
  }, [isTitleSelected]);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  return (
    <header className="toolbar-placeholder">
      {isEditingTitle ? (
        <input
          ref={titleInputRef}
          aria-label="Chart title"
          className="chart-title-input"
          value={chartName}
          onBlur={() => setIsEditingTitle(false)}
          onChange={(event) => onChangeChartName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.currentTarget.blur();
            }
          }}
        />
      ) : (
        <button
          type="button"
          className={`chart-title-button ${
            isTitleSelected ? "chart-title-button--selected" : ""
          }`}
          aria-pressed={isTitleSelected}
          onClick={() => {
            if (isTitleSelected) {
              setIsEditingTitle(true);
              return;
            }

            onSelectTitle();
          }}
        >
          <h1>{chartName}</h1>
        </button>
      )}
    </header>
  );
}
