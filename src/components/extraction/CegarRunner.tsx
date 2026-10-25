/**
 * CegarRunner — the interactive CEGAR refinement runner.
 *
 * The predicate-abstraction-refinement loop (R.5) over a BTOR2 design:
 * lift to a KMTS predicate cube, evaluate a μ-calculus formula with the
 * 3-valued { T, F, ⊥ } verdict, and refine on ⊥. Surface peer of the CLI
 * `mununu btor2 cegar` and the `POST /api/v1/btor2/cegar` endpoint.
 *
 * This is the consolidated home of what used to be the standalone
 * `/cegar` page (`RefinementTracePanel`). It is embedded in the
 * extraction tab's BTOR2 → CEGAR step, seeded with the loaded BTOR2 via
 * `initialBtor2`, so SV/BTOR2 → CEGAR is one flow. The trace rendering is
 * delegated to the reusable {@link CegarTraceView}.
 *
 * SV-direct input (the UI runs sv2v + Yosys + lift + CEGAR in one call)
 * is a Stage-2 follow-up; today the BTOR2 is produced by loading a
 * `.btor2` file or running `mununu sv emit-btor2-per-module` first.
 */

import { useEffect, useState } from "react";
import { Button } from "../common/Button";
import {
  runBtor2Cegar,
  PredicateSpecRequest,
  Btor2CegarResponse,
} from "../../api/endpoints";
import { CegarTraceView } from "./CegarTraceView";
import { parsePredicates, parseLines } from "./cegarParsing";

// A small but valid BTOR2 template: a 1-bit register `r` initialised to
// 0 whose next value is a free input. Always has a successor, so
// `nu X. <true> X` evaluates true. The user edits this for their design.
const EXAMPLE_BTOR2 = `1 sort bitvec 1
2 zero 1
3 state 1 r
4 input 1 in
5 next 1 3 4
6 init 1 3 2
`;

