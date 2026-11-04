/**
 * TraceView — the one renderer for a mununu 0.5 `Trace`, whichever verb
 * produced it: a CTXDSL path (state names + transition labels: synthesis
 * lassos and countertraces, sanity deadlocks) renders as an arrow path; an RTL
 * path (register cells: verify-auto rows, cegar countertraces, btor2 verify
 * witnesses and attacks, game stall lassos) renders one line per cycle with its
 * inputs and fault injections. A lasso marks the cycle that repeats forever
 * from `loop_start`; an `unreachable` trace names the target atoms no path
 * reaches.
 */

import type { Trace } from "../../api/endpoints";
import {
  formatCellSource,
  formatCells,
  formatReplayResult,
  stepLabel,
} from "../../utils/trace";

const VIOLATED_COLOR = "var(--error-text, #c00)";

const kindCaption = (trace: Trace): string => {
  switch (trace.kind) {
    case "lasso":
      return "stall lasso";
    case "trap":
      return "path into a trap";
    case "attack":
      return "fault attack";
    case "unreachable":
      return "unreachable target";
    default:
      return "path";
  }
};

/** The `-label->` arrow between two CTXDSL steps. */
const Arrow = ({ label }: { label?: string }) => (
  <span className="trace-view__arrow">
    {label ? (
      <>
        {" "}
        <span
          style={{ fontSize: "0.8em", color: "#6b7280", fontStyle: "italic" }}
        >
          {label}
        </span>
        {" → "}
      </>
    ) : (
      " → "
    )}
  </span>
);

const StatePath = ({ trace }: { trace: Trace }) => {
  const loop = trace.kind === "lasso" ? trace.loop_start : undefined;
  const last = trace.steps.length - 1;
  const step = (i: number) => {
    const name = trace.steps[i].state_name ?? `#${i}`;
    return i >= (loop ?? Infinity) ? (
      <strong className="trace-view__cycle-step">{name}</strong>
    ) : (
      <span className="trace-view__prefix-step">{name}</span>
    );
  };
  return (
    <span className="trace-view__steps">
      {trace.steps.map((_, i) => (
        <span key={i}>
          {i > 0 && <Arrow label={stepLabel(trace, i - 1)} />}
          {i === loop && "("}
          {step(i)}
        </span>
      ))}
      {loop !== undefined && last >= 0 && (
        <>
          <Arrow label={stepLabel(trace, last)} />
          {")"}
          <sup>&omega;</sup>
        </>
      )}
    </span>
  );
};

const CellRows = ({ trace }: { trace: Trace }) => {
  const loop = trace.kind === "lasso" ? trace.loop_start : undefined;
  return (
    <div style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
      {trace.steps.map((s, i) => {
        const inCycle = loop !== undefined && i >= loop;
        return (
          <div
            key={i}
            style={inCycle ? { color: VIOLATED_COLOR } : undefined}
            data-testid="trace-step"
          >
            {i === loop ? "↺ " : inCycle ? "  " : "→ "}
            <span style={{ opacity: 0.7 }}>[{s.cycle}]</span>{" "}
            {formatCells(s.state)}
            {s.inputs && s.inputs.length > 0 && (
              <span style={{ opacity: 0.7 }}>
                {" "}
                · inputs: {formatCells(s.inputs)}
              </span>
            )}
            {s.faults && s.faults.length > 0 && (
              <span style={{ color: VIOLATED_COLOR }}>
                {" "}
                · fault:{" "}
                {s.faults
                  .map((f) => `${f.site}:=${f.value ?? f.hex}`)
                  .join(", ")}
              </span>
            )}
          </div>
        );
      })}
      {loop !== undefined && (
        <div style={{ opacity: 0.7 }}>
          cycle repeats forever — the property is avoided
        </div>
      )}
      {trace.kind === "trap" && (
        <div style={{ opacity: 0.7 }}>
          ends in a trap — the target is never reached again
        </div>
      )}
    </div>
  );
};

/** The legend: where each cell the trace shows lives in the RTL (`trace.sources`). */
const SourceLegend = ({ trace }: { trace: Trace }) =>
  trace.sources && trace.sources.length > 0 ? (
    <div
      style={{ fontFamily: "monospace", fontSize: "0.8rem", opacity: 0.85 }}
      data-testid="trace-sources"
    >
      <div>cells:</div>
      {trace.sources.map((s) => (
        <div key={s.cell} style={{ paddingLeft: "1rem" }}>
          {formatCellSource(s)}
        </div>
      ))}
    </div>
  ) : null;

/** The simulator's verdict on the replayed trace (`trace.replay.result`). */
const ReplayResult = ({ trace }: { trace: Trace }) => {
  const r = trace.replay?.result;
  if (!r) return null;
  const color =
    r.outcome === "match"
      ? "var(--success-text, #2e7d32)"
      : r.outcome === "mismatch"
        ? VIOLATED_COLOR
        : "var(--text-secondary, #666)";
  return (
    <div
      style={{ fontFamily: "monospace", fontSize: "0.8rem" }}
      data-testid="trace-replay"
    >
      <div style={{ color }}>replay: {formatReplayResult(r)}</div>
      {r.assertions.map((a) => (
        <div key={a}>replay assertion: {a}</div>
      ))}
      {r.outcome !== "unavailable" && (
        <div style={{ opacity: 0.7 }}>
          replay vcd:{" "}
          {r.vcd_bytes !== undefined ? `${r.vcd_bytes} bytes` : "not written"}
        </div>
      )}
    </div>
  );
};

export const TraceView = ({
  trace,
  title,
}: {
  trace: Trace;
  /** Caption before the path; defaults to `counterexample (<kind>):`. */
  title?: string;
}) => {
  if (trace.kind === "unreachable") {
    return (
      <div
        className="trace-view"
        style={{
          fontFamily: "monospace",
          fontSize: "0.8rem",
          color: VIOLATED_COLOR,
        }}
      >
        counterexample: target UNREACHABLE from reset — the design never reaches{" "}
        {(trace.unreachable_target ?? []).join(" ∧ ")}
      </div>
    );
  }
  const isStatePath = trace.steps.some((s) => s.state_name !== undefined);
  return (
    <div className="trace-view">
      {title !== "" && (
        <div style={{ opacity: 0.8, fontSize: "0.8rem" }}>
          {title ?? `counterexample (${kindCaption(trace)}):`}
        </div>
      )}
      {isStatePath ? <StatePath trace={trace} /> : <CellRows trace={trace} />}
      <SourceLegend trace={trace} />
      <ReplayResult trace={trace} />
    </div>
  );
};
