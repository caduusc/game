import { matchAnswer, matchCharacter, matchCountry, matchDate } from './answers';
import { assignTargets, formatOption, targetOptions } from './arc';
import { pick, randInt } from './rng';
import {
  GameError,
  type Card,
  type CardInput,
  type CardKind,
  type Character,
  type DecoyStep,
  type EngineContext,
  type Fields,
  type GamePlayer,
  type GameState,
  type Riddle,
  type Target,
} from './types';

export const CARDS_PER_ROUND = 3;

export interface CardView {
  slot: number;
  round: number;
  step: number;
  title: string;
  prompt: string;
  fields: Fields;
  status: 'open' | 'done' | 'gone';
  feedback: string | null;
}

// ---------------------------------------------------------------- helpers

export function playerById(state: GameState, id: string): GamePlayer {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new GameError('Jogador não encontrado.');
  return p;
}

export function playerBySeat(state: GameState, seat: number): GamePlayer | undefined {
  return state.players.find((p) => p.seat === seat);
}

export function characterOf(state: GameState, p: GamePlayer): Character {
  const ch = state.characters.find((c) => c.id === p.characterId);
  if (!ch) throw new Error(`Personagem ${p.characterId} ausente`);
  return ch;
}

function requireSeat(state: GameState, n: number | null | undefined, opts: { alive?: boolean; notSelf?: GamePlayer } = {}): GamePlayer {
  if (n === null || n === undefined || !Number.isInteger(n)) throw new GameError('Informe um número de jogador.');
  const p = playerBySeat(state, n);
  if (!p) throw new GameError(`Não existe o número ${n}. Os números vão de 1 a ${state.players.length}.`);
  if (opts.alive && p.status !== 'alive') throw new GameError(`O número ${n} está fora do jogo.`);
  if (opts.notSelf && opts.notSelf.id === p.id) throw new GameError('Escolha outro jogador que não você.');
  return p;
}

export function pickRiddle(state: GameState, playerId: string, ctx: EngineContext): Riddle {
  if (!ctx.riddles.length) throw new Error('Banco de charadas vazio');
  const used = new Set(state.usedRiddles[playerId] ?? []);
  let pool = ctx.riddles.filter((r) => !used.has(r.id));
  if (!pool.length) {
    state.usedRiddles[playerId] = [];
    pool = ctx.riddles;
  }
  const r = pick(ctx.rng, pool);
  (state.usedRiddles[playerId] ??= []).push(r.id);
  return r;
}

/** Números de outros jogadores vivos, usados nas tarefas decorativas. */
function randomOtherSeat(state: GameState, me: GamePlayer, ctx: EngineContext): number {
  const others = state.players.filter((p) => p.id !== me.id && p.status === 'alive');
  return (others.length ? pick(ctx.rng, others) : me).seat;
}

export function currentTargets(state: GameState): number[] | null {
  if (state.round === 1) return state.initialTarget !== null ? [state.initialTarget] : null;
  return state.choice ? state.choice.map((t) => t.seat) : null;
}

function choiceLocked(state: GameState): boolean {
  return Object.keys(state.weaponAnswers).length > 0;
}

/** Escolha registrada ou, se ninguém escolheu, a opção padrão (L1, R1). */
export function effectiveChoice(state: GameState): Target[] | null {
  return state.choice ?? targetOptions(state)[0] ?? null;
}

function myWeaponTarget(state: GameState, me: GamePlayer): number | null {
  const choice = effectiveChoice(state);
  if (!choice) return null;
  return assignTargets(state, choice).find((a) => a.killerId === me.id)?.seat ?? null;
}

function availableQuestions(state: GameState) {
  return state.investigation.questions.filter((q) => !q.solved && q.lastAttemptRound !== state.round);
}

function questionText(q: { seat: number; type: 'birth' | 'country' }): string {
  return q.type === 'birth'
    ? `Descubra o personagem do número ${q.seat} e informe a data de nascimento dele.`
    : `Descubra o personagem do número ${q.seat} e informe o país dele.`;
}

