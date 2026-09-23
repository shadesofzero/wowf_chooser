import { recommend, scoreRaces, factionFilter } from './scoring.js';

const app = document.getElementById('app');
let data;
let answers = {}; // {questionId: [answerId, ...]}
let step = 0;
let started = false;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const day = (d) => String(d).slice(0, 10);

// ---- URL hash state: #faction=horde&theme=holy,armor&done=1 ----
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  answers = {};
  for (const q of data.questions) {
    const v = p.get(q.id);
    if (v) answers[q.id] = v.split(',').filter((id) => q.answers.some((a) => a.id === id));
  }
  started = p.size > 0;
  const firstUnanswered = data.questions.findIndex((q) => !(q.id in answers));
  step = p.get('done') ? data.questions.length : firstUnanswered === -1 ? data.questions.length : firstUnanswered;
}
function writeHash() {
  const p = new URLSearchParams();
  for (const q of data.questions) if (answers[q.id]) p.set(q.id, answers[q.id].join(','));
  if (step >= data.questions.length) p.set('done', '1');
  history.replaceState(null, '', `#${p.toString().replace(/%2C/g, ',')}`);
}

function go(n) {
  step = Math.max(0, Math.min(n, data.questions.length));
  writeHash();
  render();
  window.scrollTo({ top: 0 });
}

// ---- Rendering ----
function render() {
  if (!started) return renderIntro();
  if (step >= data.questions.length) return renderResults();
  renderQuestion(data.questions[step]);
}

function renderIntro() {
  app.innerHTML = `
    <section class="intro card">
      <h1>Find your class in <span class="gold">World of Warcraft: Forever</span></h1>
      <p>Answer ${data.questions.length} quick questions about the fantasy, playstyle and content you enjoy.
      We'll recommend a class, spec and race — including the new combos and the Skyborne.</p>
      <p class="muted">${esc(data.meta.disclaimer)}</p>
      <button class="btn primary" id="start">Start</button>
    </section>`;
  document.getElementById('start').onclick = () => {
    started = true;
    go(0);
  };
}

function renderQuestion(q) {
  const selected = new Set(answers[q.id] || []);
  const multi = q.type === 'multi';
  const pct = Math.round((step / data.questions.length) * 100);
  app.innerHTML = `
    <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
      <div style="width:${pct}%"></div>
    </div>
    <section class="card question">
      <p class="step">Question ${step + 1} of ${data.questions.length}</p>
      <h2>${esc(q.text)}</h2>
      ${q.help ? `<p class="muted">${esc(q.help)}</p>` : ''}
      <div class="answers ${multi ? 'multi' : ''}">
        ${q.answers
          .map(
            (a) => `<button class="answer ${selected.has(a.id) ? 'selected' : ''}" data-id="${esc(a.id)}"
              aria-pressed="${selected.has(a.id)}">${esc(a.text)}</button>`
          )
          .join('')}
      </div>
      <div class="nav">
        <button class="btn" id="back" ${step === 0 ? 'disabled' : ''}>Back</button>
        ${multi ? `<span class="muted">${q.max ? `Pick up to ${q.max}` : ''}</span>
          <button class="btn primary" id="next">${selected.size ? 'Next' : 'Skip'}</button>` : ''}
      </div>
    </section>`;

  app.querySelectorAll('.answer').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.id;
      if (!multi) {
        answers[q.id] = [id];
        return go(step + 1);
      }
      const cur = new Set(answers[q.id] || []);
      if (cur.has(id)) cur.delete(id);
      else if (!q.max || cur.size < q.max) cur.add(id);
      answers[q.id] = [...cur];
      writeHash();
      renderQuestion(q);
    };
  });
  document.getElementById('back').onclick = () => go(step - 1);
  const next = document.getElementById('next');
  if (next)
    next.onclick = () => {
      answers[q.id] ||= [];
      go(step + 1);
    };
}

