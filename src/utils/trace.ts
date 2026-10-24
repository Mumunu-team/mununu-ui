/**
 * Readers for the mununu 0.5 `Trace` — the one counterexample shape every verb
 * returns (CTXDSL paths name their states in `steps[].state_name` and carry the
 * labels of the transition out of each step in `steps[].labels`; RTL paths carry
 * register cells in `steps[].state`).
 */

import type { CexCellView, Trace } from "../api/endpoints";

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
