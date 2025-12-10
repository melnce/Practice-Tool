// src/ui/dom.ts
// Small DOM helpers to keep UI files clean
export const $ = (id) => {
    const el = document.getElementById(id);
    if (!el) {
        throw new Error(`Element with id "${id}" not found`);
    }
    return el;
};
export function byId(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Element with id "${id}" not found. Available IDs:`);
        console.log([...document.querySelectorAll('[id]')].map(el => el.id));
        return null;
    }
    return el;
}
export function clear(el) {
    el.innerHTML = "";
}
export function setDragData(e, payload) {
    e.dataTransfer?.setData("text/plain", payload);
}
export function getDragData(e) {
    return e.dataTransfer?.getData("text/plain") ?? "";
}
export function wireClick(id, handler) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Missing element #${id}`);
        return;
    }
    el.addEventListener("click", handler);
}
