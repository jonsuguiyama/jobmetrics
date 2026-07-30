import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Dropdown, type DropdownOption } from "./dropdown";

const options: DropdownOption[] = [
  { value: "", label: "None - just paste a job below" },
  { value: "frontendbr/vagas", label: "frontendbr/vagas" },
  { value: "backend-br/vagas", label: "backend-br/vagas" }
];

afterEach(() => cleanup());

describe("Dropdown", () => {
  it("shows the label matching the current value, closed by default", () => {
    render(<Dropdown value="frontendbr/vagas" options={options} onChange={vi.fn()} />);

    expect(screen.getByText("frontendbr/vagas")).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens the option list on click and marks the current value as selected", () => {
    render(<Dropdown value="backend-br/vagas" options={options} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("listbox")).toBeTruthy();
    const selectedOption = screen.getByRole("option", { name: "backend-br/vagas" });
    expect(selectedOption.getAttribute("aria-selected")).toBe("true");
  });

  it("calls onChange and closes when an option is picked", () => {
    const onChange = vi.fn();
    render(<Dropdown value="" options={options} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("option", { name: "frontendbr/vagas" }));

    expect(onChange).toHaveBeenCalledWith("frontendbr/vagas");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes on Escape without changing the value", () => {
    const onChange = vi.fn();
    render(<Dropdown value="" options={options} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes when clicking outside the dropdown", () => {
    render(
      <div>
        <Dropdown value="" options={options} onChange={vi.fn()} />
        <button>outside</button>
      </div>
    );

    fireEvent.click(screen.getByRole("button", { name: /none/i }));
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.mouseDown(screen.getByText("outside"));

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not close when clicking inside the dropdown's own panel", () => {
    render(<Dropdown value="" options={options} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button"));
    fireEvent.mouseDown(screen.getByRole("listbox"));

    expect(screen.getByRole("listbox")).toBeTruthy();
  });
});
