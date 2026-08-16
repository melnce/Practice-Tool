export function initPerspectiveFlip(): void {
  // Perspective flip toggle (default OFF)
  const flipToggle = document.getElementById(
    "activeOnBottomToggle",
  ) as HTMLInputElement | null;
  if (flipToggle) {
    void import("../ui/render.js").then(
      ({ isActiveOnBottom, setActiveOnBottom }) => {
        flipToggle.checked = isActiveOnBottom();
        flipToggle.addEventListener("change", () => {
          setActiveOnBottom(flipToggle.checked);
        });
      },
    );
  }
}
