"use client";

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  Download,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Variable,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnvVar {
  id: string;
  key: string;
  value: string;
  masked: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextId = 0;
function makeId(): string {
  return `env-${Date.now()}-${nextId++}`;
}

function generateDotEnv(vars: EnvVar[]): string {
  return vars
    .filter((v) => v.key.trim() !== "")
    .map((v) => {
      const val = v.value.includes(" ") ? `"${v.value}"` : v.value;
      return `${v.key}=${val}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface EnvRowProps {
  envVar: EnvVar;
  onChange: (id: string, field: "key" | "value", value: string) => void;
  onToggleMask: (id: string) => void;
  onDelete: (id: string) => void;
}

function EnvRow({ envVar, onChange, onToggleMask, onDelete }: EnvRowProps) {
  return (
    <div className="flex items-center gap-2">
      <Input
        value={envVar.key}
        onChange={(e) => onChange(envVar.id, "key", e.target.value)}
        placeholder="VARIABLE_NAME"
        className="h-8 flex-1 font-mono text-[11px]"
        spellCheck={false}
      />
      <Input
        value={envVar.value}
        onChange={(e) => onChange(envVar.id, "value", e.target.value)}
        placeholder="value"
        type={envVar.masked ? "password" : "text"}
        className="h-8 flex-[2] font-mono text-[11px]"
        spellCheck={false}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground"
        onClick={() => onToggleMask(envVar.id)}
        aria-label={envVar.masked ? "Show value" : "Hide value"}
      >
        {envVar.masked ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(envVar.id)}
        aria-label="Delete variable"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function EnvVarManager() {
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);

  const handleAdd = useCallback(() => {
    setEnvVars((prev) => [
      ...prev,
      { id: makeId(), key: "", value: "", masked: false },
    ]);
  }, []);

  const handleChange = useCallback(
    (id: string, field: "key" | "value", value: string) => {
      setEnvVars((prev) =>
        prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
      );
    },
    [],
  );

  const handleToggleMask = useCallback((id: string) => {
    setEnvVars((prev) =>
      prev.map((v) => (v.id === id ? { ...v, masked: !v.masked } : v)),
    );
  }, []);

  const handleDelete = useCallback((id: string) => {
    setEnvVars((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const handleExport = useCallback(() => {
    const nonEmpty = envVars.filter((v) => v.key.trim() !== "");
    if (nonEmpty.length === 0) {
      toast.error("No variables to export. Add at least one key-value pair.");
      return;
    }

    const content = generateDotEnv(envVars);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ".env";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(".env file downloaded.");
  }, [envVars]);

  return (
    <section className="space-y-3 rounded-md border border-border bg-card/60 p-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
          <Variable className="h-3.5 w-3.5 text-primary" />
          Environment Variables
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[10px]"
            onClick={handleExport}
            disabled={envVars.length === 0}
          >
            <Download className="mr-1 h-3 w-3" />
            Export .env
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 text-[10px]"
            onClick={handleAdd}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add Variable
          </Button>
        </div>
      </div>

      {/* Security warning */}
      <div className="flex items-start gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 p-2">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
        <p className="text-[10px] text-amber-300/90 leading-relaxed">
          <strong className="font-semibold">Do not commit .env files to public repositories.</strong>{" "}
          Environment variables often contain secrets (API keys, tokens, passwords).
          Use <span className="font-mono">.gitignore</span> to exclude{" "}
          <span className="font-mono">.env</span> from version control.
        </p>
      </div>

      {/* Column headers */}
      {envVars.length > 0 && (
        <div className="flex items-center gap-2 px-0.5">
          <span className="flex-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Key
          </span>
          <span className="flex-[2] text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Value
          </span>
          {/* Spacer for toggle + delete buttons */}
          <span className="w-[72px] shrink-0" />
        </div>
      )}

      {/* Variable rows */}
      {envVars.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">
          No environment variables defined. Click &quot;Add Variable&quot; to get started.
        </p>
      ) : (
        <div className="space-y-1.5">
          {envVars.map((v) => (
            <EnvRow
              key={v.id}
              envVar={v}
              onChange={handleChange}
              onToggleMask={handleToggleMask}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
}
