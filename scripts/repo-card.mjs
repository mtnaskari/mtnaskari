// Builds a 1280x640 social preview card for a repository, in light and dark.
// Usage: node scripts/repo-card.mjs goraz   → cards/goraz-light.svg, cards/goraz-dark.svg
import { mkdir, writeFile } from 'node:fs/promises';

const REPOS = {
  goraz: {
    title: 'goraz',
    wordplay: ['Go', 'راز', '“secret” in Persian'],
    description: 'Encrypted secrets, API tokens and passwords for Go services and the command line. No server needed.',
    stack: [
      { icon: 'go', label: 'Go', color: '#00ADD8' },
      { icon: 'docker', label: 'Docker', color: '#2496ED' },
      { icon: 'kubernetes', label: 'Kubernetes', color: '#326CE5' },
      { label: 'XChaCha20-Poly1305' },
      { label: 'Argon2id' },
    ],
  },
};

const THEMES = {
  light: { bg: '#f3f1ee', ink: '#121212', soft: '#3a3836', muted: '#6b6864', line: '#dedad4', chip: '#ebe8e3', accent: '#d23a2c' },
  dark: { bg: '#141414', ink: '#f3f1ee', soft: '#d6d2cc', muted: '#9a958f', line: '#2a2826', chip: '#1e1d1c', accent: '#e0473a' },
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
    const line = lines[lines.length - 1];
    if ((line + ' ' + word).trim().length > max) lines.push(word);
    else lines[lines.length - 1] = (line + ' ' + word).trim();
  }
  return lines;
}

async function card(repo, t) {
  const icons = await Promise.all(repo.stack.map(s => (s.icon ? iconPath(s.icon) : null)));
  let x = 96;
  const chips = repo.stack
    .map((s, i) => {
      const iconW = icons[i] ? 38 : 0;
      const w = 40 + iconW + s.label.length * (icons[i] ? 13.2 : 12.6);
      const icon = icons[i]
        ? `<g transform="translate(${x + 20} 522) scale(1.25)"><path d="${icons[i]}" fill="${s.color}"/></g>`
        : '';
      const chip = `<rect x="${x}" y="508" width="${w}" height="58" rx="29" fill="${t.chip}" stroke="${t.line}"/>
  ${icon}
  <text x="${x + 20 + iconW}" y="545" fill="${t.ink}" font-family="${icons[i] ? SANS : MONO}" font-size="${icons[i] ? 23 : 21}" font-weight="${icons[i] ? 600 : 400}">${esc(s.label)}</text>`;
      x += w + 14;
      return chip;
    })
    .join('\n  ');
  const [a, b, note] = repo.wordplay;
  const desc = wrap(repo.description, 56)
    .map((line, i) => `<text x="96" y="${400 + i * 44}" fill="${t.soft}" font-family="${SANS}" font-size="31">${esc(line)}</text>`)
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640">
  <rect width="1280" height="640" fill="${t.bg}"/>
  <rect x="28" y="28" width="1224" height="584" rx="32" fill="none" stroke="${t.line}" stroke-width="2"/>
  <clipPath id="frame"><rect x="29" y="29" width="1222" height="582" rx="31"/></clipPath>
  <g clip-path="url(#frame)">${star(1080, 190, 200, `fill="${t.line}" fill-opacity="0.55"`)}</g>
  ${star(1186, 360, 30, `fill="${t.accent}"`)}
  ${star(108, 112, 14, `fill="${t.accent}"`)}
  <text x="134" y="120" fill="${t.muted}" font-family="${MONO}" font-size="23">mtnaskari /</text>
  <text x="92" y="292" fill="${t.ink}" font-family="${SANS}" font-size="172" font-weight="800" letter-spacing="-7">${esc(repo.title)}</text>
  <text x="${100 + repo.title.length * 92}" y="292" fill="${t.muted}" font-family="${MONO}" font-size="24"><tspan>${esc(a)}</tspan><tspan fill="${t.accent}"> + </tspan><tspan font-family="${FA}" font-size="28">${esc(b)}</tspan></text>
  <text x="${100 + repo.title.length * 92}" y="256" fill="${t.muted}" font-family="${MONO}" font-size="17">${esc(note)}</text>
  ${desc}
  ${chips}
</svg>
`;
}

const name = process.argv[2];
const repo = REPOS[name];
if (!repo) throw new Error(`Unknown repository "${name}". Known: ${Object.keys(REPOS).join(', ')}`);
await mkdir('cards', { recursive: true });
for (const [theme, t] of Object.entries(THEMES)) await writeFile(`cards/${name}-${theme}.svg`, await card(repo, t));
console.log(`cards/${name}-light.svg, cards/${name}-dark.svg`);
