import {
  Network,
  Settings,
  TestTube,
  Upload,
  Menu,
  X,
  Play,
  Github,
  Sparkles,
  ShieldAlert,
  Loader2,
  FileCode2,
  Database,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { BuildButton } from "@/components/ide/BuildButton";
import { Button } from "@/components/ui/button";
import { type NetworkKey } from "@/lib/networkConfig";
import { ImportWizard } from "@/components/projects/ImportWizard";
import CiConfigGenerator from "@/components/modals/CiConfigGenerator";
import StateMockEditor from "@/components/modals/StateMockEditor";
import { SettingsModal } from "@/components/ide/SettingsModal";
import { WalletManager } from "@/components/WalletManager";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { GitBlameToggle } from "@/components/editor/GitBlameLines";
import { SignInButton } from "@/components/auth/SignInButton";
import { UserMenu } from "@/components/auth/UserMenu";
import { SaveToCloudButton } from "@/components/cloud/SaveToCloudButton";
import { useAuth } from "@/hooks/useAuth";

/* ✅ ADD THIS */
import NotificationCenter from "@/components/notifications/NotificationCenter";

type BuildState = "idle" | "building" | "success" | "error";

interface ToolbarProps {
  onCompile: () => void;
  onDeploy: () => void;
  onTest: () => void;
  isCompiling?: boolean;
  buildState?: BuildState;
  network?: NetworkKey;
  onNetworkChange?: (network: NetworkKey) => void;
  saveStatus?: string;
  onRunClippy?: () => void;
  isRunningClippy?: boolean;
  onRunAudit?: () => void;
  isRunningAudit?: boolean;
}

export function Toolbar({
  onCompile,
  onDeploy,
  onTest,
  isCompiling: propIsCompiling,
  buildState: propBuildState,
  network: propNetwork,
  onNetworkChange,
  saveStatus: propSaveStatus,
  onRunClippy,
  isRunningClippy = false,
  onRunAudit,
  isRunningAudit = false,
}: ToolbarProps) {
  const {
    isCompiling: storeIsCompiling,
    buildState: storeBuildState,
    network: storeNetwork,
    setNetwork,
    saveStatus: storeSaveStatus,
    mockLedgerState,
    setMockLedgerState,
  } = useWorkspaceStore();

  const isCompiling = propIsCompiling ?? storeIsCompiling;
  const buildState = propBuildState ?? storeBuildState;
  const network = propNetwork ?? storeNetwork;
  const saveStatus = propSaveStatus ?? storeSaveStatus;

  const changeNetwork = useMemo(
    () => onNetworkChange ?? setNetwork,
    [onNetworkChange, setNetwork],
  );

  const { isAuthenticated } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [ciOpen, setCiOpen] = useState(false);
  const [stateEditorOpen, setStateEditorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const hasMockState = mockLedgerState.entries.length > 0;

  useEffect(() => {
    const handler = () => setSettingsOpen(true);
    window.addEventListener("ide:open-settings", handler);
    return () => window.removeEventListener("ide:open-settings", handler);
  }, []);

  return (
    <div className="border-b border-border bg-toolbar-bg">
      {/* ── Desktop toolbar ── */}
      <div className="hidden items-center justify-between px-3 py-1.5 md:flex">
        {/* LEFT */}
        <div className="flex items-center gap-2">
          <span className="mr-2 font-mono text-sm font-semibold text-primary">
            Kit CANVAS
          </span>

          <BuildButton
            onClick={onCompile}
            isBuilding={isCompiling}
            state={isCompiling ? "building" : buildState}
          />

          <Button onClick={onDeploy} variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
            <Upload className="h-3.5 w-3.5" />
            Deploy
          </Button>

          <Button variant="ghost" size="sm" onClick={onTest} className="h-8 gap-1.5 text-xs">
            <TestTube className="h-3.5 w-3.5" />
            Test
          </Button>

          {onRunClippy && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRunClippy}
              disabled={isRunningClippy}
              className="h-8 gap-1.5 text-xs"
            >
              {isRunningClippy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Run Clippy
            </Button>
          )}

          {onRunAudit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRunAudit}
              disabled={isRunningAudit}
              className="h-8 gap-1.5 text-xs"
            >
              {isRunningAudit ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5" />
              )}
              Audit
            </Button>
          )}

          <GitBlameToggle />

          <Button onClick={() => setImportOpen(true)} variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
            <Github className="h-3.5 w-3.5" />
            Import
          </Button>

          <SaveToCloudButton />

          {saveStatus && (
            <span className="ml-2 font-mono text-[10px] text-muted-foreground">
              {saveStatus}
            </span>
          )}
        </div>

        {/* RIGHT */}
        <div className="flex items-center gap-3">
          {/* ✅ NOTIFICATION BELL HERE */}
          <NotificationCenter />

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Network className="h-3.5 w-3.5" />
            <select
              value={network}
              onChange={(e) => changeNetwork(e.target.value as NetworkKey)}
              className="rounded border border-border bg-secondary px-2 py-1 text-xs text-foreground"
            >
              <option value="testnet">Testnet</option>
              <option value="futurenet">Futurenet</option>
              <option value="mainnet">Mainnet</option>
              <option value="local">Local</option>
            </select>
          </label>

          <WalletManager />
          {isAuthenticated ? <UserMenu /> : <SignInButton />}

          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* MODALS */}
      <ImportGithubModal open={importOpen} onClose={() => setImportOpen(false)} />
      <CiConfigGenerator open={ciOpen} onOpenChange={setCiOpen} />
      <StateMockEditor
        open={stateEditorOpen}
        onOpenChange={setStateEditorOpen}
        value={mockLedgerState}
        onSave={setMockLedgerState}
      />
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}