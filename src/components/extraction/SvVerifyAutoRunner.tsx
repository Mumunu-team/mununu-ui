/**
 * SvVerifyAutoRunner — no-sidecar SVA verification in the extraction tab (XL.6b).
 *
 * Reads the loaded SystemVerilog from the extraction store and posts to
 * `POST /api/v1/sv/verify-auto`: the backend extracts the design's SVA, lifts SV
 * → BTOR2 (sv2v + Yosys), synthesises `$past` shadow flops, and for each
 * translated property auto-seeds cube predicates from the formula's state-cell
 * atoms and runs the predicate-abstraction refinement loop — rendering a
 * per-property verdict (HOLDS / VIOLATED / ⊥ / skipped). Properties whose atoms
 * reference non-state signals (combinational/IO) are reported skipped, never
 * given a misleading verdict. Surface peer of the CLI `mununu sv verify-auto`.
 */

import { useState } from "react";
import { Button } from "../common/Button";
import {
  runSvVerifyAuto,
  SvVerifyAutoResponse,
  PropertyVerdictView,
  SvFrontend,
} from "../../api/endpoints";
import { useExtractionStore } from "../../store/extractionStore";
import { TraceView } from "../visualization/TraceView";
import { SvFrontendSelect } from "./SvFrontendSelect";

const outcomeColor = (outcome: string): string => {
  switch (outcome) {
    case "holds":
      return "var(--success-text, #178a3a)";
    case "violated":
      return "var(--error-text, #c00)";
    case "unknown":
      return "var(--warning-text, #b8860b)";
    default:
      return "var(--text-secondary, #666)"; // skipped
  }
};

const outcomeLabel = (p: PropertyVerdictView): string => {
  const base = p.outcome.toUpperCase();
  if (p.outcome === "unknown") return `⊥ / ${base}`;
  return p.detail && p.outcome !== "skipped" ? `${base} (${p.detail})` : base;
};

// H.J — a provenance note's severity styling. Info is neutral; a scope caveat
// (narrowed verdict scope, e.g. config concretization) and a soundness caveat
// (state not modeled) stand out.
const noteLevelColor = (level: string): string => {
  switch (level) {
    case "soundness-caveat":
      return "var(--error-text, #c00)";
    case "scope-caveat":
      return "var(--warning-text, #b8860b)";
    default:
      return "var(--text-secondary, #666)"; // info
  }
};

const noteLevelLabel = (level: string): string => {
  switch (level) {
    case "soundness-caveat":
      return "⚠ soundness";
    case "scope-caveat":
      return "⚠ scope";
    default:
      return "ℹ";
  }
};