function stars(n) {
  return `<span class="stars" aria-label="${n} out of 5">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
}
function badge(conf) {
  const label = { confirmed: 'Confirmed', likely: 'Likely', speculative: 'Speculative' }[conf] || conf;
  return `<span class="badge ${esc(conf)}" title="Data confidence">${label}</span>`;
}

function renderResults() {
  const picks = recommend(data, answers, 3);
  const faction = factionFilter(data, answers);
  app.innerHTML = `
    <section class="results-head">
      <h1>Your top picks</h1>
      <p class="muted">${faction ? `Showing ${esc(data.factions[faction].name)} races only. ` : ''}
      Ranked by how well each spec fits your answers.</p>
      <div class="actions">
        <button class="btn" id="edit">Change answers</button>
        <button class="btn" id="restart">Start over</button>
        <button class="btn" id="share">Copy share link</button>
      </div>
    </section>
    ${picks.map((p, i) => resultCard(p, i)).join('')}`;

  document.getElementById('edit').onclick = () => go(data.questions.length - 1);
  document.getElementById('restart').onclick = () => {
    answers = {};
    go(0);
  };
  document.getElementById('share').onclick = async (e) => {
    try {
      await navigator.clipboard.writeText(location.href);
      e.target.textContent = 'Link copied!';
    } catch {
      e.target.textContent = 'Copy the URL from your address bar';
    }
  };
}

function resultCard({ cls, spec, reasons, alternatives }, i) {
  const races = scoreRaces(data, answers, cls, spec).slice(0, 2);
  const { vocab } = data;
  const v = spec.viability;
  return `
  <article class="card result" style="--cls:${esc(cls.color)}">
    <header>
      <span class="rank">#${i + 1}</span>
      <div>
        <h2>${esc(spec.name)} <span class="cls">${esc(cls.name)}</span></h2>
        <div class="chips">
          ${spec.roles.map((r) => `<span class="chip">${esc(vocab.roles[r])}</span>`).join('')}
          <span class="chip">${esc(cls.armor)}</span>
        </div>
      </div>
    </header>
    <p>${esc(spec.blurb)}</p>
    <p class="muted">${esc(cls.fantasy)}</p>

    ${reasons.length ? `<h3>Why it fits you</h3>
    <ul class="why">${reasons.slice(0, 4).map((r) => `<li>${esc(r.text)}</li>`).join('')}</ul>` : ''}

    <h3>Viability ${badge(v.confidence)}</h3>
    <dl class="viability">
      ${Object.keys(vocab.content).map((k) => `<div><dt>${esc(vocab.content[k])}</dt><dd>${stars(v[k])}</dd></div>`).join('')}
    </dl>

    <h3>Best races</h3>
    ${races.length ? `<div class="races">${races.map(raceCard).join('')}</div>` : '<p class="muted">No race matches your faction filter.</p>'}

    ${cls.changes?.length ? `<details>
      <summary>What's changed in Forever</summary>
      <ul class="changes">${cls.changes.map((c) => `<li>${esc(c.text)} ${badge(c.confidence)}</li>`).join('')}</ul>
    </details>` : ''}

    ${alternatives.length ? `<p class="alts">Other ${esc(cls.name)} specs: ${alternatives
      .map((a) => `${esc(a.spec.name)} (${a.spec.roles.map((r) => esc(vocab.roles[r])).join('/')})`)
      .join(', ')}</p>` : ''}

    <div class="links">
      <a class="btn" href="${esc(cls.links.guides)}" target="_blank" rel="noopener">${esc(cls.name)} guides on Wowhead ↗</a>
      <a class="btn" href="${esc(cls.links.talents)}" target="_blank" rel="noopener">Talent calculator ↗</a>
      <a class="btn" href="${esc(cls.links.class)}" target="_blank" rel="noopener">Class abilities ↗</a>
    </div>
  </article>`;
}

function raceCard({ race, variant, racials, isNew }) {
  const f = data.factions[variant.faction];
  return `
  <div class="race">
    <div class="race-head">
      <strong>${esc(variant.name || race.name)}</strong>
      <span class="faction" style="--fc:${esc(f.color)}">${esc(f.name)}</span>
      ${isNew ? `<span class="badge new">${race.new_race ? 'New race' : 'New combo'}</span>` : ''}
    </div>
    <ul class="racials">
      ${racials
        .map(
          (r) => `<li class="${r.relevant ? 'relevant' : ''}">
            <span class="rname">${esc(r.name)}</span> <span class="rtype">${r.type}</span>
            <span class="reffect">${esc(r.effect)}</span></li>`
        )
        .join('')}
    </ul>
    <p class="muted small">Highlighted racials help this spec. Racials: ${badge(race.racials_confidence)}
      · <a href="${esc(race.links.guide)}" target="_blank" rel="noopener">Race guide ↗</a></p>
  </div>`;
}

function renderFooter() {
  const m = data.meta;
  document.getElementById('phase').textContent = m.game_phase;
  const srcs = Object.values(data.sources)
    .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a> <span class="muted">(${esc(s.reliability)}, ${day(s.accessed)})</span></li>`)
    .join('');
  document.getElementById('foot').innerHTML = `
    <p>Data v${esc(m.data_version)} · last reviewed ${day(m.last_reviewed)}. Fan-made; not affiliated with Blizzard Entertainment.</p>
    <details><summary>Sources</summary><ul>${srcs}</ul></details>`;
}

async function init() {
  try {
    data = await (await fetch('data.json')).json();
  } catch {
    app.innerHTML = '<p class="card">Could not load data.json — run <code>npm run build</code> first.</p>';
    return;
  }
  renderFooter();
  readHash();
  render();
  document.getElementById('home').onclick = (e) => {
    e.preventDefault();
    answers = {};
    started = false;
    step = 0;
    history.replaceState(null, '', location.pathname);
    render();
  };
}

init();
