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
  const navigationPlayback = { active: false, shouldResume: false };

  function initAlbumPlayer(){
    if (albumController) return albumController;

    const player = document.querySelector('.album-player');
    if (!player) return null;

    const audio = player.querySelector('.album-audio');
    const buttons = Array.from(player.querySelectorAll('.album-track-button'));
    if (!audio || !buttons.length) return null;

    if (audio.controls) {
      audio.controls = false;
      audio.removeAttribute('controls');
    }

    const nowTitle = player.querySelector('.album-current-title');
    const metaEl = player.querySelector('.album-current-meta');
    const details = player.querySelector('.album-lyrics');
    const annotationsRoot = details?.querySelector('.album-annotations') || null;
    const annotationTabs = annotationsRoot ? Array.from(annotationsRoot.querySelectorAll('.album-annotations-tab')) : [];
    const annotationBodies = annotationsRoot ? Array.from(annotationsRoot.querySelectorAll('.album-annotations-body')) : [];
    const toggleButton = player.querySelector('.album-toggle');
    const toggleLabel = toggleButton?.querySelector('.album-toggle-label') || toggleButton;
    const skipPrevButton = player.querySelector('.album-skip-prev');
    const skipNextButton = player.querySelector('.album-skip-next');
    const playToggleButton = player.querySelector('.album-play-toggle');
    const playLabel = playToggleButton?.querySelector('.album-play-label') || null;
    const playIcon = playToggleButton?.querySelector('.album-console-icon') || null;
    const coverToggle = player.querySelector('.album-cover-toggle');
    const volumeInput = player.querySelector('.album-volume-input');
    const volumeAscii = player.querySelector('.album-volume-ascii');
    const volumeDisplay = player.querySelector('.album-volume-display');
    const progressInput = player.querySelector('.album-progress-input');
    const progressAscii = player.querySelector('.album-progress-ascii');
    const progressCurrent = player.querySelector('.album-progress-current');
    const progressDuration = player.querySelector('.album-progress-duration');
    const annotationsConfig = {};
    let activeAnnotation = annotationsRoot?.dataset.active?.trim().toLowerCase() || 'lyrics';

    annotationBodies.forEach((body) => {
      const view = body.dataset.view?.trim().toLowerCase();
      if (!view) return;
      annotationsConfig[view] = {
        body,
        placeholder: body.dataset.placeholder || '',
        loadingText: body.dataset.loadingText || 'loading…',
        emptyText: body.dataset.emptyText || '',
        errorText: body.dataset.errorText || '(error loading)'
      };
      if (!body.dataset.loaded) {
        body.dataset.loaded = '';
      }
      if (!body.dataset.current) {
        body.dataset.current = '';
      }
      if (!body.textContent.trim()) {
        body.textContent = annotationsConfig[view].placeholder || '';
      }
    });

    if (progressInput) {
      progressInput.value = '0';
      progressInput.disabled = true;
      progressInput.setAttribute('aria-disabled', 'true');
    }

    let currentButton = buttons.find((btn) => btn.closest('.album-track')?.classList.contains('is-active')) || buttons[0];
    if (!currentButton) {
      currentButton = buttons[0];
    }

    const ASCII_SEGMENTS = { volume: 20, progress: 20 };
    const AUTOPLAY_RESUME_WINDOW = 30000; // milliseconds

    const STORAGE_KEY = 'album-player-state';

    function clamp01(value){
      if (!Number.isFinite(value)) return 0;
      return Math.max(0, Math.min(1, value));
    }

    function formatTime(seconds){
      if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
      const total = Math.floor(seconds);
      const mins = Math.floor(total / 60);
      const secs = total % 60;
      return `${mins}:${String(secs).padStart(2, '0')}`;
    }

    let storage = null;
    let persistedState = { trackSlug: null, position: 0, volume: null, playing: false, lastPlayedAt: null };

    try {
      const testKey = `${STORAGE_KEY}__test__`;
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      storage = window.localStorage;
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.trackSlug === 'string' && parsed.trackSlug.trim()) {
            persistedState.trackSlug = parsed.trackSlug.trim();
          }
          if (Number.isFinite(parsed.position) && parsed.position >= 0) {
            persistedState.position = parsed.position;
          }
          if (Number.isFinite(parsed.volume)) {
            const vol = clamp01(parsed.volume);
            persistedState.volume = vol;
          }
          if (typeof parsed.playing === 'boolean') {
            persistedState.playing = parsed.playing;
          }
          if (Number.isFinite(parsed.lastPlayedAt) && parsed.lastPlayedAt >= 0) {
            persistedState.lastPlayedAt = parsed.lastPlayedAt;
          }
        }
      }
    } catch (err) {
      storage = null;
      persistedState = { trackSlug: null, position: 0, volume: null, playing: false, lastPlayedAt: null };
    }

    function persistState(update){
      if (!storage) return;
      persistedState = Object.assign({}, persistedState, update || {});
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify({
          trackSlug: persistedState.trackSlug || null,
          position: Number.isFinite(persistedState.position) && persistedState.position >= 0 ? persistedState.position : 0,
          volume: Number.isFinite(persistedState.volume) ? clamp01(persistedState.volume) : null,
          playing: !!persistedState.playing,
          lastPlayedAt: Number.isFinite(persistedState.lastPlayedAt) && persistedState.lastPlayedAt >= 0 ? persistedState.lastPlayedAt : null
        }));
      } catch (err) {
        /* ignore */
      }
    }

    let pendingSeek = null;
    let lastPositionPersist = 0;

    function getActiveSlug(){
      return currentButton?.dataset.slug?.trim() || null;
    }

    function clampTime(seconds){
      if (!Number.isFinite(seconds) || seconds < 0) return 0;
      if (!audio) return Math.max(0, seconds);
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
      if (duration === null) return Math.max(0, seconds);
      return Math.min(Math.max(0, seconds), duration);
    }

    function attemptSeekTime(seconds){
      if (!audio) return false;
      try {
        audio.currentTime = clampTime(seconds);
        return true;
      } catch (err) {
        return false;
      }
    }

    function scheduleSeek(slug, time){
      pendingSeek = { slug: slug || null, time: Math.max(0, Number.isFinite(time) ? time : 0) };
    }

    function applyPendingSeek(force = false){
      if (!pendingSeek || !audio) return;
      if (!force && (audio.readyState || 0) < 1) return;
      const activeSlug = getActiveSlug();
      if (pendingSeek.slug && activeSlug && pendingSeek.slug !== activeSlug) {
        return;
      }
      if (attemptSeekTime(pendingSeek.time)) {
        pendingSeek = null;
        updateProgressDisplay();
      }
    }

    function persistVolumeState(){
      if (!storage || !audio) return;
      const volume = audio.muted ? 0 : clamp01(audio.volume);
      persistState({ volume });
    }

    function persistPlaybackPosition(force = false){
      if (!storage || !audio) return;
      const slug = getActiveSlug();
      if (!slug) return;
      const now = Date.now();
      if (!force && now - lastPositionPersist < 1000) {
        return;
      }
      const position = Number.isFinite(audio.currentTime) && audio.currentTime >= 0 ? audio.currentTime : 0;
      const isPlaying = !audio.paused && !audio.ended;
      const lastPlayedAt = isPlaying ? Date.now() : null;
      persistState({ trackSlug: slug, position, playing: isPlaying, lastPlayedAt });
      lastPositionPersist = now;
    }

    function renderAsciiBar(fraction, segments = ASCII_SEGMENTS.volume){
      const total = Math.max(1, Number.isFinite(segments) ? segments : ASCII_SEGMENTS.volume);
      const normalized = clamp01(Number.isFinite(fraction) ? fraction : 0);
      const filled = Math.round(normalized * total);
      const bars = '='.repeat(filled);
      const blanks = '-'.repeat(Math.max(0, total - filled));
      return `[${bars}${blanks}]`;
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

      const lyricsSrc = button.dataset.lyrics?.trim() || '';
      const commentarySrc = button.dataset.commentary?.trim() || '';
      if (lyricsSrc) {
        player.dataset.lyrics = lyricsSrc;
      } else {
        player.removeAttribute('data-lyrics');
      }
      if (commentarySrc) {
        player.dataset.commentary = commentarySrc;
      } else {
        player.removeAttribute('data-commentary');
      }
      if (annotationsRoot) {
        resetAnnotations('lyrics');
      }

      if (button.dataset.slug) {
        player.setAttribute('data-active-track', button.dataset.slug);
      } else {
        player.removeAttribute('data-active-track');
      }
    }

    function getAnnotationSource(view){
      const key = (view || '').toLowerCase();
      if (key === 'lyrics') {
        return (player.dataset.lyrics || '').trim();
      }
      if (key === 'commentary') {
        return (player.dataset.commentary || '').trim();
      }
      return (player.dataset[key] || '').trim();
    }

    function setAnnotationView(view, { ensure = true } = {}){
      if (!annotationsRoot || !Object.keys(annotationsConfig).length) return;
      let key = (view || '').toLowerCase();
      if (!annotationsConfig[key]) {
        key = Object.keys(annotationsConfig)[0];
        if (!key) return;
      }
      const info = annotationsConfig[key];
      activeAnnotation = key;
      annotationsRoot.dataset.active = key;

      annotationTabs.forEach((tab) => {
        const tabView = tab.dataset.view?.trim().toLowerCase();
        const isActive = tabView === key;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        tab.setAttribute('tabindex', isActive ? '0' : '-1');
      });

      annotationBodies.forEach((body) => {
        const bodyView = body.dataset.view?.trim().toLowerCase();
        const isActive = bodyView === key;
        body.classList.toggle('is-active', isActive);
        if (isActive) {
          body.removeAttribute('hidden');
          body.setAttribute('aria-hidden', 'false');
        } else {
          body.setAttribute('hidden', '');
          body.setAttribute('aria-hidden', 'true');
        }
      });

      if (ensure) {
        ensureAnnotation(key);
      }
    }

    function resetAnnotations(defaultView = 'lyrics'){
      if (!annotationsRoot || !Object.keys(annotationsConfig).length) return;
      Object.entries(annotationsConfig).forEach(([view, info]) => {
        const source = getAnnotationSource(view);
        info.body.dataset.loaded = '';
        info.body.dataset.current = '';
        if (source) {
          info.body.textContent = info.placeholder || '';
        } else {
          info.body.textContent = info.emptyText || '';
          info.body.dataset.loaded = '1';
        }
        info.body.scrollTop = 0;
      });
      setAnnotationView(defaultView, { ensure: !!(details?.open) });
    }

    async function ensureAnnotation(view){
      if (!details?.open || !annotationsRoot) return;
      const key = (view || '').toLowerCase();
      const info = annotationsConfig[key];
      if (!info) return;
      const source = getAnnotationSource(key);
      if (!source) {
        info.body.textContent = info.emptyText || '';
        info.body.dataset.loaded = '1';
        info.body.dataset.current = '';
        return;
      }
      if (info.body.dataset.loaded === '1' && info.body.dataset.current === source) {
        return;
      }
      info.body.textContent = info.loadingText || 'loading…';
      try {
        const res = await fetch(source);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const text = await res.text();
        const trimmed = text.trim();
        info.body.textContent = trimmed ? trimmed : (info.emptyText || '(blank)');
      } catch (err) {
        info.body.textContent = info.errorText || '(error loading)';
      } finally {
        info.body.dataset.loaded = '1';
        info.body.dataset.current = source;
        info.body.scrollTop = 0;
      }
    }

    if (annotationsRoot && Object.keys(annotationsConfig).length) {
      setAnnotationView(activeAnnotation, { ensure: false });
    }

    function updatePlayButtonState(){
      if (!playToggleButton) return;
      const isPlaying = audio && !audio.paused && !audio.ended;
      if (playLabel) {
        playLabel.textContent = isPlaying ? ' pause' : ' play';
      }
      if (playIcon) {
        playIcon.textContent = isPlaying ? '||' : '>';
      }
      playToggleButton.setAttribute('aria-label', isPlaying ? 'pause' : 'play');
      playToggleButton.dataset.state = isPlaying ? 'playing' : 'paused';
      if (coverToggle) {
        coverToggle.setAttribute('aria-label', isPlaying ? 'pause' : 'play');
        coverToggle.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
        coverToggle.dataset.state = isPlaying ? 'playing' : 'paused';
      }
    }

    function updateVolumeDisplay(){
      if (!audio) return;
      const volume = audio.muted ? 0 : clamp01(Number.isFinite(audio.volume) ? audio.volume : 0);
      const percent = Math.round(volume * 100);
      if (volumeAscii) {
        volumeAscii.textContent = renderAsciiBar(volume, ASCII_SEGMENTS.volume);
      }
      if (volumeInput && !volumeInput.matches(':active')) {
        volumeInput.value = String(percent);
      }
      if (volumeDisplay) {
        volumeDisplay.textContent = `${percent}%`;
      }
      if (volumeInput) {
        volumeInput.setAttribute('aria-valuenow', String(percent));
        volumeInput.setAttribute('aria-valuetext', `${percent}%`);
      }
    }

    function updateProgressDisplay(){
      if (!audio) return;
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const hasDuration = duration > 0;
      const fraction = hasDuration ? current / duration : 0;
      const clamped = clamp01(Number.isFinite(fraction) ? fraction : 0);

      if (progressAscii) {
        progressAscii.textContent = renderAsciiBar(clamped, ASCII_SEGMENTS.progress);
      }

      const currentText = hasDuration || current > 0 ? formatTime(current) : '0:00';
      const durationText = hasDuration ? formatTime(duration) : '--:--';
      if (progressCurrent) {
        progressCurrent.textContent = currentText;
      }
      if (progressDuration) {
        progressDuration.textContent = durationText;
      }

      if (progressInput) {
        if (!progressInput.matches(':active')) {
          progressInput.value = String(Math.round(clamped * 100));
        }
        progressInput.disabled = !hasDuration;
        if (hasDuration) {
          progressInput.removeAttribute('aria-disabled');
        } else {
          progressInput.setAttribute('aria-disabled', 'true');
        }
        progressInput.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
        const valueText = hasDuration ? `${currentText} of ${durationText}` : `${Math.round(clamped * 100)}%`;
        progressInput.setAttribute('aria-valuetext', valueText);
      }
    }

    function setTrack(button, { autoplay = false, resumeTime = null, persist = true } = {}){
      if (!button || !audio) return;
      const newSrc = button.dataset.audio?.trim();
      if (!newSrc) return;

      const slug = button.dataset.slug?.trim() || null;
      const resume = Number.isFinite(resumeTime) && resumeTime >= 0 ? resumeTime : null;
      const wasPlaying = !audio.paused && !audio.ended;
      const shouldAutoplay = autoplay || wasPlaying;
      const sourceChanged = audio.getAttribute('src') !== newSrc;

      if (sourceChanged) {
        audio.pause();
        audio.setAttribute('src', newSrc);
        if (resume === null) {
          try {
            audio.currentTime = 0;
          } catch (err) {
            /* ignore */
          }
        }
      } else if (resume !== null) {
        if (!attemptSeekTime(resume)) {
          scheduleSeek(slug, resume);
        } else {
          pendingSeek = null;
        }
      }

      setActiveButton(button);

      let appliedSeek = false;
      if (resume !== null && sourceChanged) {
        appliedSeek = attemptSeekTime(resume);
        if (!appliedSeek) {
          scheduleSeek(slug, resume);
        } else {
          pendingSeek = null;
        }
      } else if (resume === null && sourceChanged) {
        appliedSeek = attemptSeekTime(0);
        if (!appliedSeek) {
          scheduleSeek(slug, 0);
        } else {
          pendingSeek = null;
        }
      } else if (resume === null && !sourceChanged) {
        pendingSeek = null;
      }

      updateProgressDisplay();
      if (!appliedSeek) {
        applyPendingSeek(false);
      }

      if (details?.open) {
        ensureAnnotation(activeAnnotation);
      }

      if (shouldAutoplay) {
        audio.play().catch(() => {});
      }

      if (persist) {
        const positionToStore = resume !== null ? resume : 0;
        const lastPlayedAt = shouldAutoplay ? Date.now() : null;
        persistState({ trackSlug: slug || null, position: positionToStore, playing: !!shouldAutoplay, lastPlayedAt });
        lastPositionPersist = Date.now();
      }

      updatePlayButtonState();
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

    function stepTrack(offset, { autoplay = true } = {}){
      if (!buttons.length) return;
      const currentIndex = buttons.indexOf(currentButton);
      const baseIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex = (baseIndex + offset + buttons.length) % buttons.length;
      const target = buttons[nextIndex];
      if (target) {
        setTrack(target, { autoplay });
      }
    }

    function updateSkipButtonState(){
      const disabled = buttons.length < 2;
      if (skipPrevButton) skipPrevButton.disabled = disabled;
      if (skipNextButton) skipNextButton.disabled = disabled;
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

    annotationTabs.forEach((tab) => {
      tab.addEventListener('click', (event) => {
        event.preventDefault();
        const view = tab.dataset.view?.trim().toLowerCase();
        if (view) {
          setAnnotationView(view, { ensure: !!(details?.open) });
        }
      });
      tab.addEventListener('keydown', (event) => {
        if (!annotationTabs.length) return;
        const currentIndex = annotationTabs.indexOf(tab);
        let targetIndex = currentIndex;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          targetIndex = (currentIndex - 1 + annotationTabs.length) % annotationTabs.length;
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          targetIndex = (currentIndex + 1) % annotationTabs.length;
        } else if (event.key === 'Home') {
          event.preventDefault();
          targetIndex = 0;
        } else if (event.key === 'End') {
          event.preventDefault();
          targetIndex = annotationTabs.length - 1;
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          const view = tab.dataset.view?.trim().toLowerCase();
          if (view) {
            setAnnotationView(view, { ensure: !!(details?.open) });
          }
          return;
        } else {
          return;
        }

        const nextTab = annotationTabs[targetIndex];
        if (nextTab) {
          nextTab.focus();
          const view = nextTab.dataset.view?.trim().toLowerCase();
          if (view) {
            setAnnotationView(view, { ensure: !!(details?.open) });
          }
        }
      });
    });

    skipPrevButton?.addEventListener('click', () => stepTrack(-1, { autoplay: true }));
    skipNextButton?.addEventListener('click', () => stepTrack(1, { autoplay: true }));

    function togglePlayback(){
      if (!audio) return;
      const willPlay = audio.paused || audio.ended;
      if (willPlay) {
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
      if (navigationPlayback.active) {
        navigationPlayback.shouldResume = willPlay;
      }
    }

    playToggleButton?.addEventListener('click', togglePlayback);
    coverToggle?.addEventListener('click', togglePlayback);

    volumeInput?.addEventListener('input', (event) => {
      if (!audio) return;
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) return;
      const normalized = Math.max(0, Math.min(100, value));
      const nextVolume = clamp01(normalized / 100);
      audio.muted = nextVolume <= 0;
      audio.volume = nextVolume;
      updateVolumeDisplay();
    });

    volumeInput?.addEventListener('change', () => {
      updateVolumeDisplay();
      persistVolumeState();
    });

    progressInput?.addEventListener('input', (event) => {
      if (!audio) return;
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) return;
      const ratio = Math.max(0, Math.min(100, value)) / 100;
      if (progressAscii) {
        progressAscii.textContent = renderAsciiBar(ratio, ASCII_SEGMENTS.progress);
      }
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        attemptSeekTime(ratio * audio.duration);
      }
      updateProgressDisplay();
    });

    progressInput?.addEventListener('change', () => {
      updateProgressDisplay();
      persistPlaybackPosition(true);
    });

    progressInput?.addEventListener('blur', () => {
      updateProgressDisplay();
    });

    details?.addEventListener('toggle', () => {
      if (details.open) {
        ensureAnnotation(activeAnnotation);
      }
    });

    audio.addEventListener('play', () => {
      updatePlayButtonState();
      updateProgressDisplay();
      persistPlaybackPosition(true);
    });
    audio.addEventListener('pause', () => {
      updatePlayButtonState();
      updateProgressDisplay();
      persistPlaybackPosition(true);
    });
    audio.addEventListener('ended', () => {
      updatePlayButtonState();
      updateProgressDisplay();
      const slug = getActiveSlug();
      persistState({ trackSlug: slug || null, position: 0, playing: false, lastPlayedAt: null });
      lastPositionPersist = Date.now();
    });
    audio.addEventListener('timeupdate', () => {
      updateProgressDisplay();
      persistPlaybackPosition(false);
    });
    audio.addEventListener('loadedmetadata', () => {
      applyPendingSeek(true);
      updateProgressDisplay();
      persistPlaybackPosition(true);
    });
    audio.addEventListener('durationchange', () => {
      updateProgressDisplay();
    });
    audio.addEventListener('seeked', () => {
      updateProgressDisplay();
      persistPlaybackPosition(true);
    });
    audio.addEventListener('volumechange', () => {
      updateVolumeDisplay();
      persistVolumeState();
    });

    function isPlaying(){
      return !!(audio && !audio.paused && !audio.ended);
    }

    function markNavigationStart(){
      navigationPlayback.shouldResume = isPlaying();
      navigationPlayback.active = true;
    }

    function markNavigationEnd(){
      if (navigationPlayback.shouldResume && audio && audio.paused) {
        audio.play().catch(() => {});
      }
      navigationPlayback.active = false;
      navigationPlayback.shouldResume = false;
    }

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
        ensureAnnotation(activeAnnotation);
      }
    });

    const savedVolume = Number.isFinite(persistedState.volume) ? clamp01(persistedState.volume) : null;
    if (savedVolume !== null) {
      audio.volume = savedVolume;
      audio.muted = savedVolume <= 0;
    }

    let initialButton = currentButton;
    let initialResume = null;
    if (persistedState.trackSlug) {
      const match = buttons.find((btn) => btn.dataset.slug === persistedState.trackSlug);
      if (match) {
        initialButton = match;
        if (Number.isFinite(persistedState.position) && persistedState.position > 0) {
          initialResume = persistedState.position;
        }
      }
    }
    if (!initialButton) {
      initialButton = buttons[0];
    }

    const initialMode = player.dataset.playerMode === PLAYER_MODES.EXPANDED ? PLAYER_MODES.EXPANDED : PLAYER_MODES.COMPACT;
    const lastPlayedAt = Number.isFinite(persistedState.lastPlayedAt) && persistedState.lastPlayedAt >= 0 ? persistedState.lastPlayedAt : null;
    const shouldResumePlayback = persistedState.playing === true && lastPlayedAt !== null && (Date.now() - lastPlayedAt) <= AUTOPLAY_RESUME_WINDOW;

    setMode(initialMode, { force: true });
    setTrack(initialButton, { autoplay: shouldResumePlayback, resumeTime: initialResume, persist: false });
    if (!shouldResumePlayback && persistedState.playing) {
      persistState({ playing: false, lastPlayedAt: null });
    }
    updateSkipButtonState();
    updatePlayButtonState();
    updateVolumeDisplay();

    player.dataset.jsInit = '1';

    albumController = {
      setMode,
      getMode,
      expand: () => setMode(PLAYER_MODES.EXPANDED, { force: true }),
      compact: () => setMode(PLAYER_MODES.COMPACT, { force: true }),
      isPlaying,
      resumePlayback: () => {
        if (audio && audio.paused) {
          audio.play().catch(() => {});
        }
      },
      onNavigationStart: markNavigationStart,
      onNavigationEnd: markNavigationEnd
    };

    return albumController;
  }

  function normalizeViewId(value){
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  function getLayoutConfig(){
    return window.__LAYOUT_CONFIG__ || {};
  }

  function getDefaultViewKey(){
    const config = getLayoutConfig();
    if (typeof window.__LAYOUT_DEFAULT__ === 'string') {
      const preferred = normalizeViewId(window.__LAYOUT_DEFAULT__);
      if (preferred && config[preferred]) {
        return preferred;
      }
    }
    const keys = Object.keys(config);
    if (keys.length) {
      return normalizeViewId(keys[0]);
    }
    return '';
  }

  function updateAlbumPlayerModeForPage(pageId){
    const controller = initAlbumPlayer();
    if (!controller) return;
    const layout = getLayoutConfig();
    const key = normalizeViewId(pageId);
    const entry = key && layout[key] ? layout[key] : null;
    const desired = typeof entry?.playerMode === 'string' ? entry.playerMode.trim().toLowerCase() : null;
    if (desired === PLAYER_MODES.EXPANDED) {
      controller.expand();
    } else {
      controller.compact();
    }
  }

  function updateNavActive(viewId){
    const active = normalizeViewId(viewId);
    document.querySelectorAll('[data-nav-target]').forEach((link) => {
      const target = normalizeViewId(link.dataset.navTarget);
      if (target && target === active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function parseViewFromUrl(url){
    try {
      const candidate = new URL(url, window.location.href);
      const param = normalizeViewId(candidate.searchParams.get('view'));
      const config = getLayoutConfig();
      if (param && config[param]) {
        return param;
      }
    } catch (err) {
      /* ignore */
    }
    return null;
  }

  function initLayoutRouter(){
    const root = document.querySelector('[data-layout-root]');
    const target = root?.querySelector('[data-layout-target]') || null;
    if (!root || !target) return;

    const templates = new Map();
    root.querySelectorAll('template[data-section-template]').forEach((tpl) => {
      const id = normalizeViewId(tpl.dataset.sectionTemplate);
      if (id && !templates.has(id)) {
        templates.set(id, tpl);
      }
    });

    const sections = new Map();
    const wrappers = new Map();

    Array.from(root.querySelectorAll('[data-section]')).forEach((el) => {
      const id = normalizeViewId(el.dataset.section);
      if (!id || sections.has(id)) return;
      sections.set(id, el);
    });

    function ensureBaseSection(id){
      const key = normalizeViewId(id);
      if (!key) return null;
      if (sections.has(key)) {
        return sections.get(key);
      }

      const template = templates.get(key);
      if (!template) return null;

      const fragment = template.content ? template.content.cloneNode(true) : null;
      if (!fragment) return null;
      const nodes = Array.from(fragment.childNodes).filter((node) => node.nodeType === Node.ELEMENT_NODE);
      const element = nodes[0] || null;
      if (!element) return null;

      sections.set(key, element);
      return element;
    }

    function getSectionNode(id, wrapperClass){
      const key = normalizeViewId(id);
      if (!key) return null;
      const base = ensureBaseSection(key);
      if (!base) return null;

      const parent = base.parentElement;
      const wrapperId = parent?.dataset?.wrapperFor ? normalizeViewId(parent.dataset.wrapperFor) : null;

      if (!wrapperClass) {
        if (wrapperId === key) {
          parent.removeChild(base);
        }
        return base;
      }

      const wrapperKey = `${key}::${wrapperClass}`;
      let wrapper = wrappers.get(wrapperKey);
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = wrapperClass;
        wrapper.dataset.wrapperFor = key;
        wrappers.set(wrapperKey, wrapper);
      }

      if (base.parentElement !== wrapper) {
        if (base.parentElement) {
          base.parentElement.removeChild(base);
        }
        wrapper.appendChild(base);
      }

      return wrapper;
    }

    function clearTarget(){
      while (target.firstChild) {
        target.removeChild(target.firstChild);
      }
    }

    function applyMeta(config){
      if (!config) return;
      if (typeof config.title === 'string' && config.title.trim()) {
        document.title = config.title;
      }
      if (typeof config.description === 'string') {
        const meta = document.querySelector('meta[name="description"]');
        if (meta) {
          meta.setAttribute('content', config.description);
        }
      }
    }

    function updateHistory(viewId, methodName){
      if (!history || typeof history[methodName] !== 'function') return;
      let url;
      try {
        url = new URL(window.location.href);
      } catch (err) {
        return;
      }
      const defaultKey = getDefaultViewKey();
      if (normalizeViewId(viewId) === defaultKey) {
        url.searchParams.delete('view');
      } else if (viewId) {
        url.searchParams.set('view', viewId);
      } else {
        url.searchParams.delete('view');
      }
      const state = Object.assign({}, history.state || {}, { view: viewId });
      history[methodName](state, '', url.toString());
    }

    const layout = getLayoutConfig();
    const defaultKey = getDefaultViewKey();
    let activeView = normalizeViewId(target.dataset.activeView || document.body.dataset.view || defaultKey);

    function setView(viewId, { historyMode = 'push' } = {}){
      const requestedKey = normalizeViewId(viewId);
      const resolvedKey = layout[requestedKey] ? requestedKey : defaultKey;
      const config = layout[resolvedKey];
      if (!config) return;

      const configId = normalizeViewId(config.id || resolvedKey);
      const isSame = activeView === configId;

      if (!isSame) {
        const controller = initAlbumPlayer();
        controller?.onNavigationStart?.();
        clearTarget();
        config.sections.forEach((section) => {
          const entry = section || {};
          const node = getSectionNode(entry.id, entry.wrapperClass);
          if (node) {
            target.appendChild(node);
          }
        });
        activeView = configId;
        target.dataset.activeView = config.id || resolvedKey;
        document.body.dataset.view = config.id || resolvedKey;
        applyGlitchAttributes(target);
        hydrateBlurbs(target);
        controller?.onNavigationEnd?.();
      } else {
        target.dataset.activeView = config.id || resolvedKey;
        document.body.dataset.view = config.id || resolvedKey;
      }

      updateNavActive(config.id || resolvedKey);
      updateAlbumPlayerModeForPage(config.id || resolvedKey);
      applyMeta(config);

      if (historyMode === 'push') {
        updateHistory(config.id || resolvedKey, 'pushState');
      } else if (historyMode === 'replace') {
        updateHistory(config.id || resolvedKey, 'replaceState');
      }
    }

    const initialFromUrl = parseViewFromUrl(window.location.href);
    if (initialFromUrl) {
      activeView = ''; // force rebuild
      setView(initialFromUrl, { historyMode: 'replace' });
    } else if (activeView) {
      setView(activeView, { historyMode: 'replace' });
    }

    document.querySelectorAll('[data-nav-target]').forEach((link) => {
      const navTarget = normalizeViewId(link.dataset.navTarget);
      if (!navTarget) return;
      link.addEventListener('click', (event) => {
        if (event.defaultPrevented) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        setView(navTarget, { historyMode: 'push' });
      });
    });

    window.addEventListener('popstate', () => {
      const fromUrl = parseViewFromUrl(window.location.href);
      const fromState = normalizeViewId(history.state?.view);
      const next = fromUrl || fromState || defaultKey;
      setView(next, { historyMode: 'none' });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyGlitchAttributes(document);
    hydrateBlurbs(document);
    keyboard();
    year();

    const initialView = document.body.dataset.view || document.body.dataset.page || '';
    updateNavActive(initialView);
    updateAlbumPlayerModeForPage(initialView);

    initAlbumPlayer();
    initLayoutRouter();
  });
})();
