// src/ui/dom.ts

// Small DOM helpers to keep UI files clean
export const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) {
        throw new Error(`Element with id "${id}" not found`);
    }
    return el;
};

export function byId(id: string): HTMLElement | null {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Element with id "${id}" not found. Available IDs:`);
        console.log([...document.querySelectorAll('[id]')].map(el => el.id));
        return null;
    }
    return el;
}

export function clear(el: HTMLElement) {
    el.innerHTML = "";
}

export function setDragData(e: DragEvent, payload: string) {
    e.dataTransfer?.setData("text/plain", payload);
}

export function getDragData(e: DragEvent): string {
    return e.dataTransfer?.getData("text/plain") ?? "";
}

export function wireClick(id: string, handler: (e: MouseEvent) => void) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Missing element #${id}`);
        return;
    }
    el.addEventListener("click", handler);
}
