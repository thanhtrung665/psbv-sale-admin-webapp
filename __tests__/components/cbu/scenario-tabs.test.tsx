/**
 * @jest-environment jsdom
 *
 * RTL tests for ScenarioTabs (src/components/cbu/scenario-tabs.tsx) — select / add / rename / remove
 * a logistics scenario (Air, Sea, ...). The scenario data model itself is covered by draft.test.ts;
 * this covers the interactive wiring.
 */
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScenarioTabs } from "../../../src/components/cbu/scenario-tabs";
import { MAX_SCENARIOS, type DraftScenario } from "../../../src/lib/cbu/ui/draft";

function scenario(id: string, label: string): DraftScenario {
  return { id, label, fields: {}, prices: {}, dapPrices: {} };
}

describe("ScenarioTabs", () => {
  it("clicking a tab calls onSelect with its id", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    render(
      <ScenarioTabs
        scenarios={[scenario("air", "Air"), scenario("sea", "Sea")]}
        activeId="air"
        chosenId="air"
        onSelect={onSelect}
        onAdd={jest.fn()}
        onRename={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    await user.click(screen.getByRole("tab", { name: /Sea/ }));
    expect(onSelect).toHaveBeenCalledWith("sea");
  });

  it("marks the active tab aria-selected and the chosen tab with a check mark", () => {
    render(
      <ScenarioTabs
        scenarios={[scenario("air", "Air"), scenario("sea", "Sea")]}
        activeId="sea"
        chosenId="air"
        onSelect={jest.fn()}
        onAdd={jest.fn()}
        onRename={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    expect(screen.getByRole("tab", { name: /Air/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Sea" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Dùng cho Quotation")).toBeInTheDocument();
  });

  it("the add button is disabled once MAX_SCENARIOS is reached, enabled below it", () => {
    const atLimit = Array.from({ length: MAX_SCENARIOS }, (_, i) => scenario(`s${i}`, `S${i}`));
    const { rerender } = render(
      <ScenarioTabs scenarios={atLimit} activeId="s0" chosenId="s0" onSelect={jest.fn()} onAdd={jest.fn()} onRename={jest.fn()} onRemove={jest.fn()} />
    );
    expect(screen.getByRole("button", { name: /Thêm phương án/ })).toBeDisabled();

    rerender(
      <ScenarioTabs scenarios={atLimit.slice(0, -1)} activeId="s0" chosenId="s0" onSelect={jest.fn()} onAdd={jest.fn()} onRename={jest.fn()} onRemove={jest.fn()} />
    );
    expect(screen.getByRole("button", { name: /Thêm phương án/ })).not.toBeDisabled();
  });

  it("clicking Add calls onAdd", async () => {
    const user = userEvent.setup();
    const onAdd = jest.fn();
    render(
      <ScenarioTabs scenarios={[scenario("air", "Air")]} activeId="air" chosenId="air" onSelect={jest.fn()} onAdd={onAdd} onRename={jest.fn()} onRemove={jest.fn()} />
    );
    await user.click(screen.getByRole("button", { name: /Thêm phương án/ }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("renaming: click the pencil, edit the text, press Enter to commit", async () => {
    const user = userEvent.setup();
    const onRename = jest.fn();
    render(
      <ScenarioTabs
        scenarios={[scenario("air", "Air"), scenario("sea", "Sea")]}
        activeId="air"
        chosenId="air"
        onSelect={jest.fn()}
        onAdd={jest.fn()}
        onRename={onRename}
        onRemove={jest.fn()}
      />
    );
    await user.click(screen.getByLabelText("Đổi tên Air"));
    const input = screen.getByLabelText("Tên phương án");
    await user.clear(input);
    await user.type(input, "Air freight{Enter}");
    expect(onRename).toHaveBeenCalledWith("air", "Air freight");
  });

  it("renaming: Escape cancels without calling onRename", async () => {
    const user = userEvent.setup();
    const onRename = jest.fn();
    render(
      <ScenarioTabs
        scenarios={[scenario("air", "Air"), scenario("sea", "Sea")]}
        activeId="air"
        chosenId="air"
        onSelect={jest.fn()}
        onAdd={jest.fn()}
        onRename={onRename}
        onRemove={jest.fn()}
      />
    );
    await user.click(screen.getByLabelText("Đổi tên Air"));
    await user.type(screen.getByLabelText("Tên phương án"), "x{Escape}");
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: /Air/ })).toBeInTheDocument();
  });

  it("clicking remove calls onRemove; the remove button is hidden with only one scenario", async () => {
    const user = userEvent.setup();
    const onRemove = jest.fn();
    const { rerender } = render(
      <ScenarioTabs
        scenarios={[scenario("air", "Air"), scenario("sea", "Sea")]}
        activeId="air"
        chosenId="air"
        onSelect={jest.fn()}
        onAdd={jest.fn()}
        onRename={jest.fn()}
        onRemove={onRemove}
      />
    );
    await user.click(screen.getByLabelText("Xoá phương án Air"));
    expect(onRemove).toHaveBeenCalledWith("air");

    rerender(
      <ScenarioTabs
        scenarios={[scenario("air", "Air")]}
        activeId="air"
        chosenId="air"
        onSelect={jest.fn()}
        onAdd={jest.fn()}
        onRename={jest.fn()}
        onRemove={onRemove}
      />
    );
    expect(screen.queryByLabelText("Xoá phương án Air")).not.toBeInTheDocument();
  });

  it("disabled=true prevents select/rename/remove interactions", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    render(
      <ScenarioTabs
        scenarios={[scenario("air", "Air"), scenario("sea", "Sea")]}
        activeId="air"
        chosenId="air"
        disabled
        onSelect={onSelect}
        onAdd={jest.fn()}
        onRename={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    await user.click(screen.getByRole("tab", { name: /Sea/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
