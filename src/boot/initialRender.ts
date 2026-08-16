import { render } from "../ui/render.js";

export function initInitialRender(): void {
  try {
    render();
  } catch {
    /* ignore */
  }
}
