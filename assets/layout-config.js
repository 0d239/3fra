(function (global) {
  const DEFAULT_VIEW = 'ascii';

  const ORDERED_VIEWS = ['ascii', 'info', 'runes', 'tracks', 'links'];

  const LAYOUT_CONFIG = {
    ascii: {
      id: 'ascii',
      label: 'header-ascii',
      title: '3fra',
      description: 'sound, sound - sound',
      sections: [
        { id: 'info' },
        { id: 'player' },
        { id: 'runes', wrapperClass: 'layout-constrained' }
      ],
      playerMode: 'expanded'
    },
    info: {
      id: 'info',
      label: 'info',
      title: '3fra — info',
      description: 'info on 0d239',
      sections: [
        { id: 'info' },
        { id: 'player' }
      ],
      playerMode: 'compact'
    },
    runes: {
      id: 'runes',
      label: 'runes',
      title: '3fra — runes',
      description: 'runes by 0d239',
      sections: [
        { id: 'runes' },
        { id: 'player' }
      ],
      playerMode: 'compact'
    },
    tracks: {
      id: 'tracks',
      label: 'tracks',
      title: '3fra — tracks',
      description: 'tracks by 0d239',
      sections: [
        { id: 'player' },
        { id: 'tracks' }
      ],
      playerMode: 'expanded'
    },
    links: {
      id: 'links',
      label: 'links',
      title: '3fra — links',
      description: 'links from 0d239',
      sections: [
        { id: 'links' },
        { id: 'player' }
      ],
      playerMode: 'compact'
    }
  };

  Object.freeze(LAYOUT_CONFIG);
  ORDERED_VIEWS.forEach((key) => {
    const config = LAYOUT_CONFIG[key];
    if (config) {
      Object.freeze(config.sections);
      config.sections.forEach((section) => Object.freeze(section));
      Object.freeze(config);
    }
  });
  Object.freeze(ORDERED_VIEWS);

  const api = {
    DEFAULT_VIEW,
    ORDERED_VIEWS,
    LAYOUT_CONFIG
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (global) {
    global.__LAYOUT_DEFAULT__ = DEFAULT_VIEW;
    global.__LAYOUT_ORDER__ = ORDERED_VIEWS;
    global.__LAYOUT_CONFIG__ = LAYOUT_CONFIG;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : undefined));
