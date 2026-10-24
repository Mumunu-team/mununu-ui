/**
 * CegarTraceView — presentational rendering of a CEGAR refinement trace.
 *
 * Extracted from the former standalone `/cegar` panel so the trace
 * rendering is reused (not duplicated) between the CEGAR runner and the
 * extraction tab's BTOR2 → CEGAR step. Pure view: takes a
 * `Btor2CegarResponse` and renders the per-iteration table, the 3-valued
 * { T, F, ⊥ } verdict, the termination reason, the final predicate set,
 * any warnings, and (when present) the model CTXDSL with a download.
 */

import { Button } from "../common/Button";
import {
  downloadAsFile,
  Btor2CegarResponse,
  CegarVerdictSummary,
  Trace,
} from "../../api/endpoints";
import { TraceView } from "../visualization/TraceView";

/** 3-valued verdict cell counts (KleeneT / KleeneF / KleeneBot). */
export const Trit = ({ summary }: { summary: CegarVerdictSummary }) => (
  <span style={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>
    <span style={{ color: "var(--success-text, #0a0)" }} title="KleeneT cells">
      T {summary.true_cells}
    </span>
    {" / "}
    <span style={{ color: "var(--error-text, #c00)" }} title="KleeneF cells">
      F {summary.false_cells}
    </span>
    {" / "}
    <span
      style={{ color: "var(--text-secondary, #888)" }}
      title="KleeneBot cells — unknown, needs refinement"
    >
      ⊥ {summary.unknown_cells}
    </span>
  </span>
);

/** Track I.1 — render a witness cell's predicate valuation as `idle=false, err=true`. */
const formatCell = (valuation: Record<string, boolean>): string =>
  Object.entries(valuation)
    .map(([name, holds]) => `${name}=${holds}`)
    .join(", ");

/** Track I.1 — a "falsified at / undecided at" cube-cell list (omitted when empty). */
const WitnessCells = ({
  label,
  cells,
  total,
}: {
  label: string;
  cells: { cube_index: number; valuation: Record<string, boolean> }[];
  total: number;
}) =>
  cells.length === 0 ? null : (
    <div style={{ marginBottom: "1rem" }}>
      <strong>
        {label} ({total} cell{total === 1 ? "" : "s"}):
      </strong>
      <ul style={{ margin: "0.25rem 0 0", fontFamily: "monospace" }}>
        {cells.map((c) => (
          <li key={c.cube_index}>{`{${formatCell(c.valuation)}}`}</li>
        ))}
        {total > cells.length && (
          <li
            style={{ color: "var(--text-secondary, #666)", listStyle: "none" }}
          >
            … and {total - cells.length} more
          </li>
        )}
      </ul>
    </div>
  );

/**
 * Track I.1 (trace slice) — an ordered reachability countertrace from an initial
 * failing cell to a trap (or the farthest reachable failing cell): a `finite` /
 * `trap` {@link Trace} whose steps list each cell's predicates as 1-bit cells.
 * Omitted when the property is not violated at the initial cell.
 */
const Countertrace = ({ trace }: { trace?: Trace }) =>
  !trace || trace.steps.length === 0 ? null : (
    <div style={{ marginBottom: "1rem" }}>
      <strong>
        Countertrace ({trace.steps.length} step
        {trace.steps.length === 1 ? "" : "s"}
        {trace.kind === "trap" ? ", ends in trap" : ""}):
      </strong>
      <TraceView trace={trace} title="" />
    </div>
  );

/**
 * Track I.1 (undecided-explanation) — when ⊥ cells remain, name the registers
 * the failure subgame flagged as load-bearing; adding predicates over them (or
 * promoting their init policy) may resolve the abstraction. Omitted otherwise.
 */
const UndecidedExplanation = ({
  unknownCells,
  candidates,
}: {
  unknownCells: number;
  candidates?: string[];
}) =>
  unknownCells === 0 || !candidates || candidates.length === 0 ? null : (
    <div style={{ marginBottom: "1rem" }}>
      <strong>Why undecided:</strong> the abstraction can&apos;t decide{" "}
      {unknownCells} cell{unknownCells === 1 ? "" : "s"} — try predicates over{" "}
      <span style={{ fontFamily: "monospace" }}>{candidates.join(", ")}</span>.
    </div>
  );

export const CegarTraceView = ({ result }: { result: Btor2CegarResponse }) => (
  <section style={{ marginTop: "1.5rem" }}>
    <h3>Refinement trace</h3>
    <div style={{ marginBottom: "1rem" }}>
      <strong>Terminated with:</strong> <code>{result.terminated_with}</code>
      <br />
      <strong>Final verdict:</strong> <Trit summary={result.cells} />
      <br />
      <strong>Iterations:</strong> {result.iterations.length}
      {result.lazy_lift_pending && (
        <>
          <br />
          <span style={{ color: "var(--text-secondary, #666)" }}>
            (eager predicate-cube lift — R.2.5 MVP)
          </span>
        </>
      )}
      {result.approximant_reuse_enabled && (
        <>
          <br />
          <span style={{ color: "var(--text-secondary, #666)" }}>
            (approximant reuse enabled)
          </span>
        </>
      )}
    </div>

    <WitnessCells
      label="Falsified at"
      cells={result.violating_cells ?? []}
      total={result.cells.false_cells}
    />
    <WitnessCells
      label="Undecided at"
      cells={result.undecided_cells ?? []}
      total={result.cells.unknown_cells}
    />
    <Countertrace trace={result.trace} />
    <UndecidedExplanation
      unknownCells={result.cells.unknown_cells}
      candidates={result.refinement_candidates}
    />

    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "0.85rem",
      }}
    >
      <thead>
        <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
          <th style={{ padding: "0.4rem" }}>Iter</th>
          <th style={{ padding: "0.4rem" }}>Predicates</th>
          <th style={{ padding: "0.4rem" }}>Failure subgame</th>
          <th style={{ padding: "0.4rem" }}>Added</th>
          <th style={{ padding: "0.4rem" }}>Game evals</th>
          <th style={{ padding: "0.4rem" }}>Verdict (T / F / ⊥)</th>
        </tr>
      </thead>
      <tbody>
        {result.iterations.map((iter) => (
          <tr key={iter.iteration} style={{ borderBottom: "1px solid #eee" }}>
            <td style={{ padding: "0.4rem" }}>{iter.iteration}</td>
            <td style={{ padding: "0.4rem" }}>{iter.predicate_count}</td>
            <td style={{ padding: "0.4rem" }}>
              {iter.had_failure_subgame ? "⊥ yes" : "—"}
            </td>
            <td style={{ padding: "0.4rem", fontFamily: "monospace" }}>
              {iter.predicates_added.length === 0
                ? "—"
                : iter.predicates_added
                    .map((p) => `${p.register}==${p.value}`)
                    .join(", ")}
            </td>
            <td style={{ padding: "0.4rem" }}>
              {iter.game_position_evaluations}
            </td>
            <td style={{ padding: "0.4rem" }}>
              <Trit summary={iter.cells} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>

    <div style={{ marginTop: "1rem" }}>
      <strong>Final predicate set ({result.final_predicates.length}):</strong>
      <ul
        style={{
          fontSize: "0.85rem",
          fontFamily: "monospace",
          background: "var(--code-bg, #f5f5f5)",
          padding: "0.5rem 0.5rem 0.5rem 1.5rem",
          borderRadius: "4px",
        }}
      >
        {result.final_predicates.map((p, i) => (
          <li key={i}>
            {p.name}: {p.register} == {p.value}
          </li>
        ))}
      </ul>
    </div>

    {result.warnings.length > 0 && (
      <div style={{ marginTop: "1rem" }}>
        <strong>Warnings ({result.warnings.length}):</strong>
        <ul
          style={{
            fontSize: "0.85rem",
            fontFamily: "monospace",
            background: "var(--code-bg, #f5f5f5)",
            padding: "0.5rem 0.5rem 0.5rem 1.5rem",
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

    {result.ctxdsl && (
      <div style={{ marginTop: "1rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "0.25rem",
          }}
        >
          <strong>Model CTXDSL (context + formula)</strong>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              downloadAsFile(result.ctxdsl as string, "cegar_model.ctxdsl")
            }
          >
            Download .ctxdsl
          </Button>
        </div>
        <pre
          aria-label="Model CTXDSL"
          style={{
            fontSize: "0.8rem",
            fontFamily: "monospace",
            background: "var(--code-bg, #f5f5f5)",
            padding: "0.75rem",
            borderRadius: "4px",
            maxHeight: "320px",
            overflow: "auto",
            whiteSpace: "pre",
          }}
        >
          {result.ctxdsl}
        </pre>
      </div>
    )}
  </section>
);
