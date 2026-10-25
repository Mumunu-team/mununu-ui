import { useCallback, useRef, useState } from "react";
import {
  useExtractionStore,
  isStepAvailable,
  getStepStatus,
} from "../../store/extractionStore";
import { getWorkflow } from "../../types/workflow";
import type { WorkflowStep } from "../../types/workflow";
import { WorkflowStepper } from "./WorkflowStepper";
import { DomainSelector } from "./DomainSelector";
import { SidecarEditor } from "./SidecarEditor";
import { CompositionEditor } from "./CompositionEditor";
import { ExtractConfigEditor } from "./ExtractConfigEditor";
import { resolveAdapterFormat } from "./adapterFormat";
import { VerdictTable } from "./VerdictTable";
import { CegarRunner } from "./CegarRunner";
import { SvCegarRunner } from "./SvCegarRunner";
import { SvExtractSvaRunner } from "./SvExtractSvaRunner";
import { SvVerifyAutoRunner } from "./SvVerifyAutoRunner";

/**
 * Map a source file name (e.g. `index.ts`, `worker.py`) to the language
 * label the backend's `/extraction/propose-composition` endpoint
 * accepts. Returns `undefined` for unknown extensions — the caller
 * (CompositionEditor) hides the suggest button when the language is
 * not resolvable.
 */
function inferLanguageFromFileName(fileName: string): string | undefined {
  const ext = fileName.toLowerCase().split(".").pop();
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "typescript";
    case "py":
    case "pyi":
      return "python";
    case "rs":
      return "rust";
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// File upload area (shared between domain selection and load step)
// ---------------------------------------------------------------------------

function FileUploadArea({
  onFileLoad,
}: {
  onFileLoad: (content: string, name: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          onFileLoad(reader.result, file.name);
        }
      };
      reader.readAsText(file);
    },
    [onFileLoad],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`
        mt-4 flex flex-col items-center justify-center rounded-lg border-2 border-dashed
        px-6 py-10 cursor-pointer transition-colors
        ${
          dragOver
            ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20"
            : "border-gray-300 bg-gray-50 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800/50 dark:hover:border-gray-500"
        }
      `}
    >
      <svg
        className="mx-auto h-10 w-10 text-gray-400 dark:text-gray-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
        />
      </svg>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Drop a source file here, or{" "}
        <span className="font-medium text-blue-600 dark:text-blue-400">
          browse
        </span>
      </p>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step content panels (placeholders for now)
// ---------------------------------------------------------------------------

function StepRunButton({
  step,
  disabled,
  onClick,
}: {
  step: WorkflowStep;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={
        disabled ? undefined : { backgroundColor: "#2563eb", color: "#ffffff" }
      }
      className={`
        rounded-md px-4 py-2 text-sm font-medium transition-colors
        ${
          disabled
            ? "bg-gray-300 text-gray-600 cursor-not-allowed dark:bg-gray-600 dark:text-gray-400"
            : "hover:bg-blue-700 dark:hover:bg-blue-600"
        }
      `}
    >
      Run {step.label}
    </button>
  );
}