// ---------------------------------------------------------------- decoys

type DecoyTemplate = (seat: number, riddle: () => Riddle) => DecoyStep[];

const DECOYS: DecoyTemplate[] = [
  (x) => [{ prompt: `Descubra o personagem do número ${x}. Quem é ele?`, fields: 'text' }],
  (x) => [{ prompt: `Descubra o personagem do número ${x} e informe o país dele.`, fields: 'text' }],
  (x) => [{ prompt: `Descubra o personagem do número ${x} e informe a data de nascimento dele.`, fields: 'text' }],
  (_x, r) => [
    { prompt: `Charada: ${r().question}`, fields: 'text' },
    { prompt: 'Charada certa! Informe um número e o personagem que ele declarou.', fields: 'number_text' },
  ],
  () => [{ prompt: 'Informe o número de um jogador e o personagem que você acha que ele é.', fields: 'number_text' }],
  () => [{ prompt: 'Digite o número do jogador que você acha mais suspeito nesta rodada.', fields: 'number' }],
  (_x, r) => [{ prompt: `Charada: ${r().question} Informe também o número de um jogador.`, fields: 'number_text' }],
  (_x, r) => [{ prompt: `Charada: ${r().question}`, fields: 'text' }],
];

function makeDecoy(state: GameState, me: GamePlayer, slot: number, ctx: EngineContext): Card {
  const template = DECOYS[randInt(ctx.rng, DECOYS.length)];
  const steps = template(randomOtherSeat(state, me, ctx), () => pickRiddle(state, me.id, ctx));
  return { slot, kind: 'decoy', step: 0, done: false, attempts: 0, feedback: null, decoySteps: steps };
}

// ---------------------------------------------------------------- build

export function buildCards(state: GameState, me: GamePlayer, ctx: EngineContext): Card[] {
  const kinds: CardKind[] = [];
  switch (me.role) {
    case 'killer':
      if (state.round === 1) kinds.push('killer_initial');
      else kinds.push('killer_choose', 'killer_weapon');
      break;
    case 'investigator':
      if (state.investigation.questions.some((q) => !q.solved)) kinds.push('inv_question');
      kinds.push('inv_verify');
      if (!state.accusations.some((a) => a.by === me.id)) kinds.push('inv_accuse');
      break;
    case 'police':
      if (state.round >= 2) kinds.push('police_shot');
      break;
    case 'citizen': {
      const cs = state.citizens[me.id];
      if (cs && cs.checkUses > 0) kinds.push('citizen_check');
      if (cs && cs.verifyUses > 0) kinds.push('citizen_verify');
      break;
    }
    case 'maniac':
      break;
  }
  const cards: Card[] = [];
  for (let slot = 1; slot <= CARDS_PER_ROUND; slot++) {
    const kind = kinds[slot - 1];
    if (!kind) {
      cards.push(makeDecoy(state, me, slot, ctx));
      continue;
    }
    const card: Card = { slot, kind, step: 0, done: false, attempts: 0, feedback: null };
    if (kind === 'police_shot' || kind === 'citizen_check' || kind === 'citizen_verify') {
      card.riddle = pickRiddle(state, me.id, ctx);
    }
    cards.push(card);
  }
  return cards;
}

// ---------------------------------------------------------------- render

interface Rendered {
  prompt: string;
  fields: Fields;
  status: 'open' | 'done';
}

