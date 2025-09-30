const fragmentCache = new Map();

async function loadFragment(url){
  if(!fragmentCache.has(url)){
    fragmentCache.set(url, fetch(url).then(res => {
      if(!res.ok){
        throw new Error(`Failed to load include: ${url} (${res.status})`);
      }
      return res.text();
    }));
  }
  return fragmentCache.get(url);
}

async function applyInclude(el){
  const url = el.dataset.include;
  if(!url) return;
  try{
    const html = await loadFragment(url);
    el.innerHTML = html;

    const srTitle = el.dataset.srTitle;
    if(srTitle){
      const srNode = el.querySelector('[data-slot="sr-title"]');
      if(srNode) srNode.textContent = srTitle;
    }

    const current = el.dataset.navCurrent;
    if(current){
      const activeLink = el.querySelector(`[data-nav="${current}"]`);
      if(activeLink){
        activeLink.setAttribute('aria-current', 'page');
      }
    }
  }catch(err){
    console.error(err);
    el.innerHTML = '';
    const fallback = document.createElement('div');
    fallback.setAttribute('role', 'status');
    fallback.textContent = 'Failed to load component.';
    el.appendChild(fallback);
  }
}

const includeElements = Array.from(document.querySelectorAll('[data-include]'));

const includesReady = Promise.all(includeElements.map(applyInclude));

window.__includesReady = includesReady;

includesReady.finally(() => {
  document.dispatchEvent(new CustomEvent('includes:loaded'));
});
