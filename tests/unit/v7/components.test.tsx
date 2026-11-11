import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  Button,
  Sheet,
  Segmented,
  Stepper,
  Checkbox,
  Toast,
  Chip,
  Meter,
  Field,
  Slider,
  RadioOption,
  Banner,
} from "../../../src/ui/v7/components";
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});
it("keeps a loading action named and blocks repeated activation", async () => {
  const click = vi.fn();
  await act(async () =>
    root.render(
      <Button loading onClick={click}>
        Save intention
      </Button>,
    ),
  );
  const button = host.querySelector("button")!;
  expect(button.textContent).toBe("Save intention");
  expect(button.disabled).toBe(true);
  expect(button.getAttribute("aria-busy")).toBe("true");
  button.click();
  expect(click).not.toHaveBeenCalled();
});
it("moves a segmented choice with arrows and keeps only one tab stop", async () => {
  function Demo() {
    const [value, setValue] = useState("Day");
    return (
      <Segmented
        label="Theme"
        options={["Day", "Night"]}
        value={value}
        onChange={setValue}
      />
    );
  }
  await act(async () => root.render(<Demo />));
  const buttons = host.querySelectorAll("button");
  buttons[0].focus();
  await act(async () =>
    buttons[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(buttons[1]);
  expect(buttons[1].getAttribute("aria-checked")).toBe("true");
  expect(buttons[0].tabIndex).toBe(-1);
});
it("opens a native modal, cancels on Escape and returns focus after closing", async () => {
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  const close = vi.fn();
  await act(async () =>
    root.render(
      <Sheet
        open
        title="Session"
        onClose={close}
        footer={<Button>Save</Button>}
      >
        <input aria-label="Intention" />
      </Sheet>,
    ),
  );
  expect(host.querySelector("dialog")?.open).toBe(true);
  expect(document.body.style.overflow).toBe("hidden");
  await act(async () =>
    host
      .querySelector("dialog")!
      .dispatchEvent(new Event("cancel", { cancelable: true })),
  );
  expect(close).toHaveBeenCalledOnce();
  await act(async () => root.render(<></>));
  expect(document.activeElement).toBe(trigger);
  expect(document.body.style.overflow).toBe("");
  trigger.remove();
});
it("enforces stepper bounds and exposes an indeterminate checkbox", async () => {
  const change = vi.fn();
  await act(async () =>
    root.render(
      <>
        <Stepper label="Sessions" value={0} min={0} max={5} onChange={change} />
        <Checkbox
          label="Some selected"
          checked={false}
          mixed
          onChange={change}
        />
      </>,
    ),
  );
  const buttons = host.querySelectorAll("button");
  buttons[0].click();
  expect(change).not.toHaveBeenCalled();
  buttons[1].click();
  expect(change).toHaveBeenCalledWith(1);
  expect(host.querySelector("input")!.indeterminate).toBe(true);
});
it("keeps an undo notification for eight seconds then dismisses", async () => {
  vi.useFakeTimers();
  const close = vi.fn();
  await act(async () =>
    root.render(
      <Toast message="Session removed" action="Undo" onClose={close} />,
    ),
  );
  await act(async () => vi.advanceTimersByTime(7999));
  expect(close).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(1));
  expect(close).toHaveBeenCalledOnce();
});

it("separates ready, completed and mastery indicators from subject identity", async () => {
  await act(async () =>
    root.render(
      <>
        <Chip kind="ready">Ready to begin</Chip>
        <Chip kind="status">Complete</Chip>
        <Chip kind="mastery">Demonstrated</Chip>
        <Meter label="Complete" value={100} subject={8} />
        <Meter label="In progress" value={45} subject={2} />
      </>,
    ),
  );
  expect(host.querySelector(".v7-badge.v7-tone-info svg")).not.toBeNull();
  expect(host.querySelector(".v7-badge.v7-tone-success svg")).not.toBeNull();
  expect(host.querySelector(".v7-badge .v7-proof")?.textContent).toBe("∎");
  expect(host.querySelector('[role="meter"][aria-label="Complete"]')?.getAttribute("aria-valuetext")).toBe("Complete");
  expect(host.querySelector(".v7-meter-row[data-complete=true]")).not.toBeNull();
  expect(host.querySelector(".v7-meter-row[data-complete=false]")).not.toBeNull();
});
it("exposes filled slider progress, visible loading text and distinct read-only fields", async () => {
  await act(async () =>
    root.render(
      <>
        <Slider label="Length" value={45} onChange={() => {}} />
        <Field label="Pinned title" value="Compactness" readOnly />
        <Field label="Unavailable" disabled placeholder="Not available" />
        <Button loading>Saving changes</Button>
      </>,
    ),
  );
  expect(host.querySelector('input[type="range"]')?.getAttribute("style")).toContain("--v7-range-progress: 45%");
  expect(host.querySelector('input[readonly]')?.getAttribute("aria-describedby")).toMatch(/-readonly$/);
  expect(host.querySelector(".v7-readonly-note")?.textContent).toContain("Read only");
  expect(host.querySelector('input[disabled]')).not.toBeNull();
  expect(host.querySelector(".v7-button > span")?.textContent).toBe("Saving changes");
  expect(host.querySelector(".v7-spinner")?.getAttribute("aria-hidden")).toBe("true");
});
it("shows radio choices and a non-expiring toast preview", async () => {
  vi.useFakeTimers();
  const close = vi.fn(), change = vi.fn();
  await act(async () =>
    root.render(
      <>
        <RadioOption label="Fast" name="pace" checked onChange={change} />
        <RadioOption label="Slow" name="pace" checked={false} onChange={change} />
        <Toast preview message="Session removed" onClose={close} />
        <Banner tone="critical" action="Retry" onAction={() => {}}>Could not save your changes.</Banner>
      </>,
    ),
  );
  expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(2);
  expect(host.querySelector(".v7-toast-preview")?.getAttribute("role")).toBe("group");
  expect(host.querySelector(".v7-banner.v7-critical svg")).not.toBeNull();
  await act(async () => vi.advanceTimersByTime(7000));
  expect(close).not.toHaveBeenCalled();
});
