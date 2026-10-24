import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CegarTraceView } from "../CegarTraceView";
import type { Btor2CegarResponse } from "../../../api/endpoints";

/** A predicate as the 1-bit cell `Trace::from_cegar` emits. */
const bit = (register: string, value: 0 | 1) => ({
  register,
  value,
  hex: `0x${value}`,
  bits: 1,
});

const baseResult: Btor2CegarResponse = {
  success: true,
  iterations: [
    {
      iteration: 0,
      predicate_count: 2,
      had_failure_subgame: true,
      predicates_added: [{ name: "p1", register: "boot_fsm_ns", value: 5 }],
      game_position_evaluations: 12,
      cells: { true_cells: 6, false_cells: 1, unknown_cells: 1 },
    },
  ],
  final_predicates: [{ name: "p1", register: "boot_fsm_ns", value: 5 }],
  terminated_with: "converged",
  cells: { true_cells: 7, false_cells: 1, unknown_cells: 0 },
  lazy_lift_pending: false,
  approximant_reuse_enabled: false,
  warnings: [],
};

describe("CegarTraceView", () => {
  it("renders the termination reason, 3-valued verdict, and final predicates", () => {
    render(<CegarTraceView result={baseResult} />);
    expect(screen.getByText(/Refinement trace/i)).toBeInTheDocument();
    expect(screen.getByText("converged")).toBeInTheDocument();
    // The added predicate renders in the iterations table.
    expect(screen.getByText("boot_fsm_ns==5")).toBeInTheDocument();
    // Final predicate set renders.
    expect(screen.getByText(/p1: boot_fsm_ns == 5/i)).toBeInTheDocument();
  });

  it("renders the falsifying / undecided witness cells (Track I.1)", () => {
    render(
      <CegarTraceView
        result={{
          ...baseResult,
          cells: { true_cells: 1, false_cells: 2, unknown_cells: 1 },
          violating_cells: [
            { cube_index: 2, valuation: { idle: false, err: true } },
          ],
          undecided_cells: [
            { cube_index: 3, valuation: { idle: true, err: true } },
          ],
        }}
      />,
    );
    // The falsifying cell + its valuation, with the full count.
    expect(screen.getByText(/Falsified at \(2 cells\)/i)).toBeInTheDocument();
    expect(screen.getByText("{idle=false, err=true}")).toBeInTheDocument();
    // "… and 1 more" since false_cells (2) exceeds the listed cells (1).
    expect(screen.getByText(/and 1 more/i)).toBeInTheDocument();
    // The undecided cell.
    expect(screen.getByText(/Undecided at \(1 cell\)/i)).toBeInTheDocument();
    expect(screen.getByText("{idle=true, err=true}")).toBeInTheDocument();
  });

  it("renders the reachability countertrace (Track I.1)", () => {
    render(
      <CegarTraceView
        result={{
          ...baseResult,
          cells: { true_cells: 1, false_cells: 3, unknown_cells: 0 },
          // mununu 0.5: a `trap` Trace whose steps list each cube cell's
          // predicates as 1-bit cells.
          trace: {
            kind: "trap",
            steps: [
              { cycle: 0, state: [bit("idle", 0), bit("err", 0)] },
              { cycle: 1, state: [bit("idle", 1), bit("err", 0)] },
              { cycle: 2, state: [bit("idle", 0), bit("err", 1)] },
            ],
          },
        }}
      />,
    );
    // The header reports the step count and the trap end.
    expect(
      screen.getByText(/Countertrace \(3 steps, ends in trap\)/i),
    ).toBeInTheDocument();
    // Each step's cell valuation renders, in order.
    const steps = screen.getAllByTestId("trace-step");
    expect(steps.map((s) => s.textContent)).toEqual([
      "→ [0] idle=0, err=0",
      "→ [1] idle=1, err=0",
      "→ [2] idle=0, err=1",
    ]);
  });

  it("omits the countertrace when absent", () => {
    render(<CegarTraceView result={baseResult} />);
    expect(screen.queryByText(/Countertrace/i)).not.toBeInTheDocument();
  });

  it("explains an undecided verdict with candidate registers (Track I.1)", () => {
    render(
      <CegarTraceView
        result={{
          ...baseResult,
          terminated_with: "predicate-source-exhausted",
          cells: { true_cells: 1, false_cells: 0, unknown_cells: 2 },
          refinement_candidates: ["boot_fsm_ns", "wait_count"],
        }}
      />,
    );
    expect(screen.getByText(/Why undecided/i)).toBeInTheDocument();
    expect(screen.getByText("boot_fsm_ns, wait_count")).toBeInTheDocument();
  });

  it("omits the undecided explanation when there are no unknown cells", () => {
    render(
      <CegarTraceView
        result={{ ...baseResult, refinement_candidates: ["boot_fsm_ns"] }}
      />,
    );
    expect(screen.queryByText(/Why undecided/i)).not.toBeInTheDocument();
  });

  it("renders warnings and the model CTXDSL download when present", () => {
    render(
      <CegarTraceView
        result={{
          ...baseResult,
          warnings: ["soundness note"],
          ctxdsl: "context m {\n  automaton a {\n  }\n}\n",
        }}
      />,
    );
    expect(screen.getByText("soundness note")).toBeInTheDocument();
    expect(screen.getByText(/Model CTXDSL/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Download \.ctxdsl/i }),
    ).toBeInTheDocument();
  });
});
