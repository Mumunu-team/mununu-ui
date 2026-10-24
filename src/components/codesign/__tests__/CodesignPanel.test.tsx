import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CodesignPanel } from "../CodesignPanel";
import * as endpoints from "../../../api/endpoints";

vi.mock("../../../api/endpoints", async () => {
  const actual = await vi.importActual<typeof import("../../../api/endpoints")>(
    "../../../api/endpoints",
  );
  return {
    ...actual,
    verifyCodesign: vi.fn(),
  };
});

describe("CodesignPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the form with example payload preloaded", () => {
    render(<CodesignPanel />);
    expect(screen.getByText(/HW\/SW codesign verify/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Run codesign verify/i }),
    ).toBeInTheDocument();
    // Default formula populated.
    expect(screen.getByPlaceholderText("init_reachable")).toBeInTheDocument();
  });

  it("posts the register map, firmware, and formula to verifyCodesign", async () => {
    const mocked = vi.mocked(endpoints.verifyCodesign);
    mocked.mockResolvedValue({
      outcome: "holds",
      total_states: 16,
      satisfying_states: 16,
      initial_states: ["Idle|Init"],
      initial_satisfying: ["Idle|Init"],
      composition: {
        peripheral_automaton: "UART_LITE",
        composition_name: "UART_LITESystem",
        firmware_members: ["UartDriver"],
        automaton: "UART_LITESystem",
      },
      composed_ctxdsl: "context CoupledUart { … }",
    });
    render(<CodesignPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: /Run codesign verify/i }),
    );
    await waitFor(() => {
      expect(mocked).toHaveBeenCalledTimes(1);
    });
    const arg = mocked.mock.calls[0]?.[0];
    expect(arg?.register_map.peripheral).toBe("UART_LITE");
    expect(arg?.firmware_ctxdsl).toContain("automaton UartDriver");
    expect(arg?.formula).toBe("init_reachable");
    // Automaton override omitted when empty.
    expect(arg && "automaton" in arg).toBe(false);
  });

  it("passes the automaton override when set", async () => {
    const mocked = vi.mocked(endpoints.verifyCodesign);
    mocked.mockResolvedValue({
      outcome: "violated",
      total_states: 4,
      satisfying_states: 0,
      initial_states: ["Init"],
      initial_satisfying: [],
      composition: {
        peripheral_automaton: "UART_LITE",
        composition_name: "UART_LITESystem",
        firmware_members: ["UartDriver"],
        automaton: "UartDriver",
      },
      composed_ctxdsl: "context X {}",
    });
    render(<CodesignPanel />);
    const automatonInput = screen.getByPlaceholderText(
      /<PERIPHERAL>System \(default\)/i,
    );
    fireEvent.change(automatonInput, { target: { value: "UartDriver" } });
    fireEvent.click(
      screen.getByRole("button", { name: /Run codesign verify/i }),
    );
    await waitFor(() => {
      expect(mocked).toHaveBeenCalled();
    });
    expect(mocked.mock.calls[0]?.[0].automaton).toBe("UartDriver");
  });

  it("renders a HOLDS verdict with state counts and initial-state details", async () => {
    vi.mocked(endpoints.verifyCodesign).mockResolvedValue({
      outcome: "holds",
      total_states: 16,
      satisfying_states: 16,
      initial_states: ["Idle|Init"],
      initial_satisfying: ["Idle|Init"],
      composition: {
        peripheral_automaton: "UART_LITE",
        composition_name: "UART_LITESystem",
        firmware_members: ["UartDriver"],
        automaton: "UART_LITESystem",
      },
      composed_ctxdsl: "context X {}",
    });
    render(<CodesignPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: /Run codesign verify/i }),
    );
    await waitFor(() => {
      expect(screen.getByText(/Verdict: HOLDS/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/States satisfying: 16 \/ 16/)).toBeInTheDocument();
    expect(screen.getByText(/initials:/)).toBeInTheDocument();
    expect(screen.getAllByText(/Idle\|Init/).length).toBeGreaterThan(0);
  });

  it("renders a VIOLATED verdict when not all initial states satisfy", async () => {
    vi.mocked(endpoints.verifyCodesign).mockResolvedValue({
      outcome: "violated",
      total_states: 16,
      satisfying_states: 8,
      initial_states: ["Idle|Init"],
      initial_satisfying: [],
      composition: {
        peripheral_automaton: "UART_LITE",
        composition_name: "UART_LITESystem",
        firmware_members: ["UartDriver"],
        automaton: "UART_LITESystem",
      },
      composed_ctxdsl: "context X {}",
    });
    render(<CodesignPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: /Run codesign verify/i }),
    );
    await waitFor(() => {
      expect(screen.getByText(/Verdict: VIOLATED/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/States satisfying: 8 \/ 16/)).toBeInTheDocument();
  });

  it("shows a parse error when the register map JSON is invalid", async () => {
    render(<CodesignPanel />);
    const textareas = screen.getAllByRole("textbox");
    // The first textarea is the register map JSON.
    fireEvent.change(textareas[0], { target: { value: "not valid json" } });
    fireEvent.click(
      screen.getByRole("button", { name: /Run codesign verify/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("exposes the composed CTXDSL behind a collapsible details element", async () => {
    vi.mocked(endpoints.verifyCodesign).mockResolvedValue({
      outcome: "holds",
      total_states: 16,
      satisfying_states: 16,
      initial_states: ["Idle|Init"],
      initial_satisfying: ["Idle|Init"],
      composition: {
        peripheral_automaton: "UART_LITE",
        composition_name: "UART_LITESystem",
        firmware_members: ["UartDriver"],
        automaton: "UART_LITESystem",
      },
      composed_ctxdsl:
        "context CoupledUart {\n    alphabet { label rd_status_tx_busy; }\n}\n",
    });
    render(<CodesignPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: /Run codesign verify/i }),
    );
    await waitFor(() => {
      // The <summary> shows line-count metadata so we can confirm
      // both that the body is exposed and that we got the response.
      expect(
        screen.getByText(/Composed CTXDSL \(\d+ lines\)/i),
      ).toBeInTheDocument();
    });
  });
});
