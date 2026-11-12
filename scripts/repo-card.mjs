// Builds a 1280x640 banner / social preview for a repository, in light and dark.
// Usage: node scripts/repo-card.mjs goraz   → cards/goraz-light.svg, cards/goraz-dark.svg
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const REPOS = {
  goraz: {
    wordplay: [{ text: 'Go' }, { text: 'راز', fa: true }],
    note: '“secret” in Persian',
    description: 'Encrypted secrets, API tokens and passwords for Go services and the command line. No server needed.',
    stack: [
      { icon: 'go', label: 'Go', color: '#00ADD8' },
      { icon: 'docker', label: 'Docker', color: '#2496ED' },
      { icon: 'kubernetes', label: 'Kubernetes', color: '#326CE5' },
      { label: 'XChaCha20-Poly1305' },
    ],
  },
  kabot: {
    wordplay: [{ text: 'کبوتر', fa: true }, { text: 'bot' }],
    note: 'carrier pigeon + bot',
    description: 'A website message box that delivers to Telegram and Bale, running on a single Cloudflare Worker.',
    stack: [
      { icon: 'cloudflareworkers', label: 'Workers', color: '#F38020' },
      { icon: 'typescript', label: 'TypeScript', color: '#3178C6' },
      { icon: 'telegram', label: 'Telegram', color: '#26A5E4' },
      { label: 'Bale' },
      { label: 'D1' },
    ],
  },
  'shop-api': {
    note: 'REST API · coffee shop',
    description: 'Coffee shop REST API: JWT auth with roles, product search, orders and OpenAPI docs.',
    stack: [
      { icon: 'typescript', label: 'TypeScript', color: '#3178C6' },
      { icon: 'express', label: 'Express', color: null },
      { icon: 'mongodb', label: 'MongoDB', color: '#47A248' },
      { icon: 'swagger', label: 'OpenAPI', color: '#85EA2D' },
      { icon: 'docker', label: 'Docker', color: '#2496ED' },
    ],
  },
};

const THEMES = {
  light: { bg: '#f3f1ee', ink: '#121212', soft: '#3a3836', muted: '#6b6864', line: '#dedad4', chip: '#ebe8e3', tile: '#ffffff', accent: '#d23a2c' },
  dark: { bg: '#141414', ink: '#f3f1ee', soft: '#d6d2cc', muted: '#9a958f', line: '#2a2826', chip: '#1e1d1c', tile: '#1b1a19', accent: '#e0473a' },
};
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const FA = "Vazirmatn, Tahoma, 'Segoe UI', sans-serif";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const star = (x, y, r, attrs) =>
  `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r} Z" ${attrs}/>`;

async function iconPath(name) {
  const svg = await (await fetch(`https://cdn.jsdelivr.net/npm/simple-icons@13.0.0/icons/${name}.svg`)).text();
  return svg.match(/ d="([^"]+)"/)[1];
}

function wrap(text, max) {
  const lines = [''];
  for (const word of text.split(' ')) {
    const line = lines.at(-1);
    if ((line + ' ' + word).trim().length > max) lines.push(word);
    else lines[lines.length - 1] = (line + ' ' + word).trim();
  }
  return lines;
}

async function card(name, repo, t) {
  const logo = (await readFile(`assets/logos/${name}.svg`, 'utf8')).match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1].replaceAll('#121212', t.ink);
  const icons = await Promise.all(repo.stack.map(s => (s.icon ? iconPath(s.icon) : null)));
  let x = 96;
  const chips = repo.stack
    .map((s, i) => {
      const iconW = icons[i] ? 34 : 0;
      const w = 36 + iconW + s.label.length * (icons[i] ? 12.4 : 11.6);
      const icon = icons[i]
        ? `<g transform="translate(${x + 18} 525) scale(1.1)"><path d="${icons[i]}" fill="${s.color ?? t.ink}"/></g>`
        : '';
      const chip = `<rect x="${x}" y="512" width="${w}" height="52" rx="26" fill="${t.chip}" stroke="${t.line}"/>
  ${icon}
  <text x="${x + 18 + iconW}" y="545" fill="${t.ink}" font-family="${icons[i] ? SANS : MONO}" font-size="${icons[i] ? 21 : 19}" font-weight="${icons[i] ? 600 : 400}">${esc(s.label)}</text>`;
      x += w + 12;
      return chip;
    })
    .join('\n  ');
  const size = Math.min(150, Math.floor(600 / (name.length * 0.56)));
  const titleW = name.length * size * 0.56;
  const wordplay = repo.wordplay
    ? `<text x="${96 + titleW + 28}" y="${200 + size * 0.04}" fill="${t.muted}" font-family="${MONO}" font-size="22">${repo.wordplay
        .map((p, i) => `${i ? `<tspan fill="${t.accent}"> + </tspan>` : ''}<tspan${p.fa ? ` font-family="${FA}" font-size="26"` : ''}>${esc(p.text)}</tspan>`)
        .join('')}</text>`
    : '';
  const desc = wrap(repo.description, 40)
    .map((line, i) => `<text x="96" y="${330 + i * 42}" fill="${t.soft}" font-family="${SANS}" font-size="30">${esc(line)}</text>`)
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640">
  <rect width="1280" height="640" fill="${t.bg}"/>
  <rect x="28" y="28" width="1224" height="584" rx="32" fill="none" stroke="${t.line}" stroke-width="2"/>
  ${star(108, 108, 13, `fill="${t.accent}"`)}
  <text x="132" y="116" fill="${t.muted}" font-family="${MONO}" font-size="22">mtnaskari / ${esc(repo.note)}</text>
  <text x="90" y="${150 + size * 0.72}" fill="${t.ink}" font-family="${SANS}" font-size="${size}" font-weight="800" letter-spacing="${-size * 0.04}">${esc(name)}</text>
  ${wordplay}
  ${desc}
  ${chips}
  <rect x="842" y="96" width="340" height="340" rx="44" fill="${t.tile}" stroke="${t.line}" stroke-width="2"/>
  <svg x="882" y="136" width="260" height="260" viewBox="0 0 256 256">${logo}</svg>
  ${star(1182, 436, 16, `fill="${t.accent}"`)}
</svg>
`;
}

const names = process.argv.slice(2);
await mkdir('cards', { recursive: true });
for (const name of names) {
  const repo = REPOS[name];
  if (!repo) throw new Error(`Unknown repository "${name}". Known: ${Object.keys(REPOS).join(', ')}`);
  for (const [theme, t] of Object.entries(THEMES)) await writeFile(`cards/${name}-${theme}.svg`, await card(name, repo, t));
}
console.log(names.map(n => `cards/${n}-{light,dark}.svg`).join(' '));