function LoadStepContent({
  onFileLoad,
}: {
  onFileLoad: (content: string, name: string) => void;
}) {
  const {
    sourceContent,
    sourceFileName,
    additionalSources,
    addSource,
    removeSource,
    replaceSource,
    completeStep,
  } = useExtractionStore();
  const additionalInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const handleAdditionalFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            addSource(file.name, reader.result);
          }
        };
        reader.readAsText(file);
      });
      e.target.value = "";
    },
    [addSource],
  );

  const handleReplaceFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            replaceSource(reader.result, file.name);
          }
        };
        reader.readAsText(file);
      }
      e.target.value = "";
    },
    [replaceSource],
  );

  if (sourceContent) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              Primary:{" "}
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {sourceFileName}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => replaceInputRef.current?.click()}
            className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Replace
          </button>
          <input
            ref={replaceInputRef}
            type="file"
            className="hidden"
            onChange={handleReplaceFile}
          />
        </div>
        <pre className="max-h-48 overflow-auto rounded-md bg-gray-100 p-3 text-xs text-gray-800 dark:bg-gray-800 dark:text-gray-200">
          {sourceContent.slice(0, 1500)}
          {sourceContent.length > 1500 && "\n... (truncated)"}
        </pre>

        {/* Additional sources section */}
        <div className="border-t border-gray-200 pt-3 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Additional Source Files
              <span className="ml-1 text-gray-400">
                ({additionalSources.length} file
                {additionalSources.length !== 1 ? "s" : ""})
              </span>
            </span>
            <button
              type="button"
              onClick={() => additionalInputRef.current?.click()}
              className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              + Add Files
            </button>
            <input
              ref={additionalInputRef}
              type="file"
              multiple
              accept=".sv,.v,.ts,.tsx,.py,.rs"
              onChange={handleAdditionalFiles}
              className="hidden"
            />
          </div>
          {additionalSources.length > 0 && (
            <ul className="mt-2 space-y-1">
              {additionalSources.map((src) => (
                <li
                  key={src.name}
                  className="rounded-md bg-gray-50 dark:bg-gray-800"
                >
                  <div className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <details className="flex-1">
                      <summary className="cursor-pointer text-gray-700 dark:text-gray-300">
                        {src.name}
                        <span className="ml-2 text-gray-400">
                          ({(src.content.length / 1024).toFixed(1)} KB)
                        </span>
                      </summary>
                      <pre className="mt-1 max-h-32 overflow-auto rounded bg-gray-100 p-2 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                        {src.content.slice(0, 800)}
                        {src.content.length > 800 && "\n... (truncated)"}
                      </pre>
                    </details>
                    <button
                      type="button"
                      onClick={() => removeSource(src.name)}
                      className="ml-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                      title="Remove"
                    >
                      &times;
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {additionalSources.length === 0 && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              For multi-module designs, add sub-module source files here.
            </p>
          )}
        </div>

        {/* Continue button */}
        <div className="flex justify-end border-t border-gray-200 pt-3 dark:border-gray-700">
          <button
            type="button"
            onClick={() => {
              completeStep("load", {
                success: true,
                data: sourceFileName,
                timestamp: Date.now(),
              });
            }}
            style={{ backgroundColor: "#2563eb", color: "#ffffff" }}
            className="rounded-md px-4 py-2 text-sm font-medium hover:bg-blue-700 dark:hover:bg-blue-600"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return <FileUploadArea onFileLoad={onFileLoad} />;
}

function StepContent({ step }: { step: WorkflowStep }) {
  const state = useExtractionStore();
  const available = isStepAvailable(state, step.id);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const runStep = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const stepResult = await executeStep(step.id, state);
      state.completeStep(step.id, {
        success: true,
        data: stepResult,
        timestamp: Date.now(),
      });
      if (typeof stepResult === "string") {
        setResult(stepResult);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      state.completeStep(step.id, {
        success: false,
        error: msg,
        timestamp: Date.now(),
      });
    } finally {
      setRunning(false);
    }
  }, [step.id, state]);

  // Extract step — author the full extract config and run extraction.
  // Software-domain workflow: surfaces the extract config as JSON so the
  // user controls targets[] / composition / properties[]. The compose
  // step (later) edits only the composition sub-block; this editor can
  // sync that block in on demand.
  // Other domains (xstate, sv, etc.) fall through to the generic Run
  // button below — their extract handlers don't need a config payload.
  if (step.id === "extract" && state.activeWorkflow?.domain === "software") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {step.description}
        </p>
        <ExtractConfigEditor
          content={state.extractConfig}
          onChange={state.updateExtractConfig}
          sourceFileName={state.sourceFileName}
          compositionConfig={state.compositionConfig}
        />
        <div className="flex items-center gap-3">
          <StepRunButton
            step={step}
            disabled={!available || running}
            onClick={runStep}
          />
          {running && (
            <span className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">
              Running...
            </span>
          )}
        </div>
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}
        {result && (
          <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
            {result}
          </div>
        )}
      </div>
    );
  }

  // Compose step (compositional extraction config)
  if (step.id === "compose") {
    const handleContinue = () => {
      state.completeStep(step.id, { success: true, timestamp: Date.now() });
    };
    const handleSkip = () => {
      state.skipStep(step.id);
      // Auto-advance to the next step after skipping. Mirror completeStep
      // semantics so the workflow stepper moves forward even when the
      // user chose not to use composition.
      state.completeStep(step.id, { success: true, timestamp: Date.now() });
    };
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {step.description}
        </p>
        <CompositionEditor
          content={state.compositionConfig}
          onChange={state.updateCompositionConfig}
          sourceContent={state.sourceContent}
          sourceLanguage={inferLanguageFromFileName(state.sourceFileName)}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleSkip}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Skip (single-class verification)
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={!state.compositionConfig?.trim()}
            style={
              state.compositionConfig?.trim()
                ? { backgroundColor: "#2563eb", color: "#ffffff" }
                : undefined
            }
            className="rounded-md px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:hover:bg-blue-600 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // Sidecar editor step
  if (step.id === "edit_sidecar") {
    const sidecarExt = state.activeWorkflow?.sidecarExtension ?? ".json";
    const handleContinue = () => {
      state.completeStep(step.id, { success: true, timestamp: Date.now() });
    };
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {step.description}
        </p>
        {state.sidecarContent ? (
          <>
            <div className="h-80 rounded-md border border-gray-200 dark:border-gray-700">
              <SidecarEditor
                content={state.sidecarContent}
                onChange={state.updateSidecar}
                extension={sidecarExt}
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleContinue}
                style={{ backgroundColor: "#2563eb", color: "#ffffff" }}
                className="rounded-md px-4 py-2 text-sm font-medium hover:bg-blue-700 dark:hover:bg-blue-600"
              >
                Continue to Translate
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
            No sidecar generated yet. Complete the init/extract step first.
          </div>
        )}
      </div>
    );
  }

  // CEGAR step — predicate-abstraction refinement, self-contained (the
  // runner owns the form + API call + refinement-trace rendering). Two
  // flavours by domain:
  //   - `rtl`   → SvCegarRunner: SV-direct (POST /api/v1/sv/cegar), the
  //     backend lifts the loaded SV to BTOR2 first (Stage 2).
  //   - `btor2` → CegarRunner: BTOR2-direct (POST /api/v1/btor2/cegar),
  //     seeded with the BTOR2 loaded in the previous step (Stage 1).
  if (step.id === "cegar") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {step.description}
        </p>
        {state.activeWorkflow?.domain === "rtl" ? (
          <SvCegarRunner />
        ) : (
          <CegarRunner initialBtor2={state.sourceContent} />
        )}
      </div>
    );
  }

  // SVA-extraction step (XL.6a) — the slang front-end: extract + translate the
  // design's SVA to mu-calculus. Self-contained (the runner owns the API call +
  // report rendering). Surface peer of `mununu sv extract-sva`.
  if (step.id === "extract_sva") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {step.description}
        </p>
        <SvExtractSvaRunner />
      </div>
    );
  }

  // No-sidecar SVA verification step (XL.6b) — extract + verify each property.
  // Self-contained (the runner owns the API call + verdict rendering). Surface
  // peer of `mununu sv verify-auto`.
  if (step.id === "verify_auto") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {step.description}
        </p>
        <SvVerifyAutoRunner />
      </div>
    );
  }

  // Verify step — two flavours:
  //   1. `verify-project` workflow runs the orchestrator inline against
  //      the loaded `verify.toml` and renders the report.
  //   2. Every other workflow's verify step is a hand-off ("switch to
  //      the Verification tab").
  if (step.id === "verify") {
    if (state.activeWorkflow?.domain === "verify-project") {
      return (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {step.description}
          </p>
          <div>
            <label
              htmlFor="verify-base-dir"
              className="block text-xs font-medium text-gray-700 dark:text-gray-300"
            >
              Base directory (server-side absolute path)
            </label>
            <input
              id="verify-base-dir"
              type="text"
              value={state.verifyBaseDir}
              onChange={(e) => state.setVerifyBaseDir(e.target.value)}
              placeholder="/abs/path/to/project"
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-mono text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Source paths inside the verify.toml resolve against this
              directory. Files must exist on the mununu server's filesystem.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <StepRunButton
              step={step}
              disabled={!available || running || !state.verifyBaseDir.trim()}
              onClick={runStep}
            />
            {running && (
              <span className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">
                Running...
              </span>
            )}
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}
          {result && (
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
              {result}
            </div>
          )}

          {state.verifyReport && (
            <div className="mt-4 rounded-md border border-gray-200 dark:border-gray-700">
              <div className="p-4">
                <VerdictTable report={state.verifyReport} />
              </div>
            </div>
          )}
        </div>
      );
    }
    // Default: hand-off to the Verification tab.
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {step.description}
        </p>
        <div className="rounded-md bg-blue-50 p-4 dark:bg-blue-900/20">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {state.ctxdslContent
              ? "CTXDSL generated. Switch to the Verification tab to evaluate properties."
              : "Complete the Translate step first to generate CTXDSL."}
          </p>
        </div>
      </div>
    );
  }

  // Steps with API endpoints
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {step.description}
      </p>

      <div className="flex items-center gap-3">
        <StepRunButton
          step={step}
          disabled={!available || running}
          onClick={runStep}
        />
        {running && (
          <span className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">
            Running...
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}
      {result && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
          {result}
        </div>
      )}
    </div>
  );
}

