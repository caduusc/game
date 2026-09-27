# Alergia

Web app para o **Alergia**, um jogo de dedução social presencial para 10 a 20 pessoas. Os jogadores conversam na mesma sala. Cada um usa o próprio celular para receber segredos, fazer ações e ver os anúncios de cada rodada.

- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind 4, hospedado na Vercel.
- **Supabase:** Postgres, Realtime, Anonymous Auth e Row Level Security.
- **Motor do jogo:** TypeScript puro em `lib/engine`, sem banco, testado com Vitest.

---

## Sumário

1. [Arquitetura](#arquitetura)
2. [Modelo de dados e segurança](#modelo-de-dados-e-segurança)
3. [Setup do Supabase](#setup-do-supabase)
4. [Rodando localmente](#rodando-localmente)
5. [Deploy na Vercel](#deploy-na-vercel)
6. [Testes](#testes)
7. [Modo de teste (dev)](#modo-de-teste-dev)
8. [Decisões de regra](#decisões-de-regra)
9. [Estrutura de pastas](#estrutura-de-pastas)

---

## Arquitetura

```
Celular (Next.js client) ──leitura com RLS + Realtime──▶ Supabase Postgres
        │                                                  ▲
        └─ POST /api/... (Bearer JWT anônimo) ─▶ Route Handlers ─ transação SQL ─┘
                                                   └─ lib/engine (TS puro)
```

- **Leitura:** o cliente usa a anon key com uma sessão anônima. Ele lê só o que o RLS permite e assina as tabelas pelo Realtime (Postgres Changes).
- **Escrita:** acontece só nos Route Handlers.
  1. O handler valida o JWT com `supabase.auth.getUser`.
  2. Abre uma transação no Postgres pela variável `DATABASE_URL` e trava a sala com `SELECT … FOR UPDATE`.
  3. Carrega o estado completo e chama o motor.
  4. Grava o novo estado e as *projeções*: as linhas que cada jogador ou equipe pode ler. Só o que mudou é gravado.
- **Estado oculto:** o estado completo do motor (papéis, personagens, arco, respostas das charadas, ações) fica em `game_private.game_state`. O cliente nunca tem acesso a ele.
- **Relógio:** toda resposta da API traz `serverNow`. O cliente calcula a diferença para o próprio relógio e monta o cronômetro a partir do `ends_at` da sala.
- **Virada de rodada:** quando o cronômetro zera, qualquer cliente chama `POST /api/rooms/[code]/tick`. O handler é idempotente e só resolve se:
  - o tempo acabou;
  - a sala não está pausada;
  - `resolved_round < current_round`.

  Com isso, várias chamadas simultâneas resultam em uma única resolução.
- **Presença e host:** cada cliente manda um heartbeat a cada 15 s. O host efetivo é:
  - o host original, se ele foi visto nos últimos 60 s;
  - senão, o jogador vivo e conectado com o menor número;
  - quando o host original volta, os controles retornam para ele.
- **Reentrada:** o host gera um código de uso único, que vale por 10 minutos. Quem digita esse código ocupa o lugar do jogador, e a sessão antiga perde o acesso na hora.

### API

| Rota | Quem chama | O que faz |
|---|---|---|
| `POST /api/rooms` | qualquer um | cria sala (`name`, `roundMinutes`, `devMode`) |
| `POST /api/rooms/[code]/join` | qualquer um | entra no lobby (`name`) |
| `POST /api/rooms/[code]/rejoin` | qualquer um | reentrada (`rejoinCode`) |
| `POST /api/rooms/[code]/heartbeat` | membros | presença e hora do servidor |
| `POST /api/rooms/[code]/action` | vivos | responde um card (`slot`, `number`, `text`) |
| `POST /api/rooms/[code]/tick` | membros | vira a rodada se o tempo acabou (idempotente) |
| `POST /api/rooms/[code]/start` · `pause` · `resume` · `end` | host efetivo | controles do host |
| `POST /api/rooms/[code]/rejoin-code` | host efetivo | gera código de reentrada (`playerId`) |
| `POST /api/rooms/[code]/dev-bots` · `dev-view` · `dev-force-end` | host original, só em dev | modo de teste |

---

## Modelo de dados e segurança

**Tabelas públicas da sala.** Qualquer membro da sala lê, pela função `is_room_member(room_id)`:

- `rooms`: código, host, host efetivo, status, rodada atual, `ends_at`, pausa, vencedor.
- `players`: nome, número, status, presença.
- `announcements`: mortes e prisões com nome, número e personagem. Nunca o papel.
- `final_reveal`: papel e personagem de todos. É preenchida só no fim da partida.

**Segredos de cada jogador.** Só o dono lê, pela função `owns_player(player_id)`, que confere `players.user_id = auth.uid()`:

- `player_secrets`: papel, personagem e informações privadas.
- `player_cards`: os 3 cards da rodada, só com texto e campos. Não há tipo real da tarefa nem resposta.
- `player_results`: resultados de "checar alvo" e "verificar identidade".

**Dados de equipe.** Só membros da equipe leem, pela função `is_team_member(room_id, team)`:

- `team_members`: quem é assassino e quem é investigador.
- `team_state`:
  - **Assassinos:** parceiro, lista de personagens com armas, opções de alvo, escolha atual.
  - **Investigadores:** nomes dos personagens, perguntas, dicas liberadas, verificações, acusações.

**Tabelas ocultas.** Ficam no schema `game_private`, que o PostgREST não expõe. Têm RLS ligado, nenhuma policy e acesso revogado para `anon` e `authenticated`:

- `characters`: com as armas.
- `riddles`: com as respostas.
- `game_state`: estado completo do motor.
- `actions`: auditoria de todas as submissões.
- `rejoin_codes`: guarda só o hash de cada código.

Nenhuma tabela aceita INSERT, UPDATE ou DELETE vindo do cliente. Como todas as policies passam por `players.user_id`, a reentrada precisa trocar apenas essa coluna.

**Realtime.** A migration adiciona à publicação `supabase_realtime` as tabelas:

`rooms`, `players`, `announcements`, `final_reveal`, `player_secrets`, `player_cards`, `player_results` e `team_state`.

O Postgres Changes aplica o RLS por assinante. Além disso, o cliente recarrega os dados depois de cada ação própria e a cada 30 s, como rede de segurança caso algum evento se perca.

---

## Setup do Supabase

1. **Crie um projeto** em [supabase.com](https://supabase.com). Recomendo a região São Paulo (`sa-east-1`).

2. **Habilite o login anônimo:**
   - vá em **Authentication → Sign In / Providers**;
   - ative **Allow anonymous sign-ins** e salve.

   *(Opcional)* Em **Authentication → Rate Limits**, aumente o limite de logins anônimos por IP. Numa festa, todos os celulares costumam sair pelo mesmo Wi-Fi, então o limite padrão pode travar a entrada.

3. **Rode as migrations e o seed.** Escolha uma das opções:
   - **SQL Editor (mais simples):** abra **SQL Editor → New query**, cole o conteúdo inteiro de `supabase/setup.sql` e clique em **Run**. Esse arquivo junta as duas migrations e o seed.
   - **SQL Editor, arquivo por arquivo:** execute, nesta ordem, o conteúdo de:
     1. `supabase/migrations/20260927000001_schema.sql`
     2. `supabase/migrations/20260927000002_rls_realtime.sql`
     3. `supabase/seed.sql` (24 personagens e 92 charadas)
   - **Supabase CLI:**
     ```bash
     npx supabase login
     npx supabase link --project-ref SEU_PROJECT_REF
     npx supabase db push             # aplica as migrations
     npx supabase db push --include-seed   # ou rode supabase/seed.sql no SQL Editor
     ```

4. **Confirme o Realtime:**
   - em **Database → Publications**, a publicação `supabase_realtime` deve listar as 8 tabelas acima. A migration já faz isso, mas vale conferir;
   - em **Realtime → Settings**, deixe **"Allow public access"** ligado. O app usa canais públicos de Postgres Changes, e o controle de acesso fica no RLS das tabelas.

5. **Pegue as credenciais:**
   - em **Project Settings → API**, copie a **Project URL** e a **anon / publishable key**;
   - em **Connect → Transaction pooler**, copie a connection string da porta **6543** e troque `[YOUR-PASSWORD]` pela senha do banco.

`.env.example` com as três variáveis:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
DATABASE_URL=postgresql://postgres.SEU-PROJETO:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
```

> `DATABASE_URL` dá acesso privilegiado ao banco e é usada **só no servidor**. Nunca coloque o prefixo `NEXT_PUBLIC_` nela.

---

## Rodando localmente

**Com um projeto Supabase na nuvem:**

```bash
npm install
cp .env.example .env.local   # preencha as variáveis
npm run dev                  # http://localhost:3000
```

**Com o Supabase local** (precisa de Docker). O `supabase/config.toml` já vem com login anônimo habilitado:

```bash
npx supabase start          # aplica migrations e seed.sql
# use API_URL, ANON_KEY e DB_URL que o comando imprime:
#   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
npm run dev
```

Para testar em vários celulares na mesma rede, rode `npm run dev -- -H 0.0.0.0` e acesse pelo IP da máquina.

**Mudou os bancos de personagens ou charadas?** Edite `lib/engine/data/characters.ts` ou `lib/engine/data/riddles.ts` e depois rode:

```bash
npm run seed:generate   # regenera supabase/seed.sql, supabase/seed/*.sql e supabase/setup.sql
```

---

## Deploy na Vercel

1. Suba o repositório para o GitHub.
2. Na Vercel, clique em **Add New → Project** e importe o repositório. O framework **Next.js** é detectado sozinho.
3. Em **Environment Variables**, cadastre `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `DATABASE_URL`, para Production e Preview.
4. Clique em **Deploy**.
5. No Supabase, em **Authentication → URL Configuration**, coloque a URL da Vercel em **Site URL**. O login anônimo não depende disso, mas é bom manter certo.

Recomendo colocar as Functions na mesma região do banco, em **Project Settings → Functions → Region**, por exemplo `gru1` para São Paulo. Isso reduz a latência das ações.

O modo de teste fica **desligado em produção**: o servidor bloqueia bots e troca de visão quando `NODE_ENV=production`.

Ao abrir o site no celular, use **"Adicionar à tela inicial"**: o app aparece com o nome **Alergia** (definido no manifest).

---

## Testes

```bash
npm test          # motor do jogo (Vitest)
npm run typecheck
```

A suíte do motor (`lib/engine/__tests__`) cobre:

- **Candidatos do arco:** L1, L2, R1 e R2, pulando mortos e dando a volta no círculo, incluindo o exemplo do enunciado com 20 jogadores.
- **Alvo obrigatório após erro:** um alvo sobrevive; os dois sobrevivem; alvo sem resposta; pendente morto por policial.
- **Assassino sozinho:** depois de morte ou prisão do parceiro, com 0, 1 ou 2 pendentes.
- **Mortes por policial:** não estendem o arco.
- **Poucos vivos:** candidatos repetidos, insuficientes ou arco fechado.
- **Resolução simultânea:** assassino morto ou preso na mesma virada ainda mata; vitória do maníaco; condições de vitória, incluindo o empate.
- **Dicas:** em 200 sorteios, identificam exatamente os dois assassinos. A grade de personagens é única.
- **Normalização de respostas:** acentos, pontuação, Levenshtein, datas, sinônimos de países, personagens e armas.
- **Tela uniforme:** 3 cards com o mesmo formato para todos; decorativos não afetam o jogo; a projeção não vaza respostas.
- **Host efetivo:** as regras de 60 s e de volta do host original.

**Teste de integração** (`tests/integration.test.ts`): roda os Route Handlers contra um Postgres real. Ele cobre:

- RLS por jogador e por equipe;
- idempotência do tick com chamadas concorrentes;
- pausa;
- reentrada;
- troca de host;
- modo dev;
- uma partida completa até o fim.

Ele só roda com `TEST_DATABASE_URL`:

```bash
# banco vazio + stub do Supabase + migrations + seed
psql "$URL" -f tests/sql/supabase-stub.sql
for f in supabase/migrations/*.sql; do psql "$URL" -f "$f"; done
psql "$URL" -f supabase/seed.sql
TEST_DATABASE_URL="$URL" npm test
```

---

## Modo de teste (dev)

Só funciona com `npm run dev` (`NODE_ENV=development`).

1. Na tela inicial, em **Criar sala**, marque **"Modo de teste"**.
2. No lobby, a barra amarela tem **+1 bot**, **Completar 10** e **Completar 20**.
3. Na partida, o seletor **"Visualizando como"** troca a tela para qualquer bot. Você vê as missões e a ficha dele e responde por ele.
4. **Forçar fim da rodada** faz a virada imediatamente.

Com isso, dá para jogar uma partida inteira sozinho em um navegador.

---

## Decisões de regra

Implementadas conforme o enunciado e os ajustes combinados:

- **Banco de personagens:** Bertha Lutz (arma **Mel**) substitui Chiquinha Gonzaga. Cada combinação de gênero, origem e século tem 3 personagens com áreas distintas, e as armas são únicas.
- **Arco:** é um intervalo contíguo de L até R, que cresce para cobrir cada alvo escolhido, acertando ou errando.
  - Mortos são pulados.
  - Mortes por policial e prisões não mexem no arco.
  - Alvo que sobrevive vira obrigatório. Um obrigatório que morre por outra causa sai da lista de pendentes.
- **Assassino sozinho:** tem 1 alvo por rodada. Com 2 pendentes, escolhe um deles.
- **Sem escolha na rodada 2 em diante:** vale (L1, R1), ou a combinação com o pendente. O card de arma já mostra esse alvo padrão, e responder a arma trava a escolha.
- **Tentativas:** 1 por rodada para cada arma de assassino e para o tiro de cada policial. O resultado só aparece na virada.
- **Cidadão:**
  - **Checar alvo:** no máximo 1 uso por rodada; na rodada 1 vale o alvo inicial. Se os assassinos ainda não escolheram, o app avisa e não gasta o uso.
  - **Verificar identidade:** errar a charada não gasta o uso.
- **Vitória:** a condição dos assassinos considera os assassinos vivos **no início** da virada, porque as ações deles valem mesmo se caírem na mesma virada. Por isso a regra de empate funciona: se na mesma virada o último assassino é preso e o último cidadão morre, os assassinos vencem.
- **Acusado que também leva tiro:** é anunciado como morto.
- **Respostas:** o app ignora acentos, caixa, pontuação e artigo inicial ("o pente" vale "pente"). Aceita distância de Levenshtein até 1, ou até 2 para respostas com mais de 8 caracteres.
  - Datas: `14/03/1879`, `14-03-1879`, `14 03 1879`, `14031879` e `14 de março de 1879`.
  - Países aceitam sinônimos, como EUA e Estados Unidos, ou Holanda e Países Baixos.

---

## Estrutura de pastas

```
app/
  page.tsx                     tela inicial (criar / entrar / reentrada)
  sala/[code]/page.tsx         lobby, partida e fim
  api/rooms/route.ts           criar sala
  api/rooms/[code]/[op]/route.ts  demais operações
  manifest.ts, layout.tsx, globals.css
components/                    Lobby, Game, MissionCard, SheetTab, TableTab, HostPanel, TurnModal, EndScreen, DevBar
lib/engine/                    motor puro (setup, arco, cards, resolução, vitória, dicas, respostas, projeção, host)
lib/engine/__tests__/          testes Vitest do motor
lib/server/                    conexão Postgres, auth, handlers, persistência das projeções
lib/client/                    Supabase client, API, relógio, hooks de sala
supabase/migrations/           esquema, RLS e Realtime
supabase/seed.sql              personagens + charadas (gerado)
supabase/setup.sql             migrations + seed num arquivo só, para o SQL Editor (gerado)
scripts/generate-seed.ts       gera os seeds a partir de lib/engine/data
tests/                         integração com Postgres + stub do Supabase
```
