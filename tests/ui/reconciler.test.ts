/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { reconcileZone } from "../../src/ui/render/reconcile.js";

interface TestItem {
  instanceId: string;
  label: string;
  atk: number;
}

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

describe("reconcileZone", () => {
  it("preserves node identity when unrelated stats change", () => {
    const container = mount();
    const items: TestItem[] = [{ instanceId: "a", label: "Knight", atk: 2 }];

    reconcileZone(container, items, {
      create: (item) => {
        const el = document.createElement("div");
        el.className = "card";
        el.dataset.label = item.label;
        el.dataset.atk = String(item.atk);
        return el;
      },
      update: (el, item) => {
        el.dataset.label = item.label;
        el.dataset.atk = String(item.atk);
      },
    });

    const firstRef = container.querySelector('[data-instance-id="a"]') as HTMLElement;
    expect(firstRef).toBeTruthy();

    items[0] = { instanceId: "a", label: "Knight", atk: 5 };
    reconcileZone(container, items, {
      create: (item) => {
        const el = document.createElement("div");
        el.dataset.label = item.label;
        el.dataset.atk = String(item.atk);
        return el;
      },
      update: (el, item) => {
        el.dataset.atk = String(item.atk);
      },
    });

    const secondRef = container.querySelector('[data-instance-id="a"]') as HTMLElement;
    expect(secondRef).toBe(firstRef);
    expect(secondRef.dataset.atk).toBe("5");
    expect(secondRef.isConnected).toBe(true);
  });

  it("reorders existing nodes without recreation", () => {
    const container = mount();
    const mk = (id: string, label: string): TestItem => ({ instanceId: id, label, atk: 1 });

    let createCount = 0;
    const options = {
      create: (item: TestItem) => {
        createCount++;
        const el = document.createElement("div");
        el.textContent = item.label;
        return el;
      },
      update: (el: HTMLElement, item: TestItem) => {
        el.textContent = item.label;
      },
    };

    const a = mk("a", "A");
    const b = mk("b", "B");
    const c = mk("c", "C");

    reconcileZone(container, [a, b, c], options);
    const refA = container.children[0] as HTMLElement;
    const refB = container.children[1] as HTMLElement;
    const refC = container.children[2] as HTMLElement;
    expect(createCount).toBe(3);

    reconcileZone(container, [c, a, b], options);
    expect(createCount).toBe(3);
    expect(container.children[0]).toBe(refC);
    expect(container.children[1]).toBe(refA);
    expect(container.children[2]).toBe(refB);
  });

  it("removes destroyed instance nodes and leaves others", () => {
    const container = mount();
    const options = {
      create: (item: TestItem) => {
        const el = document.createElement("div");
        el.textContent = item.label;
        return el;
      },
      update: (el: HTMLElement, item: TestItem) => {
        el.textContent = item.label;
      },
    };

    reconcileZone(
      container,
      [
        { instanceId: "keep", label: "Keep", atk: 1 },
        { instanceId: "gone", label: "Gone", atk: 1 },
      ],
      options,
    );

    const keepRef = container.querySelector('[data-instance-id="keep"]') as HTMLElement;
    reconcileZone(container, [{ instanceId: "keep", label: "Keep", atk: 2 }], options);

    expect(container.querySelector('[data-instance-id="gone"]')).toBeNull();
    expect(container.children.length).toBe(1);
    expect(container.children[0]).toBe(keepRef);
  });
});
