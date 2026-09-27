import { describe, expect, it } from 'vitest';
import {
  levenshtein,
  matchAnswer,
  matchCharacter,
  matchCountry,
  matchDate,
  matchWeapon,
  normalize,
  parseDate,
} from '../answers';
import { CHARACTERS } from '../data/characters';

describe('normalize', () => {
  it('remove acentos, pontuação, caixa e espaços extras', () => {
    expect(normalize('  Relógio!!  ')).toBe('relogio');
    expect(normalize('ARCO-ÍRIS')).toBe('arco iris');
    expect(normalize('  Getúlio    Vargas. ')).toBe('getulio vargas');
    expect(normalize('Nadia Comăneci')).toBe('nadia comaneci');
  });
});

describe('levenshtein', () => {
  it('calcula a distância de edição', () => {
    expect(levenshtein('pente', 'pente')).toBe(0);
    expect(levenshtein('pente', 'pentes')).toBe(1);
    expect(levenshtein('gato', 'rato')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
  });
});

describe('matchAnswer', () => {
  it('aceita acentos, caixa e pontuação diferentes', () => {
    expect(matchAnswer('RELOGIO', ['relógio'])).toBe(true);
    expect(matchAnswer('o pente.', ['pente'])).toBe(true);
  });
  it('aceita distância 1 para respostas curtas', () => {
    expect(matchAnswer('pentr', ['pente'])).toBe(true);
    expect(matchAnswer('pnetr', ['pente'])).toBe(false);
  });
  it('aceita distância 2 para respostas com mais de 8 caracteres', () => {
    expect(matchAnswer('ventiladr', ['ventilador'])).toBe(true);
    expect(matchAnswer('ventlador', ['ventilador'])).toBe(true);
    expect(matchAnswer('vemtiladir', ['ventilador'])).toBe(true);
    expect(matchAnswer('vemtiadir', ['ventilador'])).toBe(false);
  });
  it('aceita respostas alternativas e palavras compostas', () => {
    expect(matchAnswer('sombrinha', ['guarda-chuva', 'sombrinha'])).toBe(true);
    expect(matchAnswer('guardachuva', ['guarda-chuva'])).toBe(true);
    expect(matchAnswer('guarda chuva', ['guarda-chuva'])).toBe(true);
  });
  it('recusa vazio', () => {
    expect(matchAnswer('', ['pente'])).toBe(false);
    expect(matchAnswer('   ', ['pente'])).toBe(false);
    expect(matchAnswer(null, ['pente'])).toBe(false);
  });
});

describe('datas', () => {
  it('aceita vários formatos', () => {
    for (const f of ['14/03/1879', '14-03-1879', '14 03 1879', '14.3.1879', '14031879', '14 de março de 1879', '14 marco 1879']) {
      expect(parseDate(f), f).toBe('1879-03-14');
      expect(matchDate(f, '1879-03-14'), f).toBe(true);
    }
  });
  it('recusa datas erradas ou inválidas', () => {
    expect(matchDate('15/03/1879', '1879-03-14')).toBe(false);
    expect(parseDate('32/01/1900')).toBeNull();
    expect(parseDate('1879')).toBeNull();
    expect(parseDate('abc')).toBeNull();
  });
});

describe('países', () => {
  it('aceita sinônimos', () => {
    expect(matchCountry('Estados Unidos', 'EUA')).toBe(true);
    expect(matchCountry('usa', 'EUA')).toBe(true);
    expect(matchCountry('Países Baixos', 'Holanda')).toBe(true);
    expect(matchCountry('reino unido', 'Inglaterra')).toBe(true);
    expect(matchCountry('africa do sul', 'África do Sul')).toBe(true);
    expect(matchCountry('polonia', 'Polônia')).toBe(true);
    expect(matchCountry('mexixo', 'México')).toBe(true);
  });
  it('recusa país errado', () => {
    expect(matchCountry('França', 'EUA')).toBe(false);
    expect(matchCountry('uk', 'EUA')).toBe(false);
  });
});

describe('personagens e armas', () => {
  it('identifica personagem por nome ou apelido', () => {
    expect(matchCharacter('Einstein', CHARACTERS)).toBe('einstein');
    expect(matchCharacter('albert einstien', CHARACTERS)).toBe('einstein');
    expect(matchCharacter('Getulio', CHARACTERS)).toBe('getulio');
    expect(matchCharacter('JK', CHARACTERS)).toBe('jk');
    expect(matchCharacter('Bertha Lutz', CHARACTERS)).toBe('bertha');
    expect(matchCharacter('ninguém', CHARACTERS)).toBeNull();
  });
  it('confere a arma com tolerância e apelidos', () => {
    const ali = CHARACTERS.find((c) => c.id === 'ali')!;
    expect(matchWeapon('picada de abelha', ali)).toBe(true);
    expect(matchWeapon('abelha', ali)).toBe(true);
    const bertha = CHARACTERS.find((c) => c.id === 'bertha')!;
    expect(matchWeapon('mel', bertha)).toBe(true);
    expect(matchWeapon('morango', bertha)).toBe(false);
  });
});
