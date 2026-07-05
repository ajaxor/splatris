(() => {
  const screens = new Map(
    [...document.querySelectorAll('[data-screen]')].map(screen => [screen.dataset.screen, screen])
  );
  const gameHost = document.getElementById('game-component');
  let gameLoadPromise = null;

  function screenFromLocation() {
    const hash = location.hash.slice(1);
    if (new URLSearchParams(hash).has('join')) return 'multiplayer';
    return screens.has(hash) ? hash : 'menu';
  }

  async function loadGameComponent() {
    if (gameHost.shadowRoot) return;
    if (gameLoadPromise) return gameLoadPromise;

    gameLoadPromise = (async () => {
      const response = await fetch('splatris.html', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not load single-player demo (${response.status}).`);

      const source = await response.text();
      const parsed = new DOMParser().parseFromString(source, 'text/html');
      const styleText = parsed.querySelector('style')?.textContent ?? '';
      const scriptText = parsed.querySelector('script')?.textContent ?? '';

      parsed.querySelectorAll('script').forEach(script => script.remove());
      const root = gameHost.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = styleText
        .replace(/html\s*,\s*body/g, ':host')
        .replace(/:root/g, ':host')
        .concat('\n:host { min-height:100svh; display:flex; align-items:center; justify-content:center; }');
      root.append(style, ...parsed.body.childNodes);

      const isolatedScript = scriptText
        .replaceAll('document.getElementById', 'root.getElementById')
        .replaceAll('document.querySelectorAll', 'root.querySelectorAll');
      new Function('root', isolatedScript)(root);
    })().catch(error => {
      gameLoadPromise = null;
      gameHost.textContent = error.message;
      throw error;
    });

    return gameLoadPromise;
  }

  async function showScreen(name, updateHash = true) {
    const target = screens.has(name) ? name : 'menu';
    if (target === 'game') await loadGameComponent();

    for (const [screenName, screen] of screens) {
      screen.hidden = screenName !== target;
    }
    document.body.dataset.activeScreen = target;

    if (updateHash) {
      const nextUrl = target === 'menu'
        ? `${location.pathname}${location.search}`
        : `${location.pathname}${location.search}#${target}`;
      history.replaceState(null, '', nextUrl);
    }
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-open-screen]');
    if (!trigger) return;
    showScreen(trigger.dataset.openScreen).catch(console.error);
  });

  window.addEventListener('hashchange', () => {
    showScreen(screenFromLocation(), false).catch(console.error);
  });

  showScreen(screenFromLocation(), false).catch(console.error);
})();