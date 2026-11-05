// Netz tab: the layer tree as an SVG. Nodes top to bottom by prestige depth, forks side by side, locked parts as silhouettes.
import { h, txt, setCls, setAttr } from '../../engine/ui/dom.js';
import { NODES, EDGES, nodeById, nodeInfo } from './nodes.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const c of kids) if (c) e.append(c);
  return e;
};

const W = 360;
const ROW_H = 104;
const TOP = 52;
const R = 31; // node radius (62 px at 360 wide)
const COL_X = 92;
const px = (n) => W / 2 + n.col * COL_X;
const py = (n) => TOP + n.row * ROW_H;

/**
 * @param {{g:object, onOpen:(id:string)=>void, onChoose:()=>void, toast:Function}} ctx
 */
export function buildTree(ctx) {
  const { g } = ctx;
  const height = TOP + 6 * ROW_H + R + 34;
  const svg = el('svg', { viewBox: `0 0 ${W} ${height}`, class: 'tree-svg', role: 'group', 'aria-label': 'Das Netz' });
  const edgeEls = EDGES.map(([a, b]) => {
    const A = nodeById[a];
    const B = nodeById[b];
    const mid = (py(A) + py(B)) / 2;
    const p = el('path', { d: `M${px(A)} ${py(A) + R} C${px(A)} ${mid} ${px(B)} ${mid} ${px(B)} ${py(B) - R}`, class: 'tree-edge' });
    svg.append(p);
    return { a, b, p };
  });
  const forkText = (row) => {
    const t = el('text', { x: W / 2, y: TOP + row * ROW_H + 5, class: 'tree-or', 'text-anchor': 'middle' });
    t.textContent = 'oder';
    svg.append(t);
    return t;
  };
  const orA = forkText(2);
  forkText(4);

  const nodes = NODES.map((n) => {
    const x = px(n);
    const y = py(n);
    const ring = el('circle', { cx: x, cy: y, r: R + 5, class: 'tree-ring' });
    const body = el('circle', { cx: x, cy: y, r: R, class: 'tree-body' });
    const letter = el('text', { x, y: y - 2, class: 'tree-letter', 'text-anchor': 'middle' });
    letter.textContent = n.short;
    const stock = el('text', { x, y: y + 16, class: 'tree-stock', 'text-anchor': 'middle' });
    const label = el('text', { x, y: y + R + 17, class: 'tree-label', 'text-anchor': 'middle' });
    const dot = el('circle', { cx: x + 22, cy: y - 22, r: 7, class: 'tree-dot' });
    const g1 = el('g', { class: 'tree-node', tabindex: '0', role: 'button', 'data-node': n.id }, ring, body, letter, stock, dot, label);
    g1.addEventListener('click', () => tap(n.id));
    g1.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), tap(n.id)));
    svg.append(g1);
    return { n, g1, letter, stock, label, dot };
  });

  function tap(id) {
    const info = nodeInfo(g, id);
    if (info.kind === 'open') ctx.onOpen(id);
    else if (info.kind === 'choose') ctx.onChoose();
    else ctx.toast(info.hint || 'Noch verborgen.', { kind: 'info', ms: 2600, title: info.kind === 'teaser' ? '?' : nodeById[id].name });
  }

  const intro = h('p', { class: 'muted small tree-intro', text: 'Tippe auf einen Knoten. Oben wächst es zuerst, tiefer unten kommt später.' });
  return {
    el: h('div', { class: 'tree' }, intro, h('div', { class: 'tree-wrap' }, svg)),
    update() {
      const infos = {};
      for (const nd of nodes) {
        const info = nodeInfo(g, nd.n.id);
        infos[nd.n.id] = info;
        const k = info.kind;
        setAttr(nd.g1, 'data-kind', k);
        setAttr(nd.g1, 'aria-label', `${nd.n.name}${k === 'open' ? ', ' + info.stock : ''}${info.glow ? ', bereit' : ''}`);
        txt(nd.letter, k === 'open' || k === 'choose' || k === 'closed' ? nd.n.short : '?');
        txt(nd.stock, info.stock);
        txt(nd.label, k === 'open' || k === 'choose' || k === 'closed' ? nd.n.name : '???');
        setCls(nd.g1, 'glow', info.glow);
        setCls(nd.dot, 'show', info.dot);
      }
      for (const e of edgeEls) {
        const ka = infos[e.a].kind;
        const kb = infos[e.b].kind;
        setCls(e.p, 'on', (ka === 'open' || ka === 'choose') && kb === 'open');
      }
      setCls(orA, 'on', infos.s.kind === 'choose');
    },
  };
}
