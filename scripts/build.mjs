// Compile data/*.yaml into site/data.json, validating ids and cross-references.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const outFile = path.join(root, 'site', 'data.json');

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const load = (rel) => yaml.load(fs.readFileSync(path.join(dataDir, rel), 'utf8'));
const loadDir = (rel) =>
  fs.readdirSync(path.join(dataDir, rel))
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f) => ({ file: `${rel}/${f}`, ...load(`${rel}/${f}`) }));

const meta = load('meta.yaml');
const sources = load('sources.yaml');
const factions = load('factions.yaml');
const vocab = load('vocab.yaml');
const classes = loadDir('classes');
const races = loadDir('races');
const { questions } = load('questions.yaml');

const CONFIDENCE = ['confirmed', 'likely', 'speculative'];
const RELIABILITY = ['official', 'datamine', 'community'];
const CONTENT = Object.keys(vocab.content);

function checkIn(value, set, where) {
  if (!(value in set)) err(`${where}: unknown id "${value}"`);
}
function checkSources(list, where) {
  if (!list || list.length === 0) return warn(`${where}: no sources`);
  for (const s of list) if (!(s in sources)) err(`${where}: unknown source "${s}"`);
}
// Icons are Wowhead icon file names (e.g. classicon_mage); required where `need` is set.
function checkIcon(icon, where, need = false) {
  if (icon === undefined) return need && err(`${where}: missing icon`);
  if (!/^[a-z0-9_]+$/.test(icon)) err(`${where}: bad icon name "${icon}"`);
}
function checkConfidence(c, where) {
  if (!CONFIDENCE.includes(c)) err(`${where}: confidence must be one of ${CONFIDENCE.join('/')}, got "${c}"`);
}

for (const [id, s] of Object.entries(sources)) {
  if (!s.url || !s.title) err(`sources.${id}: needs url and title`);
  if (!RELIABILITY.includes(s.reliability)) err(`sources.${id}: bad reliability "${s.reliability}"`);
}
for (const [id, f] of Object.entries(factions)) checkIcon(f.icon, `factions.${id}`, true);

// Classes and specs
const classIds = new Set();
const specIds = new Set();
for (const c of classes) {
  const where = c.file;
  if (classIds.has(c.id)) err(`${where}: duplicate class id ${c.id}`);
  classIds.add(c.id);
  for (const k of ['name', 'color', 'fantasy', 'wowhead_class_id']) if (!c[k]) err(`${where}: missing ${k}`);
  checkIcon(c.icon, where, true);
  (c.changes || []).forEach((ch, i) => {
    checkConfidence(ch.confidence, `${where} changes[${i}]`);
    checkSources(ch.sources, `${where} changes[${i}]`);
  });
  for (const s of c.specs || []) {
    const sw = `${where} spec ${s.id}`;
    const full = `${c.id}.${s.id}`;
    if (specIds.has(full)) err(`${sw}: duplicate spec`);
    specIds.add(full);
    if (!s.roles?.length) err(`${sw}: needs roles`);
    checkIcon(s.icon, sw, true);
    s.roles?.forEach((r) => checkIn(r, vocab.roles, sw));
    s.themes?.forEach((t) => checkIn(t, vocab.themes, sw));
    s.racial_tags?.forEach((t) => checkIn(t, vocab.racial_tags, sw));
    for (const t of Object.keys(vocab.traits)) {
      const v = s.traits?.[t];
      if (typeof v !== 'number' || v < 0 || v > 3) err(`${sw}: trait ${t} must be 0-3, got ${v}`);
    }
    for (const t of Object.keys(s.traits || {})) checkIn(t, vocab.traits, `${sw} traits`);
    for (const k of CONTENT) {
      const v = s.viability?.[k];
      if (typeof v !== 'number' || v < 1 || v > 5) err(`${sw}: viability.${k} must be 1-5, got ${v}`);
    }
    checkConfidence(s.viability?.confidence, `${sw} viability`);
    checkSources(s.viability?.sources, `${sw} viability`);
  }
}

