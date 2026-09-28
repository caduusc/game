/**
 * Gera os seeds SQL a partir dos bancos em TypeScript (fonte única).
 *   npm run seed:generate
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CHARACTERS } from '../lib/engine/data/characters';
import { QUIZ } from '../lib/engine/data/quiz';
import { RIDDLES } from '../lib/engine/data/riddles';

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (xs: string[]) => (xs.length ? `array[${xs.map(q).join(', ')}]::text[]` : `'{}'::text[]`);

const header = '-- Arquivo gerado por scripts/generate-seed.ts — não edite à mão.\n';

const characters =
  header +
  'insert into game_private.characters (id, name, birth, country, gender, origin, century, area, weapon, aliases, weapon_aliases) values\n' +
  CHARACTERS.map(
    (c) =>
      `  (${q(c.id)}, ${q(c.name)}, ${q(c.birth)}, ${q(c.country)}, ${q(c.gender)}, ${q(c.origin)}, ${q(c.century)}, ${q(c.area)}, ${q(c.weapon)}, ${arr(c.aliases)}, ${arr(c.weaponAliases)})`,
  ).join(',\n') +
  '\non conflict (id) do update set\n' +
  '  name = excluded.name, birth = excluded.birth, country = excluded.country, gender = excluded.gender,\n' +
  '  origin = excluded.origin, century = excluded.century, area = excluded.area, weapon = excluded.weapon,\n' +
  '  aliases = excluded.aliases, weapon_aliases = excluded.weapon_aliases;\n';

const riddles =
  header +
  'insert into game_private.riddles (id, question, answers) values\n' +
  RIDDLES.map((r) => `  (${r.id}, ${q(r.question)}, ${arr(r.answers)})`).join(',\n') +
  '\non conflict (id) do update set question = excluded.question, answers = excluded.answers;\n';

const quiz =
  header +
  'insert into game_private.quiz (id, question, options, answer) values\n' +
  QUIZ.map((x) => `  (${x.id}, ${q(x.question)}, ${arr(x.options)}, ${x.answer})`).join(',\n') +
  '\non conflict (id) do update set question = excluded.question, options = excluded.options, answer = excluded.answer;\n' +
  `delete from game_private.quiz where id > ${QUIZ.length};\n`;

const root = path.resolve(__dirname, '..', 'supabase');
mkdirSync(path.join(root, 'seed'), { recursive: true });
// Remove versões antigas caso algum personagem saia do banco.
const cleanup = `delete from game_private.characters where id not in (${CHARACTERS.map((c) => q(c.id)).join(', ')});\n`;
writeFileSync(path.join(root, 'seed', 'characters.sql'), characters + cleanup);
writeFileSync(path.join(root, 'seed', 'riddles.sql'), riddles);
writeFileSync(path.join(root, 'seed', 'quiz.sql'), quiz);
writeFileSync(path.join(root, 'seed.sql'), `${characters}${cleanup}\n${riddles.replace(header, '')}\n${quiz.replace(header, '')}`);

// Arquivo único para colar no SQL Editor do Supabase: migrations + seed.
const migrationsDir = path.join(root, 'migrations');
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => `-- ===== ${f}\n${readFileSync(path.join(migrationsDir, f), 'utf8')}`);
writeFileSync(
  path.join(root, 'setup.sql'),
  `-- Alergia — setup completo (migrations + seed). Gerado por scripts/generate-seed.ts.\n` +
    `-- Cole tudo no SQL Editor do Supabase e execute uma vez, num projeto novo.\n\n` +
    `${migrations.join('\n')}\n-- ===== seed.sql\n${characters}${cleanup}\n${riddles.replace(header, '')}\n${quiz.replace(header, '')}`,
);
console.log(`Gerado: ${CHARACTERS.length} personagens, ${RIDDLES.length} charadas, ${QUIZ.length} perguntas.`);
