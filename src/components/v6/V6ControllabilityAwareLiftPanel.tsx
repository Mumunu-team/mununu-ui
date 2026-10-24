/**
 * R.6.7 / V.6 (2026-06-09) — Controllability-aware predicate-cube
 * lift workflow panel.
 *
 * Surface-parity peer of the CLI's `mununu btor2 cegar
 * --controllable ... --predicate ...` invocation (shipped at
 * commit `62a20ef`) and the API's `/api/v1/context/import` endpoint
 * extension (shipped at the same backend commit as this UI).
 *
 * The MVP workflow:
 *   1. User pastes (or uploads) BTOR2 source.
 *   2. User enters predicate triples (one per row: name, register,
 *      value) — these become the `{burst==0}`-style predicate set
 *      bounding the abstraction.
 *   3. User enters controllable-input names (one per row) — these
 *      are the BTOR2 inputs the controller drives (R.6.6 env/ctrl
 *      split).
 *   4. "Run lift" sends to the import endpoint with the V.6 fields
 *      populated. The backend routes through `predicate_cube_lift`
 *      + returns a summary CTXDSL + the lift's `AdapterWarning`s.
 *   5. The panel renders the lift summary (state count = cube
 *      count, warnings list, summary CTXDSL).
 *
 * SV-direct input (UI runs sv2v + Yosys + lift in one call) is a
 * follow-up. Today the user runs `mununu sv emit-btor2-per-module`
 * first to produce BTOR2 from SV, then pastes/uploads the BTOR2
 * here.
 */

import { useState } from "react";
import { Button } from "../common/Button";
import { importContext, PredicateSpecRequest } from "../../api/endpoints";

interface LiftResult {
  ctxdsl: string;
  warnings: string[];
  cubeCount: number;
  sourceFormat: string;
}

