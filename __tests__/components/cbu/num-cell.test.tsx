/**
 * @jest-environment jsdom
 *
 * RTL tests for NumCell (src/components/cbu/num-cell.tsx) — the spreadsheet-style numeric input
 * used throughout the CBU workspace. Covers what the pure `draft.ts` tests can't: real DOM
 * events (typing, focus-select, Enter/Arrow grid navigation, multi-cell paste).
 */
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumCell } from "../../../src/components/cbu/num-cell";

describe("NumCell", () => {
  it("calls onChange with the typed value, kept as a string (no parsing in the component)", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<NumCell value="" onChange={onChange} label="Material Cost" />);

    const input = screen.getByLabelText("Material Cost");
    await user.type(input, "4,37");

    // Each keystroke fires its own onChange (the component is a controlled input with no local state),
    // so the last call carries the single character since `value` prop never advances in this test.
    expect(onChange).toHaveBeenLastCalledWith("7");
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it("selects the whole value on focus, so typing replaces it like a spreadsheet cell", () => {
    render(<NumCell value="4.37" onChange={jest.fn()} label="Material Cost" />);
    const input = screen.getByLabelText<HTMLInputElement>("Material Cost");
    input.focus();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it("shows the error styling and title when `error` is set", () => {
    render(<NumCell value="" onChange={jest.fn()} label="Material Cost" error="Bắt buộc nhập" />);
    const input = screen.getByLabelText("Material Cost");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("title", "Bắt buộc nhập");
  });

  it("ArrowDown moves focus to the next row's cell in the same grid column", async () => {
    const user = userEvent.setup();
    render(
      <div data-cbu-grid>
        <NumCell value="1" onChange={jest.fn()} label="Row 0" row={0} col={2} />
        <NumCell value="2" onChange={jest.fn()} label="Row 1" row={1} col={2} />
      </div>
    );
    const row0 = screen.getByLabelText("Row 0");
    const row1 = screen.getByLabelText("Row 1");
    row0.focus();
    await user.keyboard("{ArrowDown}");
    expect(row1).toHaveFocus();
  });

  it("Shift+Enter moves focus to the previous row's cell", async () => {
    const user = userEvent.setup();
    render(
      <div data-cbu-grid>
        <NumCell value="1" onChange={jest.fn()} label="Row 0" row={0} col={0} />
        <NumCell value="2" onChange={jest.fn()} label="Row 1" row={1} col={0} />
      </div>
    );
    const row1 = screen.getByLabelText("Row 1");
    row1.focus();
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(screen.getByLabelText("Row 0")).toHaveFocus();
  });

  it("Arrow navigation is a no-op when row/col are not given (not part of a grid)", async () => {
    const user = userEvent.setup();
    render(<NumCell value="1" onChange={jest.fn()} label="Standalone" />);
    const input = screen.getByLabelText("Standalone");
    input.focus();
    // Should not throw, and focus stays put (no grid to navigate into).
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveFocus();
  });

  it("a multi-line paste is handed to onPasteBlock; a single value is left to paste normally", async () => {
    const onPasteBlock = jest.fn().mockReturnValue(true);
    render(
      <div data-cbu-grid>
        <NumCell value="" onChange={jest.fn()} label="Target" row={0} col={0} onPasteBlock={onPasteBlock} />
      </div>
    );
    const input = screen.getByLabelText("Target");
    input.focus();

    const multiLine = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(multiLine, "clipboardData", { value: { getData: () => "1\t2\n3\t4" } });
    input.dispatchEvent(multiLine);
    expect(onPasteBlock).toHaveBeenCalledWith(0, 0, "1\t2\n3\t4");

    onPasteBlock.mockClear();
    const single = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(single, "clipboardData", { value: { getData: () => "42" } });
    input.dispatchEvent(single);
    expect(onPasteBlock).not.toHaveBeenCalled();
  });
});
