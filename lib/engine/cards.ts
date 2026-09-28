import { matchAnswer, matchCharacter, matchCountry, matchDate } from './answers';
import { extendArc, SIDE_LABEL, sideChoices, tentativeTargets } from './arc';
import { pick, randInt, shuffle } from './rng';
import {
  GameError,
  type Card,
  type CardInput,
  type CardKind,
  type CardOption,
  type Character,
  type DecoyStep,
  type EngineContext,
  type Fields,
  type GamePlayer,
  type GameState,
  type KillerPlan,
  type Riddle,
  type Side,
} from './types';

export const CARDS_PER_ROUND = 3;
export const POLICE_SHOTS = 2;
export const POLICE_ATTEMPTS = 3;
export const SABOTAGE_SECONDS = 10;

const UNKNOWN = '__unknown';
const SWITCH = '__switch';

export interface CardView {
  slot: number;
  round: number;
  step: number;
  title: string;
  prompt: string;
  fields: Fields;
  options: CardOption[] | null;
  skipLabel: string | null;
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

function seatOptions(state: GameState, filter: (p: GamePlayer) => boolean): CardOption[] {
  return state.players
    .filter(filter)
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({ value: String(p.seat), label: `nº ${p.seat} · ${p.name}` }));
}

function aliveOthers(state: GameState, me: GamePlayer): CardOption[] {
  return seatOptions(state, (p) => p.status === 'alive' && p.id !== me.id);
}

function weaponOptions(state: GameState): CardOption[] {
  return state.characters
    .map((c) => c.weapon)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((w) => ({ value: w, label: w }));
}

function requireOption(options: CardOption[] | null, choice: string | null | undefined): string {
  if (!choice || !options?.some((o) => o.value === choice)) throw new GameError('Escolha uma das opções.');
  return choice;
}

