// src/ui/choiceModal.ts
export function showChoiceModal(options, callback) {
    const modal = document.createElement('div');
    modal.className = 'choice-modal';
    modal.innerHTML = `
    <div class="choice-modal-content">
      <h3>Choose an effect:</h3>
      <div class="choice-options">
        ${options.map((opt, i) => `
          <button class="choice-option" data-index="${i}">
            ${opt.label}
            ${opt.requires?.earth_rite ? `<span class="earth-rite-cost">(Consume ${opt.requires.earth_rite} Earth Sigil)</span>` : ''}
          </button>
        `).join('')}
      </div>
    </div>
  `;
    // Add click handlers
    modal.querySelectorAll('.choice-option').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.add('processing');
            // @ts-ignore
            const index = parseInt(btn.dataset.index);
            document.body.removeChild(modal);
            callback(index);
        });
    });
    // Add to DOM and show
    document.body.appendChild(modal);
}
