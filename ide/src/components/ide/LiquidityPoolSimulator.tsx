"use client";

import { useState, useCallback } from "react";
import {
  TrendingUp,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Zap,
  Droplets,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useIdentityStore } from "@/store/useIdentityStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { Badge } from "@/components/ui/badge";

// ── AMM Simulation Logic (Constant-Product x·y = k) ─────────────────────────

interface SwapSimResult {
  amountOut: number;
  minReceived: number;
  priceImpact: number;
  feeAmount: number;
  spotPrice: number;
  executionPrice: number;
  newReserveA: number;
  newReserveB: number;
  newSpotPrice: number;
  k: number;
  effectiveSlippage: number;
}

function simulateConstantProductSwap(
  reserveA: number,
  reserveB: number,
  amountIn: number,
  feePct: number,
  slippagePct: number
): SwapSimResult {
  const feeMultiplier = 1 - feePct / 100;
  const amountInWithFee = amountIn * feeMultiplier;
  const amountOut = (reserveB * amountInWithFee) / (reserveA + amountInWithFee);
  const feeAmount = amountIn * (feePct / 100);

  const spotPrice = reserveB / reserveA;
  const executionPrice = amountOut / amountIn;
  const priceImpact = ((spotPrice - executionPrice) / spotPrice) * 100;

  const minReceived = amountOut * (1 - slippagePct / 100);
  const effectiveSlippage = Math.max(0, priceImpact);

  const newReserveA = reserveA + amountIn;
  const newReserveB = reserveB - amountOut;
  const newSpotPrice = newReserveB / newReserveA;

  return {
    amountOut,
    minReceived,
    priceImpact,
    feeAmount,
    spotPrice,
    executionPrice,
    newReserveA,
    newReserveB,
    newSpotPrice,
    k: reserveA * reserveB,
    effectiveSlippage,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, decimals = 6) =>
  n.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: 2 });

const fmtPct = (n: number) =>
  `${Math.abs(n).toFixed(4)}%`;

function getImpactLevel(impact: number): {
  label: string;
  color: string;
  badge: string;
  icon: React.ReactNode;
} {
  if (impact < 0.1)
    return {
      label: "Excellent",
      color: "text-emerald-400",
      badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
      icon: <CheckCircle2 className="h-3 w-3" />,
    };
  if (impact < 1)
    return {
      label: "Low",
      color: "text-blue-400",
      badge: "bg-blue-500/15 text-blue-400 border-blue-500/25",
      icon: <CheckCircle2 className="h-3 w-3" />,
    };
  if (impact < 5)
    return {
      label: "Medium",
      color: "text-amber-400",
      badge: "bg-amber-500/15 text-amber-400 border-amber-500/25",
      icon: <AlertTriangle className="h-3 w-3" />,
    };
  if (impact < 10)
    return {
      label: "High",
      color: "text-orange-400",
      badge: "bg-orange-500/15 text-orange-400 border-orange-500/25",
      icon: <AlertTriangle className="h-3 w-3" />,
    };
  return {
    label: "Very High",
    color: "text-red-400",
    badge: "bg-red-500/15 text-red-400 border-red-500/25",
    icon: <AlertCircle className="h-3 w-3" />,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  collapsible,
  open,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  const inner = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </div>
      {collapsible &&
        (open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        ))}
    </div>
  );

  if (collapsible) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-3 py-2 border-b border-sidebar-border hover:bg-sidebar-accent/30 transition-colors"
      >
        {inner}
      </button>
    );
  }
  return (
    <div className="px-3 py-2 border-b border-sidebar-border">{inner}</div>
  );
}

