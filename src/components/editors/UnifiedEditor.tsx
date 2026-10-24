import { SanityPanel } from "./SanityPanel";
import React, { useState, useCallback, useRef, useEffect } from "react";
import Editor, { BeforeMount, OnMount } from "@monaco-editor/react";
import { useCtxdslEditor } from "../../hooks/useCtxdslEditor";
import { useSummary } from "../../hooks/useSummary";
import { useGraphVisualization } from "../../hooks/useGraphVisualization";
import { useVerification } from "../../hooks/useVerification";
import { EditorToolbar, SvFrontend } from "./EditorToolbar";
import { registerCtxdslLanguage } from "../../monaco/ctxdsl-language";
import { registerCtxdslTheme } from "../../monaco/ctxdsl-theme";
import { useAppStore } from "../../store/appStore";
import {
  synthesizeContext,
  downloadAsFile,
  type ControllerExportFormat,
} from "../../api/endpoints";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { SummaryTable } from "../visualization/SummaryTable";
import { AutomatonCard } from "../visualization/AutomatonCard";
import { SummaryJSON } from "../visualization/SummaryJSON";
import { MultiGraphView } from "../visualization/MultiGraphView";
import { CounterstrategyView } from "../visualization/CounterstrategyView";
import { TraceViewer } from "../visualization/TraceViewer";
import { LassoTraceViewer } from "../visualization/LassoTraceViewer";
import { ExtractionPanel } from "../extraction/ExtractionPanel";
import { ContractPanel } from "../contract/ContractPanel";
import { CodesignPanel } from "../codesign/CodesignPanel";
import { TemplatePicker } from "../templates/TemplatePicker";
import { useExtractionStore } from "../../store/extractionStore";
import type { TemplateRef } from "../../types/templates";
import type { SortField } from "../../hooks/useSummary";
import "./UnifiedEditor.css";

type RightTab =
  | "summary"
  | "graphs"
  | "verification"
  | "extraction"
  | "contract"
  | "codesign";