/**
 * Execute a workflow step by calling the appropriate API endpoint.
 * Returns a human-readable result message.
 */
async function executeStep(
  stepId: string,
  state: ReturnType<typeof useExtractionStore.getState>,
): Promise<string> {
  const {
    sourceContent,
    sourceFileName,
    additionalSources,
    sidecarContent,
    updateSidecar,
    updateCtxdsl,
  } = state;

  switch (stepId) {
    case "extract": {
      const { extractSource } = await import("../../api/endpoints");
      const cfg = state.extractConfig?.trim();
      if (!cfg) {
        throw new Error(
          "No extract config — open the Extract step and click 'Start from template'.",
        );
      }
      // Validate the JSON shape locally so the user gets a clearer error
      // than the backend's "missing field source" message.
      try {
        const parsed = JSON.parse(cfg);
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          throw new Error("Extract config must be a JSON object.");
        }
        const obj = parsed as Record<string, unknown>;
        if (!obj.source || typeof obj.source !== "object") {
          throw new Error("Extract config is missing the `source` block.");
        }
        if (!Array.isArray(obj.targets) || obj.targets.length === 0) {
          throw new Error(
            "Extract config is missing `targets[]` (at least one entry).",
          );
        }
      } catch (e) {
        if (e instanceof SyntaxError) {
          throw new Error(`Extract config has invalid JSON: ${e.message}`);
        }
        throw e;
      }
      const response = await extractSource({
        source: sourceContent,
        config: cfg,
      });
      updateSidecar(response.espec);
      const autCount = response.automata.length;
      return `Extracted ${autCount} automaton/a. ${response.warnings.length} warning(s).`;
    }

    case "validate": {
      const { validateExtraction } = await import("../../api/endpoints");
      if (!sidecarContent) throw new Error("No spec — run Extract first");
      const response = await validateExtraction({
        spec: sidecarContent,
        source: sourceContent,
      });
      const s = response.summary;
      return `Anchors: ${s.exact} exact, ${s.drifted} drifted, ${s.mismatch} mismatch, ${s.error} error. ${s.uncovered_accesses} uncovered.`;
    }

    case "translate": {
      const { importContext } = await import("../../api/endpoints");
      const format = resolveAdapterFormat(state.activeWorkflow?.domain);
      const content =
        format === "extraction" && sidecarContent
          ? sidecarContent
          : sourceContent;
      const response = await importContext({
        content,
        format,
        filename: sourceFileName,
        sidecar:
          format === "systemverilog"
            ? (sidecarContent ?? undefined)
            : undefined,
        additional_sources:
          format === "systemverilog"
            ? additionalSources.map((s) => ({
                name: s.name,
                content: s.content,
              }))
            : [],
      });
      updateCtxdsl(response.ctxdsl);
      return `Translated to CTXDSL (${response.source_format}): ${response.state_count} states, ${response.property_count} properties`;
    }

    case "verify": {
      // The `verify` step only has a backend handler for the
      // `verify-project` workflow — every other workflow's verify
      // step is "switch to the Verification tab" and is handled by
      // the StepContent UI, not by executeStep.
      if (state.activeWorkflow?.domain !== "verify-project") {
        throw new Error(
          "verify step has no executor for this workflow — switch to the Verification tab instead",
        );
      }
      const { verifyProject } = await import("../../api/endpoints");
      const baseDir = state.verifyBaseDir.trim();
      if (!baseDir) {
        throw new Error(
          "Enter the base directory (server-side absolute path) before running verify.",
        );
      }
      const report = await verifyProject({
        config_toml: sourceContent,
        base_dir: baseDir,
      });
      state.setVerifyReport(report);
      const satisfied = report.property_verdicts.filter(
        (v) => v.outcome === "holds",
      ).length;
      const total = report.property_verdicts.length;
      return `Verified ${report.project}: ${satisfied} / ${total} properties satisfied (${report.sources.length} source(s))`;
    }

    default:
      throw new Error(`Unknown step: ${stepId}`);
  }
}

