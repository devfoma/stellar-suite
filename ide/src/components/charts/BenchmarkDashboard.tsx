"use client";

import { useCallback, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Play, Trash2, ChevronDown, ChevronRight, Activity } from "lucide-react";

import {
  parseCriterionOutput,
  formatNs,
  type CriterionSample,
} from "@/lib/criterionParser";
import {
  useBenchmarkStore,
  type BenchmarkRun,
} from "@/store/useBenchmarkStore";
import { useWorkspaceStore, flattenWorkspaceFiles } from "@/store/workspaceStore";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BenchApiResponse {
  success?: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

// ── Tooltip style shared across charts ───────────────────────────────────────

const TOOLTIP_STYLE = {
  backgroundColor: "#1f2937",
  border: "1px solid #374151",
  borderRadius: "6px",
  fontSize: "11px",
  color: "#f9fafb",
};

// ── Statistics table ──────────────────────────────────────────────────────────

function StatsRow({ sample }: { sample: CriterionSample }) {
  return (
    <tr className="border-b border-border/60 hover:bg-muted/20 transition-colors">
      <td className="px-2 py-1.5 font-mono text-[10px] text-foreground max-w-[140px] truncate">
        {sample.name}
      </td>
      <td className="px-2 py-1.5 font-mono text-[10px] text-right tabular-nums text-blue-400">
        {formatNs(sample.mean)}
      </td>
      <td className="px-2 py-1.5 font-mono text-[10px] text-right tabular-nums text-amber-400">
        {formatNs(sample.p95)}
      </td>
      <td className="px-2 py-1.5 font-mono text-[10px] text-right tabular-nums text-red-400">
        {formatNs(sample.p99)}
      </td>
      <td className="px-2 py-1.5 font-mono text-[10px] text-right tabular-nums text-muted-foreground">
        [{formatNs(sample.low)} – {formatNs(sample.high)}]
      </td>
    </tr>
  );
}

// ── Percentile bar chart ──────────────────────────────────────────────────────

function PercentileChart({ samples }: { samples: CriterionSample[] }) {
  if (samples.length === 0) return null;

  const data = samples.map((s) => ({
    name: s.name.length > 18 ? `${s.name.slice(0, 16)}…` : s.name,
    Mean: parseFloat((s.mean / 1000).toFixed(3)),
    P95: parseFloat((s.p95 / 1000).toFixed(3)),
    P99: parseFloat((s.p99 / 1000).toFixed(3)),
  }));

  return (
    <div>
      <p className="text-[10px] text-muted-foreground mb-1.5">
        Execution time in µs (lower is better)
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart
          data={data}
          margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="name"
            stroke="#9ca3af"
            fontSize={9}
            tick={{ fill: "#9ca3af" }}
          />
          <YAxis
            stroke="#9ca3af"
            fontSize={9}
            tick={{ fill: "#9ca3af" }}
            tickFormatter={(v) => `${v}µs`}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number) => [`${v} µs`]}
          />
          <Legend
            wrapperStyle={{ fontSize: "10px", color: "#9ca3af" }}
          />
          <Bar dataKey="Mean" fill="#3b82f6" radius={[2, 2, 0, 0]} />
          <Bar dataKey="P95" fill="#f59e0b" radius={[2, 2, 0, 0]} />
          <Bar dataKey="P99" fill="#ef4444" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Historical trend chart ────────────────────────────────────────────────────

function TrendChart({
  runs,
  benchName,
}: {
  runs: BenchmarkRun[];
  benchName: string;
}) {
  const data = runs
    .map((run) => {
      const sample = run.samples.find((s) => s.name === benchName);
      if (!sample) return null;
      return {
        label: new Date(run.timestamp).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        Mean: parseFloat((sample.mean / 1000).toFixed(3)),
        Low: parseFloat((sample.low / 1000).toFixed(3)),
        High: parseFloat((sample.high / 1000).toFixed(3)),
      };
    })
    .filter(Boolean) as { label: string; Mean: number; Low: number; High: number }[];

  if (data.length < 2) {
    return (
      <p className="text-[10px] text-muted-foreground italic py-4 text-center">
        Run benchmarks at least twice to see historical trends.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="label"
          stroke="#9ca3af"
          fontSize={9}
          tick={{ fill: "#9ca3af" }}
        />
        <YAxis
          stroke="#9ca3af"
          fontSize={9}
          tick={{ fill: "#9ca3af" }}
          tickFormatter={(v) => `${v}µs`}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v: number) => [`${v} µs`]}
        />
        <Legend wrapperStyle={{ fontSize: "10px", color: "#9ca3af" }} />
        <Line
          type="monotone"
          dataKey="Mean"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 3, fill: "#3b82f6" }}
        />
        <Line
          type="monotone"
          dataKey="Low"
          stroke="#10b981"
          strokeWidth={1}
          strokeDasharray="4 2"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="High"
          stroke="#f59e0b"
          strokeWidth={1}
          strokeDasharray="4 2"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Trend section (collapsible per benchmark) ─────────────────────────────────

