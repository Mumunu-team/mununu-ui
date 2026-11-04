import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Header } from "../Header";

describe("Header", () => {
  it("shows the wordmark with the Spec Playground caption", () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.getByText("MUNUNU")).toBeInTheDocument();
    expect(screen.getByTestId("header-caption")).toHaveTextContent(
      "Spec Playground",
    );
  });
});
