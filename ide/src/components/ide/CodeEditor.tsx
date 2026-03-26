import React, { Suspense, useEffect, useRef } from "react";
import Editor, { type OnChange, type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";

interface RevealRangeDetail {
  fileId: string;
  pathParts: string[];
  range: Monaco.IRange;
}

export interface CodeEditorProps {
  content: string;
  language: string;
  fileId?: string;
  onChange?: (value: string) => void;
  onCursorChange?: (line: number, col: number) => void;
  onSave?: () => void;
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  content,
  language,
  fileId,
  onChange,
  onCursorChange,
  onSave,
}: CodeEditorProps) => {
  const monacoRef = useRef<typeof Monaco | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const pendingRangeRef = useRef<Monaco.IRange | null>(null);

  const applyReveal = (range: Monaco.IRange) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) {
      pendingRangeRef.current = range;
      return;
    }

    editor.revealRangeInCenter(range);
    editor.setSelection(range);
    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, [
      {
        range,
        options: {
          inlineClassName: "search-match-decoration",
        },
      },
    ]);
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<RevealRangeDetail>).detail;
      if (!detail) return;
      if (detail.fileId !== fileId) return;
      applyReveal(detail.range);
    };

    window.addEventListener("ide:reveal-range", handler);
    return () => window.removeEventListener("ide:reveal-range", handler);
  }, [fileId]);

  const handleEditorChange: OnChange = (value) => {
    if (value === undefined) return;
    onChange?.(value);
  };

  const defineTheme = (monaco: typeof Monaco) => {
    // Define theme only once per mount.
    monaco.editor.defineTheme("stellar-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#1e1e2e",
        "editor.foreground": "#cdd6f4",
        "editor.lineHighlightBackground": "#313244",
        "editor.selectionBackground": "#45475a",
        "editorCursor.foreground": "#f5e0dc",
        "editorWhitespace.foreground": "#45475a",
        "editorIndentGuide.background": "#313244",
        "editorIndentGuide.activeBackground": "#45475a",
      },
    });
    monaco.editor.setTheme("stellar-dark");
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editor;

    defineTheme(monaco);

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave?.();
    });

    editor.onDidChangeCursorPosition((e) => {
      onCursorChange?.(e.position.lineNumber, e.position.column);
    });

    if (pendingRangeRef.current) {
      applyReveal(pendingRangeRef.current);
      pendingRangeRef.current = null;
    }
  };

  // Monaco's height is controlled by the parent container in this layout.
  return (
    <div className="relative h-full w-full overflow-hidden border-t border-border">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-[#1e1e2e] font-mono text-xs text-muted-foreground">
            Loading Editor...
          </div>
        }
      >
        <Editor
          height="100%"
          defaultLanguage={language}
          language={language}
          value={content}
          theme="stellar-dark"
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            lineNumbers: "on",
            glyphMargin: false,
            folding: true,
            lineDecorationsWidth: 10,
            lineNumbersMinChars: 3,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
          }}
        />
      </Suspense>
    </div>
  );
};

export default CodeEditor;