export const CegarRunner = ({ initialBtor2 }: { initialBtor2?: string }) => {
  const [btor2Content, setBtor2Content] = useState(
    initialBtor2 && initialBtor2.trim() ? initialBtor2 : EXAMPLE_BTOR2,
  );
  const [formula, setFormula] = useState("nu X. <true> X");
  const [predicatesText, setPredicatesText] = useState("r_zero, r, 0\n");
  const [controllableInputsText, setControllableInputsText] = useState("");
  const [predicateSource, setPredicateSource] = useState("wp");
  const [maxIterations, setMaxIterations] = useState("16");
  const [mustEdgeInference, setMustEdgeInference] = useState("off");
  const [mayEdgeInference, setMayEdgeInference] = useState("off");
  const [configValuesText, setConfigValuesText] = useState("");
  const [emitCtxdsl, setEmitCtxdsl] = useState(false);
  // R-F5.4.2b — predicate-cube engine selector ("explicit" | "symbolic").
  const [engine, setEngine] = useState("explicit");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<Btor2CegarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the BTOR2 source when the upstream load step swaps the file.
  // Only fires when `initialBtor2` (the prop) actually changes, so local
  // edits to the textarea are preserved across re-renders.
  useEffect(() => {
    if (initialBtor2 && initialBtor2.trim()) {
      setBtor2Content(initialBtor2);
    }
  }, [initialBtor2]);

  const handleFileUpload = async (file: File) => {
    const text = await file.text();
    setBtor2Content(text);
  };

  const handleRunCegar = async () => {
    setError(null);
    setResult(null);
    if (!btor2Content.trim()) {
      setError("BTOR2 source is empty.");
      return;
    }
    if (!formula.trim()) {
      setError("Formula is empty.");
      return;
    }
    let predicates: PredicateSpecRequest[];
    let controllableInputs: string[];
    let configValues: string[];
    try {
      predicates = parsePredicates(predicatesText);
      controllableInputs = parseLines(controllableInputsText);
      configValues = parseLines(configValuesText);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (predicates.length === 0) {
      setError("At least one predicate required.");
      return;
    }
    const iterations = Number(maxIterations);
    if (!Number.isInteger(iterations) || iterations < 1) {
      setError("Max iterations must be a positive integer.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await runBtor2Cegar({
        content: btor2Content,
        formula,
        predicates,
        controllable: controllableInputs,
        predicate_source: predicateSource,
        max_iterations: iterations,
        must_edge_inference: mustEdgeInference,
        may_edge_inference: mayEdgeInference,
        init_values: configValues,
        emit_ctxdsl: emitCtxdsl,
        engine,
      });
      setResult(response);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unknown error from /api/v1/btor2/cegar",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: "sans-serif" }}>
      <p style={{ color: "var(--text-secondary, #666)" }}>
        Runs the predicate-abstraction-refinement loop (R.5) over a BTOR2 design
        and renders the per-iteration trace: which predicates were added,
        whether a failure subgame drove the refinement, and how the 3-valued{" "}
        <code>{"{ T, F, ⊥ }"}</code> verdict converges. Surface peer of the CLI{" "}
        <code>mununu btor2 cegar</code> and the{" "}
        <code>POST /api/v1/btor2/cegar</code> endpoint.
      </p>

      <section style={{ marginTop: "1.5rem" }}>
        <h3>1. BTOR2 source</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary, #666)" }}>
          The design lifted to a KMTS. Loaded from the previous step (editable).
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
          aria-label="BTOR2 source"
          value={btor2Content}
          onChange={(e) => setBtor2Content(e.target.value)}
          placeholder="; BTOR2 source..."
          style={{
            width: "100%",
            height: "160px",
            fontFamily: "monospace",
            fontSize: "0.85rem",
          }}
        />
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h3>2. Formula</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary, #666)" }}>
          The μ-calculus formula evaluated over the lifted KMTS. Example:{" "}
          <code>nu X. {"<true>"} X</code> (a successor always exists).
        </p>
        <input
          type="text"
          aria-label="Formula"
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          style={{
            width: "100%",
            fontFamily: "monospace",
            fontSize: "0.9rem",
            padding: "0.4rem",
          }}
        />
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h3>3. Initial predicates</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary, #666)" }}>
          One per line, comma-separated: <code>name, register, value</code>.
          These bootstrap the <code>2^|P|</code> predicate-cube space. Example:{" "}
          <code>r_zero, r, 0</code>.
        </p>
        <textarea
          aria-label="Initial predicates"
          value={predicatesText}
          onChange={(e) => setPredicatesText(e.target.value)}
          style={{
            width: "100%",
            height: "90px",
            fontFamily: "monospace",
            fontSize: "0.85rem",
          }}
        />
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h3>4. Options</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
          }}
        >
          <label style={{ fontSize: "0.9rem" }}>
            Engine
            <select
              aria-label="Engine"
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
              style={{ width: "100%", marginTop: "0.25rem", padding: "0.3rem" }}
            >
              <option value="explicit">explicit (SMT edges + CEGAR)</option>
              <option value="symbolic">
                symbolic (R-F5 BDD, single-shot, no SMT)
              </option>
            </select>
          </label>
          <label style={{ fontSize: "0.9rem" }}>
            Predicate source
            <select
              aria-label="Predicate source"
              value={predicateSource}
              onChange={(e) => setPredicateSource(e.target.value)}
              style={{ width: "100%", marginTop: "0.25rem", padding: "0.3rem" }}
            >
              <option value="wp">wp (weakest precondition)</option>
              <option value="craig">craig (interpolation, needs cvc5)</option>
            </select>
          </label>
          <label style={{ fontSize: "0.9rem" }}>
            Max iterations
            <input
              type="number"
              aria-label="Max iterations"
              min={1}
              value={maxIterations}
              onChange={(e) => setMaxIterations(e.target.value)}
              style={{ width: "100%", marginTop: "0.25rem", padding: "0.3rem" }}
            />
          </label>
          <label style={{ fontSize: "0.9rem" }}>
            Must-edge inference
            <select
              aria-label="Must-edge inference"
              value={mustEdgeInference}
              onChange={(e) => setMustEdgeInference(e.target.value)}
              style={{ width: "100%", marginTop: "0.25rem", padding: "0.3rem" }}
            >
              <option value="off">off</option>
              <option value="sampling-confluence">sampling-confluence</option>
              <option value="smt-per-target">smt-per-target (∀∀)</option>
              <option value="smt-per-target-standard">
                smt-per-target-standard (∀∃)
              </option>
              <option value="smt-hyper-must">smt-hyper-must</option>
            </select>
          </label>
          <label style={{ fontSize: "0.9rem" }}>
            May-edge inference
            <select
              aria-label="May-edge inference"
              value={mayEdgeInference}
              onChange={(e) => setMayEdgeInference(e.target.value)}
              style={{ width: "100%", marginTop: "0.25rem", padding: "0.3rem" }}
            >
              <option value="off">off</option>
              <option value="smt-all-pairs">smt-all-pairs (sound)</option>
            </select>
          </label>
          <label style={{ fontSize: "0.9rem" }}>
            Controllable inputs (one per line, optional)
            <textarea
              aria-label="Controllable inputs"
              value={controllableInputsText}
              onChange={(e) => setControllableInputsText(e.target.value)}
              placeholder="ctrl_g0"
              style={{
                width: "100%",
                height: "60px",
                marginTop: "0.25rem",
                fontFamily: "monospace",
                fontSize: "0.85rem",
              }}
            />
          </label>
          <label style={{ fontSize: "0.9rem" }}>
            Config values (R-S8 symbolic init; one per line:{" "}
            <code>REG=v1,v2,...</code>)
            <textarea
              aria-label="Config values"
              value={configValuesText}
              onChange={(e) => setConfigValuesText(e.target.value)}
              placeholder="boot_fsm_ns=0,1,2,3,4,5,6,7"
              style={{
                width: "100%",
                height: "60px",
                marginTop: "0.25rem",
                fontFamily: "monospace",
                fontSize: "0.85rem",
              }}
            />
          </label>
          <label
            style={{
              fontSize: "0.9rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <input
              type="checkbox"
              aria-label="Emit CTXDSL of the refined model"
              checked={emitCtxdsl}
              onChange={(e) => setEmitCtxdsl(e.target.checked)}
            />
            Emit CTXDSL of the refined model (context + formula)
          </label>
        </div>
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <Button
          variant="primary"
          size="lg"
          onClick={handleRunCegar}
          isLoading={isLoading}
        >
          Run CEGAR refinement
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

      {result && <CegarTraceView result={result} />}
    </div>
  );
};
