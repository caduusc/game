import type { Character } from './types';

const ARTICLES = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas']);

/** Remove acentos, pontuação, espaços extras e converte para minúsculas. */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Normaliza e remove artigo inicial ("o pente" → "pente"). */
function normalizeLoose(input: string): string {
  const words = normalize(input).split(' ');
  if (words.length > 1 && ARTICLES.has(words[0])) words.shift();
  return words.join(' ');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Tolerância: distância 1, ou 2 para respostas com mais de 8 caracteres. */
export function tolerance(expected: string): number {
  return expected.length > 8 ? 2 : 1;
}

/** Compara uma resposta digitada com uma lista de respostas aceitas. */
export function matchAnswer(input: string | null | undefined, accepted: readonly string[]): boolean {
  if (!input) return false;
  const given = normalizeLoose(input);
  if (!given) return false;
  const givenCompact = given.replace(/ /g, '');
  return accepted.some((raw) => {
    const exp = normalizeLoose(raw);
    if (!exp) return false;
    const tol = tolerance(exp);
    if (levenshtein(given, exp) <= tol) return true;
    // "guarda chuva" x "guardachuva"
    return levenshtein(givenCompact, exp.replace(/ /g, '')) <= tol;
  });
}

const MONTHS: Record<string, number> = {
  janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, mar: 3, abril: 4, abr: 4,
  maio: 5, mai: 5, junho: 6, jun: 6, julho: 7, jul: 7, agosto: 8, ago: 8,
  setembro: 9, set: 9, outubro: 10, out: 10, novembro: 11, nov: 11, dezembro: 12, dez: 12,
};

/**
 * Interpreta datas como 14/03/1879, 14-03-1879, 14 03 1879, 14031879,
 * 14.3.1879 ou "14 de março de 1879". Retorna ISO YYYY-MM-DD ou null.
 */
export function parseDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const n = normalize(input).replace(/\bde\b/g, ' ').replace(/\s+/g, ' ').trim();
  let d: number, m: number, y: number;
  const compact = n.replace(/ /g, '');
  if (/^\d{8}$/.test(compact) && !n.includes(' ')) {
    d = +compact.slice(0, 2);
    m = +compact.slice(2, 4);
    y = +compact.slice(4);
  } else {
    const parts = n.split(' ');
    if (parts.length !== 3) return null;
    d = +parts[0];
    m = /^\d+$/.test(parts[1]) ? +parts[1] : (MONTHS[parts[1]] ?? NaN);
    y = +parts[2];
  }
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return null;
  if (y < 100 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y.toString().padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function matchDate(input: string | null | undefined, expectedIso: string): boolean {
  return parseDate(input) === expectedIso;
}

/** Sinônimos aceitos para cada país do banco (forma canônica → formas aceitas). */
export const COUNTRY_SYNONYMS: Record<string, string[]> = {
  Brasil: ['brasil', 'brazil'],
  Holanda: ['holanda', 'paises baixos', 'netherlands'],
  'Índia': ['india'],
  Alemanha: ['alemanha', 'germany'],
  Inglaterra: ['inglaterra', 'reino unido', 'gra bretanha', 'england', 'uk'],
  'África do Sul': ['africa do sul', 'south africa'],
  EUA: ['eua', 'estados unidos', 'estados unidos da america', 'usa', 'america', 'us'],
  'Polônia': ['polonia', 'poland'],
  'França': ['franca', 'france'],
  'México': ['mexico'],
  'Romênia': ['romenia', 'romania'],
};

export function matchCountry(input: string | null | undefined, expected: string): boolean {
  if (!input) return false;
  const given = normalize(input);
  const synonyms = COUNTRY_SYNONYMS[expected] ?? [normalize(expected)];
  return synonyms.some((s) => {
    // Siglas curtas exigem igualdade exata.
    if (s.length <= 3) return given === s;
    return levenshtein(given, s) <= tolerance(s);
  });
}

function characterForms(ch: Character): string[] {
  return [ch.name, ...ch.aliases];
}

/**
 * Identifica qual personagem (dentre os fornecidos) o texto descreve.
 * Retorna o id ou null se nenhum (ou mais de um) casar.
 */
export function matchCharacter(input: string | null | undefined, characters: readonly Character[]): string | null {
  if (!input) return null;
  const given = normalizeLoose(input);
  if (!given) return null;
  let best: { id: string; dist: number } | null = null;
  let tie = false;
  for (const ch of characters) {
    for (const form of characterForms(ch)) {
      const exp = normalizeLoose(form);
      const dist = levenshtein(given, exp);
      if (dist > tolerance(exp)) continue;
      if (!best || dist < best.dist) {
        best = { id: ch.id, dist };
        tie = false;
      } else if (dist === best.dist && best.id !== ch.id) {
        tie = true;
      }
    }
  }
  return best && !tie ? best.id : null;
}

export function matchWeapon(input: string | null | undefined, ch: Character): boolean {
  return matchAnswer(input, [ch.weapon, ...ch.weaponAliases]);
}
