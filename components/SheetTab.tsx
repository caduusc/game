'use client';

import { useEffect, useState } from 'react';
import type { InvestigatorsTeamView, KillersTeamView } from '@/lib/engine';
import type { PrivateData } from '@/lib/client/types';

const ROLE_HELP: Record<string, string> = {
  killer:
    'Rodada 1: escolham o alvo inicial. Depois, escolham os alvos entre as opções do arco e digitem a arma que mata cada um. Alvo 1 fica com o Assassino A, alvo 2 com o B.',
  investigator:
    'Respondam as perguntas de pista para liberar as dicas sobre os assassinos. Uma verificação por rodada para a equipe. Cada um tem 1 acusação no jogo.',
  police: 'A partir da rodada 2, escolha um número e acerte a charada: o alvo morre na virada. Você não conhece ninguém, nem os outros policiais.',
  citizen: 'Use suas charadas para checar se você é alvo e para verificar identidades. Converse, deduza e ajude a encontrar os assassinos.',
  maniac: 'Você joga sozinho e vence se morrer por assassino ou policial. Sua vitória não encerra o jogo.',
};

/** "Minha ficha": mesma estrutura visual para todos os papéis. */
export function SheetTab({ priv, viewerId, roomId }: { priv: PrivateData; viewerId: string; roomId: string }) {
  const s = priv.secret;
  if (!s) return <p className="py-10 text-center text-sm text-zinc-500">Carregando ficha…</p>;
  const ch = s.data.character;

  return (
    <div className="flex flex-col gap-3">
      <Section title="Papel">
        <p className="text-2xl font-black">
          {s.role_label}
          {s.data.killerSlot && <span className="text-accent-soft"> {s.data.killerSlot}</span>}
        </p>
        <p className="mt-2 text-sm text-zinc-400">{ROLE_HELP[s.role]}</p>
      </Section>

      <Section title="Personagem">
        <p className="text-xl font-bold">{ch.name}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Item k="Nascimento" v={ch.birth} />
          <Item k="País" v={ch.country} />
          <Item k="Gênero" v={ch.gender} />
          <Item k="Origem" v={ch.origin} />
          <Item k="Século" v={ch.century} />
          <Item k="Área" v={ch.area} />
          <Item k="Sua alergia" v={ch.weapon} />
        </dl>
      </Section>

      <Section title="Informações">
        {s.role === 'killer' && priv.killers && <KillersInfo team={priv.killers} />}
        {s.role === 'investigator' && priv.investigators && <InvestigatorsInfo team={priv.investigators} accusationUsed={s.data.accusationUsed} />}
        {s.role === 'citizen' && (
          <ul className="text-sm text-zinc-300">
            <li>Checar alvo: {s.data.checkUses ?? 0} uso(s) restante(s)</li>
            <li>Verificar identidade: {s.data.verifyUses ?? 0} uso(s) restante(s)</li>
          </ul>
        )}
        {s.role === 'police' && <p className="text-sm text-zinc-300">Você não conhece a identidade de ninguém.</p>}
        {s.role === 'maniac' && (
          <p className="text-sm text-zinc-300">{s.data.maniacWon ? 'Você já venceu! Continue em silêncio.' : 'Ainda não venceu.'}</p>
        )}
      </Section>

      <Section title="Resultados privados">
        {priv.results.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum resultado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {priv.results.map((r) => (
              <li key={r.idx} className="rounded-lg bg-ink-800 px-3 py-2">
                <span className="text-zinc-500">R{r.round} · </span>
                {r.text}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Notes storageKey={`alergia-notes-${roomId}-${viewerId}`} />
    </div>
  );
}

function KillersInfo({ team }: { team: KillersTeamView }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <p className="font-semibold text-zinc-200">Dupla</p>
        <ul className="mt-1 text-zinc-300">
          {team.members.map((m) => (
            <li key={m.slot}>
              Assassino {m.slot}: nº {m.seat} · {m.name}
              {m.status !== 'alive' && <span className="text-zinc-500"> ({m.status === 'dead' ? 'morto' : 'preso'})</span>}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-semibold text-zinc-200">Alvos</p>
        {team.round === 1 ? (
          <p className="text-zinc-300">Alvo inicial: {team.initialTarget ? `nº ${team.initialTarget}` : 'não escolhido (o app sorteia)'}</p>
        ) : (
          <div className="text-zinc-300">
            <p>Opções: {team.options.length ? team.options.join(' · ') : 'nenhuma'}</p>
            <p>Escolha: {team.choice ?? `nenhuma (vale ${team.options[0] ?? '—'})`}</p>
            {team.assignments.map((a) => (
              <p key={a.slot}>
                Assassino {a.slot} → nº {a.seat} {a.answered ? '(arma enviada)' : ''}
              </p>
            ))}
            {team.pending.length > 0 && <p>Obrigatórios: {team.pending.map((p) => `nº ${p}`).join(', ')}</p>}
          </div>
        )}
      </div>
      <div>
        <p className="font-semibold text-zinc-200">Personagens em jogo e armas</p>
        <ul className="mt-1 grid grid-cols-1 gap-1 text-zinc-300">
          {team.characters.map((c) => (
            <li key={c.name} className="flex justify-between gap-2 border-b border-ink-800 py-1">
              <span>{c.name}</span>
              <span className="text-accent-soft">{c.weapon}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function InvestigatorsInfo({ team, accusationUsed }: { team: InvestigatorsTeamView; accusationUsed?: boolean }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <p className="font-semibold text-zinc-200">Equipe</p>
        <ul className="mt-1 text-zinc-300">
          {team.members.map((m) => (
            <li key={m.seat}>
              nº {m.seat} · {m.name}
              {m.status !== 'alive' && <span className="text-zinc-500"> (fora)</span>}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-zinc-400">Sua acusação: {accusationUsed ? 'usada' : 'disponível'}</p>
      </div>
      <div>
        <p className="font-semibold text-zinc-200">Dicas ({team.hints.length}/4)</p>
        {team.hints.length === 0 ? (
          <p className="text-zinc-500">Acertem as perguntas de pista para liberar dicas.</p>
        ) : (
          <ol className="mt-1 list-decimal pl-5 text-emerald-200">
            {team.hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ol>
        )}
      </div>
      <div>
        <p className="font-semibold text-zinc-200">Perguntas</p>
        <ul className="mt-1 text-zinc-300">
          {team.questions.map((q) => (
            <li key={q.seat}>
              nº {q.seat} — {q.type}: {q.solved ? '✓ resolvida' : q.triedThisRound ? 'tentada nesta rodada' : 'aberta'}
            </li>
          ))}
        </ul>
      </div>
      {team.verifications.length > 0 && (
        <div>
          <p className="font-semibold text-zinc-200">Verificações</p>
          <ul className="mt-1 text-zinc-300">
            {team.verifications.map((v, i) => (
              <li key={i}>
                R{v.round} · nº {v.seat} declarou “{v.declared}”: <b className={v.truth ? 'text-emerald-300' : 'text-accent-soft'}>{v.truth ? 'VERDADE' : 'MENTIRA'}</b>{' '}
                <span className="text-zinc-500">({v.byName})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {team.accusations.length > 0 && (
        <div>
          <p className="font-semibold text-zinc-200">Acusações</p>
          <ul className="mt-1 text-zinc-300">
            {team.accusations.map((a, i) => (
              <li key={i}>
                R{a.round} · {a.byName} acusou o nº {a.seat}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className="font-semibold text-zinc-200">Personagens em jogo</p>
        <p className="mt-1 text-zinc-300">{team.characterNames.join(' · ')}</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h3 className="label mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{k}</dt>
      <dd className="font-medium text-zinc-100">{v}</dd>
    </div>
  );
}

function Notes({ storageKey }: { storageKey: string }) {
  const [value, setValue] = useState('');
  useEffect(() => {
    try {
      setValue(localStorage.getItem(storageKey) ?? '');
    } catch {}
  }, [storageKey]);
  return (
    <Section title="Anotações">
      <textarea
        className="input min-h-28 text-sm"
        value={value}
        placeholder="Quem declarou qual personagem, suspeitas…"
        onChange={(e) => {
          setValue(e.target.value);
          try {
            localStorage.setItem(storageKey, e.target.value);
          } catch {}
        }}
      />
    </Section>
  );
}