function NumInput({
  label,
  value,
  onChange,
  min,
  step,
  suffix,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  step?: number;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-0.5">
      <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
        {label}
      </label>
      <div className="relative">
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-background border border-border rounded px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary text-foreground pr-8"
        />
        {suffix && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-mono text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function LiquidityPoolSimulator() {
  const { identities, activeIdentity } = useIdentityStore();
  const { network, contractId } = useWorkspaceStore();

  // Pool config
  const [poolOpen, setPoolOpen] = useState(true);
  const [assetA, setAssetA] = useState("XLM");
  const [assetB, setAssetB] = useState("USDC");
  const [reserveA, setReserveA] = useState("100000");
  const [reserveB, setReserveB] = useState("50000");
  const [feePct, setFeePct] = useState("0.3");

  // Swap inputs
  const [amountIn, setAmountIn] = useState("1000");
  const [slippage, setSlippage] = useState("0.5");
  const [direction, setDirection] = useState<"A_TO_B" | "B_TO_A">("A_TO_B");

  // Result
  const [result, setResult] = useState<SwapSimResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  // Template copy
  const [copiedTemplate, setCopiedTemplate] = useState(false);

  const fromAsset = direction === "A_TO_B" ? assetA : assetB;
  const toAsset = direction === "A_TO_B" ? assetB : assetA;

  const handleSimulate = useCallback(() => {
    setSimError(null);
    const rA = parseFloat(direction === "A_TO_B" ? reserveA : reserveB);
    const rB = parseFloat(direction === "A_TO_B" ? reserveB : reserveA);
    const aIn = parseFloat(amountIn);
    const fee = parseFloat(feePct);
    const slip = parseFloat(slippage);

    if ([rA, rB, aIn, fee, slip].some(isNaN) || rA <= 0 || rB <= 0 || aIn <= 0) {
      setSimError("All pool reserves and swap amount must be positive numbers.");
      return;
    }
    if (aIn >= rA) {
      setSimError(`Amount in (${fmt(aIn)}) must be less than pool reserve (${fmt(rA)}).`);
      return;
    }

    try {
      const sim = simulateConstantProductSwap(rA, rB, aIn, fee, slip);
      setResult(sim);
    } catch (err) {
      setSimError(err instanceof Error ? err.message : "Simulation failed.");
    }
  }, [amountIn, direction, feePct, reserveA, reserveB, slippage]);

  const handleReset = () => {
    setResult(null);
    setSimError(null);
  };

  // Soroban CLI template
  const cliTemplate = `# Soroban AMM Swap — ${fromAsset} → ${toAsset}
# Network: ${network}  |  Contract: ${contractId ?? "<contract-id>"}

soroban contract invoke \\
  --id ${contractId ?? "<CONTRACT_ID>"} \\
  --source ${activeIdentity?.nickname ?? identities[0]?.nickname ?? "<IDENTITY>"} \\
  --network ${network} \\
  -- swap \\
  --sell_token ${fromAsset} \\
  --buy_token ${toAsset} \\
  --sell_amount ${amountIn} \\
  --min_buy_amount ${result ? result.minReceived.toFixed(6) : "<min_out>"} \\
  --deadline $(date -d "+5 minutes" +%s)`;

  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(cliTemplate).then(() => {
      setCopiedTemplate(true);
      setTimeout(() => setCopiedTemplate(false), 1500);
      toast.success("CLI template copied to clipboard.");
    });
  };

  const impactInfo = result ? getImpactLevel(result.priceImpact) : null;

  return (
    <div className="h-full bg-sidebar flex flex-col overflow-hidden animate-in fade-in duration-300">
      {/* Panel Header */}
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-sidebar-border flex items-center gap-1.5 shrink-0">
        <TrendingUp className="h-3.5 w-3.5 text-primary" />
        <span>LP Swap Simulator</span>
        <Badge className="ml-auto text-[8px] py-0 h-4 px-1.5 bg-primary/15 text-primary border-primary/25">
          AMM
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* ── Pool Configuration ─────────────────────────────────────────── */}
        <SectionHeader
          icon={<Droplets className="h-3 w-3 text-blue-400" />}
          title="Pool Configuration"
          collapsible
          open={poolOpen}
          onToggle={() => setPoolOpen((p) => !p)}
        />
        {poolOpen && (
          <div className="p-3 border-b border-sidebar-border space-y-3 animate-in slide-in-from-top-1 duration-150">
            {/* Asset names */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  Asset A
                </label>
                <input
                  value={assetA}
                  onChange={(e) => setAssetA(e.target.value.toUpperCase())}
                  className="w-full bg-background border border-border rounded px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  placeholder="XLM"
                  maxLength={12}
                />
              </div>
              <div className="space-y-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  Asset B
                </label>
                <input
                  value={assetB}
                  onChange={(e) => setAssetB(e.target.value.toUpperCase())}
                  className="w-full bg-background border border-border rounded px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  placeholder="USDC"
                  maxLength={12}
                />
              </div>
            </div>

            {/* Reserves */}
            <div className="grid grid-cols-2 gap-2">
              <NumInput
                label={`Reserve ${assetA || "A"}`}
                value={reserveA}
                onChange={setReserveA}
                min={1}
                step={1000}
                placeholder="100000"
              />
              <NumInput
                label={`Reserve ${assetB || "B"}`}
                value={reserveB}
                onChange={setReserveB}
                min={1}
                step={1000}
                placeholder="50000"
              />
            </div>

            {/* Fee */}
            <NumInput
              label="LP Fee"
              value={feePct}
              onChange={setFeePct}
              min={0}
              step={0.05}
              suffix="%"
              placeholder="0.3"
            />

            {/* Pool k constant preview */}
            {parseFloat(reserveA) > 0 && parseFloat(reserveB) > 0 && (
              <div className="flex items-center justify-between text-[9px] font-mono bg-muted/30 rounded px-2 py-1.5 border border-border">
                <span className="text-muted-foreground">k = x·y</span>
                <span className="text-foreground">
                  {(parseFloat(reserveA) * parseFloat(reserveB)).toLocaleString("en-US", {
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Swap Input ─────────────────────────────────────────────────── */}
        <SectionHeader
          icon={<Zap className="h-3 w-3 text-amber-400" />}
          title="Swap Parameters"
        />
        <div className="p-3 border-b border-sidebar-border space-y-3">
          {/* Direction toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-muted-foreground">Direction:</span>
            <button
              type="button"
              onClick={() => {
                setDirection((d) => (d === "A_TO_B" ? "B_TO_A" : "A_TO_B"));
                setResult(null);
              }}
              className="flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-card/50 hover:bg-muted/60 transition-colors text-[10px] font-mono font-bold text-foreground"
            >
              <span className="text-primary">{fromAsset || "A"}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-blue-400">{toAsset || "B"}</span>
              <RefreshCw className="h-2.5 w-2.5 text-muted-foreground ml-0.5" />
            </button>
          </div>

          <NumInput
            label={`Amount In (${fromAsset || "Asset A"})`}
            value={amountIn}
            onChange={(v) => { setAmountIn(v); setResult(null); }}
            min={0.000001}
            step={100}
            placeholder="1000"
          />

          <NumInput
            label="Slippage Tolerance"
            value={slippage}
            onChange={(v) => { setSlippage(v); setResult(null); }}
            min={0.01}
            step={0.1}
            suffix="%"
            placeholder="0.5"
          />

          {simError && (
            <div className="flex items-start gap-1.5 p-2 rounded bg-destructive/10 border border-destructive/20 text-destructive text-[10px]">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{simError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleSimulate}
            className="w-full bg-primary text-primary-foreground py-1.5 text-[11px] font-bold rounded hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Simulate Swap
          </button>
        </div>

        {/* ── Simulation Results ─────────────────────────────────────────── */}
        {result && (
          <>
            <SectionHeader
              icon={<BarChart3 className="h-3 w-3 text-primary" />}
              title="Simulation Results"
            />

            <div className="p-3 border-b border-sidebar-border space-y-3 animate-in slide-in-from-bottom-2 duration-200">
              {/* Main output */}
              <div className="rounded-lg border border-border bg-card/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Amount Out</span>
                  <span className="text-[13px] font-bold text-foreground font-mono">
                    {fmt(result.amountOut)} {toAsset}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Min Received</span>
                  <span className="text-[11px] font-mono text-amber-400">
                    {fmt(result.minReceived)} {toAsset}
                  </span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">LP Fee</span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {fmt(result.feeAmount)} {fromAsset}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Execution Price</span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {fmt(result.executionPrice, 4)} {toAsset}/{fromAsset}
                  </span>
                </div>
              </div>

              {/* Price Impact */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    Price Impact
                  </span>
                  <Badge className={`text-[9px] py-0 h-4 px-1.5 flex items-center gap-0.5 ${impactInfo!.badge}`}>
                    {impactInfo!.icon}
                    {impactInfo!.label} — {fmtPct(result.priceImpact)}
                  </Badge>
                </div>

                {/* Impact bar */}
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      result.priceImpact < 0.1
                        ? "bg-emerald-500"
                        : result.priceImpact < 1
                        ? "bg-blue-500"
                        : result.priceImpact < 5
                        ? "bg-amber-500"
                        : result.priceImpact < 10
                        ? "bg-orange-500"
                        : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(result.priceImpact * 10, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[8px] font-mono text-muted-foreground/60">
                  <span>0%</span>
                  <span>5%</span>
                  <span>10%+</span>
                </div>

                {/* Slippage alert */}
                {result.priceImpact > parseFloat(slippage) && (
                  <div className="flex items-start gap-1.5 p-2 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[9px]">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                    <span>
                      Price impact ({fmtPct(result.priceImpact)}) exceeds your slippage
                      tolerance ({slippage}%). Transaction may revert.
                    </span>
                  </div>
                )}

                {result.priceImpact >= 10 && (
                  <div className="flex items-start gap-1.5 p-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[9px]">
                    <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                    <strong>High slippage warning.</strong>&nbsp;Consider splitting into smaller
                    swaps or adding liquidity first.
                  </div>
                )}
              </div>

              {/* Pool State: Before → After */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Resulting LP State
                </p>
                <div className="rounded-lg border border-border bg-card/40 p-2.5 space-y-2 text-[10px] font-mono">
                  {/* Reserve A */}
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-muted-foreground">
                      <span>{assetA} Reserve</span>
                      <div className="flex items-center gap-1.5">
                        <span>{fmt(parseFloat(direction === "A_TO_B" ? reserveA : reserveB))}</span>
                        <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                        <span className="text-emerald-400">{fmt(result.newReserveA)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500/60 rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(
                            (result.newReserveA /
                              Math.max(result.newReserveA, result.newReserveB)) *
                              100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Reserve B */}
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-muted-foreground">
                      <span>{assetB} Reserve</span>
                      <div className="flex items-center gap-1.5">
                        <span>{fmt(parseFloat(direction === "A_TO_B" ? reserveB : reserveA))}</span>
                        <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                        <span className="text-blue-400">{fmt(result.newReserveB)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500/60 rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(
                            (result.newReserveB /
                              Math.max(result.newReserveA, result.newReserveB)) *
                              100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="h-px bg-border" />
                  <div className="flex justify-between text-muted-foreground">
                    <span>New Spot Price</span>
                    <span className="text-foreground">
                      {fmt(result.newSpotPrice, 4)} {assetB}/{assetA}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>k (constant)</span>
                    <span className="text-foreground">
                      {(result.newReserveA * result.newReserveB).toLocaleString("en-US", {
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="w-full py-1 text-[9px] font-bold rounded bg-muted/50 text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1"
              >
                <RefreshCw className="h-2.5 w-2.5" />
                Reset
              </button>
            </div>

            {/* ── Soroban CLI Template ──────────────────────────────────── */}
            <SectionHeader
              icon={<Zap className="h-3 w-3 text-primary" />}
              title="Soroban Call Template"
            />
            <div className="p-3 space-y-2">
              <p className="text-[9px] text-muted-foreground leading-relaxed">
                Copy the pre-filled CLI invocation to execute this swap against your deployed
                AMM contract.
              </p>
              <div className="relative group">
                <pre className="bg-background border border-border rounded p-2.5 text-[8.5px] font-mono text-muted-foreground whitespace-pre-wrap break-all leading-relaxed max-h-36 overflow-y-auto">
                  {cliTemplate}
                </pre>
                <button
                  type="button"
                  onClick={handleCopyTemplate}
                  className="absolute top-1.5 right-1.5 p-1 rounded bg-sidebar border border-border text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                  title="Copy template"
                >
                  {copiedTemplate ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border bg-sidebar-accent/10 shrink-0">
        <div className="flex items-center gap-2 text-primary font-bold text-[9px] mb-1">
          <TrendingUp className="h-3 w-3" />
          <span>CONSTANT PRODUCT AMM (x·y = k)</span>
        </div>
        <p className="text-[9px] text-muted-foreground leading-tight italic">
          Simulates Soroban LP swaps locally. Results are estimates — on-chain execution
          may vary based on network state.
        </p>
      </div>
    </div>
  );
}
