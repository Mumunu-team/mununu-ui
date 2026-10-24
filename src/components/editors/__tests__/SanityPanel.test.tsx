import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SanityPanel } from "../SanityPanel";

describe("SanityPanel", () => {
  it("renders nothing without reports", () => {
    const { container } = render(<SanityPanel reports={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("lists a deadlock with its path and a dead label", () => {
    render(
      <SanityPanel
        reports={[
          {
            automaton: "A",
            reachable_states: 2,
            deadlocks: [{ states: ["Init", "Done"], labels: ["go"] }],
            unreachable_states: [],
            labels_never_fired: ["unused"],
            internal_livelocks: [],
          },
        ]}
      />,
    );
    expect(screen.getByText("Init -go-> Done")).toBeTruthy();
    expect(screen.getByText("unused")).toBeTruthy();
  });

  it("says when a model is clean", () => {
    render(
      <SanityPanel
        reports={[
          {
            automaton: "A",
            reachable_states: 2,
            deadlocks: [],
            unreachable_states: [],
            labels_never_fired: [],
            internal_livelocks: [],
          },
        ]}
      />,
    );
    expect(screen.getByText(/No deadlock/)).toBeTruthy();
  });
});
