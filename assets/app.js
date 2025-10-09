// Minimal progressive enhancement (no frameworks).
// 1) Hydrate text content from CSS custom properties (so the site is readable in DOM, not just ::before)
// 2) Wire up track audio src from CSS variable (so it can live in the CSS manifest file)
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

  function hydrateTracks(){
    document.querySelectorAll(".track").forEach(track => {
      const cs = getComputedStyle(track);
      // text bits
      ["--track-title","--track-year","--track-desc"].forEach(v => {
        const val = decodeCSSString(cs.getPropertyValue(v));
        if(!val) return;
        const target = track.querySelector(`[data-fallback="var(${v})"]`);
        if(target && !target.textContent.trim()) target.textContent = val;
      });
      // audio src
      const audio = track.querySelector("audio.track-audio");
      const audioSrc = unquote(cs.getPropertyValue("--audio-src"));
      if(audio && !audio.getAttribute("src") && audioSrc){
        audio.setAttribute("src", audioSrc);
      }
      // cover gradients
      const g1 = cs.getPropertyValue("--cover-grad-1").trim();
      const g2 = cs.getPropertyValue("--cover-grad-2").trim();
      if(g1 || g2){
        track.style.setProperty("--cover-grad-1", g1 || "#1a1a1a");
        track.style.setProperty("--cover-grad-2", g2 || "#101010");
      }
      // lazy-load transcript if present
      const details = track.querySelector(".track-transcript");
      const pre = track.querySelector(".transcript-body");
      details?.addEventListener("toggle", async () => {
        if(details.open && pre && !pre.dataset.loaded){
          try{
            const path = (audioSrc || "").replace(/\.(mp3|wav|ogg)(\?.*)?$/i, ".txt");
            const explicit = track.dataset.transcript || (audioSrc ? path : "");
            if(explicit){
              const res = await fetch(explicit);
              if(res.ok){
                pre.textContent = await res.text();
                pre.dataset.loaded = "1";
              }else{
                pre.textContent = "(no transcript)";
              }
            }else{
              pre.textContent = "(no transcript)";
            }
          }catch(e){
            pre.textContent = "(error loading transcript)";
          }
        }
      }, { once:true });
    });
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
    hydrateTracks();
    keyboard();
    year();
  });
})();
