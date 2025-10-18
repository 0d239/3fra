// Minimal progressive enhancement (no frameworks).
// 1) Hydrate text content from CSS custom properties (so the site is readable in DOM, not just ::before)
// 2) Run a persistent album player widget (playlist switching + lyric fetch + PJAX-aware navigation)
// 3) Toggle glitch/tilt with keyboard shortcuts

(function(){
  const PLAYER_MODES = { EXPANDED: 'expanded', COMPACT: 'compact' };

  const unquote = (s) => (s || '').trim().replace(/^["']|["']$/g, '');
  const decodeCSSString = (s) => unquote(s).replace(/\\A/g, '\n').replace(/\\"/g, '"').replace(/\\'/g, "'");

  function hydrateFromCSSVars(el){
    const cs = getComputedStyle(el);
    el.querySelectorAll('[data-fallback]').forEach((node) => {
      const expr = node.getAttribute('data-fallback');
      const match = expr ? expr.match(/var\((--[a-zA-Z0-9\-_]+)\)/) : null;
      if (!match) return;
      const val = cs.getPropertyValue(match[1]);
      if (val && !node.textContent.trim()) {
        node.textContent = decodeCSSString(val);
      }
    });
  }

  function hydrateBlurbs(root){
    (root || document).querySelectorAll('.blurb').forEach(hydrateFromCSSVars);
  }

  function applyGlitchAttributes(root){
    (root || document).querySelectorAll('.glitch').forEach((el) => {
      el.setAttribute('text', el.textContent);
    });
  }

  function keyboard(){
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'g') {
        document.querySelectorAll('.ascii').forEach((el) => el.classList.toggle('glitch'));
      }
      if (e.key.toLowerCase() === 't') {
        document.querySelectorAll('.tilt').forEach((el) => el.classList.toggle('tilt'));
      }
    });
  }

  function year(){
    const span = document.querySelector('[data-now-year]');
    if (span) span.textContent = new Date().getFullYear();
  }

  let albumController = null;

  function initAlbumPlayer(){
    if (albumController) return albumController;

    const player = document.querySelector('.album-player');
    if (!player) return null;

    const audio = player.querySelector('.album-audio');
    const buttons = Array.from(player.querySelectorAll('.album-track-button'));
    if (!audio || !buttons.length) return null;

    const nowTitle = player.querySelector('.album-current-title');
    const metaEl = player.querySelector('.album-current-meta');
    const details = player.querySelector('.album-lyrics');
    const transcriptEl = details?.querySelector('.transcript-body') || null;
    const toggleButton = player.querySelector('.album-toggle');
    const toggleLabel = toggleButton?.querySelector('.album-toggle-label') || toggleButton;
    const placeholder = transcriptEl?.dataset.placeholder || 'open to fetch lyrics';

    if (transcriptEl && !transcriptEl.textContent.trim()) {
      transcriptEl.textContent = placeholder;
    }

    let currentButton = buttons.find((btn) => btn.closest('.album-track')?.classList.contains('is-active')) || buttons[0];
    if (!currentButton) {
      currentButton = buttons[0];
    }

    function setActiveButton(button){
      currentButton = button;
      buttons.forEach((btn) => {
        const active = btn === button;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
        const item = btn.closest('.album-track');
        if (item) {
          item.classList.toggle('is-active', active);
        }
      });

      const title = button.dataset.title?.trim() || button.textContent.trim();
      if (nowTitle) {
        nowTitle.textContent = title;
      }

      if (metaEl) {
        const parts = [];
        const yearValue = button.dataset.year?.trim();
        const desc = button.dataset.description?.trim();
        if (yearValue) parts.push(yearValue);
        if (desc) parts.push(desc);
        if (parts.length) {
          metaEl.textContent = parts.join(' — ');
          metaEl.hidden = false;
        } else {
          metaEl.textContent = '';
          metaEl.hidden = true;
        }
      }

      const transcript = button.dataset.transcript?.trim() || '';
      player.dataset.transcript = transcript;
      if (transcriptEl) {
        transcriptEl.dataset.loaded = '';
        transcriptEl.dataset.current = '';
        if (transcript) {
          transcriptEl.textContent = placeholder;
        } else {
          transcriptEl.textContent = '(no transcript)';
          transcriptEl.dataset.loaded = '1';
        }
      }

      if (button.dataset.slug) {
        player.setAttribute('data-active-track', button.dataset.slug);
      } else {
        player.removeAttribute('data-active-track');
      }
    }

    async function loadLyrics(){
      if (!details?.open || !transcriptEl) return;
      const transcript = (player.dataset.transcript || '').trim();
      if (!transcript) {
        transcriptEl.textContent = '(no transcript)';
        transcriptEl.dataset.loaded = '1';
        transcriptEl.dataset.current = '';
        return;
      }
      if (transcriptEl.dataset.loaded === '1' && transcriptEl.dataset.current === transcript) {
        return;
      }
      transcriptEl.textContent = 'loading lyrics…';
      try {
        const res = await fetch(transcript);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const text = await res.text();
        transcriptEl.textContent = text.trim() ? text : '(blank transcript)';
      } catch (err) {
        transcriptEl.textContent = '(error loading transcript)';
      } finally {
        transcriptEl.dataset.loaded = '1';
        transcriptEl.dataset.current = transcript;
      }
    }

    function setTrack(button, { autoplay = false } = {}){
      if (!button || !audio) return;
      const newSrc = button.dataset.audio?.trim();
      if (!newSrc) return;

      const wasPlaying = !audio.paused && !audio.ended;
      const shouldAutoplay = autoplay || wasPlaying;
      const sourceChanged = audio.getAttribute('src') !== newSrc;

      if (sourceChanged) {
        audio.setAttribute('src', newSrc);
        if (!shouldAutoplay) {
          audio.pause();
          try {
            audio.currentTime = 0;
          } catch (err) {
            /* ignore */
          }
        }
      }

      setActiveButton(button);

      if (details?.open) {
        loadLyrics();
      }

      if (shouldAutoplay) {
        audio.play().catch(() => {});
      }
    }

    function focusTrack(index){
      if (index < 0 || index >= buttons.length) return;
      buttons[index].focus();
    }

    function focusRelative(offset){
      const currentIndex = buttons.indexOf(currentButton);
      const base = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex = (base + offset + buttons.length) % buttons.length;
      focusTrack(nextIndex);
      setTrack(buttons[nextIndex], { autoplay: false });
    }

    function handleKeyNavigation(button, event){
      switch (event.key) {
        case 'ArrowUp':
        case 'ArrowLeft':
          event.preventDefault();
          focusRelative(-1);
          break;
        case 'ArrowDown':
        case 'ArrowRight':
          event.preventDefault();
          focusRelative(1);
          break;
        case 'Home':
          event.preventDefault();
          focusTrack(0);
          setTrack(buttons[0], { autoplay: false });
          break;
        case 'End':
          event.preventDefault();
          focusTrack(buttons.length - 1);
          setTrack(buttons[buttons.length - 1], { autoplay: false });
          break;
        default:
          break;
      }
    }

    buttons.forEach((button) => {
      button.addEventListener('click', () => setTrack(button, { autoplay: true }));
      button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setTrack(button, { autoplay: true });
        } else {
          handleKeyNavigation(button, event);
        }
      });
    });

    details?.addEventListener('toggle', () => {
      if (details.open) {
        loadLyrics();
      }
    });

    function setMode(mode, { force = false } = {}){
      const next = mode === PLAYER_MODES.EXPANDED ? PLAYER_MODES.EXPANDED : PLAYER_MODES.COMPACT;
      if (!force && player.dataset.playerMode === next) {
        return;
      }
      player.dataset.playerMode = next;
      player.classList.toggle('is-compact', next !== PLAYER_MODES.EXPANDED);
      if (toggleButton) {
        toggleButton.setAttribute('aria-expanded', next === PLAYER_MODES.EXPANDED ? 'true' : 'false');
        if (toggleLabel) {
          toggleLabel.textContent = next === PLAYER_MODES.EXPANDED ? 'collapse console' : 'open console';
        }
      }
      if (details && next !== PLAYER_MODES.EXPANDED) {
        details.open = false;
      }
    }

    function getMode(){
      return player.dataset.playerMode === PLAYER_MODES.EXPANDED ? PLAYER_MODES.EXPANDED : PLAYER_MODES.COMPACT;
    }

    toggleButton?.addEventListener('click', () => {
      const next = getMode() === PLAYER_MODES.EXPANDED ? PLAYER_MODES.COMPACT : PLAYER_MODES.EXPANDED;
      setMode(next, { force: true });
      if (next === PLAYER_MODES.EXPANDED && details && details.open) {
        loadLyrics();
      }
    });

    const initialMode = player.dataset.playerMode === PLAYER_MODES.EXPANDED ? PLAYER_MODES.EXPANDED : PLAYER_MODES.COMPACT;
    setMode(initialMode, { force: true });
    setTrack(currentButton, { autoplay: false });

    player.dataset.jsInit = '1';

    albumController = {
      setMode,
      getMode,
      expand: () => setMode(PLAYER_MODES.EXPANDED, { force: true }),
      compact: () => setMode(PLAYER_MODES.COMPACT, { force: true })
    };

    return albumController;
  }

  function updateAlbumPlayerModeForPage(pageId){
    const controller = initAlbumPlayer();
    if (!controller) return;
    if (pageId === 'tracks') {
      controller.expand();
    } else {
      controller.compact();
    }
  }

  function updateNavActive(pageId){
    document.querySelectorAll('.nav-link').forEach((link) => {
      const href = link.getAttribute('href') || '';
      const key = href.replace(/\.html$/, '').replace(/\/$/, '');
      if (key && key === pageId) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function initPjax(){
    const main = document.querySelector('main');
    if (!main) return;

    let navigating = false;

    function ensureStyles(head){
      const existing = new Set(
        Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'))
          .map((link) => new URL(link.getAttribute('href'), window.location.href).href)
      );

      head.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
        const href = link.getAttribute('href');
        if (!href) return;
        const absolute = new URL(href, window.location.href).href;
        if (existing.has(absolute)) return;
        const clone = link.cloneNode(true);
        document.head.appendChild(clone);
        existing.add(absolute);
      });
    }

    function syncMeta(head){
      const incomingDescription = head.querySelector('meta[name="description"]');
      const currentDescription = document.head.querySelector('meta[name="description"]');
      if (incomingDescription) {
        const content = incomingDescription.getAttribute('content') || '';
        if (currentDescription) {
          currentDescription.setAttribute('content', content);
        } else {
          const clone = incomingDescription.cloneNode(true);
          document.head.appendChild(clone);
        }
      }
    }

    function syncBodyAttributes(fromBody){
      if (!fromBody) return;
      document.body.className = fromBody.className;
      Array.from(document.body.attributes).forEach((attr) => {
        if (attr.name.startsWith('data-')) {
          document.body.removeAttribute(attr.name);
        }
      });
      Array.from(fromBody.attributes).forEach((attr) => {
        if (attr.name.startsWith('data-')) {
          document.body.setAttribute(attr.name, attr.value);
        }
      });
    }

    async function load(url, { push = true, scrollToTop = true } = {}){
      let target;
      try {
        target = new URL(url, window.location.href);
      } catch (err) {
        window.location.href = url;
        return;
      }

      if (target.origin !== window.location.origin) {
        window.location.href = target.href;
        return;
      }

      if (navigating) return;
      navigating = true;

      try {
        const res = await fetch(target.href, { headers: { 'X-Requested-With': 'Codex-PJAX' } });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const newMain = doc.querySelector('main');
        if (!newMain) {
          throw new Error('Missing <main> in response');
        }

        ensureStyles(doc.head || document.head);
        syncMeta(doc.head || document.head);
        syncBodyAttributes(doc.body || document.body);

        main.innerHTML = newMain.innerHTML;
        document.title = doc.querySelector('title')?.textContent || document.title;

        applyGlitchAttributes(document);
        hydrateBlurbs(document);
        year();

        const pageId = document.body.dataset.page || '';
        updateNavActive(pageId);
        updateAlbumPlayerModeForPage(pageId);

        if (scrollToTop) {
          window.scrollTo(0, 0);
        }

        if (push) {
          history.pushState({ url: target.href }, '', target.href);
        }
      } catch (err) {
        console.error('[pjax]', err);
        window.location.href = target.href;
      } finally {
        navigating = false;
      }
    }

    function handleClick(event){
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest('a');
      if (!anchor) return;
      if (anchor.hasAttribute('download')) return;
      if (anchor.target && anchor.target.toLowerCase() !== '_self') return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      if (anchor.dataset.noPjax === 'true') return;

      let target;
      try {
        target = new URL(href, window.location.href);
      } catch (err) {
        return;
      }

      if (target.origin !== window.location.origin) return;

      event.preventDefault();

      if (target.href === window.location.href) return;

      load(target.href, { push: true, scrollToTop: true });
    }

    document.addEventListener('click', handleClick);

    window.addEventListener('popstate', (event) => {
      const url = event.state?.url || window.location.href;
      load(url, { push: false, scrollToTop: false });
    });

    history.replaceState({ url: window.location.href }, '', window.location.href);
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyGlitchAttributes(document);
    hydrateBlurbs(document);
    keyboard();
    year();

    updateNavActive(document.body.dataset.page || '');
    updateAlbumPlayerModeForPage(document.body.dataset.page || '');

    initAlbumPlayer();
    initPjax();
  });
})();
