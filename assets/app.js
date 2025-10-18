// Minimal progressive enhancement (no frameworks).
// 1) Hydrate text content from CSS custom properties (so the site is readable in DOM, not just ::before)
// 2) Wire up the album player widget (playlist switching + lyric fetch)
// 3) Toggle glitch/tilt with keyboard shortcuts

(function(){
  const unquote = s => (s||"").trim().replace(/^["']|["']$/g, "");
  const decodeCSSString = s => unquote(s).replace(/\\A/g, "\n").replace(/\\"/g,'"').replace(/\\'/g,"'");

  function hydrateFromCSSVars(el){
    const cs = getComputedStyle(el);
    el.querySelectorAll("[data-fallback]").forEach(node => {
      const expr = node.getAttribute("data-fallback"); // e.g. var(--title)
      // Extract var name
      const match = expr.match(/var\((--[a-zA-Z0-9\-_]+)\)/);
      if(!match) return;
      const val = cs.getPropertyValue(match[1]);
      if(val && !node.textContent.trim()){
        node.textContent = decodeCSSString(val);
      }
    });
  }

  function hydrateBlurbs(){
    document.querySelectorAll(".blurb").forEach(hydrateFromCSSVars);
  }

  function initAlbumPlayer(){
    const player = document.querySelector('.album-player');
    if(!player) return;

    const audio = player.querySelector('.album-audio');
    const buttons = Array.from(player.querySelectorAll('.album-track-button'));
    if(!audio || !buttons.length) return;

    const nowTitle = player.querySelector('.album-current-title');
    const metaEl = player.querySelector('.album-current-meta');
    const details = player.querySelector('.album-lyrics');
    const transcriptEl = details?.querySelector('.transcript-body') || null;
    const placeholder = transcriptEl?.dataset.placeholder || 'open to fetch lyrics';

    if(transcriptEl && !transcriptEl.textContent.trim()){
      transcriptEl.textContent = placeholder;
    }

    let currentButton = buttons.find((btn) => btn.closest('.album-track')?.classList.contains('is-active')) || buttons[0];
    if(!currentButton) return;

    function setActiveButton(button){
      currentButton = button;
      buttons.forEach((btn) => {
        const active = btn === button;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
        const item = btn.closest('.album-track');
        if(item){
          item.classList.toggle('is-active', active);
        }
      });

      const title = button.dataset.title?.trim() || button.textContent.trim();
      if(nowTitle){
        nowTitle.textContent = title;
      }

      if(metaEl){
        const parts = [];
        const year = button.dataset.year?.trim();
        const desc = button.dataset.description?.trim();
        if(year) parts.push(year);
        if(desc) parts.push(desc);
        if(parts.length){
          metaEl.textContent = parts.join(' — ');
          metaEl.hidden = false;
        }else{
          metaEl.textContent = '';
          metaEl.hidden = true;
        }
      }

      const transcript = button.dataset.transcript?.trim() || '';
      player.dataset.transcript = transcript;
      if(transcriptEl){
        transcriptEl.dataset.loaded = '';
        transcriptEl.dataset.current = '';
        if(transcript){
          transcriptEl.textContent = placeholder;
        }else{
          transcriptEl.textContent = '(no transcript)';
          transcriptEl.dataset.loaded = '1';
        }
      }

      if(button.dataset.slug){
        player.setAttribute('data-active-track', button.dataset.slug);
      }else{
        player.removeAttribute('data-active-track');
      }
    }

    async function loadLyrics(){
      if(!details?.open || !transcriptEl) return;
      const transcript = (player.dataset.transcript || '').trim();
      if(!transcript){
        transcriptEl.textContent = '(no transcript)';
        transcriptEl.dataset.loaded = '1';
        transcriptEl.dataset.current = '';
        return;
      }
      if(transcriptEl.dataset.loaded === '1' && transcriptEl.dataset.current === transcript){
        return;
      }
      transcriptEl.textContent = 'loading lyrics…';
      try{
        const res = await fetch(transcript);
        if(!res.ok){
          throw new Error(`HTTP ${res.status}`);
        }
        const text = await res.text();
        transcriptEl.textContent = text.trim() ? text : '(blank transcript)';
      }catch(err){
        transcriptEl.textContent = '(error loading transcript)';
      }finally{
        transcriptEl.dataset.loaded = '1';
        transcriptEl.dataset.current = transcript;
      }
    }

    function setTrack(button, { autoplay = false } = {}){
      if(!button || !audio) return;
      const newSrc = button.dataset.audio?.trim();
      if(!newSrc) return;

      const wasPlaying = !audio.paused && !audio.ended;
      const shouldAutoplay = autoplay || wasPlaying;
      const sourceChanged = audio.getAttribute('src') !== newSrc;

      if(sourceChanged){
        audio.setAttribute('src', newSrc);
        if(!shouldAutoplay){
          audio.pause();
          audio.currentTime = 0;
        }
      }

      setActiveButton(button);

      if(details?.open){
        loadLyrics();
      }

      if(shouldAutoplay){
        audio.play().catch(() => {});
      }
    }

    function focusTrack(index){
      if(index < 0 || index >= buttons.length) return;
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
      switch(event.key){
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
        if(event.key === 'Enter' || event.key === ' '){
          event.preventDefault();
          setTrack(button, { autoplay: true });
        }else{
          handleKeyNavigation(button, event);
        }
      });
    });

    details?.addEventListener('toggle', () => {
      if(details.open){
        loadLyrics();
      }
    });

    setTrack(currentButton, { autoplay: false });
  }

  // keyboard toggles
  function keyboard(){
    window.addEventListener("keydown", (e) => {
      if(e.key.toLowerCase() === "g"){
        document.querySelectorAll(".ascii").forEach(el => el.classList.toggle("glitch"));
      }
      if(e.key.toLowerCase() === "t"){
        document.querySelectorAll(".tilt").forEach(el => el.classList.toggle("tilt"));
      }
    });
  }

  // now-year
  function year(){
    const span = document.querySelector("[data-now-year]");
    if(span) span.textContent = new Date().getFullYear();
  }

  document.addEventListener("DOMContentLoaded", () => {
  // mirror inner text to attribute so CSS ::before/::after can use attr(text)
  document.querySelectorAll(".glitch").forEach(el => {
    el.setAttribute("text", el.textContent);
  });

    hydrateBlurbs();
    initAlbumPlayer();
    keyboard();
    year();
  });
})();