// ---------------------------------------------------------------------------
// Main ExtractionPanel
// ---------------------------------------------------------------------------

export const ExtractionPanel = () => {
  const state = useExtractionStore();
  const { activeWorkflow, currentStep, startWorkflow, resetWorkflow } = state;
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{
    content: string;
    name: string;
  } | null>(null);

  const handleSelectDomain = useCallback(
    (domain: string) => {
      setSelectedDomain(domain);
      if (pendingFile) {
        const workflow = getWorkflow(domain);
        if (workflow) {
          startWorkflow(workflow, pendingFile.content, pendingFile.name);
          setPendingFile(null);
        }
      }
    },
    [pendingFile, startWorkflow],
  );

  const handleFileLoad = useCallback(
    (content: string, name: string) => {
      if (selectedDomain) {
        const workflow = getWorkflow(selectedDomain);
        if (workflow) {
          startWorkflow(workflow, content, name);
          return;
        }
      }
      setPendingFile({ content, name });
    },
    [selectedDomain, startWorkflow],
  );

  // ---- No workflow active: domain selection + file upload ----
  if (!activeWorkflow) {
    return (
      <div className="space-y-6 p-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Select Extraction Domain
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Choose a domain to begin the extraction workflow.
          </p>
        </div>

        <DomainSelector
          onSelectDomain={handleSelectDomain}
          selectedDomain={selectedDomain}
        />

        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Source File
          </h3>
          <FileUploadArea onFileLoad={handleFileLoad} />
          {pendingFile && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              File ready:{" "}
              <span className="font-medium">{pendingFile.name}</span> — select a
              domain to start.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ---- Workflow active: stepper + step content ----
  const currentStepDef = activeWorkflow.steps.find((s) => s.id === currentStep);
  const status = currentStepDef
    ? getStepStatus(state, currentStepDef.id)
    : "pending";

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {activeWorkflow.displayName}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {activeWorkflow.description}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetWorkflow();
            setSelectedDomain(null);
            setPendingFile(null);
          }}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Reset
        </button>
      </div>

      {/* Stepper */}
      <WorkflowStepper />

      {/* Step content */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        {currentStepDef && (
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">
              {currentStepDef.label}
            </h3>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                status === "completed"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : status === "active"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : status === "skipped"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
              }`}
            >
              {status}
            </span>
          </div>
        )}

        {currentStepDef?.id === "load" ? (
          <LoadStepContent onFileLoad={handleFileLoad} />
        ) : currentStepDef ? (
          <StepContent step={currentStepDef} />
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No step selected.
          </p>
        )}
      </div>
    </div>
  );
};
