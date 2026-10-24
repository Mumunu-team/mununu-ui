import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CegarRunner } from "../CegarRunner";
import * as endpoints from "../../../api/endpoints";

vi.mock("../../../api/endpoints", async () => {
  const actual = await vi.importActual<typeof import("../../../api/endpoints")>(
    "../../../api/endpoints",
  );
  return {
    ...actual,
    runBtor2Cegar: vi.fn(),
  };
});

describe("CegarRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the form with the BTOR2 template and a default formula", () => {
    render(<CegarRunner />);
    expect(
      screen.getByRole("button", { name: /Run CEGAR refinement/i }),
    ).toBeInTheDocument();
    // Default formula preloaded in the formula input.
    expect(screen.getByLabelText("Formula")).toHaveValue("nu X. <true> X");
    // Falls back to the example BTOR2 when no source is seeded.
    const source = screen.getByLabelText("BTOR2 source") as HTMLTextAreaElement;
    expect(source.value).toContain("state 1 r");
  });

  it("seeds the BTOR2 source from the initialBtor2 prop (extraction-tab flow)", () => {
    const loaded = "1 sort bitvec 1\n3 state 1 my_reg\n";
    render(<CegarRunner initialBtor2={loaded} />);
    expect(screen.getByLabelText("BTOR2 source")).toHaveValue(loaded);
  });

  it("posts the BTOR2, formula, and parsed predicates to runBtor2Cegar", async () => {
    const mocked = vi.mocked(endpoints.runBtor2Cegar);
    mocked.mockResolvedValue({
      success: true,
      iterations: [
        {
          iteration: 0,
          predicate_count: 1,
          had_failure_subgame: false,
          predicates_added: [],
          game_position_evaluations: 4,
          cells: { true_cells: 2, false_cells: 0, unknown_cells: 0 },
        },
      ],
      final_predicates: [{ name: "r_zero", register: "r", value: 0 }],
      terminated_with: "converged",
      cells: { true_cells: 2, false_cells: 0, unknown_cells: 0 },
      lazy_lift_pending: true,
      approximant_reuse_enabled: false,
      warnings: [],
    });

    render(<CegarRunner />);
    fireEvent.click(
      screen.getByRole("button", { name: /Run CEGAR refinement/i }),
    );

    await waitFor(() => {
      expect(mocked).toHaveBeenCalledTimes(1);
    });
    const arg = mocked.mock.calls[0]?.[0];
    expect(arg?.formula).toBe("nu X. <true> X");
    expect(arg?.predicates).toEqual([
      { name: "r_zero", register: "r", value: 0 },
    ]);
    expect(arg?.predicate_source).toBe("wp");
    expect(arg?.max_iterations).toBe(16);
    expect(arg?.content).toContain("state 1 r");
    // M.6 parity defaults: may-edge off, no config-values.
    expect(arg?.may_edge_inference).toBe("off");
    expect(arg?.init_values).toEqual([]);
    // CTXDSL Phase 2 default: emit-ctxdsl off.
    expect(arg?.emit_ctxdsl).toBe(false);
  });

  it("posts may_edge_inference and init_values when set (M.6 parity)", async () => {
    const mocked = vi.mocked(endpoints.runBtor2Cegar);
    mocked.mockResolvedValue({
      success: true,
      iterations: [],
      final_predicates: [],
      terminated_with: "converged",
      cells: { true_cells: 0, false_cells: 0, unknown_cells: 0 },
      lazy_lift_pending: false,
      approximant_reuse_enabled: false,
      warnings: [],
    });

    render(<CegarRunner />);
    fireEvent.change(screen.getByLabelText("May-edge inference"), {
      target: { value: "smt-all-pairs" },
    });
    fireEvent.change(screen.getByLabelText("Config values"), {
      target: { value: "boot_fsm_ns=0,1,2,3,4,5,6,7\n" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Run CEGAR refinement/i }),
    );

    await waitFor(() => {
      expect(mocked).toHaveBeenCalledTimes(1);
    });
    const arg = mocked.mock.calls[0]?.[0];
    expect(arg?.may_edge_inference).toBe("smt-all-pairs");
    expect(arg?.init_values).toEqual(["boot_fsm_ns=0,1,2,3,4,5,6,7"]);
  });

  it("posts engine=symbolic when the R-F5 engine is selected (R-F5.4.2b)", async () => {
    const mocked = vi.mocked(endpoints.runBtor2Cegar);
    mocked.mockResolvedValue({
      success: true,
      iterations: [],
      final_predicates: [],
      terminated_with: "symbolic-single-shot",
      cells: { true_cells: 1, false_cells: 0, unknown_cells: 1 },
      lazy_lift_pending: false,
      approximant_reuse_enabled: false,
      warnings: ["engine=symbolic (R-F5): single-shot"],
    });

    render(<CegarRunner />);
    // Default engine is explicit.
    expect(screen.getByLabelText("Engine")).toHaveValue("explicit");
    fireEvent.change(screen.getByLabelText("Engine"), {
      target: { value: "symbolic" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Run CEGAR refinement/i }),
    );

    await waitFor(() => {
      expect(mocked).toHaveBeenCalledTimes(1);
    });
    expect(mocked.mock.calls[0]?.[0]?.engine).toBe("symbolic");
  });

  it("renders the iterations table and termination reason from the trace", async () => {
    const mocked = vi.mocked(endpoints.runBtor2Cegar);
    mocked.mockResolvedValue({
      success: true,
      iterations: [
        {
          iteration: 0,
          predicate_count: 1,
          had_failure_subgame: true,
          predicates_added: [{ name: "r_one", register: "r", value: 1 }],
          game_position_evaluations: 8,
          cells: { true_cells: 1, false_cells: 0, unknown_cells: 1 },
        },
        {
          iteration: 1,
          predicate_count: 2,
          had_failure_subgame: false,
          predicates_added: [],
          game_position_evaluations: 3,
          cells: { true_cells: 2, false_cells: 0, unknown_cells: 0 },
        },
      ],
      final_predicates: [
        { name: "r_zero", register: "r", value: 0 },
        { name: "r_one", register: "r", value: 1 },
      ],
      terminated_with: "converged",
      cells: { true_cells: 2, false_cells: 0, unknown_cells: 0 },
      lazy_lift_pending: false,
      approximant_reuse_enabled: true,
      warnings: ["sample soundness warning"],
    });

    render(<CegarRunner />);
    fireEvent.click(
      screen.getByRole("button", { name: /Run CEGAR refinement/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Refinement trace/i)).toBeInTheDocument();
    });
    expect(screen.getByText("converged")).toBeInTheDocument();
    // The added predicate from iteration 0 renders in the table.
    expect(screen.getByText("r==1")).toBeInTheDocument();
    // Both final predicates render.
    expect(screen.getByText(/r_one: r == 1/i)).toBeInTheDocument();
    // The warning surfaces.
    expect(screen.getByText("sample soundness warning")).toBeInTheDocument();
  });

  it("posts emit_ctxdsl and renders the model CTXDSL when returned (Phase 2)", async () => {
    const mocked = vi.mocked(endpoints.runBtor2Cegar);
    mocked.mockResolvedValue({
      success: true,
      iterations: [],
      final_predicates: [],
      terminated_with: "converged",
      cells: { true_cells: 0, false_cells: 0, unknown_cells: 0 },
      lazy_lift_pending: false,
      approximant_reuse_enabled: false,
      warnings: [],
      ctxdsl: "context cegar_model {\n  automaton lifted_kmts {\n  }\n}\n",
    });

    render(<CegarRunner />);
    // Opt in via the "Emit CTXDSL" checkbox (the only checkbox in the form).
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: /Run CEGAR refinement/i }),
    );

    await waitFor(() => {
      expect(mocked).toHaveBeenCalledTimes(1);
    });
    expect(mocked.mock.calls[0]?.[0]?.emit_ctxdsl).toBe(true);

    // The returned model CTXDSL renders, with a download control.
    await waitFor(() => {
      expect(screen.getByText(/Model CTXDSL/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/automaton lifted_kmts/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Download \.ctxdsl/i }),
    ).toBeInTheDocument();
  });

  it("blocks submission and shows an error when predicates are malformed", async () => {
    const mocked = vi.mocked(endpoints.runBtor2Cegar);
    render(<CegarRunner />);
    fireEvent.change(screen.getByLabelText("Initial predicates"), {
      target: { value: "bad row without three fields\n" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Run CEGAR refinement/i }),
    );
    await waitFor(() => {
      expect(screen.getByText(/Invalid predicate row/i)).toBeInTheDocument();
    });
    expect(mocked).not.toHaveBeenCalled();
  });
});