function renderInner(state: GameState, me: GamePlayer, card: Card): Rendered {
  const done = (prompt: string, fields: Fields = 'text'): Rendered => ({ prompt, fields, status: 'done' });
  if (card.done) {
    const r = renderInner(state, me, { ...card, done: false });
    return { ...r, status: 'done' };
  }
  switch (card.kind) {
    case 'decoy': {
      const step = card.decoySteps![Math.min(card.step, card.decoySteps!.length - 1)];
      return { prompt: step.prompt, fields: step.fields, status: 'open' };
    }
    case 'killer_initial': {
      const cur = state.initialTarget !== null ? ` Escolha atual: nº ${state.initialTarget}.` : ' Ainda não há escolha.';
      return {
        prompt: `Escolham o alvo inicial: digite o número do jogador que sai na virada. Qualquer um de vocês pode registrar; vale a última escolha.${cur}`,
        fields: 'number',
        status: 'open',
      };
    }
    case 'killer_choose': {
      const options = targetOptions(state);
      if (!options.length) return done('Não há alvos disponíveis nesta rodada.');
      const cur = state.choice ? formatOption(state.choice) : null;
      if (choiceLocked(state)) return done(`Alvos travados nesta rodada: ${cur}.`);
      return {
        prompt: `Escolham os alvos desta rodada. Opções: ${options.map(formatOption).join(' · ')}. Digite os números da opção escolhida.${
          cur ? ` Escolha atual: ${cur}.` : ' Se ninguém escolher, vale a primeira opção.'
        }`,
        fields: 'text',
        status: 'open',
      };
    }
    case 'killer_weapon': {
      const seat = myWeaponTarget(state, me);
      if (seat === null) return { prompt: 'Nenhum alvo ficou com você nesta rodada. Envie qualquer resposta.', fields: 'text', status: 'open' };
      const answered = state.weaponAnswers[String(seat)];
      if (answered) return done(`O que mata o número ${seat}? Resposta registrada.`);
      const note = state.choice
        ? ''
        : ` (Alvos ainda não escolhidos: vale o padrão ${formatOption(effectiveChoice(state)!)}. Responder trava essa escolha.)`;
      return { prompt: `O que mata o número ${seat}?${note}`, fields: 'text', status: 'open' };
    }
    case 'inv_question': {
      if (state.investigation.questions.every((q) => q.solved)) return done('Todas as pistas foram descobertas.', 'number_text');
      const avail = availableQuestions(state);
      if (!avail.length) return done('Todas as perguntas abertas já foram tentadas nesta rodada.', 'number_text');
      return {
        prompt: `Pistas da equipe (1 tentativa por pergunta por rodada):\n${avail.map((q) => `• ${questionText(q)}`).join('\n')}\nInforme o número do jogador da pergunta e a resposta.`,
        fields: 'number_text',
        status: 'open',
      };
    }
    case 'inv_verify': {
      const used = state.investigation.verifications.find((v) => v.round === state.round);
      if (used) return done(`A verificação da equipe nesta rodada já foi usada (nº ${used.seat}: ${used.truth ? 'VERDADE' : 'MENTIRA'}).`, 'number_text');
      return {
        prompt: 'Verificação da equipe (1 por rodada): informe um número e o personagem que esse jogador declarou.',
        fields: 'number_text',
        status: 'open',
      };
    }
    case 'inv_accuse':
      return {
        prompt: 'Acusação (1 por jogo): digite o número de quem você acusa. Se for assassino, será preso na virada.',
        fields: 'number',
        status: 'open',
      };
    case 'police_shot':
      return {
        prompt: `Charada: ${card.riddle!.question} Informe o número do seu alvo e a resposta. Acertou: o alvo sai na virada.`,
        fields: 'number_text',
        status: 'open',
      };
    case 'citizen_check': {
      const uses = state.citizens[me.id]?.checkUses ?? 0;
      if (card.step === 1) {
        return {
          prompt: 'Charada resolvida, mas os assassinos ainda não escolheram. Envie qualquer texto para consultar de novo (o uso não foi gasto).',
          fields: 'text',
          status: 'open',
        };
      }
      return {
        prompt: `Checar alvo (${uses} ${uses === 1 ? 'uso restante' : 'usos restantes'}, ${2 - card.attempts} ${2 - card.attempts === 1 ? 'tentativa' : 'tentativas'}). Charada: ${card.riddle!.question}`,
        fields: 'text',
        status: 'open',
      };
    }
    case 'citizen_verify': {
      const uses = state.citizens[me.id]?.verifyUses ?? 0;
      if (card.step === 1) {
        return { prompt: 'Charada certa! Informe um número e o personagem que esse jogador declarou.', fields: 'number_text', status: 'open' };
      }
      return {
        prompt: `Verificar identidade (${uses} ${uses === 1 ? 'uso restante' : 'usos restantes'}). Charada: ${card.riddle!.question}`,
        fields: 'text',
        status: 'open',
      };
    }
  }
}

