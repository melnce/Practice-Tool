// src/ui/motion/motion.ts — config, guards, and WAAPI wrapper

export type MotionSpeed = "normal" | "fast" | "instant";

const STORAGE_KEY = "svwb_ui_settings";

export interface MotionSettings {
  speed: MotionSpeed;
}

const SPEED_MULTIPLIER: Record<MotionSpeed, number> = {
  normal: 1,
  fast: 0.5,
  instant: 0,
};

let cachedSettings: MotionSettings | null = null;

function readSettings(): MotionSettings {
  if (cachedSettings) return cachedSettings;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MotionSettings>;
      if (parsed.speed === "normal" || parsed.speed === "fast" || parsed.speed === "instant") {
        cachedSettings = { speed: parsed.speed };
        return cachedSettings;
      }
    }
  } catch {
    /* ignore */
  }
  cachedSettings = { speed: "normal" };
  return cachedSettings;
}

function writeSettings(settings: MotionSettings): void {
  cachedSettings = settings;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function getMotionSettings(): MotionSettings {
  return readSettings();
}

export function setMotionSpeed(speed: MotionSpeed): void {
  writeSettings({ speed });
  document.documentElement.dataset.motionSpeed = speed;
}

export function motionEnabled(): boolean {
  if ((globalThis as { HEADLESS?: boolean }).HEADLESS) return false;
  if (readSettings().speed === "instant") return false;
  if (typeof Element === "undefined" || typeof Element.prototype.animate !== "function") {
    return false;
  }
  if (typeof window !== "undefined" && window.matchMedia) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  }
  return true;
}

export function dur(tokenMs: number): number {
  const mult = SPEED_MULTIPLIER[readSettings().speed] ?? 1;
  return Math.round(tokenMs * mult);
}

const activeAnimations = new WeakMap<Element, Animation>();

function applyFinalKeyframe(el: Element, keyframes: Keyframe[]): void {
  const last = keyframes[keyframes.length - 1];
  if (!last || typeof last !== "object") return;
  const style = (el as HTMLElement).style;
  for (const [key, value] of Object.entries(last)) {
    if (key === "offset" || key === "easing" || key === "composite") continue;
    if (value == null) continue;
    const cssKey = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    style.setProperty(cssKey, String(value));
  }
}

const EASING_RESOLVE: Record<string, string> = {
  "var(--ease-out)": "cubic-bezier(0.22, 0.61, 0.36, 1)",
  "var(--ease-spring)": "cubic-bezier(0.34, 1.4, 0.4, 1)",
};

function resolveEasing(easing: string | undefined): string {
  if (!easing) return "ease";
  return EASING_RESOLVE[easing] ?? easing;
}

export function animate(
  el: Element,
  keyframes: Keyframe[],
  opts: KeyframeAnimationOptions = {},
): Promise<void> {
  const prev = activeAnimations.get(el);
  if (prev) {
    prev.cancel();
    activeAnimations.delete(el);
  }

  if (!motionEnabled()) {
    applyFinalKeyframe(el, keyframes);
    return Promise.resolve();
  }

  const duration = dur(
    typeof opts.duration === "number" ? opts.duration : 200,
  );
  if (duration <= 0) {
    applyFinalKeyframe(el, keyframes);
    return Promise.resolve();
  }

  const htmlEl = el as HTMLElement;
  htmlEl.style.willChange = "transform, opacity";

  const anim = htmlEl.animate(keyframes, {
    ...opts,
    duration,
    easing: resolveEasing(
      typeof opts.easing === "string" ? opts.easing : undefined,
    ),
    composite: "replace",
    fill: opts.fill ?? "forwards",
  });
  activeAnimations.set(el, anim);

  return new Promise<void>((resolve) => {
    const finish = () => {
      htmlEl.style.willChange = "";
      activeAnimations.delete(el);
      applyFinalKeyframe(el, keyframes);
      resolve();
    };
    anim.addEventListener("finish", finish, { once: true });
    anim.addEventListener("cancel", finish, { once: true });
  });
}

export function wireMotionSettingsUi(): void {
  const gear = document.getElementById("motionGearBtn");
  const popover = document.getElementById("motionPopover");
  if (!gear || !popover) return;

  const speed = readSettings().speed;
  document.documentElement.dataset.motionSpeed = speed;
  const radio = popover.querySelector<HTMLInputElement>(
    `input[name="motionSpeed"][value="${speed}"]`,
  );
  if (radio) radio.checked = true;

  gear.addEventListener("click", (e) => {
    e.stopPropagation();
    const hidden = popover.hasAttribute("hidden");
    if (hidden) popover.removeAttribute("hidden");
    else popover.setAttribute("hidden", "");
  });

  popover.querySelectorAll<HTMLInputElement>('input[name="motionSpeed"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      setMotionSpeed(input.value as MotionSpeed);
    });
  });

  document.addEventListener("click", (e) => {
    if (!popover.contains(e.target as Node) && e.target !== gear) {
      popover.setAttribute("hidden", "");
    }
  });
}
