(async () => {
  async function refreshForLatestRelease() {
    try {
      const manifestUrl = new URL('version.json', location.href);
      manifestUrl.searchParams.set('_', Date.now().toString());

      const response = await fetch(manifestUrl, { cache: 'no-store' });
      if (!response.ok) return false;

      const { version } = await response.json();
      if (!version) return false;

      const currentUrl = new URL(location.href);
      if (currentUrl.searchParams.get('v') === version) return false;

      currentUrl.searchParams.set('v', version);
      location.replace(currentUrl);
      return true;
    } catch (error) {
      console.warn('Could not check for a newer Splatris release.', error);
      return false;
    }
  }

  if (await refreshForLatestRelease()) return;

  const screens = new Map(
    [...document.querySelectorAll('[data-screen]')].map(screen => [screen.dataset.screen, screen])
  );
  let gameHost = document.getElementById('game-component');
  let gameLoadPromise = null;
  let selectedRole = sessionStorage.getItem('splatris-role') || 'platformer';
  let loadedRole = null;

  function screenFromLocation() {
    const hash = location.hash.slice(1);
    if (new URLSearchParams(hash).has('join')) return 'multiplayer';
    return screens.has(hash) ? hash : 'menu';
  }

  function resetGameHostForRole() {
    if (!gameHost.shadowRoot || loadedRole === selectedRole) return;
    const replacement = gameHost.cloneNode(false);
    gameHost.replaceWith(replacement);
    gameHost = replacement;
    gameLoadPromise = null;
    loadedRole = null;
  }

  async function loadGameComponent() {
    resetGameHostForRole();
    if (gameHost.shadowRoot) return;
    if (gameLoadPromise) return gameLoadPromise;

    gameLoadPromise = (async () => {
      const response = await fetch('splatris.html', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not load single-player demo (${response.status}).`);

      let source = await response.text();
      if (typeof window.patchSplatrisSource === 'function') {
        source = window.patchSplatrisSource(source, selectedRole);
      }
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
      loadedRole = selectedRole;
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
      const nextUrl = new URL(location.href);
      nextUrl.hash = target === 'menu' ? '' : target;
      history.replaceState(null, '', nextUrl);
    }
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-open-screen]');
    if (!trigger) return;
    if (trigger.dataset.gameRole) {
      selectedRole = trigger.dataset.gameRole;
      sessionStorage.setItem('splatris-role', selectedRole);
    }
    showScreen(trigger.dataset.openScreen).catch(console.error);
  });

  window.addEventListener('hashchange', () => {
    showScreen(screenFromLocation(), false).catch(console.error);
  });

  showScreen(screenFromLocation(), false).catch(console.error);
})();
