// Builds the profile cards in assets/ from live GitHub data.
// Runs daily in .github/workflows/profile-cards.yml; needs GITHUB_TOKEN.
import { readFile, writeFile } from 'node:fs/promises';

const LOGIN = process.env.PROFILE_LOGIN ?? 'mtnaskari';
const TOKEN = process.env.GITHUB_TOKEN;
const MIN_UPSTREAM_STARS = 200;

const THEMES = {
  light: { bg: '#f3f1ee', ink: '#121212', muted: '#6b6864', line: '#dedad4', accent: '#d23a2c' },
  dark: { bg: '#161616', ink: '#f3f1ee', muted: '#9a958f', line: '#2c2a28', accent: '#e0473a' },
};
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const compact = n => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n));
const clip = (s, max) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);
const star = (x, y, r, fill, cls = '') =>
  `<path class="${cls}" d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r} Z" fill="${fill}"/>`;

async function loadStats() {
  const { user } = await gql(
    `query($login: String!) {
      user(login: $login) {
        createdAt
        followers { totalCount }
        repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, first: 100) { nodes { stargazerCount } }
        contributionsCollection { contributionCalendar { totalContributions } }
      }
    }`,
    { login: LOGIN },
  );

  // Commits and daily contributions for every year since the account was created
  let commits = 0;
  let allContributions = 0;
  const days = [];
  for (let year = new Date(user.createdAt).getUTCFullYear(); year <= new Date().getUTCFullYear(); year++) {
    const { user: y } = await gql(
      `query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            totalCommitContributions restrictedContributionsCount
            contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
          }
        }
      }`,
      { login: LOGIN, from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` },
    );
    const c = y.contributionsCollection;
    commits += c.totalCommitContributions + c.restrictedContributionsCount;
    allContributions += c.contributionCalendar.totalContributions;
    for (const w of c.contributionCalendar.weeks) days.push(...w.contributionDays);
  }

  const today = new Date().toISOString().slice(0, 10);
  const past = [...new Map(days.map(d => [d.date, d])).values()]
    .filter(d => d.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  let longest = 0;
  let run = 0;
  for (const d of past) {
    run = d.contributionCount > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // Today without a contribution yet does not break the streak
  let current = 0;
  for (let i = past.length - 1; i >= 0; i--) {
    if (past[i].contributionCount > 0) current++;
    else if (i === past.length - 1) continue;
    else break;
  }

  const { user: langUser } = await gql(
    `query($login: String!) {
      user(login: $login) {
        repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, first: 100) {
          nodes { languages(first: 10, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } } }
        }
      }
    }`,
    { login: LOGIN },
  );
  const sizes = new Map();
  for (const repo of langUser.repositories.nodes)
    for (const e of repo.languages.edges) sizes.set(e.node.name, (sizes.get(e.node.name) ?? 0) + e.size);
  const ignored = new Set(['HTML', 'CSS', 'SCSS', 'Dockerfile', 'Shell', 'Makefile', 'PLpgSQL', 'Procfile']);
  const ranked = [...sizes].filter(([n]) => !ignored.has(n)).sort((a, b) => b[1] - a[1]);
  const langTotal = ranked.reduce((sum, [, size]) => sum + size, 0) || 1;
  const languages = ranked.filter(([, size]) => size / langTotal >= 0.01).slice(0, 6).map(([name, size]) => ({ name, share: size / langTotal }));

  const prs = await gql(`query($q: String!) { search(query: $q, type: ISSUE) { issueCount } }`, {
    q: `is:pr author:${LOGIN}`,
  });
  const upstream = await gql(
    `query($q: String!) {
      search(query: $q, type: ISSUE, first: 50) {
        issueCount
        nodes { ... on PullRequest { title url mergedAt repository { nameWithOwner stargazerCount } } }
      }
    }`,
    { q: `is:pr is:merged author:${LOGIN} -user:${LOGIN} sort:updated-desc` },
  );

  const notable = upstream.search.nodes
    .filter(pr => pr.repository.stargazerCount >= MIN_UPSTREAM_STARS)
    .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt));

  return {
    commits,
    contributionsThisYear: user.contributionsCollection.contributionCalendar.totalContributions,
    pullRequests: prs.search.issueCount,
    mergedUpstream: notable.length,
    stars: user.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0),
    notable: notable.slice(0, 4),
    streak: { current, longest, allContributions, since: new Date(user.createdAt).getUTCFullYear(), last: past.slice(-30) },
    languages,
  };
}

function headerCard(t) {
  const roles = ['Backend &amp; Systems', 'Node.js · Go · PostgreSQL', 'Open-source contributor'];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="880" height="230" viewBox="0 0 880 230" role="img" aria-label="Matin Askari, Software Engineer">
  <style>
    .spin { transform-box: fill-box; transform-origin: center; animation: spin 14s linear infinite; }
    .role { opacity: 0; animation: role 9s infinite; }
    .r1 { animation-delay: 3s; } .r2 { animation-delay: 6s; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes role { 0% { opacity: 0; transform: translateY(6px); } 4%, 30% { opacity: 1; transform: none; } 34%, 100% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .spin { animation: none; } .role { animation: none; } .r0 { opacity: 1; } }
  </style>
  <rect width="880" height="230" rx="20" fill="${t.bg}"/>
  <rect x="0.5" y="0.5" width="879" height="229" rx="19.5" fill="none" stroke="${t.line}"/>
  ${star(66, 64, 16, t.accent, 'spin')}
  ${star(820, 178, 7, t.line)}
  <text x="44" y="146" fill="${t.ink}" font-family="${SANS}" font-size="58" font-weight="700" letter-spacing="-2">Matin Askari</text>
  <text x="46" y="184" fill="${t.muted}" font-family="${MONO}" font-size="15">Software Engineer</text>
  <text x="208" y="184" fill="${t.accent}" font-family="${MONO}" font-size="15">/</text>
  ${roles.map((r, i) => `<text class="role r${i}" x="228" y="184" fill="${t.ink}" font-family="${MONO}" font-size="15">${r}</text>`).join('\n  ')}
  <text x="836" y="62" text-anchor="end" fill="${t.muted}" font-family="Vazirmatn, Tahoma, 'Segoe UI', sans-serif" font-size="17">متین عسکری</text>
</svg>
`;
}

function statsCard(t, s) {
  const items = [
    ['Commits', compact(s.commits), 'all time'],
    ['Contributions', compact(s.contributionsThisYear), 'last 12 months'],
    ['Pull requests', compact(s.pullRequests), 'opened'],
    ['Merged upstream', compact(s.mergedUpstream), `into ${MIN_UPSTREAM_STARS}+★ repos`],
    ['Stars', compact(s.stars), 'on my repos'],
  ];
  const col = 792 / items.length;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="880" height="190" viewBox="0 0 880 190" role="img" aria-label="GitHub stats">
  <rect width="880" height="190" rx="20" fill="${t.bg}"/>
  <rect x="0.5" y="0.5" width="879" height="189" rx="19.5" fill="none" stroke="${t.line}"/>
  ${star(52, 40, 6, t.accent)}
  <text x="66" y="45" fill="${t.muted}" font-family="${MONO}" font-size="13" letter-spacing="1.5">BY THE NUMBERS</text>
  ${items
    .map(([label, value, note], i) => {
      const x = 44 + i * col;
      const divider = i ? `<line x1="${x - 16}" y1="74" x2="${x - 16}" y2="156" stroke="${t.line}"/>` : '';
      return `${divider}
  <text x="${x}" y="130" fill="${t.ink}" font-family="${SANS}" font-size="44" font-weight="700" letter-spacing="-1.5">${esc(value)}</text>
  <text x="${x + 1}" y="84" fill="${t.ink}" font-family="${SANS}" font-size="14" font-weight="600">${esc(label)}</text>
  <text x="${x + 1}" y="154" fill="${t.muted}" font-family="${MONO}" font-size="11.5">${esc(note)}</text>`;
    })
    .join('\n  ')}
</svg>
`;
}

function ossCard(t, s) {
  const rowH = 46;
  const h = 76 + Math.max(s.notable.length, 1) * rowH + 18;
  const rows = s.notable.length
    ? s.notable
        .map((pr, i) => {
          const y = 76 + i * rowH;
          const [owner, name] = pr.repository.nameWithOwner.split('/');
          return `<line x1="44" y1="${y}" x2="836" y2="${y}" stroke="${t.line}"/>
  <text x="44" y="${y + 29}" font-family="${SANS}" font-size="17"><tspan fill="${t.muted}">${esc(owner)}/</tspan><tspan fill="${t.ink}" font-weight="700">${esc(name)}</tspan></text>
  <text x="836" y="${y + 29}" text-anchor="end" fill="${t.muted}" font-family="${MONO}" font-size="12.5">${esc(clip(pr.title, 52))}  <tspan fill="${t.accent}">★ ${compact(pr.repository.stargazerCount)}</tspan></text>`;
        })
        .join('\n  ')
    : `<text x="44" y="110" fill="${t.muted}" font-family="${MONO}" font-size="13">Coming soon.</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="880" height="${h}" viewBox="0 0 880 ${h}" role="img" aria-label="Pull requests merged into open-source projects">
  <rect width="880" height="${h}" rx="20" fill="${t.bg}"/>
  <rect x="0.5" y="0.5" width="879" height="${h - 1}" rx="19.5" fill="none" stroke="${t.line}"/>
  ${star(52, 40, 6, t.accent)}
  <text x="66" y="45" fill="${t.muted}" font-family="${MONO}" font-size="13" letter-spacing="1.5">MERGED UPSTREAM</text>
  ${rows}
</svg>
`;
}

function streakCard(t, s) {
  const { current, longest, allContributions, since, last } = s.streak;
  const max = Math.max(1, ...last.map(d => d.contributionCount));
  const bars = last
    .map((d, i) => {
      const h = d.contributionCount ? 6 + (d.contributionCount / max) * 38 : 3;
      return `<rect x="${36 + i * 12.2}" y="${170 - h}" width="8" height="${h}" rx="2" fill="${d.contributionCount ? t.accent : t.line}"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="432" height="200" viewBox="0 0 432 200" role="img" aria-label="Contribution streak: ${current} days">
  <rect width="432" height="200" rx="20" fill="${t.bg}"/>
  <rect x="0.5" y="0.5" width="431" height="199" rx="19.5" fill="none" stroke="${t.line}"/>
  ${star(42, 38, 6, t.accent)}
  <text x="56" y="43" fill="${t.muted}" font-family="${MONO}" font-size="13" letter-spacing="1.5">STREAK</text>
  <text x="36" y="100" fill="${t.ink}" font-family="${SANS}" font-size="46" font-weight="700" letter-spacing="-1.5">${current}<tspan font-size="16" font-weight="600" letter-spacing="0" fill="${t.muted}" dx="8">day${current === 1 ? '' : 's'} in a row</tspan></text>
  <text x="396" y="76" text-anchor="end" fill="${t.ink}" font-family="${SANS}" font-size="15" font-weight="600">${longest} days</text>
  <text x="396" y="94" text-anchor="end" fill="${t.muted}" font-family="${MONO}" font-size="11.5">longest</text>
  ${bars}
  <text x="36" y="188" fill="${t.muted}" font-family="${MONO}" font-size="11">last 30 days · ${compact(allContributions)} contributions since ${since}</text>
</svg>
`;
}

function languagesCard(t, s) {
  const width = 360;
  let x = 36;
  const shades = [t.accent, t.ink, t.muted, t.muted, t.line, t.line];
  const opacity = [1, 1, 1, 0.6, 1, 0.6];
  const bar = s.languages
    .map((l, i) => {
      const w = Math.max(3, l.share * width);
      const seg = `<rect x="${x}" y="64" width="${w}" height="12" fill="${shades[i]}" fill-opacity="${opacity[i]}"/>`;
      x += w;
      return seg;
    })
    .join('');
  const list = s.languages
    .map((l, i) => {
      const cx = 36 + (i % 2) * 184;
      const cy = 116 + Math.floor(i / 2) * 30;
      return `<circle cx="${cx + 5}" cy="${cy - 4}" r="5" fill="${shades[i]}" fill-opacity="${opacity[i]}"/>
  <text x="${cx + 18}" y="${cy}" fill="${t.ink}" font-family="${SANS}" font-size="14" font-weight="600">${esc(l.name)}</text>
  <text x="${cx + 168}" y="${cy}" text-anchor="end" fill="${t.muted}" font-family="${MONO}" font-size="12">${(l.share * 100).toFixed(1)}%</text>`;
    })
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="432" height="200" viewBox="0 0 432 200" role="img" aria-label="Most used languages">
  <defs><clipPath id="bar"><rect x="36" y="64" width="${width}" height="12" rx="6"/></clipPath></defs>
  <rect width="432" height="200" rx="20" fill="${t.bg}"/>
  <rect x="0.5" y="0.5" width="431" height="199" rx="19.5" fill="none" stroke="${t.line}"/>
  ${star(42, 38, 6, t.accent)}
  <text x="56" y="43" fill="${t.muted}" font-family="${MONO}" font-size="13" letter-spacing="1.5">LANGUAGES</text>
  <g clip-path="url(#bar)">${bar}</g>
  ${list}
  <text x="36" y="188" fill="${t.muted}" font-family="${MONO}" font-size="11">by code size · my own repositories</text>
</svg>
`;
}

async function updateWriting(readme) {
  const xml = await (await fetch('https://www.askari.pro/rss.xml')).text();
  const unxml = v => v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 4).map(([, item]) => {
    const get = tag => unxml(item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? '');
    const date = new Date(get('pubDate'));
    // Feed links have no locale prefix, which would redirect to the Persian site
    const link = get('link').replace('https://www.askari.pro/blog/', 'https://www.askari.pro/en/blog/');
    return `- <samp>${date.toISOString().slice(0, 10)}</samp> &nbsp; [${get('title').replace(/[[\]]/g, '')}](${link})`;
  });
  if (!items.length) return readme;
  return readme.replace(/(<!-- WRITING:START -->)[\s\S]*?(<!-- WRITING:END -->)/, `$1\n${items.join('\n')}\n$2`);
}

const stats = await loadStats();
for (const [name, theme] of Object.entries(THEMES)) {
  await writeFile(`assets/header-${name}.svg`, headerCard(theme));
  await writeFile(`assets/stats-${name}.svg`, statsCard(theme, stats));
  await writeFile(`assets/oss-${name}.svg`, ossCard(theme, stats));
  await writeFile(`assets/streak-${name}.svg`, streakCard(theme, stats));
  await writeFile(`assets/languages-${name}.svg`, languagesCard(theme, stats));
}
await writeFile('README.md', await updateWriting(await readFile('README.md', 'utf8')));
console.log(JSON.stringify({ ...stats, notable: stats.notable.map(p => p.repository.nameWithOwner), streak: { ...stats.streak, last: undefined } }));
