import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SvCegarRunner } from "../SvCegarRunner";
import { useExtractionStore } from "../../../store/extractionStore";
import * as endpoints from "../../../api/endpoints";

vi.mock("../../../api/endpoints", async () => {
  const actual = await vi.importActual<typeof import("../../../api/endpoints")>(
    "../../../api/endpoints",
  );
  return {
    ...actual,
    runSvCegar: vi.fn(),
  };
});

const SV = `module ctr (input logic clk, input logic rst);
  logic [1:0] burst;
  always_ff @(posedge clk) burst <= rst ? 2'd0 : burst - 2'd1;
endmodule
`;

describe("SvCegarRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset + seed the extraction store with a loaded SV source.
    useExtractionStore.getState().resetWorkflow();
    useExtractionStore.setState({
      sourceContent: SV,
      sourceFileName: "ctr.sv",
      additionalSources: [],
    });
  });

  it("shows the loaded SV filename and a default formula", () => {
    render(<SvCegarRunner />);
    expect(screen.getByText("ctr.sv")).toBeInTheDocument();
    expect(screen.getByLabelText("Formula")).toHaveValue("nu X. <true> X");
    expect(
      screen.getByRole("button", { name: /Run CEGAR refinement/i }),
    ).toBeInTheDocument();
  });

  it("posts the SV source, formula, predicates, and lift options to runSvCegar", async () => {
    const mocked = vi.mocked(endpoints.runSvCegar);
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
      final_predicates: [{ name: "burst_zero", register: "burst", value: 0 }],
      terminated_with: "converged",
      cells: { true_cells: 2, false_cells: 0, unknown_cells: 0 },
      lazy_lift_pending: false,
      approximant_reuse_enabled: false,
      warnings: [],
    });

    render(<SvCegarRunner />);
    fireEvent.change(screen.getByLabelText("Initial predicates"), {
      target: { value: "burst_zero, burst, 0\n" },
    });
    fireEvent.change(screen.getByLabelText("Top module"), {
      target: { value: "ctr" },
    });
    fireEvent.change(screen.getByLabelText("Undefined-net policy"), {
      target: { value: "anyconst" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Run CEGAR refinement/i }),
    );

    await waitFor(() => {
      expect(mocked).toHaveBeenCalledTimes(1);
    });
    const arg = mocked.mock.calls[0]?.[0];
    expect(arg?.lift.source).toContain("module ctr");
    expect(arg?.formula).toBe("nu X. <true> X");
    expect(arg?.predicates).toEqual([
      { name: "burst_zero", register: "burst", value: 0 },
    ]);
    expect(arg?.lift.top).toBe("ctr");
    // anyconst policy → setundef_anyconst true, anyseq false.
    expect(arg?.setundef_anyconst).toBe(true);
    expect(arg?.setundef_anyseq).toBe(false);
    // The sv2v front end is the default for modern SV (mununu 0.5 `lift.frontend`).
    expect(arg?.lift.frontend).toBe("sv2v");
    // No pre-0.5 top-level keys: the backend refuses unknown keys with a 400.
    expect(arg).not.toHaveProperty("source");
    expect(arg).not.toHaveProperty("use_sv2v");
    expect(arg).not.toHaveProperty("controllable_inputs");
    expect(arg).not.toHaveProperty("config_values");

    // The trace renders via the shared CegarTraceView.
    await waitFor(() => {
      expect(screen.getByText(/Refinement trace/i)).toBeInTheDocument();
    });
    expect(screen.getByText("converged")).toBeInTheDocument();
  });

  it("blocks submission with no predicates", async () => {
    const mocked = vi.mocked(endpoints.runSvCegar);
    render(<SvCegarRunner />);
    fireEvent.click(
      screen.getByRole("button", { name: /Run CEGAR refinement/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/At least one predicate required/i),
      ).toBeInTheDocument();
    });
    expect(mocked).not.toHaveBeenCalled();
  });

  it("blocks submission when no SV source is loaded", async () => {
    const mocked = vi.mocked(endpoints.runSvCegar);
    useExtractionStore.setState({ sourceContent: "", sourceFileName: "" });
    render(<SvCegarRunner />);
    fireEvent.change(screen.getByLabelText("Initial predicates"), {
      target: { value: "burst_zero, burst, 0\n" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Run CEGAR refinement/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/No SystemVerilog source loaded/i),
      ).toBeInTheDocument();
    });
    expect(mocked).not.toHaveBeenCalled();
  });
});
