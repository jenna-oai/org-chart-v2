import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CanvasTextBox as CanvasTextBoxModel } from "../types/orgChart";

interface CanvasTextBoxProps {
  textBox: CanvasTextBoxModel;
  isSelected: boolean;
  onChange: (textBox: CanvasTextBoxModel) => void;
  onSelect: (textBoxId: string) => void;
}

export function CanvasTextBox({
  textBox,
  isSelected,
  onChange,
  onSelect,
}: CanvasTextBoxProps) {
  const textBoxRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const hasHydratedEditorRef = useRef(false);
  const [dragState, setDragState] = useState<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    const editorIsActive = document.activeElement === editorRef.current;

    if (
      (!hasHydratedEditorRef.current || !editorIsActive) &&
      editorRef.current.innerHTML !== textBox.html
    ) {
      editorRef.current.innerHTML = textBox.html;
    }

    hasHydratedEditorRef.current = true;
  }, [textBox.html]);

  useLayoutEffect(() => {
    if (!isSelected || textBox.html !== "") {
      return;
    }

    editorRef.current?.focus();
    placeCaretAtEnd(editorRef.current);
  }, [isSelected, textBox.html]);

  useEffect(() => {
    if (!isSelected) {
      hasHydratedEditorRef.current = false;
    }
  }, [isSelected]);

  useEffect(() => {
    const element = textBoxRef.current;

    if (!element) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const nextWidth = Math.round(width);
      const nextHeight = Math.round(height);

      if (nextWidth !== textBox.width || nextHeight !== textBox.height) {
        onChange({
          ...textBox,
          width: nextWidth,
          height: nextHeight,
        });
      }
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [onChange, textBox]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      onChange({
        ...textBox,
        x: Math.max(0, dragState.startX + event.clientX - dragState.startClientX),
        y: Math.max(0, dragState.startY + event.clientY - dragState.startClientY),
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId === dragState.pointerId) {
        setDragState(null);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, onChange, textBox]);

  return (
    <div
      ref={textBoxRef}
      className={`canvas-text-box ${
        isSelected ? "canvas-text-box--selected" : ""
      }`}
      style={{
        transform: `translate(${textBox.x}px, ${textBox.y}px)`,
        width: textBox.width,
        height: textBox.height,
        ...(textBox.backgroundColor
          ? { backgroundColor: textBox.backgroundColor }
          : {}),
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(textBox.id);
      }}
    >
      <div
        className="canvas-text-box-drag-handle"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSelect(textBox.id);
          setDragState({
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startX: textBox.x,
            startY: textBox.y,
          });
        }}
      />
      <div
        ref={editorRef}
        className="canvas-text-box-editor"
        contentEditable
        role="textbox"
        aria-label="Text box note"
        suppressContentEditableWarning
        onInput={(event) =>
          onChange({
            ...textBox,
            html: event.currentTarget.innerHTML,
          })
        }
        onKeyDown={(event) => {
          if (!event.metaKey) {
            return;
          }

          if (event.key.toLowerCase() === "b") {
            event.preventDefault();
            document.execCommand("bold");
          }

          if (event.key.toLowerCase() === "i") {
            event.preventDefault();
            document.execCommand("italic");
          }

          if (event.key.toLowerCase() === "u") {
            event.preventDefault();
            document.execCommand("underline");
          }
        }}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(textBox.id);
        }}
      />
    </div>
  );
}

function placeCaretAtEnd(element: HTMLElement | null): void {
  if (!element) {
    return;
  }

  const range = document.createRange();
  const selection = window.getSelection();

  range.selectNodeContents(element);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}