// Races
const raceIds = new Set();
const lookSet = vocab.looks;
for (const r of races) {
  const where = r.file;
  if (raceIds.has(r.id)) err(`${where}: duplicate race id ${r.id}`);
  raceIds.add(r.id);
  r.looks?.forEach((l) => checkIn(l, lookSet, where));
  checkIcon(r.icon, where, true);
  checkConfidence(r.racials_confidence, where);
  checkSources(r.sources, where);
  const checkRacials = (list, w) =>
    (list || []).forEach((rc) => {
      if (!['active', 'passive'].includes(rc.type)) err(`${w} ${rc.name}: type must be active/passive`);
      checkIcon(rc.icon, `${w} ${rc.name}`, true);
      rc.tags?.forEach((t) => checkIn(t, vocab.racial_tags, `${w} ${rc.name}`));
    });
  checkRacials(r.racials, where);
  if (!r.variants?.length) err(`${where}: needs at least one variant`);
  for (const v of r.variants || []) {
    const vw = `${where} variant ${v.faction}`;
    checkIn(v.faction, factions, vw);
    v.classes?.forEach((c) => {
      if (!classIds.has(c)) err(`${vw}: unknown class "${c}"`);
    });
    v.new_combos?.forEach((c) => {
      if (!v.classes.includes(c)) err(`${vw}: new combo ${c} not in class list`);
    });
    checkRacials(v.racials, vw);
    const count = (r.racials?.length || 0) + (v.racials?.length || 0);
    if (count !== 4) warn(`${vw}: has ${count} racials (Forever races have 4)`);
  }
}

// Every class must be playable by at least one race per faction.
for (const f of Object.keys(factions)) {
  for (const c of classIds) {
    const ok = races.some((r) => r.variants.some((v) => v.faction === f && v.classes.includes(c)));
    if (!ok) err(`No ${factions[f].name} race can play ${c}`);
  }
}

// Questions
const qIds = new Set();
for (const q of questions) {
  const where = `questions.${q.id}`;
  if (qIds.has(q.id)) err(`${where}: duplicate question id`);
  qIds.add(q.id);
  if (!['single', 'multi'].includes(q.type)) err(`${where}: type must be single/multi`);
  const aIds = new Set();
  for (const a of q.answers) {
    const aw = `${where}.${a.id}`;
    if (aIds.has(a.id)) err(`${aw}: duplicate answer id`);
    aIds.add(a.id);
    if (a.filter?.faction) checkIn(a.filter.faction, factions, aw);
    checkIcon(a.icon, aw);
    for (const e of a.effects || []) {
      if (typeof e.w !== 'number') err(`${aw}: effect missing numeric w`);
      if (e.role) checkIn(e.role, vocab.roles, aw);
      else if (e.theme) checkIn(e.theme, vocab.themes, aw);
      else if (e.trait) checkIn(e.trait, vocab.traits, aw);
      else if (e.viability) checkIn(e.viability, vocab.content, aw);
      else if (e.race_tag) checkIn(e.race_tag, vocab.racial_tags, aw);
      else if (e.look) checkIn(e.look, lookSet, aw);
      else if (!e.novelty) err(`${aw}: effect has no recognised key`);
    }
  }
}

for (const w of warnings) console.warn(`warn: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\n${errors.length} error(s); site/data.json not written.`);
  process.exit(1);
}

// Output: attach Wowhead links so the client doesn't need URL knowledge.
const WH = 'https://www.wowhead.com/forever';
const out = {
  iconBase: 'https://wow.zamimg.com/images/wow/icons',
  meta,
  sources,
  factions,
  vocab,
  questions,
  classes: classes.map(({ file, ...c }) => ({
    ...c,
    links: {
      class: `${WH}/class=${c.wowhead_class_id}/${c.id}`,
      guides: `${WH}/guides/classes/${c.id}`,
      talents: `${WH}/talent-calc/${c.id}`,
    },
  })),
  races: races.map(({ file, ...r }) => ({
    ...r,
    links: { guide: `${WH}/guide/new-race-class-combinations` },
  })),
};

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out));
console.log(
  `Built site/data.json: ${classes.length} classes, ${specIds.size} specs, ${races.length} races, ${questions.length} questions (data v${meta.data_version}).`
);
