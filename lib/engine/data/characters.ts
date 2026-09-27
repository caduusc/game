import type { Character } from '../types';

/**
 * Banco de personagens. Fonte única: o seed SQL (supabase/seed/characters.sql)
 * é gerado a partir deste arquivo com `npm run seed:generate`.
 *
 * Cada combinação gênero + origem + século tem exatamente 3 personagens com
 * áreas distintas, e cada arma é única.
 */
export const CHARACTERS: Character[] = [
  c('machado', 'Machado de Assis', '1839-06-21', 'Brasil', 'M', 'BR', 'XIX', 'Arte', 'Café', ['machado']),
  c('santos-dumont', 'Santos Dumont', '1873-07-20', 'Brasil', 'M', 'BR', 'XIX', 'Ciência', 'Pólen', ['dumont', 'santos dumont']),
  c('getulio', 'Getúlio Vargas', '1882-04-19', 'Brasil', 'M', 'BR', 'XIX', 'Política', 'Canela', ['getulio', 'vargas']),
  c('jk', 'Juscelino Kubitschek', '1902-09-12', 'Brasil', 'M', 'BR', 'XX', 'Política', 'Amendoim', ['juscelino', 'kubitschek', 'jk']),
  c('niemeyer', 'Oscar Niemeyer', '1907-12-15', 'Brasil', 'M', 'BR', 'XX', 'Arte', 'Gergelim', ['niemeyer']),
  c('senna', 'Ayrton Senna', '1960-03-21', 'Brasil', 'M', 'BR', 'XX', 'Esporte', 'Camarão', ['senna']),
  c('isabel', 'Princesa Isabel', '1846-07-29', 'Brasil', 'F', 'BR', 'XIX', 'Política', 'Leite', ['isabel']),
  c('bertha', 'Bertha Lutz', '1894-08-02', 'Brasil', 'F', 'BR', 'XIX', 'Ciência', 'Mel', ['bertha', 'lutz']),
  c('tarsila', 'Tarsila do Amaral', '1886-09-01', 'Brasil', 'F', 'BR', 'XIX', 'Arte', 'Morango', ['tarsila']),
  c('zilda', 'Zilda Arns', '1934-08-25', 'Brasil', 'F', 'BR', 'XX', 'Ciência', 'Penicilina', ['zilda']),
  c('esther', 'Maria Esther Bueno', '1939-10-11', 'Brasil', 'F', 'BR', 'XX', 'Esporte', 'Látex', ['maria esther', 'esther bueno']),
  c('elis', 'Elis Regina', '1945-03-17', 'Brasil', 'F', 'BR', 'XX', 'Arte', 'Kiwi', ['elis']),
  c('van-gogh', 'Vincent van Gogh', '1853-03-30', 'Holanda', 'M', 'EX', 'XIX', 'Arte', 'Tomate', ['van gogh', 'gogh']),
  c('gandhi', 'Mahatma Gandhi', '1869-10-02', 'Índia', 'M', 'EX', 'XIX', 'Política', 'Soja', ['gandhi']),
  c('einstein', 'Albert Einstein', '1879-03-14', 'Alemanha', 'M', 'EX', 'XIX', 'Ciência', 'Ovo', ['einstein']),
  c('turing', 'Alan Turing', '1912-06-23', 'Inglaterra', 'M', 'EX', 'XX', 'Ciência', 'Mostarda', ['turing']),
  c('mandela', 'Nelson Mandela', '1918-07-18', 'África do Sul', 'M', 'EX', 'XX', 'Política', 'Nozes', ['mandela']),
  c('ali', 'Muhammad Ali', '1942-01-17', 'EUA', 'M', 'EX', 'XX', 'Esporte', 'Picada de abelha', ['muhammad ali', 'cassius clay'], ['abelha', 'picada']),
  c('curie', 'Marie Curie', '1867-11-07', 'Polônia', 'F', 'EX', 'XIX', 'Ciência', 'Poeira', ['curie']),
  c('chanel', 'Coco Chanel', '1883-08-19', 'França', 'F', 'EX', 'XIX', 'Arte', 'Chocolate', ['chanel']),
  c('earhart', 'Amelia Earhart', '1897-07-24', 'EUA', 'F', 'EX', 'XIX', 'Esporte', 'Pelo de gato', ['earhart', 'amelia']),
  c('frida', 'Frida Kahlo', '1907-07-06', 'México', 'F', 'EX', 'XX', 'Arte', 'Abacaxi', ['frida', 'kahlo']),
  c('rosa-parks', 'Rosa Parks', '1913-02-04', 'EUA', 'F', 'EX', 'XX', 'Política', 'Peixe', ['rosa parks', 'parks']),
  c('nadia', 'Nadia Comăneci', '1961-11-12', 'Romênia', 'F', 'EX', 'XX', 'Esporte', 'Glúten', ['nadia', 'comaneci']),
];

function c(
  id: string,
  name: string,
  birth: string,
  country: string,
  gender: Character['gender'],
  origin: Character['origin'],
  century: Character['century'],
  area: string,
  weapon: string,
  aliases: string[] = [],
  weaponAliases: string[] = [],
): Character {
  return { id, name, birth, country, gender, origin, century, area, weapon, aliases, weaponAliases };
}
