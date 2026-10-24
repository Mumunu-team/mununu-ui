import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TraceView } from "../TraceView";
import { LassoTraceViewer } from "../LassoTraceViewer";
import type { Trace } from "../../../api/endpoints";
import { formatTracePath, traceStateNames } from "../../../utils/trace";

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