export function renderCard(state: GameState, me: GamePlayer, card: Card): CardView {
  const r = renderInner(state, me, card);
  return {
    slot: card.slot,
    round: state.round,
    step: card.step,
    title: `Missão ${card.slot}`,
    prompt: r.prompt,
    fields: r.fields,
    status: r.status,
    feedback: card.feedback,
  };
}

// ---------------------------------------------------------------- submit

function validateFields(fields: Fields, input: CardInput) {
  if (fields !== 'text' && (input.number === null || input.number === undefined || !Number.isInteger(input.number))) {
    throw new GameError('Informe um número.');
  }
  if (fields !== 'number' && !(input.text ?? '').trim()) throw new GameError('Digite uma resposta.');
}

function parseSeats(input: CardInput): number[] {
  const nums = (input.text ?? '').match(/\d+/g)?.map(Number) ?? [];
  if (input.number !== null && input.number !== undefined) nums.unshift(input.number);
  return [...new Set(nums)];
}

/**
 * Registra a resposta de um jogador em um card. Muta `state`.
 * Retorna o feedback mostrado ao jogador. Lança GameError em entradas inválidas.
 */
export function submitCard(state: GameState, playerId: string, slot: number, input: CardInput, ctx: EngineContext): string {
  if (state.status !== 'playing') throw new GameError('A partida terminou.');
  const me = playerById(state, playerId);
  if (me.status !== 'alive') throw new GameError('Você está fora do jogo.');
  const card = state.cards[me.id]?.find((c) => c.slot === slot);
  if (!card) throw new GameError('Missão não encontrada.');
  const view = renderInner(state, me, card);
  if (view.status === 'done') throw new GameError('Esta missão já foi concluída.');
  validateFields(view.fields, input);

  const feedback = handle(state, me, card, input, ctx);
  card.feedback = feedback;
  return feedback;
}

