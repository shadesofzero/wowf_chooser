// Pure scoring logic shared by the browser app and the Node persona checks.

const ROLE_SECONDARY = 0.85; // a spec's non-primary roles score slightly lower

/** Flatten answers ({questionId: [answerId]}) into [{question, answer}] pairs. */
export function chosen(data, answers) {
  const out = [];
  for (const q of data.questions) {
    for (const id of answers[q.id] || []) {
      const a = q.answers.find((x) => x.id === id);
      if (a) out.push({ question: q, answer: a });
    }
  }
  return out;
}

export function factionFilter(data, answers) {
  for (const { answer } of chosen(data, answers)) if (answer.filter?.faction) return answer.filter.faction;
  return null;
}

/** Score every spec. Returns [{cls, spec, score, reasons: [{text, value}]}] sorted desc. */
export function scoreSpecs(data, answers) {
  const picks = chosen(data, answers);
  const { vocab } = data;
  const results = [];
  for (const cls of data.classes) {
    for (const spec of cls.specs) {
      let score = 0;
      const reasons = [];
      const add = (value, text) => {
        score += value;
        if (text) reasons.push({ text, value });
      };
      let bestRole = null; // role picks don't stack, so dual-role specs aren't favoured
      for (const { answer } of picks) {
        for (const e of answer.effects || []) {
          if (e.role) {
            const i = spec.roles.indexOf(e.role);
            const v = i < 0 ? 0 : e.w * (i === 0 ? 1 : ROLE_SECONDARY);
            if (v > (bestRole?.v ?? 0)) bestRole = { v, text: `Fills your chosen role: ${vocab.roles[e.role]}` };
          } else if (e.theme) {
            if (spec.themes.includes(e.theme)) add(e.w, `Matches your fantasy: ${vocab.themes[e.theme]}`);
          } else if (e.trait) {
            const t = vocab.traits[e.trait];
            const v = e.w * (spec.traits[e.trait] - 1.5);
            add(v, v > 0 ? (e.w > 0 ? t.high : t.low) : null);
          } else if (e.viability) {
            const v = (e.w * (spec.viability[e.viability] - 3)) / 1.5;
            add(v, v > 0 ? `Rated well for ${vocab.content[e.viability]}` : null);
          }
        }
      }
      if (bestRole) add(bestRole.v, bestRole.text);
      results.push({ cls, spec, score, reasons: topReasons(reasons) });
    }
  }
  return results.sort((a, b) => b.score - a.score);
}

function topReasons(reasons) {
  const merged = new Map();
  for (const r of reasons) if (r.value > 0) merged.set(r.text, (merged.get(r.text) || 0) + r.value);
  return [...merged].sort((a, b) => b[1] - a[1]).map(([text, value]) => ({ text, value }));
}

/** Top N specs, at most one per class, each with its class's other specs attached. */
export function recommend(data, answers, n = 3) {
  const all = scoreSpecs(data, answers);
  const seen = new Set();
  const picks = [];
  for (const r of all) {
    if (seen.has(r.cls.id)) continue;
    seen.add(r.cls.id);
    picks.push({ ...r, alternatives: all.filter((x) => x.cls.id === r.cls.id && x !== r) });
    if (picks.length === n) break;
  }
  return picks;
}

/** Score race variants for a class/spec. Returns [{race, variant, score, racials, isNew}] sorted desc. */
export function scoreRaces(data, answers, cls, spec) {
  const picks = chosen(data, answers);
  const faction = factionFilter(data, answers);
  const out = [];
  for (const race of data.races) {
    for (const variant of race.variants) {
      if (faction && variant.faction !== faction) continue;
      if (!variant.classes.includes(cls.id)) continue;
      const isNew = Boolean(race.new_race || variant.new_combos?.includes(cls.id));
      const racials = [...(race.racials || []), ...(variant.racials || [])].map((r) => {
        const matches = (r.tags || []).filter((t) => spec.racial_tags.includes(t));
        return { ...r, relevant: matches.length > 0, matches };
      });
      let score = 0;
      for (const r of racials) {
        if (r.relevant) score += (1 + 0.5 * (r.matches.length - 1)) * (r.type === 'active' ? 1.2 : 1);
      }
      for (const { answer } of picks) {
        for (const e of answer.effects || []) {
          if (e.race_tag) score += e.w * racials.filter((r) => r.tags?.includes(e.race_tag)).length;
          else if (e.look && race.looks?.includes(e.look)) score += e.w;
          else if (e.novelty && isNew) score += e.w;
        }
      }
      out.push({ race, variant, score, racials, isNew });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
