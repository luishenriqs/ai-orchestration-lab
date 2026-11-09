# AI Engineering Operating Model v0.3 — Laboratory (`ai-orchestration-lab`)

## 1. Objetivo do Laboratório

Este repositório contém o laboratório experimental do **AI Engineering Operating Model v0.3**, projetado para validar contratos, gates de governança, coleta independente de evidências, isolamento de execução e fluxos de revisão independente.

## 2. Independência em Relação ao Projeto IAS

O laboratório `ai-orchestration-lab` é um projeto **estritamente independente** do **Identity and Access Server (IAS)**:

- Nenhuma atividade deste laboratório altera documentos canônicos, estados normativos, cartões ou código-fonte do IAS.
- Na Fase P1, todas as execuções operam exclusivamente sobre dados e fixtures sintéticas (`SYNTHETIC_LAB`).

## 3. Estado atual — P1 homologada; P2-001 implementado, pronto para revisão independente

A implementação P1-003 a P1-008 acrescenta:

- Canonicalização RFC8785, SHA256, parser sem chaves duplicadas e aprovação vinculada a registros confiáveis do host.
- Eventos persistentes de tentativas, transições, reconciliação por token de processo e rollback com arquivo de evidências.
- Fixtures Git independentes e dez comportamentos sintéticos sob bubblewrap.
- RED e GREEN observados em invocações distintas; escrita permitida somente no arquivo de implementação autorizado.
- Coleta Git independente, logs, hashes, snapshots de governança e handoff local verificado.
- TASK-READY, ValidationGate e PR-GATE com decisões auditáveis.
- CLI serial que reproduz os 16 cenários oficiais e gera relatórios JSON/Markdown.

A baseline e a autorização vigente estão em [P1-EXECUTION-BASELINE](docs/evidence/P1-EXECUTION-BASELINE.md). Os documentos originais preservam seus estados históricos. O resultado consolidado está em [P1-IMPLEMENTATION-FINAL-REPORT](P1-IMPLEMENTATION-FINAL-REPORT.md).

P2-001 adiciona contratos versionados, protocolo JSON estrito, máquinas de
estados, autorização vinculada a `ApprovalRecord`, journal por workflow,
deduplicação, reconciliação, limites e revisão independente em adapters
simulados. A implementação está pronta para revisão independente. Não executa
Codex, Gemini ou Antigravity reais e não comprova isolamento de CLIs. A
especificação, validação e limitações estão em
[P2-001 implementation notes](docs/specifications/P2-001-IMPLEMENTATION.md).

## 4. Reproduzir a validação P1

Além de Node/npm/Git, a execução integrada exige Linux/WSL2 com `/proc` e `bubblewrap` funcional (`/usr/bin/bwrap`). A instalação da ferramenta sozinha não comprova isolamento. Se namespaces ou mounts forem negados, os testes falham e TASK-READY bloqueia; não há fallback desprotegido.

```bash
npm ci
npm run typecheck
npm test
npm run test:coverage
npm run simulate
node scripts/verify-evidence.mjs
```

`npm test` e a simulação são seriais. A opção do runner Node `--test-isolation=none` permite a contagem individual dos testes neste ambiente; a separação de segurança dos subprocessos é imposta independentemente pelo bubblewrap. Não executar dois comandos de simulação/testes simultaneamente.

`npm run simulate` cria fixtures novas em `worktrees/` e tentativas em `runs/`, sem limpar execuções anteriores. Cada execução arquiva seus próprios artefatos em `docs/evidence/p1-execution/scenarios/run-<uuid>/`. Os arquivos `p1-simulation-report.json` e `P1-Relatorio-Final-Validacao.md` apontam para o resultado mais recente; os anteriores permanecem nos diretórios de execução. Nenhuma ação de push, merge ou exportação externa é realizada.

O adapter desta prova de conceito executa os programas sintéticos fixos: alteração em `src/sum.cjs`, teste host `tests/sum.cjs` e baseline Git registrada. Os contratos gerais continuam separados da política operacional restrita do laboratório. Revisões e aprovações nos cenários são dados **sintéticos**, sem representar revisão independente ou aprovação humana de resultados reais.

A barreira preventiva restringe filesystem, capabilities, rede e visibilidade do host. `/tmp` e `/dev` são áreas privadas de runtime. Captura de saída é limitada a 1 MiB por stream e há timeout/encerramento de grupo; não foram implementadas quotas rígidas de CPU, memória ou PIDs. A P1 não autoriza código arbitrário ou executores reais.

## 5. Pré-requisitos de Ambiente

- **Sistema Operacional:** Ubuntu 22.04 (WSL2)
- **Node.js:** `^24.0.0` (validado em `v24.22.2`)
- **npm:** `11.x` (validado em `11.19.1`)
- **Git:** `2.34+` (validado em `2.34.1`)

Verificação rápida dos pré-requisitos:

```bash
node -v
npm -v
git --version
```

## 6. Instalação, Compilação, Typecheck e Testes

### Instalação reproduzível (a partir do `package-lock.json`)

```bash
npm ci
```

### Verificação estática de tipos (`tsc --noEmit`)

```bash
npm run typecheck
```

### Compilação TypeScript (`src/` e `tests/` para `dist/`)

```bash
npm run build
```

### Execução dos testes automatizados (`node:test`)

```bash
npm test
```

> O script `npm test` executa `npm run build` seguido de `node --test --test-reporter=spec 'dist/tests/**/*.test.js'`, com `--test-isolation=none --test-concurrency=1`, utilizando o resolvedor interno de globs do Node.js 24 (entre aspas simples para evitar dependência de expansão de glob pelo shell `/bin/sh`).

## 7. Estrutura de Diretórios

A P1 executa somente programas sintéticos fixos. Antes de carregar a implementação
nos testes, o host verifica os bytes contra a lista de fontes sintéticas conhecidas;
conteúdo desconhecido produz ERROR e bloqueia a validação. O gate repete essa
verificação e exige a tentativa integral do journal, a autorização EXECUTION e
TASK-READY persistidos, além da identidade do processo observado. Evidências
arquivadas permitem inspeção; decisões de avanço exigem o journal host em `runs/`.
Achados HIGH/CRITICAL bloqueiam PR-GATE mesmo quando `blocking` é falso.

```text
ai-orchestration-lab/
├── docs/
│   ├── specifications/   # Especificações aprovadas (P0 v0.3.0 e P1 v0.2.0)
│   └── evidence/         # Evidências e relatórios de validação
├── schemas/              # Sete JSON Schemas Draft 2020-12
├── contracts/            # TaskContracts (reservado para P1-002+)
├── approvals/            # ApprovalRecords (reservado para P1-003+)
├── reviews/              # ReviewReports (reservado para P1-006+)
├── runs/                 # Artefatos por execução e tentativa (reservado para P1-004+)
├── worktrees/            # Fixtures Git isoladas (reservado para P1-005+)
├── src/
│   ├── index.ts          # Constantes estáticas da fundação P1-001
│   ├── contracts/
│   ├── governance/
│   ├── execution/
│   ├── evidence/
│   └── cli/
├── tests/
│   ├── unit/
│   │   └── foundation.test.ts
│   ├── integration/
│   └── scenarios/
├── package.json
├── package-lock.json
└── tsconfig.json
```
