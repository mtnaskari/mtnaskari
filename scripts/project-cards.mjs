// Small linked cards for public projects: logo, name, one line, language.
// Usage: node scripts/project-cards.mjs   → assets/project-<name>-{light,dark}.svg
import { readFile, writeFile } from 'node:fs/promises';

const PROJECTS = [
  { name: 'goraz', blurb: 'Encrypted secrets, tokens and passwords for Go. No server.', lang: 'Go', color: '#00ADD8' },
  { name: 'shop-api', blurb: 'Coffee shop REST API with auth, orders and OpenAPI docs.', lang: 'TypeScript', color: '#3178C6' },
];
const THEMES = {
  light: { bg: '#f3f1ee', ink: '#121212', muted: '#6b6864', line: '#dedad4' },
  dark: { bg: '#161616', ink: '#f3f1ee', muted: '#9a958f', line: '#2c2a28' },
};
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function wrap(text, max) {
  const lines = [''];
  for (const w of text.split(' ')) {
    const l = lines.at(-1);
    if ((l + ' ' + w).trim().length > max) lines.push(w);
    else lines[lines.length - 1] = (l + ' ' + w).trim();
  }
  return lines.slice(0, 2);
}

for (const p of PROJECTS) {
  const logo = (await readFile(`assets/logos/${p.name}.svg`, 'utf8')).match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1];
  for (const [theme, t] of Object.entries(THEMES)) {
    const mark = logo.replaceAll('#121212', t.ink);
    const blurb = wrap(p.blurb, 34)
      .map((l, i) => `<text x="112" y="${70 + i * 19}" fill="${t.muted}" font-family="${SANS}" font-size="14">${esc(l)}</text>`)
      .join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="432" height="128" viewBox="0 0 432 128" role="img" aria-label="${p.name}">
  <rect width="432" height="128" rx="18" fill="${t.bg}"/>
  <rect x="0.5" y="0.5" width="431" height="127" rx="17.5" fill="none" stroke="${t.line}"/>
  <svg x="22" y="24" width="76" height="76" viewBox="0 0 256 256">${mark}</svg>
  <text x="112" y="44" fill="${t.ink}" font-family="${SANS}" font-size="20" font-weight="700" letter-spacing="-0.4">${esc(p.name)}</text>
  ${blurb}
  <circle cx="${400 - p.lang.length * 7.3}" cy="39" r="5" fill="${p.color}"/>
  <text x="410" y="44" text-anchor="end" fill="${t.muted}" font-family="${MONO}" font-size="12">${esc(p.lang)}</text>
</svg>
`;
    await writeFile(`assets/project-${p.name}-${theme}.svg`, svg);
  }
}
