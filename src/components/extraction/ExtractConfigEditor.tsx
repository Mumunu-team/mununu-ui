/**
 * ExtractConfigEditor — author the full extract config sent to
 * `POST /api/v1/extraction/extract`.
 *
 * The extract config carries:
 *   - `source`: pointer to the source file (filename + optional repo / commit)
 *   - `language`: source language (typescript / python / rust)
 *   - `targets[]`: classes to scan + per-class abstraction overrides
 *   - `composition` (optional): instances + shared labels + resources
 *   - `properties[]` (optional): mu-calculus formulas to verify
 *
 * The CompositionEditor (compose step) authors the `composition`
 * sub-block; this editor lets the user shape the rest. The "Sync
 * composition from compose step" button merges the latest
 * `compositionConfig` from the store into the extract config so the
 * two editors stay aligned without forcing the user to copy JSON.
 */

import { useCallback, useMemo, useState } from "react";

interface ExtractConfigShape {
  source?: { file?: string };
  language?: string;
  targets?: unknown[];
  composition?: unknown;
  properties?: unknown[];
}

interface ExtractConfigEditorProps {
  /** Current extract config JSON, or null for empty. */
  content: string | null;
  /** Called when content changes. */
  onChange: (content: string) => void;
  /** Source filename — used to pre-fill `source.file`. */
  sourceFileName?: string;
  /**
   * Composition block (raw JSON string) authored in the compose step.
   * When set + valid, the "Sync composition from compose step" button
   * merges it into the extract config under `composition`.
   */
  compositionConfig?: string | null;
  /** Whether the editor is read-only. */
  readOnly?: boolean;
}

interface ValidationResult {
  ok: boolean;
  parsed: ExtractConfigShape | null;
  error: string | null;
}

