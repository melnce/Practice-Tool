// src/ui/render/reconcile.ts
// Keyed DOM reconciliation — reuse nodes by stable instance id, never clone.

export interface ReconcileItem {
  instanceId: string;
}

export interface ReconcileOptions<T extends ReconcileItem> {
  create: (item: T) => HTMLElement;
  update: (el: HTMLElement, item: T) => void;
  getInstanceId?: (item: T) => string;
}

/**
 * Reconcile `items` into `container` preserving element identity.
 * - Indexes existing children by data-instance-id
 * - Reuses nodes via update(); creates only on first sighting
 * - Reorders with insertBefore (moves nodes, never clones)
 * - Removes DOM for instances no longer present
 */
export function reconcileZone<T extends ReconcileItem>(
  container: HTMLElement,
  items: T[],
  options: ReconcileOptions<T>,
): void {
  const getId = options.getInstanceId ?? ((item) => item.instanceId);

  const existing = new Map<string, HTMLElement>();
  const toRemove = new Set<HTMLElement>();

  for (let i = 0; i < container.children.length; i++) {
    const child = container.children[i] as HTMLElement;
    const id = child.dataset.instanceId;
    if (id) {
      existing.set(id, child);
      toRemove.add(child);
    }
  }

  items.forEach((item, index) => {
    const instanceId = getId(item);
    let el = existing.get(instanceId);

    if (el) {
      toRemove.delete(el);
      options.update(el, item);
    } else {
      el = options.create(item);
      el.dataset.instanceId = instanceId;
    }

    const ref = container.children[index] ?? null;
    if (container.children[index] !== el) {
      container.insertBefore(el, ref);
    }
  });

  toRemove.forEach((el) => el.remove());
}
