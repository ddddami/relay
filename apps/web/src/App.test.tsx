import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("App", () => {
  it("renders the Relay heading", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Internal deployment control plane" }),
    ).toBeInTheDocument();
  });
});