export const V6ControllabilityAwareLiftPanel = () => {
  const [btor2Content, setBtor2Content] = useState("");
  const [predicatesText, setPredicatesText] = useState(
    "burst_zero, burst, 0\n",
  );
  const [controllableInputsText, setControllableInputsText] =
    useState("ctrl_g0\nctrl_g1\n");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<LiftResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsePredicates = (text: string): PredicateSpecRequest[] => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("//"))
      .map((line) => {
        const parts = line.split(",").map((s) => s.trim());
        if (parts.length !== 3) {
          throw new Error(
            `Invalid predicate row: ${line}. Expected "name, register, value".`,
          );
        }
        const value = Number(parts[2]);
        if (!Number.isFinite(value)) {
          throw new Error(
            `Invalid predicate value: ${parts[2]} (must be a finite integer).`,
          );
        }
        return { name: parts[0], register: parts[1], value };
      });
  };

  const parseControllableInputs = (text: string): string[] => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("//"));
  };

  const handleFileUpload = async (file: File) => {
    const text = await file.text();
    setBtor2Content(text);
  };

  const handleRunLift = async () => {
    setError(null);
    setResult(null);
    if (!btor2Content.trim()) {
      setError("BTOR2 source is empty.");
      return;
    }
    let predicates: PredicateSpecRequest[];
    let controllableInputs: string[];
    try {
      predicates = parsePredicates(predicatesText);
      controllableInputs = parseControllableInputs(controllableInputsText);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (predicates.length === 0) {
      setError("At least one predicate required.");
      return;
    }
    if (controllableInputs.length === 0) {
      setError("At least one controllable input required.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await importContext({
        content: btor2Content,
        format: "btor2",
        filename: "v6_lift.btor2",
        predicates,
        controllable: controllableInputs,
      });
      setResult({
        ctxdsl: response.ctxdsl,
        warnings: response.warnings,
        cubeCount: response.state_count,
        sourceFormat: response.source_format,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unknown error from /api/v1/context/import",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: "1rem",
        maxWidth: "900px",
        margin: "0 auto",
        fontFamily: "sans-serif",
      }}
    >
      <h2>V.6 — Controllability-aware predicate-cube lift</h2>
      <p style={{ color: "var(--text-secondary, #666)" }}>
        R.6.7 industrial proof-of-fire workflow. Lifts a BTOR2 design to a
        controllability-aware KMTS via the R.6.6 dual-label emission + the R.2.5
        predicate-cube abstraction. See{" "}
        <code>docs/tutorials/v6_amba_arbiter.md</code> for the full walkthrough.
      </p>

      <section style={{ marginTop: "1.5rem" }}>
        <h3>1. BTOR2 source</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary, #666)" }}>
          Paste BTOR2 text or upload a .btor2 file. For SV input, run{" "}
          <code>mununu sv emit-btor2-per-module</code> first to produce the
          BTOR2.
        </p>
        <input
          type="file"
          accept=".btor2,.btor"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
          }}
          style={{ marginBottom: "0.5rem" }}
        />
        <textarea
          value={btor2Content}
          onChange={(e) => setBtor2Content(e.target.value)}
          placeholder="; BTOR2 source..."
          style={{
            width: "100%",
            height: "200px",
            fontFamily: "monospace",
            fontSize: "0.85rem",
          }}
        />
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h3>2. Predicates</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary, #666)" }}>
          One per line, comma-separated: <code>name, register, value</code>.
          Example: <code>burst_zero, burst, 0</code>.
        </p>
        <textarea
          value={predicatesText}
          onChange={(e) => setPredicatesText(e.target.value)}
          style={{
            width: "100%",
            height: "100px",
            fontFamily: "monospace",
            fontSize: "0.85rem",
          }}
        />
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h3>3. Controllable inputs</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary, #666)" }}>
          One BTOR2 input symbol name per line. These are the inputs the
          controller drives (R.6.6 env/ctrl split). All other boolean inputs are
          treated as environment-driven.
        </p>
        <textarea
          value={controllableInputsText}
          onChange={(e) => setControllableInputsText(e.target.value)}
          style={{
            width: "100%",
            height: "100px",
            fontFamily: "monospace",
            fontSize: "0.85rem",
          }}
        />
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <Button
          variant="primary"
          size="lg"
          onClick={handleRunLift}
          isLoading={isLoading}
        >
          Run controllability-aware lift
        </Button>
      </section>

      {error && (
        <section
          style={{
            marginTop: "1rem",
            padding: "0.75rem",
            background: "var(--error-bg, #fee)",
            color: "var(--error-text, #c00)",
            border: "1px solid var(--error-border, #f00)",
            borderRadius: "4px",
          }}
        >
          <strong>Error:</strong> {error}
        </section>
      )}

      {result && (
        <section style={{ marginTop: "1.5rem" }}>
          <h3>Lift summary</h3>
          <div style={{ marginBottom: "1rem" }}>
            <strong>Cube count:</strong> {result.cubeCount}
            <br />
            <strong>Source format:</strong> {result.sourceFormat}
          </div>
          {result.warnings.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <strong>
                Warnings ({result.warnings.length}, including R.6.7 summary
                line):
              </strong>
              <ul
                style={{
                  fontSize: "0.85rem",
                  fontFamily: "monospace",
                  background: "var(--code-bg, #f5f5f5)",
                  padding: "0.5rem",
                  borderRadius: "4px",
                }}
              >
                {result.warnings.map((w, i) => (
                  <li key={i} style={{ marginBottom: "0.25rem" }}>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <strong>Summary CTXDSL:</strong>
            <pre
              style={{
                fontFamily: "monospace",
                fontSize: "0.85rem",
                background: "var(--code-bg, #f5f5f5)",
                padding: "0.5rem",
                borderRadius: "4px",
                overflow: "auto",
              }}
            >
              {result.ctxdsl}
            </pre>
            <p
              style={{
                fontSize: "0.85rem",
                color: "var(--text-secondary, #666)",
              }}
            >
              Full CTXDSL emit from the lifted KMTS is a follow-up; the warnings
              list above carries the canonical R.6.7 V.6 summary line. See{" "}
              <code>docs/tutorials/v6_amba_arbiter.md</code> for interpretation.
            </p>
          </div>
        </section>
      )}
    </div>
  );
};