export const SvVerifyAutoRunner = () => {
  const { sourceContent, sourceFileName, additionalSources } =
    useExtractionStore();

  const [top, setTop] = useState("");
  // `lift.frontend`: sv2v keeps the former `use_sv2v: true` default; `slang`
  // replaces the former "force slang" checkbox (while loops, package imports).
  const [frontend, setFrontend] = useState<SvFrontend>("sv2v");
  const [maxIterations, setMaxIterations] = useState("16");
  const [mustEdgeInference, setMustEdgeInference] = useState("off");
  // R-F5.5d — predicate-cube engine selector ("explicit" | "symbolic").
  const [engine, setEngine] = useState("explicit");
  const [gateReset, setGateReset] = useState(true);
  const [autoStubFlops, setAutoStubFlops] = useState(true);
  // H.J.b — config pins (`pins`): comma/newline-separated `signal=value`
  // entries (e.g. `cfg_detect_timer_i=7`). Pins wide config inputs to constants
  // so comparisons against them become decidable (scope-reduced verdicts).
  const [configValues, setConfigValues] = useState("");
  // H.H — counter upper bounds: comma/newline `signal<=value` entries. Seeds a
  // `signal <= value` cube-partition to refine a counter-monotonicity property
  // whose ⊥ is the abstract wraparound (also auto-derived from config values).
  const [counterBounds, setCounterBounds] = useState("");
  // Control-slice cut points: comma/newline `net` names. Each is replaced by a free
  // `$anyseq` input in the lift so its datapath fanin drops out of the cone — lets
  // `exact-symbolic` fit a wide control FSM. Over-approximation (HOLDS sound; VIOLATED
  // sound only for orphaned-state targets); surfaced as a `control-slice` note.
  const [cutpoints, setCutpoints] = useState("");
  // Abstraction-predicate hints (CLI `--predicate` / `@mununu_predicate` peer): a
  // comma/newline-separated list of predicate expressions (`reg == value`, `reg == reg`,
  // `reg >= K`) seeded as cube dimensions for every property. Sound by monotonicity — a
  // hint only refines the cube (a ⊥ can become definite; a definite verdict never flips).
  const [predicates, setPredicates] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SvVerifyAutoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    setError(null);
    setResult(null);
    if (!sourceContent.trim()) {
      setError(
        "No SystemVerilog source loaded — complete the Load step first.",
      );
      return;
    }
    const iterations = Number(maxIterations);
    if (!Number.isInteger(iterations) || iterations < 1) {
      setError("Max iterations must be a positive integer.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await runSvVerifyAuto({
        lift: {
          source: sourceContent,
          additional_sources: additionalSources.map((s) => ({
            name: s.name,
            content: s.content,
          })),
          top: top.trim() || undefined,
          frontend,
          cutpoints: cutpoints
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
        },
        max_iterations: iterations,
        must_edge_inference: mustEdgeInference,
        gate_reset: gateReset,
        auto_stub_flops: autoStubFlops,
        pins: configValues
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
        counter_bounds: counterBounds
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
        predicate: predicates
          .split(/\n/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
        engine,
      });
      setResult(response);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unknown error from /api/v1/sv/verify-auto",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: "sans-serif" }}>
      <p style={{ color: "var(--text-secondary, #666)" }}>
        Verifies the design's SystemVerilog Assertions with no sidecar: the
        backend extracts the SVA, lifts SV → BTOR2 (sv2v + Yosys), and runs
        predicate-abstraction refinement per property, rendering a 3-valued{" "}
        <code>{"{ HOLDS, VIOLATED, ⊥ }"}</code> verdict. Combinational/IO
        properties (over inputs/outputs) are reported skipped. Surface peer of
        the CLI <code>mununu sv verify-auto</code>.
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
            Engine
            <select
              aria-label="Engine"
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
              style={{ width: "100%", marginTop: "0.25rem", padding: "0.3rem" }}
            >
              <option value="explicit">explicit (SMT edges + CEGAR)</option>
              <option value="symbolic">
                symbolic (R-F5 BDD, no per-cube-pair SMT)
              </option>
              <option value="exact-symbolic">
                exact-symbolic (D1 full-state BDD MC, definite — decides
                liveness where abstraction is ⊥)
              </option>
            </select>
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
              aria-label="Gate reset"
              checked={gateReset}
              onChange={(e) => setGateReset(e.target.checked)}
            />
            Gate reset (drop <code>disable iff</code>, pin reset inactive)
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
              aria-label="Auto-stub flop primitives"
              checked={autoStubFlops}
              onChange={(e) => setAutoStubFlops(e.target.checked)}
            />
            Auto-stub cut flop primitives (e.g.{" "}
            <code>prim_sparse_fsm_flop</code>)
          </label>
          <label style={{ fontSize: "0.9rem", display: "block" }}>
            <span style={{ display: "block", marginBottom: "0.25rem" }}>
              Config concretization (<code>signal=value</code>, comma/newline
              separated — verdicts are scoped to these values)
            </span>
            <input
              type="text"
              aria-label="Config concretization"
              placeholder="cfg_detect_timer_i=7, cfg_debounce_timer_i=1"
              value={configValues}
              onChange={(e) => setConfigValues(e.target.value)}
              style={{ width: "100%", fontFamily: "monospace" }}
            />
          </label>
          <label style={{ fontSize: "0.9rem", display: "block" }}>
            <span style={{ display: "block", marginBottom: "0.25rem" }}>
              Counter bounds (<code>signal&lt;=value</code>, comma/newline
              separated — refines a counter-monotonicity ⊥ by excluding the
              abstract wraparound; sound partition, needs must-edges on)
            </span>
            <input
              type="text"
              aria-label="Counter bounds"
              placeholder="cnt_q<=7"
              value={counterBounds}
              onChange={(e) => setCounterBounds(e.target.value)}
              style={{ width: "100%", fontFamily: "monospace" }}
            />
          </label>
          <label style={{ fontSize: "0.9rem", display: "block" }}>
            <span style={{ display: "block", marginBottom: "0.25rem" }}>
              Control-slice cut points (<code>net</code> names, comma/newline
              separated — free the FSM's datapath guards so{" "}
              <code>exact-symbolic</code> fits a wide control FSM; over-approx,
              HOLDS sound, VIOLATED sound only for orphaned-state targets)
            </span>
            <input
              type="text"
              aria-label="Control-slice cut points"
              placeholder="must_refresh, precharge_done"
              value={cutpoints}
              onChange={(e) => setCutpoints(e.target.value)}
              style={{ width: "100%", fontFamily: "monospace" }}
            />
          </label>
          <label style={{ fontSize: "0.9rem", display: "block" }}>
            <span style={{ display: "block", marginBottom: "0.25rem" }}>
              Abstraction-predicate hints (one <code>expr</code> per line —{" "}
              <code>reg == value</code>, <code>reg == reg</code>,{" "}
              <code>reg &gt;= K</code>; the <code>@mununu_predicate</code> /{" "}
              <code>--predicate</code> peer, seeded into every property's cube.
              Sound by monotonicity — refines the cube, never flips a definite
              verdict)
            </span>
            <textarea
              aria-label="Abstraction-predicate hints"
              placeholder={"c_state == 0\nwptr == rptr\nfill >= 30"}
              value={predicates}
              onChange={(e) => setPredicates(e.target.value)}
              rows={3}
              style={{ width: "100%", fontFamily: "monospace" }}
            />
          </label>
        </div>
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <Button
          variant="primary"
          size="lg"
          onClick={handleVerify}
          isLoading={isLoading}
        >
          Verify all properties
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
          <p>
            <strong>{result.properties.length}</strong> propert
            {result.properties.length === 1 ? "y" : "ies"} verified,{" "}
            <strong>{result.unsupported.length}</strong> unsupported
          </p>
          {result.diagnostics && (
            <p
              style={{
                fontSize: "0.85rem",
                color: "var(--text-secondary, #666)",
              }}
            >
              model: <strong>{result.diagnostics.state_register_count}</strong>{" "}
              state register(s)
              {result.diagnostics.blackboxed_modules.length > 0 && (
                <>
                  {" · "}
                  <span style={{ color: "var(--color-warning, #b8860b)" }}>
                    black-boxed (cut to free inputs — provide source to model):{" "}
                    {result.diagnostics.blackboxed_modules.join(", ")}
                  </span>
                </>
              )}
              {result.diagnostics.gated_resets.length > 0 && (
                <>
                  {" · "}
                  reset-gated (pinned inactive):{" "}
                  {result.diagnostics.gated_resets.join(", ")}
                </>
              )}
              {result.diagnostics.auto_provided_stubs?.length > 0 && (
                <>
                  {" · "}
                  auto-stubbed flop primitives:{" "}
                  {result.diagnostics.auto_provided_stubs.join(", ")}
                </>
              )}
            </p>
          )}
          {result.notes && result.notes.length > 0 && (
            <div style={{ marginTop: "0.75rem", marginBottom: "1rem" }}>
              <p
                style={{
                  fontSize: "0.9rem",
                  fontWeight: 700,
                  marginBottom: "0.4rem",
                }}
              >
                Notes (decisions that shaped these verdicts)
              </p>
              <ul
                style={{
                  fontSize: "0.85rem",
                  listStyle: "none",
                  paddingLeft: 0,
                }}
              >
                {result.notes.map((n, i) => (
                  <li
                    key={`${n.kind}-${i}`}
                    style={{
                      marginBottom: "0.5rem",
                      borderLeft: `3px solid ${noteLevelColor(n.level)}`,
                      paddingLeft: "0.6rem",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        color: noteLevelColor(n.level),
                      }}
                    >
                      {noteLevelLabel(n.level)}
                    </span>{" "}
                    <code>[{n.kind}]</code> {n.summary}
                    {n.detail && (
                      <div
                        style={{
                          color: "var(--text-secondary, #666)",
                          marginTop: "0.15rem",
                        }}
                      >
                        {n.detail}
                      </div>
                    )}
                    {n.items.length > 0 && (
                      <div style={{ marginTop: "0.15rem" }}>
                        {n.items.map((it) => (
                          <code
                            key={it}
                            style={{
                              marginRight: "0.4rem",
                              background: "var(--code-bg, #f2f2f2)",
                              padding: "0 0.3rem",
                              borderRadius: "3px",
                            }}
                          >
                            {it}
                          </code>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul
            style={{ fontSize: "0.85rem", listStyle: "none", paddingLeft: 0 }}
          >
            {result.properties.map((p) => (
              <li key={p.name} style={{ marginBottom: "0.5rem" }}>
                <span
                  style={{ fontWeight: 700, color: outcomeColor(p.outcome) }}
                >
                  {outcomeLabel(p)}
                </span>{" "}
                <code>[{p.kind}]</code> <strong>{p.name}</strong>
                <div
                  style={{
                    color: "var(--text-secondary, #666)",
                    marginLeft: "1rem",
                  }}
                >
                  <code>
                    {p.formula_language === "ltl" ? "ltl " : ""}
                    {p.formula}
                  </code>
                  {p.translated && (
                    <div>
                      translated: <code>{p.translated}</code>
                    </div>
                  )}
                  {p.outcome === "skipped" && p.detail && (
                    <div>skipped — {p.detail}</div>
                  )}
                  {p.seeded_predicates.length > 0 && (
                    <div>predicates: {p.seeded_predicates.join(", ")}</div>
                  )}
                  {p.trace && (
                    <div style={{ marginTop: "0.35rem" }}>
                      <TraceView trace={p.trace} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {result.unsupported.length > 0 && (
            <div>
              <h4>Unsupported assertions</h4>
              <ul style={{ fontSize: "0.85rem" }}>
                {result.unsupported.map((u) => (
                  <li key={u.name}>
                    <strong>{u.name}</strong>: {u.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
