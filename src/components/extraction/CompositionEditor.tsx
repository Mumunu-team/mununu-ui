/**
 * CompositionEditor — author the compositional-extraction config block.
 *
 * Renders a JSON editor for the composition section of the extract config,
 * with live validation and a preview of the resolved instances + shared
 * labels. Authored in the `compose` workflow step (software domain).
 *
 * The composition shape (mirrors the backend's `CompositionConfig`):
 *   {
 *     "type": "asynchronous" | "synchronous",
 *     "name": "<id>",
 *     "instances": [{ "of": "<class>", "as": "<instance_name>" }, ...],
 *     "shared": ["<label>", ...]
 *   }
 *
 * The user supplies this JSON; downstream the `extract` step merges it
 * into the extract config it sends to `POST /api/v1/extraction/extract`.
 */

import { useCallback, useMemo, useState } from "react";
import {
  proposeComposition,
  type DetectedConcurrency,
} from "../../api/endpoints";

interface CompositionInstance {
  of: string;
  as: string;
}

interface CompositionShape {
  type?: string;
  name?: string;
  instances?: CompositionInstance[];
  shared?: string[];
}

interface CompositionEditorProps {
  /** Current composition config JSON, or null for empty. */
  content: string | null;
  /** Called when content changes (caller is responsible for store updates). */
  onChange: (content: string) => void;
  /** Whether the editor is read-only. */
  readOnly?: boolean;
  /**
   * Source content for the Phase B 'Suggest from source' pre-pass.
   * When omitted (or empty) the suggest button is hidden — the
   * editor falls back to the manual / template-only flow.
   */
  sourceContent?: string;
  /**
   * Source language passed to the backend's propose-composition
   * endpoint. Required alongside `sourceContent` for the suggest
   * button to render. Accepts the same names the backend recognises
   * (`typescript`, `python`, `rust`).
   */
  sourceLanguage?: string;
}

const DEFAULT_TEMPLATE = JSON.stringify(
  {
    type: "asynchronous",
    name: "race",
    instances: [
      { of: "Worker", as: "worker_a" },
      { of: "Worker", as: "worker_b" },
    ],
    shared: ["ev_save"],
  },
  null,
  2,
);

interface ValidationResult {
  ok: boolean;
  parsed: CompositionShape | null;
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
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, parsed: null, error: "Top-level must be an object" };
  }
  const obj = parsed as Record<string, unknown>;
  if (
    obj.type !== undefined &&
    obj.type !== "asynchronous" &&
    obj.type !== "synchronous"
  ) {
    return {
      ok: false,
      parsed: null,
      error: `\`type\` must be "asynchronous" or "synchronous"`,
    };
  }
  if (obj.instances !== undefined && !Array.isArray(obj.instances)) {
    return { ok: false, parsed: null, error: "`instances` must be an array" };
  }
  if (Array.isArray(obj.instances)) {
    for (let i = 0; i < obj.instances.length; i++) {
      const inst = obj.instances[i];
      if (typeof inst !== "object" || inst === null) {
        return {
          ok: false,
          parsed: null,
          error: `instances[${i}] must be an object`,
        };
      }
      const i_obj = inst as Record<string, unknown>;
      if (typeof i_obj.of !== "string" || !i_obj.of) {
        return {
          ok: false,
          parsed: null,
          error: `instances[${i}].of must be a non-empty string (class name)`,
        };
      }
      if (typeof i_obj.as !== "string" || !i_obj.as) {
        return {
          ok: false,
          parsed: null,
          error: `instances[${i}].as must be a non-empty string (instance name)`,
        };
      }
    }
  }
  if (
    obj.shared !== undefined &&
    (!Array.isArray(obj.shared) ||
      obj.shared.some((s) => typeof s !== "string"))
  ) {
    return {
      ok: false,
      parsed: null,
      error: "`shared` must be an array of strings",
    };
  }
  return { ok: true, parsed: obj as CompositionShape, error: null };
}

