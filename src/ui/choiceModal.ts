// src/ui/choiceModal.ts
export function showChoiceModal(
  options: any[],
  callback: (index: number) => void,
) {
  const modal = document.createElement("div");
  modal.className = "choice-modal";
  modal.innerHTML = `
    <div class="choice-modal-content">
      <h3>Choose an effect:</h3>
      <div class="choice-options">
        ${options
          .map(
            (opt, i) => `
          <button class="choice-option" data-index="${i}">
            ${opt.label || opt.name}
            ${opt.requires?.earth_rite ? `<span class="earth-rite-cost">(Consume ${opt.requires.earth_rite} Earth Sigil)</span>` : ""}
          </button>
        `,
          )
          .join("")}
      </div>
    </div>
  `;

  // Add click handlers
  modal.querySelectorAll(".choice-option").forEach((btn: Element) => {
    const el = btn as HTMLElement;
    el.addEventListener("click", () => {
      el.classList.add("processing");
      const index = parseInt(el.dataset.index || "0");
      document.body.removeChild(modal);
      callback(index);
    });
  });

  // Add to DOM and show
  document.body.appendChild(modal);
}














