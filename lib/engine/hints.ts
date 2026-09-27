import type { Character, KillerSlot } from './types';

export function comboHint(slot: KillerSlot, ch: Character): string {
  const male = ch.gender === 'M';
  const gender = male ? 'homem' : 'mulher';
  const origin = ch.origin === 'BR' ? (male ? 'brasileiro' : 'brasileira') : male ? 'estrangeiro' : 'estrangeira';
  const born = male ? 'nascido' : 'nascida';
  return `O Assassino ${slot} é ${gender} ${origin} ${born} no século ${ch.century}.`;
}

export function areaHint(slot: KillerSlot, ch: Character): string {
  return `O Assassino ${slot} é da área de ${ch.area}.`;
}

/** As 4 dicas na ordem de liberação. */
export function generateHints(a: Character, b: Character): string[] {
  return [comboHint('A', a), comboHint('B', b), areaHint('A', a), areaHint('B', b)];
}

/** Personagens em jogo compatíveis com combinação + área (usado para validar a grade). */
export function matchingCharacters(
  characters: readonly Character[],
  target: Pick<Character, 'gender' | 'origin' | 'century' | 'area'>,
): Character[] {
  return characters.filter(
    (c) =>
      c.gender === target.gender &&
      c.origin === target.origin &&
      c.century === target.century &&
      c.area === target.area,
  );
}

/** Garante que combinação + área apontem um único personagem dentro do conjunto. */
export function isGridUnique(characters: readonly Character[]): boolean {
  const keys = new Set<string>();
  for (const c of characters) {
    const key = `${c.gender}|${c.origin}|${c.century}|${c.area}`;
    if (keys.has(key)) return false;
    keys.add(key);
  }
  return true;
}

/** Interpreta as frases das dicas de volta em atributos (para testes e conferência). */
export function parseHints(hints: readonly string[], slot: KillerSlot): Pick<Character, 'gender' | 'origin' | 'century' | 'area'> | null {
  const combo = hints.find((h) => h.startsWith(`O Assassino ${slot} é homem`) || h.startsWith(`O Assassino ${slot} é mulher`));
  const area = hints.find((h) => h.startsWith(`O Assassino ${slot} é da área de `));
  if (!combo || !area) return null;
  const m = combo.match(/é (homem|mulher) (brasileir[oa]|estrangeir[oa]) nascid[oa] no século (XIX|XX)\./);
  if (!m) return null;
  return {
    gender: m[1] === 'homem' ? 'M' : 'F',
    origin: m[2].startsWith('brasileir') ? 'BR' : 'EX',
    century: m[3] as Character['century'],
    area: area.replace(`O Assassino ${slot} é da área de `, '').replace(/\.$/, ''),
  };
}
