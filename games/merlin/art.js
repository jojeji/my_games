// Inline SVG art for Merlin: the hourglass (sand levels are driven by the CSS variable --fill, see style.css) and spell icons.
export function hourglassSvg() {
  const span = document.createElement('span');
  span.className = 'hg';
  span.innerHTML = `<svg viewBox="0 0 120 170" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="hgGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe3a3"/><stop offset="0.55" stop-color="#e9a93f"/><stop offset="1" stop-color="#9a5f14"/></linearGradient>
    <linearGradient id="hgSand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#f0b24a"/></linearGradient>
    <linearGradient id="hgGlass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b9b6ff" stop-opacity="0.34"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.08"/><stop offset="1" stop-color="#b9b6ff" stop-opacity="0.3"/></linearGradient>
    <clipPath id="hgClip"><path d="M26 26C26 60 54 70 56 85 54 100 26 110 26 144H94C94 110 66 100 64 85 66 70 94 60 94 26Z"/></clipPath>
  </defs>
  <path d="M26 26C26 60 54 70 56 85 54 100 26 110 26 144H94C94 110 66 100 64 85 66 70 94 60 94 26Z" fill="url(#hgGlass)"/>
  <g clip-path="url(#hgClip)">
    <rect class="hg-top" x="20" y="26" width="80" height="60" fill="url(#hgSand)"/>
    <rect class="hg-bottom" x="20" y="85" width="80" height="60" fill="url(#hgSand)"/>
    <rect class="hg-stream" x="59" y="80" width="2" height="62" fill="#ffe3a3"/>
  </g>
  <path d="M26 26C26 60 54 70 56 85 54 100 26 110 26 144H94C94 110 66 100 64 85 66 70 94 60 94 26Z" fill="none" class="hg-rim" stroke="#e8dcff" stroke-opacity="0.55" stroke-width="2"/>
  <path d="M34 34C34 52 44 62 50 70" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="2" stroke-linecap="round"/>
  <g class="hg-grains" fill="#fff3c4"><circle cx="64.9" cy="135.0" r="1.7"/><circle cx="55.0" cy="132.5" r="1.7"/><circle cx="60.7" cy="130.5" r="1.7"/><circle cx="65.6" cy="131.0" r="1.7"/><circle cx="50.0" cy="134.0" r="1.7"/><circle cx="69.3" cy="131.7" r="1.7"/><circle cx="56.9" cy="128.7" r="1.7"/><circle cx="54.2" cy="128.9" r="1.7"/><circle cx="72.4" cy="132.5" r="1.7"/><circle cx="47.2" cy="132.1" r="1.7"/><circle cx="66.1" cy="127.8" r="1.7"/><circle cx="64.5" cy="127.1" r="1.7"/><circle cx="46.6" cy="130.7" r="1.7"/><circle cx="75.7" cy="133.1" r="1.7"/><circle cx="50.5" cy="127.5" r="1.7"/><circle cx="57.8" cy="125.7" r="1.7"/><circle cx="73.4" cy="128.8" r="1.7"/><circle cx="42.0" cy="134.6" r="1.7"/><circle cx="73.1" cy="127.9" r="1.7"/><circle cx="59.1" cy="124.6" r="1.7"/><circle cx="47.6" cy="126.9" r="1.7"/><circle cx="79.5" cy="133.6" r="1.7"/><circle cx="43.5" cy="128.7" r="1.7"/><circle cx="64.5" cy="124.0" r="1.7"/><circle cx="70.4" cy="125.0" r="1.7"/><circle cx="39.8" cy="131.4" r="1.7"/><circle cx="79.6" cy="130.0" r="1.7"/><circle cx="51.5" cy="123.8" r="1.7"/><circle cx="52.4" cy="123.4" r="1.7"/><circle cx="80.1" cy="129.2" r="1.7"/><circle cx="37.7" cy="131.8" r="1.7"/></g>
  <rect x="14" y="14" width="92" height="12" rx="6" fill="url(#hgGold)"/>
  <rect x="14" y="144" width="92" height="12" rx="6" fill="url(#hgGold)"/>
  <path d="M20 26V144M100 26V144" stroke="url(#hgGold)" stroke-width="3" stroke-linecap="round" opacity="0.85"/>
  </svg>`;
  return span;
}

export const SPELL_ICONS = {
  zeit: '<path d="M4 6l7 6-7 6zM13 6l7 6-7 6z"/>',
  rueck: '<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4.5h4.5M12 8v4l3 2"/>',
  still: '<path d="M9 5v14M15 5v14"/>',
  sturm: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8"/>',
  prophe: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
