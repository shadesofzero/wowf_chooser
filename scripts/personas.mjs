// Sanity-check the scoring with a few personas: `npm test` (after `npm run build`).
import fs from 'node:fs';
import { recommend, scoreRaces } from '../site/scoring.js';

const data = JSON.parse(fs.readFileSync(new URL('../site/data.json', import.meta.url)));

const personas = [
  {
    name: 'Horde nature healer',
    answers: { faction: ['horde'], role: ['healer'], source: ['land'], scene: ['rescue'], content: ['raid'] },
    expectTop: ['shaman.restoration', 'druid.restoration'],
  },
  {
    name: 'Alliance stealth PvPer',
    answers: { faction: ['alliance'], role: ['melee'], source: ['training'], scene: ['vanish'], content: ['pvp'], complexity: ['complex'] },
    expectTop: ['rogue.subtlety', 'rogue.assassination'],
  },
  {
    name: 'Casual solo pet lover',
    answers: { role: ['ranged'], scene: ['hunt'], company: ['companion'], complexity: ['simple'], solo: ['very'], pet: ['love'] },
    expectTop: ['hunter.beast_mastery'],
  },
  {
    name: 'Holy plate tank, wants new stuff (Horde)',
    answers: { faction: ['horde'], role: ['tank'], source: ['faith'], scene: ['doorway'], novelty: ['new'] },
    expectTop: ['paladin.protection'],
    expectRace: 'undead',
  },
  {
    name: 'Raiding fire caster',
    answers: { role: ['ranged'], source: ['knowledge'], company: ['study'], content: ['raid'], pace: ['burst'], survival: ['glass'] },
    expectTop: ['mage.fire'],
  },
  {
    name: 'Dark scholar with a demon',
    answers: { role: ['ranged'], source: ['knowledge'], company: ['companion'], pet: ['love'] },
    expectTop: ['warlock.demonology', 'warlock.affliction'],
  },
  {
    name: 'Holy tank',
    answers: { role: ['tank'], source: ['faith'], company: ['center'] },
    expectTop: ['paladin.protection'],
    expectNoRole: ['healer', 'melee', 'ranged'],
  },
];

let failed = 0;
for (const p of personas) {
  const picks = recommend(data, p.answers, 3);
  const top = `${picks[0].cls.id}.${picks[0].spec.id}`;
  const races = scoreRaces(data, p.answers, picks[0].cls, picks[0].spec);
  const offRole = (p.expectNoRole || []).length && picks.some((r) => !r.spec.roles.some((x) => !p.expectNoRole.includes(x)));
  const ok = p.expectTop.includes(top) && (!p.expectRace || races[0]?.race.id === p.expectRace) && !offRole;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${p.name}`);
  for (const r of picks) console.log(`   ${r.score.toFixed(1).padStart(5)}  ${r.cls.name} ${r.spec.name}`);
  console.log(`   races: ${races.slice(0, 3).map((r) => `${r.variant.name || r.race.name} (${r.score.toFixed(1)})`).join(', ')}`);
}
if (failed) {
  console.error(`\n${failed} persona(s) failed`);
  process.exit(1);
}