function validate(json: string): ValidationResult {
  if (!json.trim()) {
    return { ok: false, parsed: null, error: "Empty config" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, parsed: null, error: `JSON parse error: ${msg}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      parsed: null,
      error: "Top-level must be a JSON object",
    };
  }
  const obj = parsed as Record<string, unknown>;
  if (
    obj.source === undefined ||
    typeof obj.source !== "object" ||
    obj.source === null
  ) {
    return {
      ok: false,
      parsed: null,
      error: "`source` is required and must be an object with a `file` field",
    };
  }
  const src = obj.source as Record<string, unknown>;
  if (typeof src.file !== "string" || !src.file) {
    return {
      ok: false,
      parsed: null,
      error: "`source.file` is required and must be a non-empty string",
    };
  }
  if (!Array.isArray(obj.targets)) {
    return {
      ok: false,
      parsed: null,
      error: "`targets` is required and must be an array",
    };
  }
  if (obj.targets.length === 0) {
    return {
      ok: false,
      parsed: null,
      error: "`targets` must contain at least one entry",
    };
  }
  return { ok: true, parsed: obj as ExtractConfigShape, error: null };
}

function inferLanguage(fileName: string | undefined): string {
  if (!fileName) return "typescript";
  const ext = fileName.toLowerCase().split(".").pop();
  switch (ext) {
    case "py":
    case "pyi":
      return "python";
    case "rs":
      return "rust";
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
    default:
      return "typescript";
  }
}

/**
 * Build a sensible default extract config from the loaded source filename
 * and (optionally) the composition block authored in the compose step.
 *
 * The default uses a placeholder class name (`Worker`) the user must
 * replace with the actual class they want to scan. Listing one target is
 * the minimum the backend's schema requires; the user edits it post-load.
 */
function buildDefaultConfig(
  sourceFileName: string,
  compositionConfig: string | null,
): string {
  const config: Record<string, unknown> = {
    $schema: "extraction_config_v1",
    domain: "mcp_server",
    language: inferLanguage(sourceFileName),
    source: { file: sourceFileName || "source.ts" },
    targets: [
      {
        class: "Worker",
        state_fields: ["_committed"],
        methods: { include: ["commit", "reset"] },
      },
    ],
  };
  if (compositionConfig?.trim()) {
    try {
      config.composition = JSON.parse(compositionConfig);
    } catch {
      // Leave composition out — user will see the validation error in the
      // CompositionEditor and fix it there.
    }
  }
  return JSON.stringify(config, null, 2);
}

export function ExtractConfigEditor({
  content,
  onChange,
  sourceFileName,
  compositionConfig,
  readOnly = false,
}: ExtractConfigEditorProps) {
  const validation = useMemo(() => validate(content ?? ""), [content]);
  const [syncFlash, setSyncFlash] = useState<string | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const handleStartFromTemplate = useCallback(() => {
    onChange(
      buildDefaultConfig(sourceFileName ?? "", compositionConfig ?? null),
    );
  }, [onChange, sourceFileName, compositionConfig]);

  const handleSyncComposition = useCallback(() => {
    if (!compositionConfig?.trim()) {
      setSyncFlash("Compose step is empty — nothing to sync.");
      return;
    }
    let parsedComposition: unknown;
    try {
      parsedComposition = JSON.parse(compositionConfig);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSyncFlash(`Compose step has invalid JSON: ${msg}`);
      return;
    }
    let current: Record<string, unknown>;
    if (!content?.trim()) {
      current = {
        $schema: "extraction_config_v1",
        language: inferLanguage(sourceFileName),
        source: { file: sourceFileName || "source.ts" },
        targets: [],
      };
    } else {
      try {
        const parsed = JSON.parse(content);
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          setSyncFlash(
            "Current extract config is not a JSON object — fix it first.",
          );
          return;
        }
        current = parsed as Record<string, unknown>;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setSyncFlash(`Current extract config has invalid JSON: ${msg}`);
        return;
      }
    }
    current.composition = parsedComposition;
    onChange(JSON.stringify(current, null, 2));
    setSyncFlash("Composition synced from compose step.");
  }, [compositionConfig, content, onChange, sourceFileName]);

  const showTemplate = !content || !content.trim();

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Author the full extract config sent to{" "}
        <span className="font-mono">/extraction/extract</span>. Includes{" "}
        <span className="font-mono">source</span>,{" "}
        <span className="font-mono">targets</span>, optional{" "}
        <span className="font-mono">composition</span>, and optional{" "}
        <span className="font-mono">properties</span>. See the{" "}
        <a
          href="https://github.com/Mumunu-team/mununu/wiki/Compositional-Extraction-Tutorial"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-blue-600 dark:hover:text-blue-400"
        >
          Compositional Extraction tutorial
        </a>{" "}
        for the full schema.
      </div>

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          {showTemplate && (
            <button
              type="button"
              onClick={handleStartFromTemplate}
              aria-label="Start from a default extract-config template"
              style={{ backgroundColor: "#2563eb", color: "#ffffff" }}
              className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-blue-700 dark:hover:bg-blue-600"
            >
              Start from template
            </button>
          )}
          <button
            type="button"
            onClick={handleSyncComposition}
            aria-label="Sync composition from compose step"
            className="rounded-md border border-blue-600 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-500 dark:bg-gray-900 dark:text-blue-300 dark:hover:bg-gray-800"
          >
            Sync composition from compose step
          </button>
        </div>
      )}

      {syncFlash && (
        <div className="rounded-md bg-blue-50 p-2 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
          {syncFlash}
        </div>
      )}

      <textarea
        value={content ?? ""}
        onChange={handleChange}
        readOnly={readOnly}
        spellCheck={false}
        rows={18}
        aria-label="Extract config JSON"
        placeholder='{ "source": {"file": "..."}, "language": "...", "targets": [...], "composition": {...} }'
        className="w-full rounded-md border border-gray-200 bg-white p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />

      {content && content.trim() && !validation.ok && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {validation.error}
        </div>
      )}

      {validation.ok && validation.parsed && (
        <ExtractConfigSummary shape={validation.parsed} />
      )}
    </div>
  );
}

function ExtractConfigSummary({ shape }: { shape: ExtractConfigShape }) {
  const targets = shape.targets ?? [];
  const composition = shape.composition as
    | { name?: string; instances?: { of?: string; as?: string }[] }
    | undefined;
  const properties = shape.properties ?? [];

  return (
    <div className="rounded-md bg-green-50 p-3 text-sm dark:bg-green-900/20">
      <div className="font-medium text-green-800 dark:text-green-300">
        Valid extract config
      </div>
      <div className="mt-1 space-y-1 text-xs text-green-700 dark:text-green-400">
        <div>
          <span className="font-medium">source.file:</span>{" "}
          <span className="font-mono">{shape.source?.file ?? "—"}</span>
        </div>
        <div>
          <span className="font-medium">language:</span>{" "}
          <span className="font-mono">{shape.language ?? "(default)"}</span>
        </div>
        <div>
          <span className="font-medium">targets ({targets.length}):</span>{" "}
          {targets.length > 0 ? "set" : "— missing — at least one required"}
        </div>
        <div>
          <span className="font-medium">composition:</span>{" "}
          {composition
            ? `${composition.name ?? "(unnamed)"} — ${
                composition.instances?.length ?? 0
              } instance(s)`
            : "— (single-target extraction)"}
        </div>
        <div>
          <span className="font-medium">properties ({properties.length}):</span>{" "}
          {properties.length > 0 ? "set" : "— (none — add to verify in-place)"}
        </div>
      </div>
    </div>
  );
}
