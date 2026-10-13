// Mock of Threads' post menu and block confirmation (October 2026):
// More (…) → role="menu" → "Block" → role="dialog" "Block name?" → Block.
// Each post's author is in data-author on its More button. Blocks are
// logged to localStorage "threadsLog", which the tests read.
(() => {
  const log = (s) => {
    const all = JSON.parse(localStorage.getItem('threadsLog') || '[]');
    all.push(s);
    localStorage.setItem('threadsLog', JSON.stringify(all));
  };
  const button = (label) => `<div role="button" tabindex="0"><span>${label}</span></div>`;
  const close = () => document.querySelectorAll('.mock-layer').forEach((el) => el.remove());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  document.addEventListener('click', (e) => {
    const more = e.target.closest('[aria-haspopup="menu"]');
    if (more) {
      close();
      const who = more.dataset.author;
      more.setAttribute('aria-expanded', 'true');
      // Opens with a delay, like Threads'.
      setTimeout(() => {
        const m = document.createElement('div');
        m.className = 'mock-layer';
        const block = more.dataset.noBlock ? '' : '<div role="menuitem" tabindex="0" class="block-item"><span>Block</span></div>';
        // Threads first shows an empty placeholder menu, then replaces it
        // with a new menu element.
        m.innerHTML = '<div role="menu"><div role="progressbar">Loading…</div></div>';
        m.dataset.author = who;
        document.body.appendChild(m);
        setTimeout(() => {
          m.innerHTML = `<div role="menu">
          <div role="group"><div role="menuitem" tabindex="0"><span>Copy link</span></div></div></div>`;
        }, 200);
        // Like Threads', the Mute / Restrict / Block / Report group renders
        // after the rest of the menu.
        setTimeout(() => {
          m.querySelector('[role="menu"]').insertAdjacentHTML('beforeend', `
          <div role="group"><div role="menuitem" tabindex="0"><span>Mute</span></div>
          <div role="menuitem" tabindex="0"><span>Restrict</span></div>${block}
          <div role="menuitem" tabindex="0"><span>Report</span></div></div>`);
        }, 400);
      }, 120);
      return;
    }
    const item = e.target.closest('.block-item');
    if (item) {
      const who = item.closest('.mock-layer').dataset.author;
      close();
      const shown = who === 'mismatch.mike' ? 'someone.else' : who;
      const d = document.createElement('div');
      d.className = 'mock-layer';
      d.innerHTML = `<div role="dialog" aria-modal="true"><div aria-hidden="false">
        <h2 tabindex="-1">Block ${shown}?</h2>
        <span>${shown} won't be able to find your profile or content.</span>
        ${button('Block')}${button('Cancel')}</div></div>`;
      d.querySelector('[role="button"]').addEventListener('click', () => {
        log(`blocked:${who}`);
        setTimeout(close, 100);
      });
      d.querySelectorAll('[role="button"]')[1].addEventListener('click', () => {
        log(`cancelled:${who}`);
        close();
      });
      document.body.appendChild(d);
    }
  });
})();
