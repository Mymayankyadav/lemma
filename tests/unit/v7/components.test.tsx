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
  expect(buttons[1].getAttribute("aria-selected")).toBe("true");
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
it("keeps an undo notification for six seconds then dismisses", async () => {
  vi.useFakeTimers();
  const close = vi.fn();
  await act(async () =>
    root.render(
      <Toast message="Session removed" action="Undo" onClose={close} />,
    ),
  );
  await act(async () => vi.advanceTimersByTime(5999));
  expect(close).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(1));
  expect(close).toHaveBeenCalledOnce();
});
