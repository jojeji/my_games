// QR code as inline SVG (encoder: vendor/qrcode.js, MIT, see vendor/LICENSE). Standard codes, scannable with any phone camera.
import qrcode from './vendor/qrcode.js';

/** Dark modules as rows of booleans. Version is picked automatically, error correction M. */
export function qrMatrix(text, ecc = 'M') {
  const q = qrcode(0, ecc);
  q.addData(String(text));
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => q.isDark(y, x)));
}

/** SVG markup with the 4-module quiet zone the standard asks for (dark on white, so it also works on a dark TV theme). */
export function qrSvg(text, { margin = 4, ecc = 'M', label = 'QR-Code' } = {}) {
  const m = qrMatrix(text, ecc);
  const n = m.length;
  let d = '';
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!m[y][x]) {
        x++;
        continue;
      }
      let e = x;
      while (e < n && m[y][e]) e++;
      d += `M${x + margin} ${y + margin}h${e - x}v1h${x - e}z`;
      x = e;
    }
  }
  const size = n + 2 * margin;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
