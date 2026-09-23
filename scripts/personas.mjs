// Sanity-check the scoring with a few personas: `npm test` (after `npm run build`).
import fs from 'node:fs';
import { recommend, scoreRaces } from '../site/scoring.js';

const data = JSON.parse(fs.readFileSync(new URL('../site/data.json', import.meta.url)));

const personas = [
  {
    name: 'Horde nature healer',
    answers: { faction: ['horde'], role: ['healer'], theme: ['nature', 'elements'], content: ['raid'] },
    expectTop: ['shaman.restoration', 'druid.restoration'],
  },
  {
    name: 'Alliance stealth PvPer',
    answers: { faction: ['alliance'], role: ['melee'], theme: ['stealth'], content: ['pvp'], complexity: ['complex'] },
    expectTop: ['rogue.subtlety', 'rogue.assassination'],
  },
  {
    name: 'Casual solo pet lover',
    answers: { role: ['ranged'], theme: ['beasts'], complexity: ['simple'], solo: ['very'], pet: ['love'] },
    expectTop: ['hunter.beast_mastery'],
  },
  {
    name: 'Holy plate tank, wants new stuff (Horde)',
    answers: { faction: ['horde'], role: ['tank'], theme: ['holy', 'armor'], novelty: ['new'] },
    expectTop: ['paladin.protection'],
    expectRace: 'undead',
  },
  {
    name: 'Raiding fire caster',
    answers: { role: ['ranged'], theme: ['arcane'], content: ['raid'], pace: ['burst'], survival: ['glass'] },
    expectTop: ['mage.fire'],
  },
];

let failed = 0;
for (const p of personas) {
  const picks = recommend(data, p.answers, 3);
  const top = `${picks[0].cls.id}.${picks[0].spec.id}`;
  const races = scoreRaces(data, p.answers, picks[0].cls, picks[0].spec);
  const ok = p.expectTop.includes(top) && (!p.expectRace || races[0]?.race.id === p.expectRace);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${p.name}`);
  for (const r of picks) console.log(`   ${r.score.toFixed(1).padStart(5)}  ${r.cls.name} ${r.spec.name}`);
  console.log(`   races: ${races.slice(0, 3).map((r) => `${r.variant.name || r.race.name} (${r.score.toFixed(1)})`).join(', ')}`);
}
if (failed) {
  console.error(`\n${failed} persona(s) failed`);
  process.exit(1);
}