function handle(state: GameState, me: GamePlayer, card: Card, input: CardInput, ctx: EngineContext): string {
  const text = (input.text ?? '').trim();
  switch (card.kind) {
    case 'decoy': {
      if (card.step < card.decoySteps!.length - 1) {
        card.step++;
        return 'Resposta registrada. Continue.';
      }
      card.done = true;
      return 'Resposta registrada.';
    }

    case 'killer_initial': {
      const target = requireSeat(state, input.number, { alive: true });
      state.initialTarget = target.seat;
      return `Alvo inicial registrado: nº ${target.seat}.`;
    }

    case 'killer_choose': {
      const options = targetOptions(state);
      const seats = parseSeats(input).sort((a, b) => a - b);
      const opt = options.find((o) => {
        const s = o.map((t) => t.seat).sort((a, b) => a - b);
        return s.length === seats.length && s.every((v, i) => v === seats[i]);
      });
      if (!opt) throw new GameError(`Opção inválida. Opções: ${options.map(formatOption).join(' · ')}.`);
      state.choice = opt;
      return `Alvos registrados: ${formatOption(opt)}.`;
    }

    case 'killer_weapon': {
      const seat = myWeaponTarget(state, me);
      if (seat === null) {
        card.done = true;
        return 'Resposta registrada.';
      }
      if (state.weaponAnswers[String(seat)]) throw new GameError('Já há uma resposta para este alvo.');
      state.choice ??= effectiveChoice(state);
      state.weaponAnswers[String(seat)] = { by: me.id, answer: text };
      card.done = true;
      return 'Resposta registrada. O resultado sai na virada.';
    }

    case 'inv_question': {
      const q = availableQuestions(state).find((x) => x.seat === input.number);
      if (!q) throw new GameError('Não há pergunta aberta para esse número nesta rodada.');
      q.lastAttemptRound = state.round;
      const target = playerBySeat(state, q.seat)!;
      const ch = characterOf(state, target);
      const ok = q.type === 'birth' ? matchDate(text, ch.birth) : matchCountry(text, ch.country);
      if (!ok) return `Resposta errada para o nº ${q.seat}. Tente de novo na próxima rodada.`;
      q.solved = true;
      state.investigation.hintsUnlocked = Math.min(state.investigation.hints.length, state.investigation.hintsUnlocked + 1);
      return 'Resposta certa! Nova dica liberada na sua ficha.';
    }

    case 'inv_verify': {
      const target = requireSeat(state, input.number);
      const truth = matchCharacter(text, state.characters) === target.characterId;
      state.investigation.verifications.push({ round: state.round, by: me.id, seat: target.seat, declared: text, truth });
      return `Nº ${target.seat} declarou "${text}": ${truth ? 'VERDADE' : 'MENTIRA'}.`;
    }

    case 'inv_accuse': {
      const target = requireSeat(state, input.number, { alive: true, notSelf: me });
      state.accusations.push({ by: me.id, seat: target.seat, round: state.round });
      card.done = true;
      return `Acusação registrada contra o nº ${target.seat}. O resultado sai na virada.`;
    }

    case 'police_shot': {
      const target = requireSeat(state, input.number, { alive: true, notSelf: me });
      const correct = matchAnswer(text, card.riddle!.answers);
      state.policeShots.push({ by: me.id, seat: target.seat, correct });
      card.done = true;
      return 'Registrado. O resultado sai na virada.';
    }

    case 'citizen_check': {
      const cs = state.citizens[me.id];
      if (card.step === 0) {
        if (!matchAnswer(text, card.riddle!.answers)) {
          card.attempts++;
          if (card.attempts >= 2) {
            cs.checkUses = Math.max(0, cs.checkUses - 1);
            cs.lastCheckRound = state.round;
            card.done = true;
            return 'Resposta errada de novo. Uso perdido.';
          }
          return 'Resposta errada. Você tem mais 1 tentativa.';
        }
        card.step = 1;
      }
      const targets = currentTargets(state);
      if (!targets) return 'Charada certa! Mas os assassinos ainda não escolheram. Consulte de novo mais tarde — o uso não foi gasto.';
      cs.checkUses = Math.max(0, cs.checkUses - 1);
      cs.lastCheckRound = state.round;
      card.done = true;
      const result = targets.includes(me.seat)
        ? 'Você ESTÁ entre os alvos atuais dos assassinos.'
        : 'Você NÃO está entre os alvos atuais dos assassinos.';
      (state.results[me.id] ??= []).push({ round: state.round, kind: 'check', text: result });
      return result;
    }

    case 'citizen_verify': {
      const cs = state.citizens[me.id];
      if (card.step === 0) {
        if (!matchAnswer(text, card.riddle!.answers)) {
          card.done = true;
          return 'Resposta errada. Tente na próxima rodada — o uso não foi gasto.';
        }
        card.step = 1;
        return 'Charada certa! Agora informe o número e o personagem declarado.';
      }
      const target = requireSeat(state, input.number);
      const truth = matchCharacter(text, state.characters) === target.characterId;
      cs.verifyUses = Math.max(0, cs.verifyUses - 1);
      cs.lastVerifyRound = state.round;
      card.done = true;
      const result = `Nº ${target.seat} declarou "${text}": ${truth ? 'VERDADE' : 'MENTIRA'}.`;
      (state.results[me.id] ??= []).push({ round: state.round, kind: 'verify', text: result });
      return result;
    }
  }
}