function seatFromChoice(state: GameState, choice: string): GamePlayer {
  const p = playerBySeat(state, Number(choice));
  if (!p) throw new GameError('Jogador inválido.');
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

function randomOtherSeat(state: GameState, me: GamePlayer, ctx: EngineContext): number {
  const others = state.players.filter((p) => p.id !== me.id && p.status === 'alive');
  return (others.length ? pick(ctx.rng, others) : me).seat;
}

/** Ataques que resolvem na próxima virada ("alvos atuais"). */
export function currentAttacks(state: GameState) {
  return state.attacks.filter((a) => a.resolvesAfterRound === state.round);
}

function availableQuestions(state: GameState) {
  return state.investigation.questions.filter((q) => !q.solved && q.lastAttemptRound !== state.round);
}

function questionText(q: { seat: number; type: 'birth' | 'country' }): string {
  return q.type === 'birth'
    ? `Descubra o personagem do número ${q.seat} e informe a data de nascimento dele.`
    : `Descubra o personagem do número ${q.seat} e informe o país dele.`;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------- tarefas decorativas

type DecoyTemplate = (seat: number, riddle: () => Riddle) => DecoyStep[];

const AREAS: CardOption[] = ['Arte', 'Ciência', 'Política', 'Esporte'].map((a) => ({ value: a, label: a }));

const DECOYS: DecoyTemplate[] = [
  (x) => [{ prompt: `Descubra o personagem do número ${x}. Quem é ele?`, fields: 'text' }],
  (x) => [{ prompt: `Descubra o personagem do número ${x} e informe o país dele.`, fields: 'text' }],
  () => [{ prompt: 'Escolha o jogador que você acha mais suspeito nesta rodada.', fields: 'choice', options: 'seats' }],
  () => [{ prompt: 'Escolha um jogador e escreva o personagem que você acha que ele é.', fields: 'choice_text', options: 'seats' }],
  (_x, r) => [
    { prompt: `Charada: ${r().question}`, fields: 'text' },
    { prompt: 'Charada certa! Escolha um jogador e escreva o personagem que ele declarou.', fields: 'choice_text', options: 'seats' },
  ],
  (x) => [
    {
      prompt: `O personagem do número ${x} nasceu em qual século?`,
      fields: 'choice',
      options: [
        { value: 'XIX', label: 'Século XIX' },
        { value: 'XX', label: 'Século XX' },
      ],
    },
  ],
  (x) => [
    {
      prompt: `O personagem do número ${x} é brasileiro ou estrangeiro?`,
      fields: 'choice',
      options: [
        { value: 'BR', label: 'Brasileiro' },
        { value: 'EX', label: 'Estrangeiro' },
      ],
    },
  ],
  (x) => [{ prompt: `Em que área você acha que o personagem do número ${x} atua?`, fields: 'choice', options: AREAS }],
  (_x, r) => [
    {
      prompt: `Charada: ${r().question} Escolha um jogador e responda.`,
      fields: 'choice_text',
      options: 'seats',
      skipLabel: 'Pular nesta rodada',
    },
  ],
  (_x, r) => [{ prompt: `Charada: ${r().question}`, fields: 'text' }],
];

function makeDecoy(state: GameState, me: GamePlayer, slot: number, ctx: EngineContext): Card {
  const template = DECOYS[randInt(ctx.rng, DECOYS.length)];
  const steps = template(randomOtherSeat(state, me, ctx), () => pickRiddle(state, me.id, ctx));
  return { slot, kind: 'decoy', step: 0, done: false, attempts: 0, feedback: null, decoySteps: steps };
}

// ---------------------------------------------------------------- montagem dos cards

export function buildCards(state: GameState, me: GamePlayer, ctx: EngineContext): Card[] {
  const kinds: CardKind[] = [];
  switch (me.role) {
    case 'killer':
      kinds.push(state.round === 1 ? 'killer_initial' : 'killer_action');
      break;
    case 'investigator':
      if (state.investigation.questions.some((q) => !q.solved)) kinds.push('inv_question');
      kinds.push('inv_verify');
      if (!state.accusations.some((a) => a.by === me.id)) kinds.push('inv_accuse');
      break;
    case 'police':
      if (state.round >= 2 && (state.policeShotsLeft[me.id] ?? 0) > 0) kinds.push('police_shot');
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
    if (kind === 'citizen_check' && !state.citizens[me.id]?.sabotageUsed && ctx.quiz.length >= 3) {
      card.quiz = shuffle(ctx.rng, ctx.quiz).slice(0, 3);
    }
    cards.push(card);
  }
  return cards;
}

// ---------------------------------------------------------------- renderização

interface Rendered {
  prompt: string;
  fields: Fields;
  options?: CardOption[] | null;
  skipLabel?: string | null;
  status: 'open' | 'done';
}

function planOf(state: GameState, killerId: string): KillerPlan {
  return state.killerPlans[killerId] ?? { side: null, seat: null, done: false, summary: null };
}

function initialStatus(state: GameState, me: GamePlayer): string {
  const killers = state.players.filter((p) => p.role === 'killer');
  const a = killers.find((k) => k.killerSlot === 'A');
  const b = killers.find((k) => k.killerSlot === 'B');
  const pa = a ? state.initialPicks[a.id] ?? null : null;
  const pb = b ? state.initialPicks[b.id] ?? null : null;
  const mine = state.initialPicks[me.id] ?? null;
  if (pa !== null && pb !== null) {
    if (pa === pb) return `Acordo fechado: nº ${pa}. Ele morre na virada para a rodada 3. Vocês ainda podem trocar até o fim da rodada.`;
    return `Assassinos, vocês precisam entrar em um acordo para a primeira morte: o Assassino A escolheu o nº ${pa} e o Assassino B escolheu o nº ${pb}. Um dos dois precisa trocar.`;
  }
  if (mine === null) return 'Você ainda não escolheu.';
  return `Você escolheu o nº ${mine}. Aguardando o parceiro escolher.`;
}

function killerAction(state: GameState, me: GamePlayer): Rendered {
  const plan = planOf(state, me.id);
  if (plan.done) return { prompt: plan.summary ?? 'Ação registrada.', fields: 'choice', options: null, status: 'done' };
  const saved = state.killerTargets[me.id];
  const weapons = weaponOptions(state);
  if (saved) {
    const options = [...weapons, { value: UNKNOWN, label: 'Não sabemos ainda' }];
    if (saved.kind === 'reserved') options.push({ value: SWITCH, label: 'Trocar de lado' });
    return {
      prompt: `Seu alvo ${saved.kind === 'obligatory' ? 'obrigatório (a arma anterior errou)' : 'reservado'}: nº ${saved.seat}. O que mata o número ${saved.seat}?`,
      fields: 'choice',
      options,
      status: 'open',
    };
  }
  const t = plan.side ? tentativeTargets(state)[me.id] : undefined;
  if (!plan.side || !t) {
    const choices = sideChoices(state, me.id);
    if (!choices.length) return { prompt: 'Não há alvos disponíveis nesta rodada.', fields: 'choice', options: null, status: 'done' };
    return {
      prompt: 'Qual seu próximo alvo? Esquerda ou direita?',
      fields: 'choice',
      options: choices.map((c) => ({ value: c.side, label: `${SIDE_LABEL[c.side]} — nº ${c.seat}` })),
      status: 'open',
    };
  }
  return {
    prompt: `Seu alvo: nº ${t.seat} (${SIDE_LABEL[plan.side]}). O que mata o número ${t.seat}?`,
    fields: 'choice',
    options: [...weapons, { value: UNKNOWN, label: 'Não sabemos ainda' }, { value: SWITCH, label: 'Trocar de lado' }],
    status: 'open',
  };
}

function renderInner(state: GameState, me: GamePlayer, card: Card): Rendered {
  const done = (prompt: string, fields: Fields = 'text'): Rendered => ({ prompt, fields, status: 'done' });
  if (card.done && card.kind !== 'killer_action') {
    const r = renderInner(state, me, { ...card, done: false });
    return { ...r, status: 'done' };
  }
  switch (card.kind) {
    case 'decoy': {
      const step = card.decoySteps![Math.min(card.step, card.decoySteps!.length - 1)];
      return {
        prompt: step.prompt,
        fields: step.fields,
        options: step.options === 'seats' ? aliveOthers(state, me) : (step.options ?? null),
        skipLabel: step.skipLabel ?? null,
        status: 'open',
      };
    }
    case 'killer_initial':
      return {
        prompt: `Escolham juntos o alvo inicial. Os dois precisam escolher a mesma pessoa. ${initialStatus(state, me)}`,
        fields: 'choice',
        options: seatOptions(state, (p) => p.status === 'alive' && p.role !== 'killer'),
        status: 'open',
      };
    case 'killer_action':
      return killerAction(state, me);
    case 'inv_question': {
      if (state.investigation.questions.every((q) => q.solved)) return done('Todas as pistas foram descobertas.', 'choice_text');
      const avail = availableQuestions(state);
      if (!avail.length) return done('Todas as perguntas abertas já foram tentadas nesta rodada.', 'choice_text');
      return {
        prompt: `Pistas da equipe (1 tentativa por pergunta por rodada):\n${avail.map((q) => `• ${questionText(q)}`).join('\n')}\nEscolha a pergunta e escreva a resposta.`,
        fields: 'choice_text',
        options: avail.map((q) => ({
          value: String(q.seat),
          label: `nº ${q.seat} — ${q.type === 'birth' ? 'data de nascimento' : 'país'}`,
        })),
        status: 'open',
      };
    }
    case 'inv_verify': {
      const used = state.investigation.verifications.find((v) => v.round === state.round);
      if (used) return done(`A verificação da equipe nesta rodada já foi usada (nº ${used.seat}: ${used.truth ? 'VERDADE' : 'MENTIRA'}).`, 'choice_text');
      return {
        prompt: 'Verificação da equipe (1 por rodada): escolha um jogador e escreva o personagem que ele declarou.',
        fields: 'choice_text',
        options: seatOptions(state, (p) => p.id !== me.id),
        status: 'open',
      };
    }
    case 'inv_accuse':
      return {
        prompt: 'Acusação (1 por jogo): escolha quem você acusa. Se for assassino, será preso na virada.',
        fields: 'choice',
        options: aliveOthers(state, me),
        status: 'open',
      };
    case 'police_shot': {
      const left = state.policeShotsLeft[me.id] ?? 0;
      return {
        prompt: `Tiro (${plural(left, 'tiro restante', 'tiros restantes')} no jogo, ${plural(POLICE_ATTEMPTS - card.attempts, 'tentativa', 'tentativas')} nesta charada). Charada: ${card.riddle!.question} Escolha o alvo e responda. Acertou: o alvo sai na virada.`,
        fields: 'choice_text',
        options: aliveOthers(state, me),
        skipLabel: 'Não atirar nesta rodada',
        status: 'open',
      };
    }
    case 'citizen_check': {
      const uses = state.citizens[me.id]?.checkUses ?? 0;
      switch (card.step) {
        case 1:
          return {
            prompt: 'Charada resolvida, mas não há ataque dos assassinos em andamento agora. Envie qualquer texto para consultar de novo (o uso não foi gasto).',
            fields: 'text',
            status: 'open',
          };
        case 2:
          return {
            prompt: 'Você ESTÁ entre os alvos. Você pode sabotar colocando o alvo em outra pessoa. Quer?',
            fields: 'choice',
            options: [
              { value: 'yes', label: 'Sim, quero sabotar' },
              { value: 'no', label: 'Não' },
            ],
            status: 'open',
          };
        case 3:
          return {
            prompt: 'Escolha o número de quem vai receber o alvo se errar a pergunta.',
            fields: 'choice',
            options: aliveOthers(state, me),
            status: 'open',
          };
        case 4:
          return {
            prompt: `Escolha uma pergunta que você acha que o nº ${card.sabotageSeat} não vai acertar. Ele terá ${SABOTAGE_SECONDS} segundos e 4 opções.`,
            fields: 'choice',
            options: (card.quiz ?? []).map((q) => ({ value: String(q.id), label: q.question })),
            status: 'open',
          };
      }
      return {
        prompt: `Checar alvo (${plural(uses, 'uso restante', 'usos restantes')}, ${plural(2 - card.attempts, 'tentativa', 'tentativas')}). Charada: ${card.riddle!.question}`,
        fields: 'text',
        status: 'open',
      };
    }
    case 'citizen_verify': {
      const uses = state.citizens[me.id]?.verifyUses ?? 0;
      if (card.step === 1) {
        return {
          prompt: 'Charada certa! Escolha um jogador e escreva o personagem que ele declarou.',
          fields: 'choice_text',
          options: seatOptions(state, (p) => p.id !== me.id),
          status: 'open',
        };
      }
      return {
        prompt: `Verificar identidade (${plural(uses, 'uso restante', 'usos restantes')}). Charada: ${card.riddle!.question}`,
        fields: 'text',
        status: 'open',
      };
    }
  }
}

export function renderCard(state: GameState, me: GamePlayer, card: Card): CardView {
  const r = renderInner(state, me, card);
  const open = r.status === 'open';
  return {
    slot: card.slot,
    round: state.round,
    step: card.step,
    title: `Missão ${card.slot}`,
    prompt: r.prompt,
    fields: r.fields,
    options: open ? (r.options ?? null) : null,
    skipLabel: open ? (r.skipLabel ?? null) : null,
    status: r.status,
    feedback: card.feedback,
  };
}

// ---------------------------------------------------------------- respostas

function validate(r: Rendered, input: CardInput) {
  if (input.skip) {
    if (!r.skipLabel) throw new GameError('Esta missão não pode ser pulada.');
    return;
  }
  if (r.fields !== 'text') requireOption(r.options ?? null, input.choice);
  if (r.fields !== 'choice' && !(input.text ?? '').trim()) throw new GameError('Digite uma resposta.');
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
  validate(view, input);

  const feedback = handle(state, me, card, input);
  card.feedback = feedback;
  return feedback;
}

function handle(state: GameState, me: GamePlayer, card: Card, input: CardInput): string {
  const text = (input.text ?? '').trim();
  const choice = input.choice ?? '';
  switch (card.kind) {
    case 'decoy': {
      if (!input.skip && card.step < card.decoySteps!.length - 1) {
        card.step++;
        return 'Resposta registrada. Continue.';
      }
      card.done = true;
      return 'Resposta registrada.';
    }

    case 'killer_initial': {
      const target = seatFromChoice(state, choice);
      state.initialPicks[me.id] = target.seat;
      return `Escolha registrada: nº ${target.seat}.`;
    }

    case 'killer_action':
      return handleKiller(state, me, choice);

    case 'inv_question': {
      const q = availableQuestions(state).find((x) => String(x.seat) === choice);
      if (!q) throw new GameError('Não há pergunta aberta para esse número nesta rodada.');
      q.lastAttemptRound = state.round;
      const ch = characterOf(state, playerBySeat(state, q.seat)!);
      const ok = q.type === 'birth' ? matchDate(text, ch.birth) : matchCountry(text, ch.country);
      if (!ok) return `Resposta errada para o nº ${q.seat}. Tente de novo na próxima rodada.`;
      q.solved = true;
      state.investigation.hintsUnlocked = Math.min(state.investigation.hints.length, state.investigation.hintsUnlocked + 1);
      return 'Resposta certa! Nova dica liberada na sua ficha.';
    }

    case 'inv_verify': {
      const target = seatFromChoice(state, choice);
      const truth = matchCharacter(text, state.characters) === target.characterId;
      state.investigation.verifications.push({ round: state.round, by: me.id, seat: target.seat, declared: text, truth });
      return `Nº ${target.seat} declarou "${text}": ${truth ? 'VERDADE' : 'MENTIRA'}.`;
    }

    case 'inv_accuse': {
      const target = seatFromChoice(state, choice);
      state.accusations.push({ by: me.id, seat: target.seat, round: state.round });
      card.done = true;
      return `Acusação registrada contra o nº ${target.seat}. O resultado sai na virada.`;
    }

    case 'police_shot': {
      if (input.skip) {
        card.done = true;
        return 'Você decidiu não atirar nesta rodada. Nenhum tiro foi gasto.';
      }
      const target = seatFromChoice(state, choice);
      if (matchAnswer(text, card.riddle!.answers)) {
        state.policeShots.push({ by: me.id, seat: target.seat });
        state.policeShotsLeft[me.id] = Math.max(0, (state.policeShotsLeft[me.id] ?? 0) - 1);
        card.done = true;
        return `Tiro registrado no nº ${target.seat}. O resultado sai na virada.`;
      }
      card.attempts++;
      if (card.attempts >= POLICE_ATTEMPTS) {
        state.policeShotsLeft[me.id] = Math.max(0, (state.policeShotsLeft[me.id] ?? 0) - 1);
        card.done = true;
        return `Errou ${POLICE_ATTEMPTS} vezes. O tiro foi perdido.`;
      }
      return `Resposta errada. ${plural(POLICE_ATTEMPTS - card.attempts, 'tentativa restante', 'tentativas restantes')}.`;
    }

    case 'citizen_check':
      return handleCitizenCheck(state, me, card, choice, text);

    case 'citizen_verify': {
      const cs = state.citizens[me.id];
      if (card.step === 0) {
        if (!matchAnswer(text, card.riddle!.answers)) {
          card.done = true;
          return 'Resposta errada. Tente na próxima rodada — o uso não foi gasto.';
        }
        card.step = 1;
        return 'Charada certa! Agora escolha o jogador e escreva o personagem declarado.';
      }
      const target = seatFromChoice(state, choice);
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

function handleKiller(state: GameState, me: GamePlayer, choice: string): string {
  const n = state.players.length;
  const plan = (state.killerPlans[me.id] = { ...planOf(state, me.id) });
  const saved = state.killerTargets[me.id];

  // Escolha de lado
  if (!saved && (choice === 'L' || choice === 'R')) {
    plan.side = choice;
    const t = tentativeTargets(state)[me.id];
    return `Lado escolhido: ${SIDE_LABEL[choice]} (nº ${t?.seat ?? '?'}). Agora escolha a arma.`;
  }

  if (choice === SWITCH) {
    const current: Side | null = saved?.side ?? plan.side;
    const other: Side = current === 'L' ? 'R' : 'L';
    state.killerTargets[me.id] = null;
    plan.side = other;
    if (!tentativeTargets(state)[me.id]) {
      plan.side = null;
      return 'Não há alvo do outro lado. Escolha um lado.';
    }
    return `Lado trocado para ${SIDE_LABEL[other]}.`;
  }

  const target = saved ? { seat: saved.seat, side: saved.side } : tentativeTargets(state)[me.id];
  if (!target) throw new GameError('Escolha um lado primeiro.');
  state.arc = extendArc(state.arc, target.seat, target.side, n);
  plan.seat = target.seat;
  plan.done = true;

  if (choice === UNKNOWN) {
    state.killerTargets[me.id] = { seat: target.seat, side: target.side, kind: saved?.kind ?? 'reserved' };
    plan.summary = `Alvo nº ${target.seat} guardado para a próxima rodada ("Não sabemos ainda").`;
    return plan.summary;
  }

  state.killerTargets[me.id] = null;
  state.attacks.push({
    id: state.nextAttackId++,
    killerId: me.id,
    seat: target.seat,
    side: target.side,
    weapon: choice,
    chosenRound: state.round,
    resolvesAfterRound: state.round + 1,
    sabotagedFrom: null,
  });
  plan.summary = `Ataque registrado: nº ${target.seat} com ${choice}. Se a arma estiver certa, ele morre na virada da rodada ${state.round + 1} para a ${state.round + 2}.`;
  return plan.summary;
}

function handleCitizenCheck(state: GameState, me: GamePlayer, card: Card, choice: string, text: string): string {
  const cs = state.citizens[me.id];
  const targetedNow = () => currentAttacks(state).some((a) => a.seat === me.seat);

  if (card.step === 2) {
    if (choice === 'no') {
      card.done = true;
      return 'Você decidiu não sabotar.';
    }
    card.step = 3;
    return 'Escolha quem vai receber o alvo.';
  }
  if (card.step === 3) {
    card.sabotageSeat = seatFromChoice(state, choice).seat;
    card.step = 4;
    return `Agora escolha a pergunta para o nº ${card.sabotageSeat}.`;
  }
  if (card.step === 4) {
    const question = card.quiz?.find((q) => String(q.id) === choice);
    const target = playerBySeat(state, card.sabotageSeat ?? -1);
    if (!question || !target || target.status !== 'alive') throw new GameError('Sabotagem inválida.');
    if (!targetedNow()) throw new GameError('Você não está mais entre os alvos.');
    state.sabotages.push({
      id: state.sabotages.length + 1,
      round: state.round,
      by: me.id,
      bySeat: me.seat,
      targetId: target.id,
      targetSeat: target.seat,
      question,
      status: 'pending',
      openedAt: null,
      announced: false,
    });
    cs.sabotageUsed = true;
    card.done = true;
    return `Sabotagem enviada ao nº ${target.seat}. O resultado aparece na virada.`;
  }

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
  // step 1: consulta
  if (!currentAttacks(state).length) {
    return 'Charada certa! Mas não há ataque dos assassinos em andamento agora. Consulte de novo mais tarde — o uso não foi gasto.';
  }
  cs.checkUses = Math.max(0, cs.checkUses - 1);
  cs.lastCheckRound = state.round;
  const hit = targetedNow();
  const result = hit ? 'Você ESTÁ entre os alvos atuais dos assassinos.' : 'Você NÃO está entre os alvos atuais dos assassinos.';
  (state.results[me.id] ??= []).push({ round: state.round, kind: 'check', text: result });
  if (hit && !cs.sabotageUsed && (card.quiz?.length ?? 0) >= 3) {
    card.step = 2;
  } else {
    card.done = true;
  }
  return result;
}

// ---------------------------------------------------------------- sabotagem (lado do sabotado)

export function pendingSabotageFor(state: GameState, playerId: string) {
  return state.sabotages.find((s) => s.targetId === playerId && (s.status === 'pending' || s.status === 'open'));
}

const GRACE_MS = 1500;

export function sabotageDeadline(s: { openedAt: number | null }): number | null {
  return s.openedAt === null ? null : s.openedAt + SABOTAGE_SECONDS * 1000;
}

export function openSabotage(state: GameState, playerId: string, now: number) {
  const s = pendingSabotageFor(state, playerId);
  if (!s) throw new GameError('Não há sabotagem para você.');
  if (s.status === 'pending') {
    s.status = 'open';
    s.openedAt = now;
  }
  return s;
}

function finishSabotage(state: GameState, s: GameState['sabotages'][number], correct: boolean) {
  const by = playerById(state, s.by);
  if (correct) {
    s.status = 'failed';
    (state.results[s.by] ??= []).push({ round: s.round, kind: 'sabotage', text: `Sua sabotagem falhou: o nº ${s.targetSeat} acertou a pergunta.` });
    (state.results[s.targetId] ??= []).push({ round: s.round, kind: 'sabotage', text: 'Você acertou a pergunta e escapou da sabotagem.' });
    return;
  }
  s.status = 'success';
  for (const a of state.attacks) {
    if (a.resolvesAfterRound === state.round && a.seat === by.seat) {
      a.sabotagedFrom = a.seat;
      a.seat = s.targetSeat;
    }
  }
  (state.results[s.by] ??= []).push({ round: s.round, kind: 'sabotage', text: `Sua sabotagem deu certo: o alvo foi para o nº ${s.targetSeat}.` });
  (state.results[s.targetId] ??= []).push({ round: s.round, kind: 'sabotage', text: 'Você não acertou a pergunta da sabotagem.' });
}

export function answerSabotage(state: GameState, playerId: string, optionIndex: number, now: number): boolean {
  const s = pendingSabotageFor(state, playerId);
  if (!s || s.status !== 'open') throw new GameError('Abra a pergunta primeiro.');
  const late = now > (sabotageDeadline(s) ?? 0) + GRACE_MS;
  const correct = !late && optionIndex === s.question.answer;
  finishSabotage(state, s, correct);
  return correct;
}

/** Perguntas abertas cujo tempo acabou contam como erro. */
export function expireSabotages(state: GameState, now: number): void {
  for (const s of state.sabotages) {
    if (s.status === 'open' && now > (sabotageDeadline(s) ?? 0) + GRACE_MS) finishSabotage(state, s, false);
  }
}

/** A virada espera enquanto houver sabotagem sem resposta. */
export function sabotageBlocking(state: GameState): boolean {
  return state.sabotages.some((s) => s.round === state.round && (s.status === 'pending' || s.status === 'open'));
}

export function sabotageView(state: GameState, playerId: string, quizVisible: boolean) {
  const s = pendingSabotageFor(state, playerId);
  if (!s) return null;
  return {
    id: s.id,
    status: s.status,
    seconds: SABOTAGE_SECONDS,
    deadline: sabotageDeadline(s),
    question: quizVisible && s.status === 'open' ? s.question.question : null,
    options: quizVisible && s.status === 'open' ? s.question.options : null,
  };
}

