interface ToolbarPlaceholderProps {
  chartName: string;
}

export function ToolbarPlaceholder({ chartName }: ToolbarPlaceholderProps) {
  return (
    <header className="toolbar-placeholder">
      <h1>{chartName}</h1>
    </header>
  );
}