export function CompositionEditor({
  content,
  onChange,
  readOnly = false,
  sourceContent,
  sourceLanguage,
}: CompositionEditorProps) {
  const validation = useMemo(() => validate(content ?? ""), [content]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const handleStartFromTemplate = useCallback(() => {
    onChange(DEFAULT_TEMPLATE);
  }, [onChange]);

  const showTemplate = !content || !content.trim();

  const canSuggest = !readOnly && !!sourceContent?.trim() && !!sourceLanguage;
  const [findings, setFindings] = useState<DetectedConcurrency[] | null>(null);
  const [suggestRunning, setSuggestRunning] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const handleSuggest = useCallback(async () => {
    if (!sourceContent || !sourceLanguage) return;
    setSuggestRunning(true);
    setSuggestError(null);
    try {
      const response = await proposeComposition({
        source: sourceContent,
        language: sourceLanguage,
      });
      setFindings(response.findings);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      // axios surfaces aborted timeouts as the bare error code; that's
      // useless to a user. Translate to something they can act on.
      const isTimeout =
        raw.includes("ECONNABORTED") ||
        raw.toLowerCase().includes("timeout") ||
        (typeof (e as { code?: string }).code === "string" &&
          (e as { code?: string }).code === "ECONNABORTED");
      const friendly = isTimeout
        ? "Backend timed out (>30s). Check that the mununu server is built " +
          "in --release mode (debug-mode tree-sitter is much slower) and " +
          "that the source file isn't unusually large."
        : raw;
      setSuggestError(friendly);
      setFindings(null);
    } finally {
      setSuggestRunning(false);
    }
  }, [sourceContent, sourceLanguage]);

  const handleApplyFinding = useCallback(
    (finding: DetectedConcurrency) => {
      const className = finding.suggested_class_hint ?? "Worker";
      const instances = finding.suggested_instance_names.map((name) => ({
        of: className,
        as: name,
      }));
      const config = {
        type: "asynchronous",
        name: `auto_${finding.detector_id}_l${finding.line}`,
        instances,
        shared: [] as string[],
      };
      onChange(JSON.stringify(config, null, 2));
    },
    [onChange],
  );

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Declare instances + shared labels for compositional verification. See{" "}
        <a
          href="https://github.com/Mumunu-team/mununu/wiki/Compositional-Extraction"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-blue-600 dark:hover:text-blue-400"
        >
          Compositional Extraction wiki
        </a>{" "}
        for the full schema and semantics.
      </div>

      {showTemplate && !readOnly && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleStartFromTemplate}
            aria-label="Start from a 2-instance race-detection template"
            style={{ backgroundColor: "#2563eb", color: "#ffffff" }}
            className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-blue-700 dark:hover:bg-blue-600"
          >
            Start from template (2-instance race)
          </button>
          {canSuggest && (
            <button
              type="button"
              onClick={handleSuggest}
              disabled={suggestRunning}
              aria-label="Suggest composition from source"
              className="rounded-md border border-blue-600 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-500 dark:bg-gray-900 dark:text-blue-300 dark:hover:bg-gray-800"
            >
              {suggestRunning ? "Scanning…" : "Suggest from source (Phase B)"}
            </button>
          )}
        </div>
      )}

      {suggestError && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          Propose-composition failed: {suggestError}
        </div>
      )}

      {findings !== null && (
        <FindingsList
          findings={findings}
          onApply={handleApplyFinding}
          onDismiss={() => setFindings(null)}
        />
      )}

      <textarea
        value={content ?? ""}
        onChange={handleChange}
        readOnly={readOnly}
        spellCheck={false}
        rows={14}
        aria-label="Composition config JSON"
        placeholder='{ "type": "asynchronous", "name": "race", "instances": [...], "shared": [...] }'
        className="w-full rounded-md border border-gray-200 bg-white p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />

      {content && content.trim() && !validation.ok && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {validation.error}
        </div>
      )}

      {validation.ok && validation.parsed && (
        <CompositionSummary shape={validation.parsed} />
      )}
    </div>
  );
}

function FindingsList({
  findings,
  onApply,
  onDismiss,
}: {
  findings: DetectedConcurrency[];
  onApply: (f: DetectedConcurrency) => void;
  onDismiss: () => void;
}) {
  if (findings.length === 0) {
    return (
      <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
        No concurrency idioms detected in the loaded source. Phase B is a
        suggestion-only pre-pass — falling back to the manual / template flow.
        <div className="mt-2">
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-900/20">
      <div className="flex items-center justify-between">
        <div className="font-medium text-blue-800 dark:text-blue-300">
          {findings.length} concurrency idiom(s) detected
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-blue-700 underline hover:no-underline dark:text-blue-300"
        >
          Dismiss
        </button>
      </div>
      <ul className="mt-2 space-y-2">
        {findings.map((f, i) => (
          <li
            key={`${f.detector_id}-${f.line}-${i}`}
            className="rounded-md bg-white p-2 dark:bg-gray-900"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-mono text-xs text-gray-600 dark:text-gray-400">
                  {f.detector_id} @ line {f.line}
                </div>
                <div className="text-sm text-gray-800 dark:text-gray-100">
                  {f.description}
                </div>
                {f.suggested_instance_names.length > 0 && (
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Suggests: {f.suggested_instance_names.join(", ")}
                    {f.suggested_class_hint
                      ? ` (of ${f.suggested_class_hint})`
                      : ""}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onApply(f)}
                aria-label={`Apply finding ${f.detector_id} at line ${f.line}`}
                style={{ backgroundColor: "#2563eb", color: "#ffffff" }}
                className="shrink-0 rounded-md px-3 py-1 text-xs font-medium hover:bg-blue-700 dark:hover:bg-blue-600"
              >
                Apply
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2 text-xs text-blue-700 dark:text-blue-400">
        Suggestions are starting points. Review the resulting JSON, set
        <span className="font-mono"> shared</span> labels for the resource(s)
        the instances contend over, and rename instances to reflect your domain
        (e.g.,
        <span className="font-mono"> worker_a</span>,
        <span className="font-mono"> worker_b</span>).
      </div>
    </div>
  );
}

function CompositionSummary({ shape }: { shape: CompositionShape }) {
  const instances = shape.instances ?? [];
  const shared = shape.shared ?? [];

  return (
    <div className="rounded-md bg-green-50 p-3 text-sm dark:bg-green-900/20">
      <div className="font-medium text-green-800 dark:text-green-300">
        Valid composition
      </div>
      <div className="mt-1 text-xs text-green-700 dark:text-green-400">
        <div>
          <span className="font-medium">Type:</span> {shape.type ?? "(unset)"} ·{" "}
          <span className="font-medium">Name:</span> {shape.name ?? "(unset)"}
        </div>
        <div className="mt-1">
          <span className="font-medium">Instances ({instances.length}):</span>{" "}
          {instances.length > 0
            ? instances.map((i) => `${i.as} (of ${i.of})`).join(", ")
            : "—"}
        </div>
        <div className="mt-1">
          <span className="font-medium">Shared labels ({shared.length}):</span>{" "}
          {shared.length > 0
            ? shared.join(", ")
            : "— (full async, no synchronization)"}
        </div>
      </div>
    </div>
  );
}
