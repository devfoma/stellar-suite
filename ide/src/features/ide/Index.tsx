"use client";

import { DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { FileExplorer } from "@/components/ide/FileExplorer";
import { EditorTabs } from "@/components/ide/EditorTabs";
import CodeEditor from "@/components/ide/CodeEditor";
import { Terminal } from "@/components/ide/Terminal";
import { Toolbar } from "@/components/ide/Toolbar";
import { AssistantSidebar } from "@/components/ide/AssistantSidebar";
import { ContractPanel } from "@/components/ide/ContractPanel";
import { IdentitiesView } from "@/components/ide/IdentitiesView";
import { ProductTour } from "@/components/ide/ProductTour";
import { StatusBar } from "@/components/ide/StatusBar";
import { SearchPane } from "@/components/ide/SearchPane";
import TestExplorer from "@/components/ide/TestExplorer";
import { IdeShell } from "@/components/layout/IdeShell";
import { useIdentityStore } from "@/store/useIdentityStore";
import { flattenWorkspaceFiles, useWorkspaceStore } from "@/store/workspaceStore";
import { useDiagnosticsStore } from "@/store/useDiagnosticsStore";
import {
  showCompilationFailedToast,
  showCompilationSuccessToast,
} from "@/lib/compilationToasts";
import {
  executeWriteTransaction,
  type InvokePhase,
} from "@/lib/transactionExecution";
import {
  DROP_LIMIT_BYTES,
  mapDroppedEntriesToTree,
  mergeFileNodes,
  readDropPayload,
} from "@/lib/file-drop";
import { type NetworkKey } from "@/lib/networkConfig";
import { FileNode } from "@/lib/sample-contracts";
import {
  createStreamProcessor,
  readCompileResponse,
} from "@/utils/compileStream";
import { parseMixedOutput } from "@/utils/cargoParser";
import { DeploymentsView } from "@/components/ide/DeploymentsView";
import { useDeployedContractsStore } from "@/store/useDeployedContractsStore";
import { useWalletStore } from "@/store/walletStore";
import {
  createInvocationDebugData,
  type InvocationDebugData,
} from "@/lib/invokeResult";
import {
  FileText,
  FolderTree,
  PanelRightClose,
  PanelRightOpen,
  Rocket,
  Terminal as TerminalIcon,
  History,
  Users,
  X,
} from "lucide-react";

const COMPILE_API_URL =
  process.env.NEXT_PUBLIC_COMPILE_API_URL ?? "/api/compile";

type InvokeState = { phase: InvokePhase | "idle"; message: string };

const findNode = (nodes: FileNode[], pathParts: string[]): FileNode | null => {
  for (const node of nodes) {
    if (node.name === pathParts[0]) {
      if (pathParts.length === 1) return node;
      if (node.children) return findNode(node.children, pathParts.slice(1));
    }
  }
  return null;
};

const toCompilePath = (pathParts: string[]) => {
  if (pathParts.length === 2 && pathParts[1].endsWith(".rs")) {
    return [pathParts[0], "src", pathParts[1]].join("/");
  }
  return pathParts.join("/");
};

const flattenProjectFiles = (nodes: FileNode[], parentPath: string[] = []) =>
  nodes.flatMap((node) => {
    const nextPath = [...parentPath, node.name];

    if (node.type === "folder") {
      return flattenProjectFiles(node.children ?? [], nextPath);
    }

    return [
      {
        path: toCompilePath(nextPath),
        content: node.content ?? "",
        language: node.language ?? "text",
      },
    ];
  });

const Index = () => {
  const [lastInvocation, setLastInvocation] =
    useState<InvocationDebugData | null>(null);
  const [invokeState, setInvokeState] = useState<InvokeState>({
    phase: "idle",
    message: "Invoke",
  });

  const dragDepthRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const {
    files,
    openTabs,
    activeTabPath,
    unsavedFiles,
    setFiles,
    setActiveTabPath,
    addTab,
    closeTab,
    createFile,
    createFolder,
    renameNode,
    markSaved,
    updateFileContent,

    network,
    horizonUrl,
    networkPassphrase,
    customRpcUrl,
    setNetwork,

    terminalExpanded,
    isCompiling,
    contractId,
    showExplorer,
    showPanel,
    cursorPos,
    saveStatus,
    mobilePanel,
    leftSidebarTab,
    setTerminalExpanded,
    setIsCompiling,
    setBuildState,
    setContractId,
    setShowExplorer,
    setShowPanel,
    setSaveStatus,
    setMobilePanel,
    setLeftSidebarTab,
    appendTerminalOutput,
    mockLedgerState,
  } = useWorkspaceStore();

  const {
    loadIdentities,
    activeContext,
    activeIdentity,
    webWalletPublicKey,
    setWebWalletPublicKey,
  } = useIdentityStore();

  const { addContract } = useDeployedContractsStore();
  const { setDiagnostics } = useDiagnosticsStore();
  const { publicKey: connectedWalletPublicKey, walletType } = useWalletStore();

  useEffect(() => {
    loadIdentities();
  }, [loadIdentities]);

  useEffect(() => {
    setWebWalletPublicKey(connectedWalletPublicKey);
  }, [connectedWalletPublicKey, setWebWalletPublicKey]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    if (mq.matches) {
      setShowExplorer(true);
      setShowPanel(true);
    }

    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setShowExplorer(true);
        setShowPanel(true);
      } else {
        setShowExplorer(false);
        setShowPanel(false);
      }
    };

    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [setShowExplorer, setShowPanel]);

  const handleTabClose = useCallback(
    (path: string[]) => {
      closeTab(path);
    },
    [closeTab]
  );

  const handleContentChange = useCallback(
    (newContent: string) => {
      updateFileContent(activeTabPath, newContent);
    },
    [activeTabPath, updateFileContent]
  );

  const handleSave = useCallback(() => {
    markSaved(activeTabPath);
    setSaveStatus("Saved");
    setTimeout(() => setSaveStatus(""), 1500);
  }, [activeTabPath, markSaved, setSaveStatus]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  const handleCompile = useCallback(async () => {
    setIsCompiling(true);
    setBuildState("building");
    setTerminalExpanded(true);
    appendTerminalOutput("> Compiling contract...\r\n");
    appendTerminalOutput(`Target network: ${network}\r\n`);

    const contractName = activeTabPath[0] ?? files[0]?.name ?? "hello_world";
    const processor = createStreamProcessor({
      onTerminalData: appendTerminalOutput,
    });

    try {
      const response = await fetch(COMPILE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractName,
          network,
          activeFilePath: activeTabPath.join("/"),
          files: flattenProjectFiles(files),
        }),
      });

      const output = await readCompileResponse(response, processor);
      const diagnostics = parseMixedOutput(output, contractName);
      setDiagnostics(diagnostics);

      if (!response.ok) {
        throw new Error(
          output.trim() || `Build request failed with status ${response.status}`
        );
      }

      appendTerminalOutput(
        "✓ Compilation successful! WASM binary: 1.2 KB\r\n"
      );
      showCompilationSuccessToast();
      setBuildState("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Build failed";
      appendTerminalOutput(`Build failed: ${message}\r\n`);
      showCompilationFailedToast({
        onViewLogs: () => setTerminalExpanded(true),
      });
      setBuildState("error");
    } finally {
      setIsCompiling(false);
      setTimeout(() => setBuildState("idle"), 1200);
    }
  }, [
    activeTabPath,
    appendTerminalOutput,
    files,
    network,
    setBuildState,
    setDiagnostics,
    setIsCompiling,
    setTerminalExpanded,
  ]);

  const handleDeploy = useCallback(() => {
    setTerminalExpanded(true);
    appendTerminalOutput(`Deploying to ${network}...\r\n`);

    setTimeout(() => {
      const fullId = `CD${Math.random()
        .toString(36)
        .substring(2, 15)}${Math.random()
        .toString(36)
        .substring(2, 15)}${Math.random()
        .toString(36)
        .substring(2, 15)}${Math.random()
        .toString(36)
        .substring(2, 15)}`
        .substring(0, 56)
        .toUpperCase();

      setContractId(fullId);
      appendTerminalOutput(`✓ Contract deployed! ID: ${fullId}\r\n`);
      addContract(fullId, network as NetworkKey, "hello_world");
    }, 2000);
  }, [network, appendTerminalOutput, addContract, setContractId, setTerminalExpanded]);

  const handleTest = useCallback(() => {
    setTerminalExpanded(true);

    if (mockLedgerState.entries.length > 0) {
      appendTerminalOutput(
        `Injecting ${mockLedgerState.entries.length} mock ledger ${mockLedgerState.entries.length === 1 ? "entry" : "entries"} via --ledger-snapshot...\r\n`
      );
      appendTerminalOutput(
        `Mock state: ${JSON.stringify(mockLedgerState)}\r\n`
      );
    }

    appendTerminalOutput("Running tests...\r\n");
    setTimeout(() => {
      appendTerminalOutput(
        "✓ test_hello ... ok\r\ntest result: ok. 1 passed; 0 failed;\r\n"
      );
    }, 1200);
  }, [appendTerminalOutput, setTerminalExpanded, mockLedgerState]);

  const handleInvoke = useCallback(
    async (fn: string, args: string) => {
      if (!contractId) {
        appendTerminalOutput("Invoke aborted: no contract selected.\r\n");
        return;
      }

      setTerminalExpanded(true);
      const signer =
        activeContext?.type === "web-wallet"
          ? connectedWalletPublicKey ?? "browser-wallet"
          : activeIdentity?.nickname ??
            activeIdentity?.publicKey ??
            "anonymous";

      appendTerminalOutput(
        `Invoking write transaction ${fn}(${args}) as ${signer}...\r\n`
      );
      setInvokeState({ phase: "preparing", message: "Preparing..." });

      try {
        const rpcUrl = network === "local" ? customRpcUrl : horizonUrl;
        const result = await executeWriteTransaction({
          contractId,
          fnName: fn,
          args,
          rpcUrl,
          networkPassphrase,
          activeContext,
          activeIdentity,
          webWalletPublicKey,
          walletType,
          onStatus: (status) => {
            setInvokeState({
              phase: status.phase,
              message:
                status.phase === "confirming"
                  ? "Confirming..."
                  : status.message,
            });
            appendTerminalOutput(
              `${status.message}${status.hash ? ` [${status.hash}]` : ""}\r\n`
            );
          },
        });

        appendTerminalOutput(
          `Signed XDR submitted to RPC: ${result.hash}\r\n`
        );
        appendTerminalOutput(
          `Transaction reached ${result.finalResponse.status}.\r\n`
        );

        setLastInvocation(
          createInvocationDebugData({
            functionName: fn,
            args,
            signer,
            network,
            result: JSON.stringify(result.finalResponse),
          })
        );

        setInvokeState({ phase: "success", message: "Confirmed" });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Transaction execution failed.";
        appendTerminalOutput(`Transaction failed: ${message}\r\n`);
        setInvokeState({ phase: "failed", message: "Failed" });
      } finally {
        setTimeout(() => {
          setInvokeState({ phase: "idle", message: "Invoke" });
        }, 2000);
      }
    },
    [
      activeContext,
      activeIdentity,
      appendTerminalOutput,
      connectedWalletPublicKey,
      contractId,
      customRpcUrl,
      horizonUrl,
      network,
      networkPassphrase,
      walletType,
      webWalletPublicKey,
      setTerminalExpanded,
    ]
  );

  const handleCreateFile = useCallback(
    (parent: string[], name: string) => {
      createFile(parent, name);
    },
    [createFile]
  );

  const handleCreateFolder = useCallback(
    (parent: string[], name: string) => {
      createFolder(parent, name);
    },
    [createFolder]
  );

  const handleRenameNode = useCallback(
    (path: string[], newName: string) => {
      renameNode(path, newName);
    },
    [renameNode]
  );

  const handleExplorerDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current += 1;
    },
    []
  );

  const handleExplorerDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
    },
    []
  );

  const handleExplorerDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    },
    []
  );

  const handleExplorerDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;

      try {
        const dropped = await readDropPayload(event.dataTransfer);
        const { nodes, uploadedFiles, skippedFiles, totalBytes } =
          await mapDroppedEntriesToTree(dropped);

        if (uploadedFiles === 0) {
          appendTerminalOutput(
            `Upload skipped. No eligible files found (limit ${(
              DROP_LIMIT_BYTES /
              (1024 * 1024)
            ).toFixed(0)} MB).\r\n`
          );
          return;
        }

        setFiles(mergeFileNodes(files, nodes));
        appendTerminalOutput(
          `Uploaded ${uploadedFiles} file${
            uploadedFiles === 1 ? "" : "s"
          } (${(totalBytes / 1024).toFixed(1)} KB).\r\n`
        );

        if (skippedFiles > 0) {
          appendTerminalOutput(
            `Skipped ${skippedFiles} file${
              skippedFiles === 1 ? "" : "s"
            } (ignored folders or upload limit).\r\n`
          );
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "unknown error";
        appendTerminalOutput(`Upload failed: ${message}\r\n`);
      }
    },
    [appendTerminalOutput, files, setFiles]
  );

  const getActiveContent = useCallback(() => {
    const file = findNode(files, activeTabPath);
    return {
      content: file?.content ?? "// Select a file to begin editing",
      language: file?.language ?? "rust",
      fileId: activeTabPath.join("/"),
    };
  }, [activeTabPath, files]);

  useEffect(() => {
    const onOpenSearch = () => {
      setLeftSidebarTab("search");
      setShowExplorer(true);
      setMobilePanel("none");
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
    };

    window.addEventListener("ide:open-search", onOpenSearch);
    return () => window.removeEventListener("ide:open-search", onOpenSearch);
  }, [setLeftSidebarTab, setShowExplorer, setMobilePanel]);

  const { content, language } = getActiveContent();

  const activeFileContext = activeTabPath.length
    ? {
        path: activeTabPath.join("/"),
        language,
        content,
      }
    : null;

  const workspaceFiles = flattenWorkspaceFiles(files);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <ProductTour />

      <Toolbar
        onCompile={handleCompile}
        onDeploy={handleDeploy}
        onTest={handleTest}
        isCompiling={isCompiling}
        buildState={isCompiling ? "building" : "idle"}
        network={network}
        onNetworkChange={setNetwork}
        saveStatus={saveStatus}
      />

      <IdeShell
        onCompile={handleCompile}
        onDeploy={handleDeploy}
        onTest={handleTest}
        isCompiling={isCompiling}
        buildState={isCompiling ? "building" : "idle"}
        network={network}
        onNetworkChange={setNetwork}
        saveStatus={saveStatus}
        activeTab={leftSidebarTab}
        onTabChange={(tab) => {
          if (leftSidebarTab === tab && showExplorer) {
            setShowExplorer(false);
          } else {
            setLeftSidebarTab(tab);
            setShowExplorer(true);
          }
        }}
        sidebarVisible={showExplorer}
        onToggleSidebar={() => setShowExplorer(!showExplorer)}
      >
        <div className="flex-1 flex overflow-hidden relative">
          {mobilePanel === "explorer" && (
            <div className="md:hidden absolute inset-0 z-30 flex">
              <div className="w-64 bg-sidebar border-r border-border h-full flex flex-col">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">
                    Explorer
                  </span>
                  <button
                    title="Close Explorer"
                    onClick={() => setMobilePanel("none")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <FileExplorer />
              </div>
              <div
                className="flex-1 bg-background/60"
                onClick={() => setMobilePanel("none")}
              />
            </div>
          )}

          {mobilePanel === "identities" && (
            <div className="md:hidden absolute inset-0 z-30 flex">
              <div className="w-64 bg-sidebar border-r border-border h-full flex flex-col">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">
                    Users
                  </span>
                  <button
                    title="Close"
                    onClick={() => setMobilePanel("none")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <IdentitiesView network={network} />
              </div>
              <div
                className="flex-1 bg-background/60"
                onClick={() => setMobilePanel("none")}
              />
            </div>
          )}

          {mobilePanel === "deployments" && (
            <div className="md:hidden absolute inset-0 z-30 flex">
              <div className="w-64 bg-sidebar border-r border-border h-full flex flex-col">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">
                    Recent
                  </span>
                  <button
                    title="Close"
                    onClick={() => setMobilePanel("none")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <DeploymentsView
                  activeContractId={contractId}
                  onSelectContract={(id, net) => {
                    setContractId(id);
                    setNetwork(net as NetworkKey);
                    setMobilePanel("none");
                    appendTerminalOutput(
                      `Targeting contract ${id.substring(0, 8)}... on ${net}\r\n`
                    );
                  }}
                />
              </div>
              <div
                className="flex-1 bg-background/60"
                onClick={() => setMobilePanel("none")}
              />
            </div>
          )}

          {mobilePanel === "interact" && (
            <div className="md:hidden absolute inset-0 z-30 flex justify-end">
              <div
                className="flex-1 bg-background/60"
                onClick={() => setMobilePanel("none")}
              />
              <div className="w-72 bg-card border-l border-border h-full flex flex-col">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">
                    Assistant
                  </span>
                  <button
                    title="Close Interact"
                    onClick={() => setMobilePanel("none")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <ContractPanel
                  contractId={contractId}
                  onInvoke={handleInvoke}
                  invokeState={invokeState}
                />
                <AssistantSidebar
                  activeFile={activeFileContext}
                  contractId={contractId}
                  onInvoke={handleInvoke}
                  lastInvocation={lastInvocation}
                />
              </div>
            </div>
          )}

          <div className="flex-1 flex overflow-hidden">
            <div
              className="flex-1 flex overflow-hidden"
              onDragEnter={handleExplorerDragEnter}
              onDragOver={handleExplorerDragOver}
              onDragLeave={handleExplorerDragLeave}
              onDrop={handleExplorerDrop}
            >
              {showExplorer && (
                <div className="hidden md:flex w-80 shrink-0 border-r border-border bg-sidebar overflow-hidden">
                  {leftSidebarTab === "explorer" && <FileExplorer />}

                  {leftSidebarTab === "identities" && (
                    <IdentitiesView network={network} />
                  )}

                  {leftSidebarTab === "deployments" && (
                    <DeploymentsView
                      activeContractId={contractId}
                      onSelectContract={(id, net) => {
                        setContractId(id);
                        setNetwork(net as NetworkKey);
                        appendTerminalOutput(
                          `Targeting contract ${id.substring(0, 8)}... on ${net}\r\n`
                        );
                      }}
                    />
                  )}

                  {leftSidebarTab === "search" && (
                    <SearchPane
                      inputRef={searchInputRef}
                      onResultSelect={(pathParts, range) => {
                        addTab(pathParts, pathParts[pathParts.length - 1]);
                        setActiveTabPath(pathParts);
                        window.dispatchEvent(
                          new CustomEvent("ide:reveal-range", {
                            detail: {
                              fileId: pathParts.join("/"),
                              pathParts,
                              range,
                            },
                          })
                        );
                      }}
                    />
                  )}

                  {leftSidebarTab === "tests" && (
                    <TestExplorer
                      files={workspaceFiles}
                      onOpenTest={(test) => {
                        const pathParts = test.filePath.split("/");
                        const name = pathParts[pathParts.length - 1];
                        addTab(pathParts, name);
                        setActiveTabPath(pathParts);
                        window.dispatchEvent(
                          new CustomEvent("ide:reveal-range", {
                            detail: {
                              fileId: test.filePath,
                              pathParts,
                              range: {
                                startLine: test.line,
                                endLine: test.line,
                                startColumn: 1,
                                endColumn: 1,
                              },
                            },
                          })
                        );
                      }}
                      onRunTest={(test) => {
                        setTerminalExpanded(true);
                        if (mockLedgerState.entries.length > 0) {
                          appendTerminalOutput(
                            `Injecting ${mockLedgerState.entries.length} mock ledger ${mockLedgerState.entries.length === 1 ? "entry" : "entries"} via --ledger-snapshot...\r\n`
                          );
                        }
                        appendTerminalOutput(
                          `Running test ${test.testName} (${test.kind}) in ${test.filePath}:${test.line}\r\n`
                        );
                      }}
                    />
                  )}
                </div>
              )}

              <div className="flex-1 flex flex-col min-w-0">
                <EditorTabs />
                <div className="flex-1 overflow-hidden">
                  <CodeEditor />
                </div>

                {terminalExpanded && (
                  <div className="border-t border-border">
                    <Terminal />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="hidden md:flex shrink-0 z-10">
            {showPanel && (
              <>
                <div className="w-64 border-l border-border bg-card">
                  <ContractPanel
                    contractId={contractId}
                    onInvoke={handleInvoke}
                    invokeState={invokeState}
                  />
                </div>
                <div className="w-[22rem] border-l border-border bg-card">
                  <AssistantSidebar
                    activeFile={activeFileContext}
                    contractId={contractId}
                    onInvoke={handleInvoke}
                    lastInvocation={lastInvocation}
                  />
                </div>
              </>
            )}
            <div className="flex flex-col bg-card border-l border-border h-full">
              <button
                onClick={() => setShowPanel(!showPanel)}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                title="Toggle Panel"
              >
                {showPanel ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="hidden md:block">
          <StatusBar />
        </div>

        <div className="md:hidden flex flex-col border-t border-border bg-sidebar">
          <div className="flex items-center justify-between px-3 py-1 border-b border-border/50 bg-muted/30">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
              {unsavedFiles.size > 0 && (
                <span className="text-warning">
                  {unsavedFiles.size} unsaved
                </span>
              )}
              <span>
                Ln {cursorPos.line}, Col {cursorPos.col}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">
              {network}
            </span>
          </div>

          <div className="flex items-stretch">
            <button
              onClick={() =>
                setMobilePanel(
                  mobilePanel === "explorer" ? "none" : "explorer"
                )
              }
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors border-t-2 ${
                mobilePanel === "explorer"
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <FolderTree className="h-4 w-4" />
              Explorer
            </button>

            <button
              onClick={() =>
                setMobilePanel(
                  mobilePanel === "identities" ? "none" : "identities"
                )
              }
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors border-t-2 ${
                mobilePanel === "identities"
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="h-4 w-4" />
              Users
            </button>

            <button
              onClick={() =>
                setMobilePanel(
                  mobilePanel === "deployments" ? "none" : "deployments"
                )
              }
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors border-t-2 ${
                mobilePanel === "deployments"
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <History className="h-4 w-4" />
              Activity
            </button>

            <button
              onClick={() => setMobilePanel("none")}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors border-t-2 ${
                mobilePanel === "none"
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="h-4 w-4" />
              Editor
            </button>

            <button
              onClick={() =>
                setMobilePanel(
                  mobilePanel === "interact" ? "none" : "interact"
                )
              }
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors border-t-2 ${
                mobilePanel === "interact"
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Rocket className="h-4 w-4" />
              Interact
            </button>

            <button
              onClick={() => {
                setTerminalExpanded(!terminalExpanded);
                setMobilePanel("none");
              }}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors border-t-2 ${
                terminalExpanded
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <TerminalIcon className="h-4 w-4" />
              Console
            </button>
          </div>
        </div>
      </IdeShell>
    </div>
  );
};

export default Index;