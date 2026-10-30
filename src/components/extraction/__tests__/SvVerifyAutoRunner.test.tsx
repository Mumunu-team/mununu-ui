import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SvVerifyAutoRunner } from "../SvVerifyAutoRunner";
import { useExtractionStore } from "../../../store/extractionStore";
import * as endpoints from "../../../api/endpoints";

vi.mock("../../../api/endpoints", async () => {
  const actual = await vi.importActual<typeof import("../../../api/endpoints")>(
    "../../../api/endpoints",
  );
  return {
    ...actual,
    runSvVerifyAuto: vi.fn(),
  };
});

const SV = `module fsm (input logic clk, input logic rst_n);
  logic [1:0] state;
  always_ff @(posedge clk) state <= rst_n ? state + 2'd1 : 2'd0;
  ok: assert property (@(posedge clk) state != 2'd3);
endmodule
`;

describe("SvVerifyAutoRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useExtractionStore.getState().resetWorkflow();
    useExtractionStore.setState({
      sourceContent: SV,
      sourceFileName: "fsm.sv",
      additionalSources: [],
    });
  });

  it("shows the loaded SV filename and a verify button", () => {
    render(<SvVerifyAutoRunner />);
    expect(screen.getByText("fsm.sv")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Verify all properties/i }),
    ).toBeInTheDocument();
  });

  it("posts the SV source + options and renders per-property verdicts", async () => {
    const mocked = vi.mocked(endpoints.runSvVerifyAuto);
    mocked.mockResolvedValue({
      properties: [
        {
          name: "fsm_sva_0",
          kind: "assert",
          formula: "nu X. ((state != 3) && [] X)",
          outcome: "holds",
          detail: null,
          seeded_predicates: ["state != 3"],
        },
        {
          name: "fsm_sva_1",
          kind: "assert",
          formula: "nu X. ((state == 1) && [] X)",
          outcome: "violated",
          detail: "1 cell(s)",
          seeded_predicates: ["state == 1"],
        },
        {
          name: "fsm_sva_2",
          kind: "assert",
          formula: "nu X. (gnt_o && [] X)",
          outcome: "skipped",
          detail: "atom over non-state signal: gnt_o",
          seeded_predicates: [],
        },
      ],
      unsupported: [],
      diagnostics: {
        state_register_count: 2,
        blackboxed_modules: [],
        gated_resets: ["rst_ni=1"],
        auto_provided_stubs: ["prim_sparse_fsm_flop"],
      },
      notes: [
        {
          kind: "coverage-summary",
          level: "info",
          summary:
            "3 assertion(s): 1 definite (HOLDS), 1 violated, 0 unknown (⊥), 1 skipped",
          detail: "A definite verdict transfers to the RTL.",
          items: [],
        },
        {
          kind: "config-concretization",
          level: "scope-caveat",
          summary: "1 config input(s) pinned to constants.",
          detail: "Verdicts are scoped to this configuration.",
          items: ["cfg_detect_timer_i=7"],
        },
      ],
    });

    render(<SvVerifyAutoRunner />);
    fireEvent.change(screen.getByLabelText("Must-edge inference"), {
      target: { value: "smt-hyper-must" },
    });
    // H.J.b — config concretization: comma-separated `signal=value` entries are
    // parsed into the request's `pins` array.
    fireEvent.change(screen.getByLabelText("Config concretization"), {
      target: { value: "cfg_detect_timer_i=7, cfg_debounce_timer_i=1" },
    });
    // H.H — counter bounds: comma-separated `signal<=value` entries are parsed
    // into the request's `counter_bounds` array.
    fireEvent.change(screen.getByLabelText("Counter bounds"), {
      target: { value: "cnt_q<=7" },
    });
    // Control-slice cut points travel inside the `lift` object (`lift.cutpoints`).
    fireEvent.change(screen.getByLabelText("Control-slice cut points"), {
      target: { value: "must_refresh, precharge_done" },
    });
    // R-F5.5d — the engine selector (default explicit) posts `engine`.
    expect(screen.getByLabelText("Engine")).toHaveValue("explicit");
    fireEvent.change(screen.getByLabelText("Engine"), {
      target: { value: "symbolic" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Verify all properties/i }),
    );

    await waitFor(() => {
      expect(mocked).toHaveBeenCalledTimes(1);
    });
    const arg = mocked.mock.calls[0]?.[0];
    expect(arg?.lift.source).toContain("module fsm");
    // The sv2v front end is the default (mununu 0.5 `lift.frontend`).
    expect(arg?.lift.frontend).toBe("sv2v");
    expect(arg?.lift.cutpoints).toEqual(["must_refresh", "precharge_done"]);
    // No pre-0.5 keys: the backend refuses unknown keys with a 400.
    for (const stale of [
      "source",
      "use_sv2v",
      "use_slang",
      "config_values",
      "cutpoint",
      "no_antecedent_shadow",
    ]) {
      expect(arg).not.toHaveProperty(stale);
    }
    expect(arg?.engine).toBe("symbolic");
    expect(arg?.must_edge_inference).toBe("smt-hyper-must");
    expect(arg?.gate_reset).toBe(true);
    expect(arg?.auto_stub_flops).toBe(true);
    expect(arg?.pins).toEqual([
      "cfg_detect_timer_i=7",
      "cfg_debounce_timer_i=1",
    ]);
    expect(arg?.counter_bounds).toEqual(["cnt_q<=7"]);

    // All three properties render, with their headline verdicts + skip reason.
    await waitFor(() => {
      expect(screen.getByText("fsm_sva_0")).toBeInTheDocument();
    });
    const liText = (name: string) =>
      screen.getByText(name).closest("li")?.textContent ?? "";
    expect(liText("fsm_sva_0")).toContain("HOLDS");
    expect(liText("fsm_sva_1")).toContain("VIOLATED (1 cell(s))");
    expect(liText("fsm_sva_2")).toContain("SKIPPED");
    expect(
      screen.getByText(/atom over non-state signal: gnt_o/),
    ).toBeInTheDocument();

    // Model diagnostics render: the auto-stubbed flop (single text node)
    // anchors the diagnostics paragraph; the paragraph also carries the
    // state-register count + reset-gating.
    const stub = screen.getByText(
      /auto-stubbed flop primitives.*prim_sparse_fsm_flop/,
    );
    const diagText = stub.closest("p")?.textContent ?? "";
    expect(diagText).toMatch(/state register/);
    expect(diagText).toMatch(/\b2\b/);
    expect(diagText).toMatch(/reset-gated.*rst_ni=1/);

    // H.J — the provenance notes panel renders each note with its summary,
    // and the config-concretization scope caveat carries the pinned value.
    expect(
      screen.getByText(/Notes \(decisions that shaped these verdicts\)/),
    ).toBeInTheDocument();
    const configNote =
      screen.getByText(/1 config input\(s\) pinned to constants/).closest("li")
        ?.textContent ?? "";
    expect(configNote).toContain("scope");
    expect(configNote).toContain("cfg_detect_timer_i=7");
  });

  it("posts engine=exact-symbolic when the D1 exact-symbolic engine is selected", async () => {
    const mocked = vi.mocked(endpoints.runSvVerifyAuto);
    mocked.mockResolvedValue({
      properties: [
        {
          name: "fsm_sva_0",
          kind: "assert",
          formula: "nu X. ((state != 3) && [] X)",
          outcome: "holds",
          detail: null,
          seeded_predicates: ["state != 3"],
        },
      ],
      unsupported: [],
      diagnostics: {
        state_register_count: 2,
        blackboxed_modules: [],
        gated_resets: [],
        auto_provided_stubs: [],
      },
      notes: [],
    });

    render(<SvVerifyAutoRunner />);
    // D1.6 — the exact-symbolic option is present and, when selected, posts
    // `engine: "exact-symbolic"` so the API routes to the exact full-state ROBDD MC.
    fireEvent.change(screen.getByLabelText("Engine"), {
      target: { value: "exact-symbolic" },
    });
    expect(screen.getByLabelText("Engine")).toHaveValue("exact-symbolic");
    fireEvent.click(
      screen.getByRole("button", { name: /Verify all properties/i }),
    );

    await waitFor(() => {
      expect(mocked).toHaveBeenCalledTimes(1);
    });
    expect(mocked.mock.calls[0]?.[0]?.engine).toBe("exact-symbolic");
  });

  it("posts lift.frontend slang when the slang front end is selected", async () => {
    const mocked = vi.mocked(endpoints.runSvVerifyAuto);
    mocked.mockResolvedValue({
      properties: [],
      unsupported: [],
      diagnostics: {
        state_register_count: 0,
        blackboxed_modules: [],
        gated_resets: [],
        auto_provided_stubs: [],
      },
    });
    render(<SvVerifyAutoRunner />);
    fireEvent.change(screen.getByLabelText("RTL front end"), {
      target: { value: "slang" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Verify all properties/i }),
    );
    await waitFor(() => {
      expect(mocked).toHaveBeenCalledTimes(1);
    });
    expect(mocked.mock.calls[0]?.[0]?.lift.frontend).toBe("slang");
  });

  it("renders each violated row's trace: a stall lasso and an unreachable target", async () => {
    const cell = (register: string, value: number) => ({
      register,
      value,
      hex: `0x${value.toString(16)}`,
      bits: 2,
    });
    const mocked = vi.mocked(endpoints.runSvVerifyAuto);
    mocked.mockResolvedValue({
      properties: [
        {
          name: "fsm_sva_live",
          kind: "assert",
          formula: "mu X. (done || [] X)",
          outcome: "violated",
          detail: null,
          seeded_predicates: [],
          trace: {
            kind: "lasso",
            loop_start: 1,
            steps: [
              { cycle: 0, state: [cell("state", 0)] },
              { cycle: 1, state: [cell("state", 1)] },
              { cycle: 2, state: [cell("state", 2)] },
            ],
          },
        },
        {
          name: "fsm_sva_reach",
          kind: "cover",
          formula: "mu X. ((state == 3) || <> X)",
          outcome: "violated",
          detail: null,
          seeded_predicates: [],
          trace: {
            kind: "unreachable",
            steps: [],
            unreachable_target: ["state == 3"],
          },
        },
      ],
      unsupported: [],
      diagnostics: {
        state_register_count: 1,
        blackboxed_modules: [],
        gated_resets: [],
        auto_provided_stubs: [],
      },
    });
    render(<SvVerifyAutoRunner />);
    fireEvent.click(
      screen.getByRole("button", { name: /Verify all properties/i }),
    );
    await waitFor(() => {
      expect(screen.getByText("fsm_sva_live")).toBeInTheDocument();
    });
    const steps = screen.getAllByTestId("trace-step");
    expect(steps.map((s) => s.textContent)).toEqual([
      "→ [0] state=0",
      "↺ [1] state=1",
      "  [2] state=2",
    ]);
    expect(screen.getByText(/cycle repeats forever/)).toBeInTheDocument();
    expect(
      screen.getByText(/target UNREACHABLE from reset/).textContent,
    ).toContain("state == 3");
  });

  it("shows each row's source line and cone lines, the source-map status, and posts the replay flags", async () => {
    const mocked = vi.mocked(endpoints.runSvVerifyAuto);
    mocked.mockResolvedValue({
      properties: [
        {
          name: "ann_guarantee_0",
          label: "alternates",
          kind: "assert",
          formula: "G (start_a -> X (!start_a W start_b))",
          formula_language: "ltl",
          translated: "(nu G1. ...)",
          source: { file: "pump_pair.sv", line: 13 },
          involves: [
            { file: "pump_pair.sv", line: 24 },
            { file: "pump_pair.sv", line: 25 },
            { file: "pump_pair.sv", line: 52 },
          ],
          outcome: "violated",
          detail: "1 cell(s)",
          seeded_predicates: [],
        },
      ],
      unsupported: [],
      diagnostics: {
        state_register_count: 4,
        blackboxed_modules: [],
        gated_resets: ["rst_n=1"],
        auto_provided_stubs: [],
        source_map: {
          status: "partial",
          reason: "no assignment line for u_fsm.sv2v_cast_2$result",
        },
      },
    });
    render(<SvVerifyAutoRunner />);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Replay counterexamples under Verilator/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Verify all properties/i }),
    );
    await waitFor(() => {
      expect(screen.getByText("ann_guarantee_0")).toBeInTheDocument();
    });
    expect(mocked.mock.calls[0][0]).toMatchObject({
      emit_testbench: true,
      replay: true,
    });
    expect(screen.getByText("label: alternates")).toBeInTheDocument();
    expect(screen.getByTestId("property-source").textContent).toBe(
      "source: pump_pair.sv:13",
    );
    expect(screen.getByTestId("property-involves").textContent).toContain(
      "pump_pair.sv:24-25, 52",
    );
    expect(screen.getByTestId("source-map-status").textContent).toContain(
      "source map: partial — no assignment line for u_fsm.sv2v_cast_2$result",
    );
  });

  it("blocks verification when no SV source is loaded", async () => {
    const mocked = vi.mocked(endpoints.runSvVerifyAuto);
    useExtractionStore.setState({ sourceContent: "", sourceFileName: "" });
    render(<SvVerifyAutoRunner />);
    fireEvent.click(
      screen.getByRole("button", { name: /Verify all properties/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/No SystemVerilog source loaded/i),
      ).toBeInTheDocument();
    });
    expect(mocked).not.toHaveBeenCalled();
  });
});
