/**
 * SvCegarRunner — SV-direct CEGAR in the extraction tab (Stage 2).
 *
 * The SystemVerilog RTL workflow's CEGAR step. Reads the loaded SV (+ any
 * additional sources) from the extraction store, takes a μ-calculus
 * formula + an initial predicate set + the refinement/lift options, and
 * posts to `POST /api/v1/sv/cegar` — the backend lifts SV → flattened
 * BTOR2 (sv2v + Yosys) and runs the same refinement loop as the
 * BTOR2-direct path. The trace rendering is delegated to the reusable
 * {@link CegarTraceView}. Surface peer of the CLI `mununu sv cegar`.
 *
 * This is the SV half of cegar-extraction Stage 2: it lets a user extract
 * SV → run CEGAR → see the refinement trace without leaving the tab or
 * hand-running `mununu sv emit-btor2-per-module`.
 */

import { useState } from "react";
import { Button } from "../common/Button";
import {
  runSvCegar,
  PredicateSpecRequest,
  Btor2CegarResponse,
  SvFrontend,
} from "../../api/endpoints";
import { useExtractionStore } from "../../store/extractionStore";
import { CegarTraceView } from "./CegarTraceView";
import { SvFrontendSelect } from "./SvFrontendSelect";
import { parsePredicates, parseLines } from "./cegarParsing";

type SetundefPolicy = "zero" | "anyconst" | "anyseq";

export const SvCegarRunner = () => {
  const { sourceContent, sourceFileName, additionalSources } =
    useExtractionStore();

  const [formula, setFormula] = useState("nu X. <true> X");
  const [predicatesText, setPredicatesText] = useState("");
  const [top, setTop] = useState("");
  // sv2v keeps the former `use_sv2v: true` default (sv2v first, slang fallback).
  const [frontend, setFrontend] = useState<SvFrontend>("sv2v");
  const [setundefPolicy, setSetundefPolicy] = useState<SetundefPolicy>("zero");
  const [controllableInputsText, setControllableInputsText] = useState("");
  const [predicateSource, setPredicateSource] = useState("wp");
  const [maxIterations, setMaxIterations] = useState("16");
  const [mustEdgeInference, setMustEdgeInference] = useState("off");
  const [mayEdgeInference, setMayEdgeInference] = useState("off");
  const [configValuesText, setConfigValuesText] = useState("");
  const [emitCtxdsl, setEmitCtxdsl] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<Btor2CegarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunCegar = async () => {
    setError(null);
    setResult(null);
    if (!sourceContent.trim()) {
      setError(
        "No SystemVerilog source loaded — complete the Load step first.",
      );
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
      setError("At least one predicate required to bootstrap the cube space.");
      return;
    }
    const iterations = Number(maxIterations);
    if (!Number.isInteger(iterations) || iterations < 1) {
      setError("Max iterations must be a positive integer.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await runSvCegar({
        lift: {
          source: sourceContent,
          additional_sources: additionalSources.map((s) => ({
            name: s.name,
            content: s.content,
          })),
          top: top.trim() || undefined,
          frontend,
        },
        setundef_anyseq: setundefPolicy === "anyseq",
        setundef_anyconst: setundefPolicy === "anyconst",
        formula,
        predicates,
        controllable: controllableInputs,
        predicate_source: predicateSource,
        max_iterations: iterations,
        must_edge_inference: mustEdgeInference,
        may_edge_inference: mayEdgeInference,
        init_values: configValues,
        emit_ctxdsl: emitCtxdsl,
      });
      setResult(response);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unknown error from /api/v1/sv/cegar",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: "sans-serif" }}>
      <p style={{ color: "var(--text-secondary, #666)" }}>
        Runs SV-direct CEGAR: the backend lifts the loaded SystemVerilog to a
        flattened BTOR2 (sv2v + Yosys) and runs the
        predicate-abstraction-refinement loop (R.5), rendering the per-iteration
        trace and the 3-valued <code>{"{ T, F, ⊥ }"}</code> verdict. Surface
        peer of the CLI <code>mununu sv cegar</code> and the{" "}
        <code>POST /api/v1/sv/cegar</code> endpoint.
      </p>

      <section style={{ marginTop: "1rem" }}>
        <strong>SystemVerilog source:</strong>{" "}
        {sourceFileName ? (
          <code>{sourceFileName}</code>
        ) : (
          <span style={{ color: "var(--error-text, #c00)" }}>
            none loaded — complete the Load step
          </span>
        )}
        {additionalSources.length > 0 && (
          <span style={{ color: "var(--text-secondary, #666)" }}>
            {" "}
            (+{additionalSources.length} additional source
            {additionalSources.length !== 1 ? "s" : ""})
          </span>
        )}
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h3>1. Formula</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary, #666)" }}>
          The μ-calculus formula evaluated over the lifted KMTS. Example:{" "}
          <code>nu X. {"<true>"} X</code>.
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
        <h3>2. Initial predicates</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary, #666)" }}>
          One per line, comma-separated: <code>name, register, value</code>.
          Register names are the design's post-elaboration state cells (e.g.{" "}
          <code>boot_fsm_ns</code>). Example: <code>idle, boot_fsm_ns, 0</code>.
        </p>
        <textarea
          aria-label="Initial predicates"
          value={predicatesText}
          onChange={(e) => setPredicatesText(e.target.value)}
          placeholder="idle, boot_fsm_ns, 0"
          style={{
            width: "100%",
            height: "90px",
            fontFamily: "monospace",
            fontSize: "0.85rem",
          }}
        />
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h3>3. Lift + refinement options</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
          }}
        >
          <label style={{ fontSize: "0.9rem" }}>
            Top module (optional)
            <input
              type="text"
              aria-label="Top module"
              value={top}
              onChange={(e) => setTop(e.target.value)}
              placeholder="(auto-detect)"
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.3rem",
                fontFamily: "monospace",
              }}
            />
          </label>
          <label style={{ fontSize: "0.9rem" }}>
            Undefined-net policy
            <select
              aria-label="Undefined-net policy"
              value={setundefPolicy}
              onChange={(e) =>
                setSetundefPolicy(e.target.value as SetundefPolicy)
              }
              style={{ width: "100%", marginTop: "0.25rem", padding: "0.3rem" }}
            >
              <option value="zero">zero (deterministic; masks bugs)</option>
              <option value="anyconst">
                anyconst (constant power-up nondeterminism)
              </option>
              <option value="anyseq">anyseq (per-cycle havoc)</option>
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
          <SvFrontendSelect value={frontend} onChange={setFrontend} />
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
