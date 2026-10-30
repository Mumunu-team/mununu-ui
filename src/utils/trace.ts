/**
 * Readers for the mununu 0.5 `Trace` — the one counterexample shape every verb
 * returns (CTXDSL paths name their states in `steps[].state_name` and carry the
 * labels of the transition out of each step in `steps[].labels`; RTL paths carry
 * register cells in `steps[].state`).
 */

import type {
  CellSource,
  CexCellView,
  ReplayResultView,
  SourceLoc,
  Trace,
} from "../api/endpoints";

/** The state names along a CTXDSL trace, in order (RTL steps contribute nothing). */
export const traceStateNames = (trace: Trace): string[] =>
  trace.steps.flatMap((s) =>
    s.state_name !== undefined ? [s.state_name] : [],
  );

/** The label text of the transition out of step `i` (`a, b` for a synchronisation vector). */
export const stepLabel = (trace: Trace, i: number): string | undefined => {
  const labels = trace.steps[i]?.labels;
  return labels && labels.length > 0 ? labels.join(", ") : undefined;
};

/**
 * Formats a CTXDSL trace as `Init -go-> Busy -stop-> Done`; a lasso closes with
 * the label back to its `loop_start` state: `A -a-> (B -b-> C -c->)ω`.
 */
export const formatTracePath = (trace: Trace): string => {
  const names = trace.steps.map((s, i) => s.state_name ?? `#${i}`);
  const loop = trace.kind === "lasso" ? trace.loop_start : undefined;
  const arrow = (i: number) => {
    const label = stepLabel(trace, i);
    return label ? ` -${label}-> ` : " -> ";
  };
  let out = "";
  names.forEach((name, i) => {
    if (i > 0) out += arrow(i - 1);
    if (i === loop) out += "(";
    out += name;
  });
  if (loop !== undefined && names.length > 0) {
    out += `${arrow(names.length - 1).trimEnd()})ω`;
  }
  return out;
};

/** One cell's value: the decimal `value` when it fits 64 bits, else its `hex`. */
export const cellValue = (c: CexCellView): string =>
  c.value !== null && c.value !== undefined ? String(c.value) : c.hex;

/** Register cells as `reg=value, …`. */
export const formatCells = (cells: CexCellView[] | undefined): string =>
  (cells ?? []).map((c) => `${c.register}=${cellValue(c)}`).join(", ");

/** A place in the RTL as `file:line`. */
export const formatSourceLoc = (loc: SourceLoc): string =>
  `${loc.file}:${loc.line}`;

/**
 * Source lines as one short line, as the CLI prints `involves:`: grouped by file in sorted order,
 * each run of consecutive lines as a range — `pump_pair.sv:24-25, 31; pump_pair_sva.sv:16`.
 */
export const compactLines = (locs: SourceLoc[] | undefined): string => {
  const sorted = [...(locs ?? [])].sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1,
  );
  const files: { file: string; runs: string[] }[] = [];
  let i = 0;
  while (i < sorted.length) {
    const { file, line: start } = sorted[i];
    let end = start;
    while (
      i + 1 < sorted.length &&
      sorted[i + 1].file === file &&
      sorted[i + 1].line <= end + 1
    ) {
      i += 1;
      end = Math.max(end, sorted[i].line);
    }
    const run = end > start ? `${start}-${end}` : `${start}`;
    const last = files[files.length - 1];
    if (last && last.file === file) last.runs.push(run);
    else files.push({ file, runs: [run] });
    i += 1;
  }
  return files.map((f) => `${f.file}:${f.runs.join(", ")}`).join("; ");
};

/**
 * One legend line, as the CLI prints it under `cells:` — `state_q ← pump_pair.sv:33 (register,
 * assigned at pump_pair.sv:52)`; a half the map lacks is left out, never shown as a placeholder.
 */
export const formatCellSource = (s: CellSource): string => {
  const declared = s.declared ? ` ← ${formatSourceLoc(s.declared)}` : "";
  const assigned =
    s.assigned && s.assigned.length > 0
      ? `, assigned at ${s.assigned.map(formatSourceLoc).join(", ")}`
      : "";
  return `${s.cell}${declared} (${s.kind}${assigned})`;
};

/**
 * The simulator's verdict line, as the CLI prints `replay:` —
 * `match — 0 of 16 checks disagree; verilator 5.051`, the first mismatch named when there is one,
 * `unavailable — <reason>` when the bench could not run.
 */
export const formatReplayResult = (r: ReplayResultView): string => {
  if (r.outcome === "unavailable") {
    return `unavailable — ${r.reason ?? "no reason recorded"}`;
  }
  const first = r.first_mismatch
    ? `; first at cycle ${r.first_mismatch.cycle}: ${r.first_mismatch.register} = ${r.first_mismatch.got}, trace says ${r.first_mismatch.expected}`
    : "";
  return `${r.outcome} — ${r.mismatches} of ${r.checks} checks disagree${first}; verilator ${r.verilator ?? "?"}`;
};