function TrendSection({
  runs,
  benchNames,
}: {
  runs: BenchmarkRun[];
  benchNames: string[];
}) {
  const [expanded, setExpanded] = useState<string | null>(
    benchNames[0] ?? null,
  );

  if (runs.length === 0 || benchNames.length === 0) return null;

  return (
    <div className="space-y-1">
      {benchNames.map((name) => (
        <div key={name} className="rounded border border-border/60 bg-card/40">
          <button
            type="button"
            onClick={() => setExpanded((v) => (v === name ? null : name))}
            className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/20 transition-colors"
          >
            {expanded === name ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <span className="font-mono text-[10px] text-foreground truncate">
              {name}
            </span>
          </button>
          {expanded === name && (
            <div className="px-2 pb-2">
              <TrendChart runs={runs} benchName={name} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Delta badge vs previous run ───────────────────────────────────────────────

function DeltaBadge({
  current,
  previous,
}: {
  current: number;
  previous: number | undefined;
}) {
  if (previous === undefined || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const improved = pct < -1;
  const regressed = pct > 1;

  if (!improved && !regressed) return null;

  return (
    <span
      className={`ml-1 font-mono text-[9px] font-semibold px-1 rounded ${
        improved
          ? "bg-emerald-900/60 text-emerald-300"
          : "bg-red-900/60 text-red-300"
      }`}
    >
      {improved ? "▼" : "▲"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ── Main BenchmarkDashboard ───────────────────────────────────────────────────

export function BenchmarkDashboard() {
  const { files } = useWorkspaceStore();
  const contractName = useMemo(
    () => files[0]?.name ?? "hello_world",
    [files],
  );

  const { isRunning, lastError, setIsRunning, setLastError, addRun, clearHistory, getRunsForContract } =
    useBenchmarkStore();

  const historicalRuns = getRunsForContract(contractName);
  const latestRun = historicalRuns.at(-1);
  const previousRun = historicalRuns.at(-2);

  // Build a map from bench name → previous mean for delta rendering
  const previousMeans = useMemo(() => {
    const map = new Map<string, number>();
    previousRun?.samples.forEach((s) => map.set(s.name, s.mean));
    return map;
  }, [previousRun]);

  const benchNames = useMemo(
    () => [...new Set(historicalRuns.flatMap((r) => r.samples.map((s) => s.name)))],
    [historicalRuns],
  );

  const handleRunBenchmarks = useCallback(async () => {
    setIsRunning(true);
    setLastError(null);

    const workspaceFiles = flattenWorkspaceFiles(files).map((f) => ({
      path: f.path,
      content: f.content,
    }));

    try {
      const response = await fetch("/api/bench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractName, files: workspaceFiles }),
      });

      const payload = (await response.json()) as BenchApiResponse;
      const raw = `${payload.stdout ?? ""}${payload.stderr ?? ""}`;

      if (payload.error && !raw.trim()) {
        setLastError(payload.error);
        return;
      }

      const parsed = parseCriterionOutput(raw);

      if (parsed.samples.length === 0) {
        setLastError(
          "No benchmark results found. Ensure your contract has #[bench] functions or criterion benchmarks.",
        );
        return;
      }

      addRun({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        contractName,
        timestamp: Date.now(),
        samples: parsed.samples,
        rawOutput: raw,
      });
    } catch (err) {
      setLastError(
        err instanceof Error ? err.message : "Benchmark request failed",
      );
    } finally {
      setIsRunning(false);
    }
  }, [contractName, files, setIsRunning, setLastError, addRun]);

  return (
    <div className="h-full bg-sidebar flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Benchmarks
          </span>
        </div>
        <div className="flex items-center gap-1">
          {historicalRuns.length > 0 && (
            <button
              type="button"
              title={`Clear benchmark history for ${contractName}`}
              onClick={() => clearHistory(contractName)}
              className="p-1 rounded text-muted-foreground hover:text-red-400 transition-colors"
              aria-label="Clear benchmark history"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => { void handleRunBenchmarks(); }}
            disabled={isRunning}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-mono bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Run benchmarks"
          >
            <Play className="h-3 w-3" aria-hidden="true" />
            {isRunning ? "Running…" : "Run Bench"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
        {/* Status messages */}
        {isRunning && (
          <div className="flex items-center gap-2 rounded border border-border/60 bg-card/60 px-3 py-2">
            <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] text-muted-foreground font-mono">
              Running <code>cargo bench --message-format=json</code>…
            </span>
          </div>
        )}

        {lastError && !isRunning && (
          <div className="rounded border border-red-800/60 bg-red-950/30 px-3 py-2">
            <p className="text-[10px] text-red-400 font-mono">{lastError}</p>
          </div>
        )}

        {/* Empty state */}
        {!isRunning && !lastError && historicalRuns.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Activity className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
            <div>
              <p className="text-xs font-medium text-foreground mb-1">
                No benchmark data yet
              </p>
              <p className="text-[10px] text-muted-foreground max-w-[200px] leading-relaxed">
                Click <strong>Run Bench</strong> to execute{" "}
                <code className="font-mono">cargo bench</code> and capture
                criterion results.
              </p>
            </div>
          </div>
        )}

        {/* Latest run statistics */}
        {latestRun && latestRun.samples.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Latest Run
              </h3>
              <span className="text-[9px] text-muted-foreground font-mono">
                {new Date(latestRun.timestamp).toLocaleString()}
              </span>
            </div>

            {/* Stats table */}
            <div className="rounded border border-border/60 overflow-hidden">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60">
                    <th className="px-2 py-1 text-left font-semibold text-muted-foreground">
                      Benchmark
                    </th>
                    <th className="px-2 py-1 text-right font-semibold text-blue-400">
                      Mean
                    </th>
                    <th className="px-2 py-1 text-right font-semibold text-amber-400">
                      P95
                    </th>
                    <th className="px-2 py-1 text-right font-semibold text-red-400">
                      P99
                    </th>
                    <th className="px-2 py-1 text-right font-semibold text-muted-foreground">
                      95% CI
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {latestRun.samples.map((s) => (
                    <tr
                      key={s.name}
                      className="border-b border-border/60 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-2 py-1.5 font-mono text-[10px] text-foreground max-w-[140px]">
                        <span className="truncate block">{s.name}</span>
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[10px] text-right tabular-nums text-blue-400">
                        {formatNs(s.mean)}
                        <DeltaBadge
                          current={s.mean}
                          previous={previousMeans.get(s.name)}
                        />
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[10px] text-right tabular-nums text-amber-400">
                        {formatNs(s.p95)}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[10px] text-right tabular-nums text-red-400">
                        {formatNs(s.p99)}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[10px] text-right tabular-nums text-muted-foreground">
                        [{formatNs(s.low)} – {formatNs(s.high)}]
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Percentile comparison bar chart */}
        {latestRun && latestRun.samples.length > 0 && (
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Mean / P95 / P99 Comparison
            </h3>
            <PercentileChart samples={latestRun.samples} />
          </section>
        )}

        {/* Historical trend - only shown if ≥1 run exists */}
        {historicalRuns.length > 0 && benchNames.length > 0 && (
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Historical Trends
              <span className="ml-1.5 normal-case text-[9px] font-normal">
                ({historicalRuns.length} run{historicalRuns.length !== 1 ? "s" : ""})
              </span>
            </h3>
            <TrendSection runs={historicalRuns} benchNames={benchNames} />
          </section>
        )}
      </div>
    </div>
  );
}