export const UnifiedEditor = () => {
  const { theme } = useAppStore();

  // Editor state
  const {
    state: editorState,
    editorRef,
    setContent,
    newFile,
    loadFile,
    saveFile,
    validate,
    isValidating,
    undo,
    redo,
    clearImportSource,
  } = useCtxdslEditor();

  // Feature hooks
  const summary = useSummary();
  const graphs = useGraphVisualization();
  const verification = useVerification();

  // Bridge: when extraction workflow produces CTXDSL, load it into the editor
  const extractionCtxdsl = useExtractionStore((s) => s.ctxdslContent);
  const lastLoadedCtxdsl = useRef<string | null>(null);
  useEffect(() => {
    if (extractionCtxdsl && extractionCtxdsl !== lastLoadedCtxdsl.current) {
      lastLoadedCtxdsl.current = extractionCtxdsl;
      loadFile(extractionCtxdsl, "extraction.ctxdsl");
    }
  }, [extractionCtxdsl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Panel state
  const [activeTab, setActiveTab] = useState<RightTab>("summary");
  const [activatedTabs, setActivatedTabs] = useState<Set<RightTab>>(
    new Set(["summary"]),
  );
  const [dividerPosition, setDividerPosition] = useState(55); // percentage
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Graph options
  const [graphTypes, setGraphTypes] = useState<("dsl" | "unrolled")[]>([
    "dsl",
    "unrolled",
  ]);

  // Verification options
  const [verifyFormula, setVerifyFormula] = useState("");
  const [verifyAutomaton, setVerifyAutomaton] = useState("");
  const [useTemplate, setUseTemplate] = useState(false);
  const [activeTemplateRef, setActiveTemplateRef] = useState<{
    template: string;
    args: Record<string, string>;
  } | null>(null);
  const [templateFormulaPreview, setTemplateFormulaPreview] = useState("");

  // Expandable detail rows for verification results
  const [expandedRows, setExpandedRows] = useState<
    Map<string, Set<"counterstrategy" | "countertraces">>
  >(new Map());

  // Trace viewer selection state per row
  const [traceSelection, setTraceSelection] = useState<
    Map<string, { traceIndex: number; step: number }>
  >(new Map());

  // Import source viewer
  const [showOriginalSource, setShowOriginalSource] = useState(false);

  // Export controller in a native format
  const [exportingController, setExportingController] = useState<string | null>(
    null,
  );
  // Controller extraction mode selector. Affects all controller exports
  // until changed. `projection` is the default; the other modes implement
  // increasingly memory-aware strategies (see Controller-Modes wiki page).
  type ControllerMode =
    | "projection"
    | "functional"
    | "permissive"
    | "signature-memory"
    | "product-game"
    | "parity-game";
  const [controllerMode, setControllerMode] =
    useState<ControllerMode>("projection");

  // Per-controller "Preview synthesis" results. Keyed by controller name,
  // value carries the synth verdict + state/transition counts under the
  // currently-selected `controllerMode`. Populated by `handlePreviewSynthesis`
  // and used to override the summarize endpoint's placeholder values
  // (which are always realizable=false, states=0, transitions=0 because the
  // summarize endpoint deliberately does not run synthesis).
  type PreviewResult = {
    mode: ControllerMode;
    realizable: boolean;
    statesCount: number;
    transitionsCount: number;
  };
  const [previewResults, setPreviewResults] = useState<
    Map<string, PreviewResult>
  >(new Map());
  const [previewingController, setPreviewingController] = useState<
    string | null
  >(null);

  const handlePreviewSynthesis = useCallback(
    async (controllerName: string, source: string, formula: string) => {
      const content = editorRef.current?.getValue() || editorState.content;
      if (!content.trim()) return;
      try {
        setPreviewingController(controllerName);
        const response = await synthesizeContext({
          context: { name: editorState.fileName, content },
          formula,
          automaton: source,
          options: {
            minimize: false,
            controller_mode: controllerMode,
          } as Record<string, unknown>,
        });
        // Parse the controller's CTXDSL to count states + transitions, since
        // the response shape only exposes the source text. A trivial regex is
        // enough — the emitted format always uses one `state <name>` line per
        // state and one `transition <src> -> <tgt>` line per transition.
        let statesCount = 0;
        let transitionsCount = 0;
        const ctrl = response.controller;
        if (ctrl?.content) {
          const stateMatches = ctrl.content.match(/^\s*state\s+\w+/gm);
          statesCount = stateMatches?.length ?? 0;
          const transitionMatches = ctrl.content.match(/^\s*transition\s+/gm);
          transitionsCount = transitionMatches?.length ?? 0;
        }
        setPreviewResults((prev) => {
          const next = new Map(prev);
          next.set(controllerName, {
            mode: controllerMode,
            realizable: response.realizable,
            statesCount,
            transitionsCount,
          });
          return next;
        });
      } finally {
        setPreviewingController(null);
      }
    },
    [editorRef, editorState.content, editorState.fileName, controllerMode],
  );

  // Whenever the user changes the mode, invalidate prior previews — they're
  // mode-specific and would mislead.
  useEffect(() => {
    setPreviewResults(new Map());
  }, [controllerMode]);
  const handleExportController = useCallback(
    async (
      controllerName: string,
      source: string,
      formula: string,
      format: ControllerExportFormat,
    ) => {
      if (format === "ctxdsl") {
        // Use existing CTXDSL content from the editor
        const content = editorRef.current?.getValue() || editorState.content;
        if (!content.trim()) return;
        try {
          setExportingController(controllerName);
          const response = await synthesizeContext({
            context: { name: editorState.fileName, content },
            formula,
            automaton: source,
            options: {
              minimize: true,
              controller_mode: controllerMode,
            } as Record<string, unknown>,
          });
          if (response.controller) {
            downloadAsFile(
              response.controller.content,
              response.controller.name,
            );
          }
        } finally {
          setExportingController(null);
        }
        return;
      }

      // For native formats, call synthesis with output_format
      const content = editorRef.current?.getValue() || editorState.content;
      if (!content.trim()) return;
      try {
        setExportingController(controllerName);
        const response = await synthesizeContext({
          context: { name: editorState.fileName, content },
          formula,
          automaton: source,
          options: {
            minimize: true,
            output_format: format,
            controller_mode: controllerMode,
          } as Record<string, unknown>,
        });
        const native = (response as Record<string, unknown>)
          .controller_native as { name: string; content: string } | undefined;
        if (native) {
          downloadAsFile(native.content, native.name);
        } else if (response.controller) {
          downloadAsFile(response.controller.content, response.controller.name);
        }
      } finally {
        setExportingController(null);
      }
    },
    [editorRef, editorState.content, editorState.fileName, controllerMode],
  );

  const toggleExpanded = (
    key: string,
    kind: "counterstrategy" | "countertraces",
  ) => {
    setExpandedRows((prev) => {
      const next = new Map(prev);
      const current = next.get(key) ?? new Set();
      const updated = new Set(current);
      if (updated.has(kind)) {
        updated.delete(kind);
      } else {
        updated.add(kind);
      }
      next.set(key, updated);
      return next;
    });
  };

  // Monaco setup
  const handleEditorWillMount: BeforeMount = (monacoInstance) => {
    registerCtxdslLanguage(monacoInstance);
    registerCtxdslTheme(monacoInstance);
  };

  const handleEditorDidMount: OnMount = (editor, _monacoInstance) => {
    editorRef.current = editor;
  };

  const handleEditorChange = (value: string | undefined) => {
    setContent(value || "");
  };

  const handleLoadFile = async (file: File, svFrontend?: SvFrontend) => {
    const text = await file.text();
    loadFile(text, file.name, svFrontend);
  };

  // Get current editor content
  const getContent = useCallback(() => {
    return editorRef.current?.getValue() || editorState.content;
  }, [editorRef, editorState.content]);

  // Action handlers
  const handleSummary = () => {
    const content = getContent();
    if (!content.trim()) return;
    summary.fetchSummary(content, editorState.fileName);
  };

  const handleGraphs = () => {
    const content = getContent();
    if (!content.trim()) return;
    graphs.fetchGraphs(content, editorState.fileName, graphTypes);
  };

  const handleVerify = () => {
    const content = getContent();
    if (!content.trim()) return;
    setExpandedRows(new Map());
    setTraceSelection(new Map());
    if (useTemplate && activeTemplateRef) {
      // Template mode: pass template_ref instead of formula name
      verification.verify(
        content,
        editorState.fileName,
        undefined,
        verifyAutomaton || undefined,
        activeTemplateRef,
      );
    } else {
      verification.verify(
        content,
        editorState.fileName,
        verifyFormula || undefined,
        verifyAutomaton || undefined,
      );
    }
  };

  // Divider drag handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percentage = ((e.clientX - rect.left) / rect.width) * 100;
      setDividerPosition(Math.min(Math.max(percentage, 20), 80));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const tabs: { id: RightTab; label: string }[] = [
    { id: "summary", label: "Summary" },
    { id: "graphs", label: "Graphs" },
    { id: "verification", label: "Verification" },
    { id: "extraction", label: "Extraction" },
    { id: "contract", label: "Contract" },
    { id: "codesign", label: "Codesign" },
  ];

  const filteredAutomata = summary.getFilteredAndSortedAutomata();

  return (
    <div
      ref={containerRef}
      className={`unified-editor ${isDragging ? "unified-editor--dragging" : ""}`}
    >
      {/* Left pane: Editor */}
      <div
        className="unified-editor__left"
        style={{ width: `${dividerPosition}%` }}
      >
        <div className="unified-editor__editor-wrap">
          <EditorToolbar
            fileName={editorState.fileName}
            isDirty={editorState.isDirty}
            isValidating={isValidating}
            onNew={newFile}
            onSave={saveFile}
            onValidate={validate}
            onUndo={undo}
            onRedo={redo}
            onLoadFile={handleLoadFile}
            onLoadExample={(content: string, fileName: string) =>
              loadFile(content, fileName)
            }
          />
          {editorState.importSource && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 12px",
                fontSize: "0.75rem",
                background: "var(--color-accent-muted, #e0e7ff)",
                color: "var(--text-secondary, #4b5563)",
                borderBottom: "1px solid var(--color-border, #e5e7eb)",
              }}
            >
              <span>
                Imported from:{" "}
                <strong>{editorState.importSource.originalFileName}</strong> (
                {editorState.importSource.sourceFormat})
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOriginalSource((p) => !p)}
                title="Toggle original source view"
              >
                {showOriginalSource ? "Hide Original" : "View Original"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearImportSource}
                title="Dismiss import banner"
              >
                Dismiss
              </Button>
            </div>
          )}
          {showOriginalSource && editorState.importSource && (
            <div
              style={{
                height: "40%",
                borderBottom: "2px solid var(--color-border, #e5e7eb)",
                overflow: "auto",
              }}
            >
              <Editor
                height="100%"
                language={
                  editorState.importSource.sourceFormat === "SystemVerilog"
                    ? "systemverilog"
                    : "json"
                }
                theme={theme === "dark" ? "vs-dark" : "vs"}
                value={editorState.importSource.originalContent}
                options={{ readOnly: true, minimap: { enabled: false } }}
              />
            </div>
          )}
          <div className="unified-editor__monaco">
            <Editor
              height="100%"
              language="ctxdsl"
              theme={theme === "dark" ? "ctxdsl-dark" : "ctxdsl-light"}
              value={editorState.content}
              onChange={handleEditorChange}
              beforeMount={handleEditorWillMount}
              onMount={handleEditorDidMount}
              loading={
                <div className="flex items-center justify-center h-full">
                  <div className="text-gray-500 dark:text-gray-400">
                    Loading editor...
                  </div>
                </div>
              }
              options={{
                minimap: { enabled: true },
                fontSize: 14,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: "on",
                formatOnPaste: true,
                formatOnType: true,
              }}
            />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="unified-editor__divider" onMouseDown={handleMouseDown}>
        <div className="unified-editor__divider-handle" />
      </div>

      {/* Right pane: Results */}
      <div
        className="unified-editor__right"
        style={{ width: `${100 - dividerPosition}%` }}
      >
        {/* Tab bar */}
        <div className="unified-editor__tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setActivatedTabs((prev) => new Set(prev).add(tab.id));
              }}
              className={`unified-editor__tab ${activeTab === tab.id ? "unified-editor__tab--active" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="unified-editor__panel">
          {activeTab === "summary" && (
            <div className="unified-editor__section">
              <div className="unified-editor__action-bar">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSummary}
                  disabled={summary.state.isLoading}
                >
                  {summary.state.isLoading ? (
                    <>
                      <LoadingSpinner size="sm" /> Summarizing...
                    </>
                  ) : (
                    "Generate Summary"
                  )}
                </Button>
                {summary.state.summary && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={summary.clearSummary}
                    >
                      Clear
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={summary.exportJSON}
                    >
                      Export JSON
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={summary.exportCSV}
                    >
                      Export CSV
                    </Button>
                  </>
                )}
              </div>
              {summary.state.error && (
                <div className="unified-editor__error">
                  {summary.state.error}
                </div>
              )}
              {summary.state.summary && (
                <div className="unified-editor__results">
                  <div className="unified-editor__summary-header">
                    <strong>{summary.state.summary.context_name}</strong>
                    <span>
                      {summary.state.summary.automata.length} automata,{" "}
                      {summary.state.summary.formulas_count} formulas,{" "}
                      {summary.state.summary.controllers_count} controllers
                    </span>
                  </div>
                  {summary.viewMode === "table" && (
                    <SummaryTable
                      automata={filteredAutomata}
                      sortField={summary.sortField}
                      sortOrder={summary.sortOrder}
                      onSort={(field: SortField) => {
                        if (summary.sortField === field) {
                          summary.setSortOrder(
                            summary.sortOrder === "asc" ? "desc" : "asc",
                          );
                        } else {
                          summary.setSortField(field);
                          summary.setSortOrder("asc");
                        }
                      }}
                    />
                  )}
                  {summary.viewMode === "cards" &&
                    filteredAutomata.map((a, i) => (
                      <AutomatonCard
                        key={i}
                        name={a.name}
                        statesCount={a.states_count}
                        transitionsCount={a.transitions_count}
                      />
                    ))}
                  {summary.viewMode === "json" && summary.state.summary && (
                    <SummaryJSON summary={summary.state.summary} />
                  )}
                  <div className="unified-editor__view-modes">
                    {(["table", "cards", "json"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => summary.setViewMode(mode)}
                        className={`unified-editor__view-mode ${summary.viewMode === mode ? "unified-editor__view-mode--active" : ""}`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                  {summary.state.summary.controllers &&
                    summary.state.summary.controllers.length > 0 && (
                      <div className="unified-editor__controllers-summary">
                        <strong>Controllers</strong>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            margin: "0.4rem 0",
                            fontSize: "0.85rem",
                          }}
                        >
                          <label htmlFor="controller-mode-select">
                            Extraction mode:
                          </label>
                          <select
                            id="controller-mode-select"
                            data-testid="controller-mode-select"
                            value={controllerMode}
                            onChange={(e) =>
                              setControllerMode(
                                e.target.value as ControllerMode,
                              )
                            }
                            style={{ padding: "2px 6px", fontSize: "0.85rem" }}
                          >
                            <option value="projection">
                              Projection (default)
                            </option>
                            <option value="functional">
                              Functional (one transition per state)
                            </option>
                            <option value="permissive">
                              Permissive (Ramadge-Wonham)
                            </option>
                            <option value="signature-memory">
                              Signature Memory (rank-annotated)
                            </option>
                            <option value="product-game">
                              Product Game (mu-obligation rotation)
                            </option>
                            <option value="parity-game">
                              Parity Game (full Zielonka)
                            </option>
                          </select>
                        </div>
                        <table className="unified-editor__verify-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Source</th>
                              <th>Formula</th>
                              <th>Realizable</th>
                              <th>States</th>
                              <th>Transitions</th>
                              <th>Export</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summary.state.summary.controllers.map((c, i) => {
                              const preview = previewResults.get(c.name);
                              const realizable = preview
                                ? preview.realizable
                                : c.realizable;
                              const states = preview
                                ? preview.statesCount
                                : c.states_count;
                              const transitions = preview
                                ? preview.transitionsCount
                                : c.transitions_count;
                              return (
                                <tr key={i}>
                                  <td>{c.name}</td>
                                  <td>{c.source}</td>
                                  <td>{c.formula}</td>
                                  <td>
                                    <span
                                      className={
                                        realizable
                                          ? "unified-editor__verify-badge--pass"
                                          : "unified-editor__verify-badge--fail"
                                      }
                                      style={{
                                        padding: "2px 6px",
                                        borderRadius: "4px",
                                      }}
                                    >
                                      {realizable ? "Yes" : "No"}
                                    </span>
                                  </td>
                                  <td
                                    title={
                                      preview
                                        ? `Synthesized under '${preview.mode}'`
                                        : "Run Preview to compute the count under the selected mode"
                                    }
                                  >
                                    {preview ? states : "—"}
                                  </td>
                                  <td
                                    title={
                                      preview
                                        ? `Synthesized under '${preview.mode}'`
                                        : "Run Preview to compute the count under the selected mode"
                                    }
                                  >
                                    {preview ? transitions : "—"}
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      disabled={previewingController === c.name}
                                      onClick={() =>
                                        handlePreviewSynthesis(
                                          c.name,
                                          c.source,
                                          c.formula,
                                        )
                                      }
                                      style={{
                                        fontSize: "0.75rem",
                                        padding: "2px 6px",
                                        marginRight: "0.25rem",
                                      }}
                                      title={`Run synthesis under '${controllerMode}' and update this row's state and transition counts`}
                                    >
                                      {previewingController === c.name
                                        ? "..."
                                        : "Preview"}
                                    </button>
                                    {realizable && (
                                      <select
                                        disabled={
                                          exportingController === c.name
                                        }
                                        onChange={(e) => {
                                          const fmt = e.target
                                            .value as ControllerExportFormat;
                                          if (fmt) {
                                            handleExportController(
                                              c.name,
                                              c.source,
                                              c.formula,
                                              fmt,
                                            );
                                            e.target.value = "";
                                          }
                                        }}
                                        style={{
                                          fontSize: "0.75rem",
                                          padding: "2px 4px",
                                        }}
                                      >
                                        <option value="">
                                          {exportingController === c.name
                                            ? "..."
                                            : "Download"}
                                        </option>
                                        <option value="ctxdsl">CTXDSL</option>
                                        <option value="xstate">
                                          XState JSON
                                        </option>
                                        <option value="systemverilog">
                                          SystemVerilog
                                        </option>
                                      </select>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                </div>
              )}
            </div>
          )}

          <div
            className="unified-editor__section"
            style={{ display: activeTab === "graphs" ? "block" : "none" }}
          >
            {activatedTabs.has("graphs") && (
              <>
                <div className="unified-editor__action-bar">
                  <label className="unified-editor__checkbox">
                    <input
                      type="checkbox"
                      checked={graphTypes.includes("dsl")}
                      onChange={(e) => {
                        setGraphTypes((prev) =>
                          e.target.checked
                            ? [...prev, "dsl"]
                            : prev.filter((t) => t !== "dsl"),
                        );
                      }}
                    />
                    DSL
                  </label>
                  <label className="unified-editor__checkbox">
                    <input
                      type="checkbox"
                      checked={graphTypes.includes("unrolled")}
                      onChange={(e) => {
                        setGraphTypes((prev) =>
                          e.target.checked
                            ? [...prev, "unrolled"]
                            : prev.filter((t) => t !== "unrolled"),
                        );
                      }}
                    />
                    Unrolled
                  </label>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleGraphs}
                    disabled={graphs.state.isLoading}
                  >
                    {graphs.state.isLoading ? (
                      <>
                        <LoadingSpinner size="sm" /> Generating...
                      </>
                    ) : (
                      "Generate Graphs"
                    )}
                  </Button>
                  {graphs.state.graphs.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={graphs.clearGraphs}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                {graphs.state.error && (
                  <div className="unified-editor__error">
                    {graphs.state.error}
                  </div>
                )}
                {graphs.state.graphs.length > 0 && (
                  <div className="unified-editor__results unified-editor__graphs">
                    <MultiGraphView
                      graphs={graphs.getFilteredGraphs()}
                      searchText={graphs.state.searchText}
                      selectedNodeId={graphs.state.selectedNodeId}
                      onNodeSelect={graphs.setSelectedNodeId}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {activeTab === "verification" && (
            <div className="unified-editor__section">
              <div className="unified-editor__action-bar">
                <label className="unified-editor__template-toggle">
                  <input
                    type="checkbox"
                    checked={useTemplate}
                    onChange={(e) => {
                      setUseTemplate(e.target.checked);
                      if (!e.target.checked) {
                        setActiveTemplateRef(null);
                        setTemplateFormulaPreview("");
                      }
                    }}
                  />
                  Use Template
                </label>
                {!useTemplate && (
                  <Input
                    label=""
                    value={verifyFormula}
                    onChange={(e) => setVerifyFormula(e.target.value)}
                    placeholder="Formula (optional, all if empty)"
                  />
                )}
                {useTemplate && activeTemplateRef && (
                  <span
                    className="unified-editor__template-active"
                    title={templateFormulaPreview}
                  >
                    {activeTemplateRef.template}
                    {Object.keys(activeTemplateRef.args).length > 0 &&
                      `(${Object.values(activeTemplateRef.args).join(", ")})`}
                  </span>
                )}
                <Input
                  label=""
                  value={verifyAutomaton}
                  onChange={(e) => setVerifyAutomaton(e.target.value)}
                  placeholder="Automaton (optional)"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleVerify}
                  disabled={
                    verification.state.isLoading ||
                    (useTemplate && !activeTemplateRef)
                  }
                >
                  {verification.state.isLoading ? (
                    <>
                      <LoadingSpinner size="sm" /> Verifying...
                    </>
                  ) : (
                    "Verify"
                  )}
                </Button>
                {verification.state.result && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={verification.clearResult}
                  >
                    Clear
                  </Button>
                )}
              </div>
              {useTemplate && !activeTemplateRef && (
                <TemplatePicker
                  onSelect={(ref: TemplateRef, preview: string) => {
                    setActiveTemplateRef(ref);
                    setTemplateFormulaPreview(preview);
                  }}
                  onClear={() => {
                    setActiveTemplateRef(null);
                    setTemplateFormulaPreview("");
                  }}
                />
              )}
              {verification.state.error && (
                <div className="unified-editor__error">
                  {verification.state.error}
                </div>
              )}
              {verification.state.result && (
                <div className="unified-editor__results">
                  <div
                    className={`unified-editor__verify-badge ${verification.state.result.all_satisfied ? "unified-editor__verify-badge--pass" : "unified-editor__verify-badge--fail"}`}
                  >
                    {verification.state.result.all_satisfied
                      ? "All Formulas Satisfied"
                      : "Some Formulas Not Satisfied"}
                  </div>
                  <SanityPanel reports={verification.state.result.sanity} />
                  <table className="unified-editor__verify-table">
                    <thead>
                      <tr>
                        <th>Formula</th>
                        <th>Automaton</th>
                        <th>Status</th>
                        <th>Satisfying</th>
                        <th>Initial</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {verification.state.result.results.map((r, i) => {
                        const rowKey = `${r.formula_name}:${r.automaton}`;
                        const expanded = expandedRows.get(rowKey);
                        const csResult = verification.getCounterstrategy(
                          r.formula_name,
                          r.automaton,
                        );
                        const ctResult = verification.getCountertraces(
                          r.formula_name,
                          r.automaton,
                        );
                        const traceState = traceSelection.get(rowKey) ?? {
                          traceIndex: 0,
                          step: 0,
                        };

                        // Countertraces: show lasso traces if available, else deadlock traces
                        const hasLassoTraces =
                          ctResult && ctResult.lasso_traces.length > 0;
                        const hasDeadlockTraces =
                          ctResult && ctResult.deadlock_traces.length > 0;
                        const hasTraces = hasLassoTraces || hasDeadlockTraces;

                        return (
                          <React.Fragment key={i}>
                            <tr
                              className={
                                r.satisfied
                                  ? ""
                                  : "unified-editor__verify-row--fail"
                              }
                            >
                              <td>{r.formula_name}</td>
                              <td>{r.automaton}</td>
                              <td>
                                {r.satisfied ? "Satisfied" : "Not Satisfied"}
                              </td>
                              <td>
                                {r.satisfying_states}/{r.total_states}
                              </td>
                              <td>
                                {r.initial_satisfying.length}/
                                {r.initial_states.length}
                              </td>
                              <td>
                                {!r.satisfied && (
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "4px",
                                      flexWrap: "nowrap",
                                    }}
                                  >
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={verification.isFetchingCounterstrategy(
                                        r.formula_name,
                                        r.automaton,
                                      )}
                                      onClick={() => {
                                        if (!csResult?.counterstrategy) {
                                          verification.fetchCounterstrategy(
                                            editorState.content,
                                            r.formula_name,
                                            r.automaton,
                                          );
                                        }
                                        toggleExpanded(
                                          rowKey,
                                          "counterstrategy",
                                        );
                                      }}
                                    >
                                      {verification.isFetchingCounterstrategy(
                                        r.formula_name,
                                        r.automaton,
                                      )
                                        ? "Computing..."
                                        : expanded?.has("counterstrategy")
                                          ? "Hide Strategy"
                                          : "Counterstrategy"}
                                    </Button>
                                    {/* Show Countertraces button only when traces exist or haven't been fetched yet */}
                                    {(!ctResult || hasTraces) && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={verification.isFetchingCountertraces(
                                          r.formula_name,
                                          r.automaton,
                                        )}
                                        onClick={() => {
                                          if (!ctResult) {
                                            verification.fetchCountertraces(
                                              editorState.content,
                                              r.formula_name,
                                              r.automaton,
                                            );
                                          }
                                          toggleExpanded(
                                            rowKey,
                                            "countertraces",
                                          );
                                        }}
                                      >
                                        {verification.isFetchingCountertraces(
                                          r.formula_name,
                                          r.automaton,
                                        )
                                          ? "Computing..."
                                          : expanded?.has("countertraces")
                                            ? "Hide Traces"
                                            : "Countertraces"}
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>

                            {/* Expanded: Counterstrategy graph */}
                            {expanded?.has("counterstrategy") &&
                              csResult?.counterstrategy && (
                                <tr>
                                  <td colSpan={6}>
                                    <div className="unified-editor__verify-detail">
                                      <CounterstrategyView
                                        result={csResult.counterstrategy}
                                        formulaName={r.formula_name}
                                        automatonName={r.automaton}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              )}

                            {/* Expanded: Countertraces — lasso traces if available, else deadlock traces */}
                            {expanded?.has("countertraces") &&
                              ctResult &&
                              hasTraces && (
                                <tr>
                                  <td colSpan={6}>
                                    <div className="unified-editor__verify-detail">
                                      {ctResult.violating_initials.length >
                                        0 && (
                                        <div style={{ marginBottom: "8px" }}>
                                          <strong>
                                            Violating Initial States:{" "}
                                          </strong>
                                          {ctResult.violating_initials.join(
                                            ", ",
                                          )}
                                        </div>
                                      )}

                                      {hasLassoTraces ? (
                                        <LassoTraceViewer
                                          traces={ctResult.lasso_traces}
                                          title="Lasso Traces"
                                        />
                                      ) : hasDeadlockTraces ? (
                                        <TraceViewer
                                          traces={ctResult.deadlock_traces}
                                          title="Deadlock Traces"
                                          selectedTraceIndex={
                                            traceState.traceIndex
                                          }
                                          selectedStep={traceState.step}
                                          onTraceSelect={(index) =>
                                            setTraceSelection((prev) => {
                                              const next = new Map(prev);
                                              next.set(rowKey, {
                                                traceIndex: index,
                                                step: 0,
                                              });
                                              return next;
                                            })
                                          }
                                          onStepSelect={(step) =>
                                            setTraceSelection((prev) => {
                                              const next = new Map(prev);
                                              next.set(rowKey, {
                                                ...traceState,
                                                step,
                                              });
                                              return next;
                                            })
                                          }
                                          stateValuations={
                                            editorState.importSource
                                              ?.stateValuations?.[r.automaton]
                                          }
                                          transitionObservations={
                                            editorState.importSource
                                              ?.transitionObservations?.[
                                              r.automaton
                                            ]
                                          }
                                        />
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                              )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "extraction" && (
            <div className="unified-editor__section">
              <ExtractionPanel />
            </div>
          )}

          {activeTab === "contract" && (
            <div className="unified-editor__section">
              <ContractPanel />
            </div>
          )}

          {activeTab === "codesign" && (
            <div className="unified-editor__section">
              <CodesignPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
