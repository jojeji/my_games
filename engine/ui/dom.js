// Tiny DOM helpers: element factory + "write only if changed" setters (no virtual DOM, no re-render per tick).

/**
 * Create an element. props: class, text, style (object), onXxx handlers, other keys become
 * properties (if the element has them, e.g. value/disabled/type) or attributes (aria-*, data-*).
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv); // custom properties need setProperty
          else el.style[sk] = sv;
        }
      }
      else if (k.length > 2 && k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && !k.includes('-')) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** SVG from an inner-markup string (stroke icons, 24x24 viewBox). */
export function svgIcon(inner, cls = 'icon') {
  const span = document.createElement('span');
  span.className = cls;
  span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return span;
}

/* ---- cached setters: skip DOM writes when nothing changed ---- */

export function txt(el, s) {
  if (el._t !== s) {
    el._t = s;
    el.textContent = s;
  }
}

export function setCls(el, name, on) {
  const c = el._c || (el._c = {});
  const v = !!on;
  if (c[name] !== v) {
    c[name] = v;
    el.classList.toggle(name, v);
  }
}

export function setDisabled(el, on) {
  const v = !!on;
  if (el._d !== v) {
    el._d = v;
    el.disabled = v;
  }
}

export function setHidden(el, on) {
  const v = !!on;
  if (el._h !== v) {
    el._h = v;
    el.hidden = v;
  }
}

export function setStyle(el, prop, value) {
  const s = el._s || (el._s = {});
  if (s[prop] !== value) {
    s[prop] = value;
    el.style[prop] = value;
  }
}

export function setAttr(el, name, value) {
  const a = el._a || (el._a = {});
  if (a[name] !== value) {
    a[name] = value;
    el.setAttribute(name, value);
  }
}

/** Safe localStorage access for UI conveniences (remembered tab, collapsed sections). */
export const prefs = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
};
