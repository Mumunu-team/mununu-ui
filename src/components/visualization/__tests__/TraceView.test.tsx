import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TraceView } from "../TraceView";
import { LassoTraceViewer } from "../LassoTraceViewer";
import type { Trace } from "../../../api/endpoints";
import {
  compactLines,
  formatCellSource,
  formatReplayResult,
  formatTracePath,
  traceStateNames,
} from "../../../utils/trace";

// The serialized form of a CTXDSL `LassoTrace {prefix: [Idle], cycle: [Busy,
// Wait], prefix_labels: [start], cycle_labels: [poll, retry]}` in mununu 0.5:
// labels ride on the step they leave, the last one closes the cycle.
const lasso: Trace = {
  kind: "lasso",
  loop_start: 1,
  steps: [
    { cycle: 0, state_name: "Idle", labels: ["start"] },
    { cycle: 1, state_name: "Busy", labels: ["poll"] },
    { cycle: 2, state_name: "Wait", labels: ["retry"] },
  ],
};

describe("trace readers", () => {
  it("formats a CTXDSL lasso with its labels and the closing edge", () => {
    expect(formatTracePath(lasso)).toBe(
      "Idle -start-> (Busy -poll-> Wait -retry->)ω",
    );
    expect(traceStateNames(lasso)).toEqual(["Idle", "Busy", "Wait"]);
  });

  it("formats a finite CTXDSL path without a cycle", () => {
    expect(
      formatTracePath({
        kind: "finite",
        steps: [
          { cycle: 0, state_name: "Init", labels: ["go"] },
          { cycle: 1, state_name: "Done" },
        ],
      }),
    ).toBe("Init -go-> Done");
  });
});

describe("TraceView", () => {
  it("renders a CTXDSL lasso: the prefix, the cycle states and every label", () => {
    const { container } = render(<TraceView trace={lasso} title="" />);
    expect(screen.getByText("Idle")).toBeInTheDocument();
    expect(screen.getByText("Busy").tagName).toBe("STRONG");
    expect(screen.getByText("Wait").tagName).toBe("STRONG");
    for (const label of ["start", "poll", "retry"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(container.textContent).toContain("ω");
  });

  it("renders an attack trace's fault injections per cycle", () => {
    render(
      <TraceView
        trace={{
          kind: "attack",
          steps: [
            { cycle: 0 },
            { cycle: 1, faults: [{ site: "state_q", value: 5, hex: "0x5" }] },
          ],
        }}
      />,
    );
    expect(
      screen.getByText(/counterexample \(fault attack\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/state_q:=5/)).toBeInTheDocument();
  });

  it("shows a cell wider than 64 bits by its hex", () => {
    render(
      <TraceView
        trace={{
          kind: "finite",
          steps: [
            {
              cycle: 0,
              state: [
                { register: "tl_i", value: null, hex: "0x1fff", bits: 109 },
              ],
            },
          ],
        }}
      />,
    );
    expect(screen.getByTestId("trace-step").textContent).toContain(
      "tl_i=0x1fff",
    );
  });
});

describe("LassoTraceViewer", () => {
  it("renders one numbered entry per lasso trace", () => {
    render(<LassoTraceViewer traces={[lasso, lasso]} title="Lasso Traces" />);
    expect(screen.getByText("Lasso Traces")).toBeInTheDocument();
    expect(screen.getByText("Trace 1:")).toBeInTheDocument();
    expect(screen.getByText("Trace 2:")).toBeInTheDocument();
  });
});

// The tutorial pump-pair draft's `alternates` row on mununu 0.5.8 (`--replay`, mununu-sva): the
// legend and the replay verdict the CLI printed, field for field.
const pumpPair: Trace = {
  kind: "finite",
  steps: [
    {
      cycle: 0,
      state: [{ register: "state_q", value: 0, hex: "0x0", bits: 2 }],
      inputs: [{ register: "flow", value: 0, hex: "0x0", bits: 1 }],
    },
  ],
  sources: [
    {
      cell: "state_q",
      kind: "register",
      declared: { file: "pump_pair.sv", line: 33 },
      assigned: [{ file: "pump_pair.sv", line: 52 }],
    },
    {
      cell: "flow",
      kind: "input",
      declared: { file: "pump_pair.sv", line: 26 },
    },
    { cell: "u_x.q", kind: "register", assigned: [{ file: "x.sv", line: 9 }] },
  ],
  replay: {
    result: {
      outcome: "match",
      checks: 16,
      mismatches: 0,
      assertions: [],
      vcd_bytes: 2037,
      verilator: "5.051",
      log: "",
    },
  },
};

describe("source map and replay readers", () => {
  it("prints a legend line as the CLI does, leaving out a half the map lacks", () => {
    expect(pumpPair.sources?.map(formatCellSource)).toEqual([
      "state_q ← pump_pair.sv:33 (register, assigned at pump_pair.sv:52)",
      "flow ← pump_pair.sv:26 (input)",
      "u_x.q (register, assigned at x.sv:9)",
    ]);
  });

  it("collapses source lines into runs per file, as the CLI's involves: line", () => {
    const at = (file: string, line: number) => ({ file, line });
    expect(
      compactLines([
        at("pump_pair_sva.sv", 16),
        at("pump_pair.sv", 52),
        at("pump_pair.sv", 24),
        at("pump_pair.sv", 25),
        at("pump_pair.sv", 31),
        at("pump_pair.sv", 25),
        at("pump_pair.sv", 53),
        at("pump_pair.sv", 54),
      ]),
    ).toBe("pump_pair.sv:24-25, 31, 52-54; pump_pair_sva.sv:16");
    expect(compactLines([])).toBe("");
  });

  it("prints the replay verdict as the CLI does, and why it could not run", () => {
    expect(formatReplayResult(pumpPair.replay!.result!)).toBe(
      "match — 0 of 16 checks disagree; verilator 5.051",
    );
    expect(
      formatReplayResult({
        outcome: "mismatch",
        checks: 16,
        mismatches: 1,
        first_mismatch: {
          cycle: 3,
          register: "state_q",
          got: "2",
          expected: "1",
        },
        assertions: [],
        log: "",
      }),
    ).toBe(
      "mismatch — 1 of 16 checks disagree; first at cycle 3: state_q = 2, trace says 1; verilator ?",
    );
    expect(
      formatReplayResult({
        outcome: "unavailable",
        reason: "verilator not found",
        checks: 16,
        mismatches: 0,
        assertions: [],
        log: "",
      }),
    ).toBe("unavailable — verilator not found");
  });

  it("renders the legend and the replay verdict under an RTL path", () => {
    render(<TraceView trace={pumpPair} />);
    expect(screen.getByTestId("trace-sources").textContent).toContain(
      "state_q ← pump_pair.sv:33 (register, assigned at pump_pair.sv:52)",
    );
    const replay = screen.getByTestId("trace-replay").textContent ?? "";
    expect(replay).toContain(
      "replay: match — 0 of 16 checks disagree; verilator 5.051",
    );
    expect(replay).toContain("replay vcd: 2037 bytes");
  });

  it("renders neither block when the trace carries no legend and no replay", () => {
    render(<TraceView trace={{ kind: "finite", steps: pumpPair.steps }} />);
    expect(screen.queryByTestId("trace-sources")).toBeNull();
    expect(screen.queryByTestId("trace-replay")).toBeNull();
  });
});
