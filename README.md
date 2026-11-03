# AI Engineering Operating Model v0.3 — Laboratory (`ai-orchestration-lab`)

## 1. Objetivo do Laboratório

Este repositório contém o laboratório experimental do **AI Engineering Operating Model v0.3**, projetado para validar contratos, gates de governança, coleta independente de evidências, isolamento de execução e fluxos de revisão independente.

## 2. Independência em Relação ao Projeto IAS

O laboratório `ai-orchestration-lab` é um projeto **estritamente independente** do **Identity and Access Server (IAS)**:

- Nenhuma atividade deste laboratório altera documentos canônicos, estados normativos, cartões ou código-fonte do IAS.
- Na Fase P1, todas as execuções operam exclusivamente sobre dados e fixtures sintéticas (`SYNTHETIC_LAB`).

## 3. Escopo Atual (`P1-001` e `P1-002`)

O estado atual do código contempla a fundação técnica da **`P1-001`** e a infraestrutura de validação estrutural de contratos da **`P1-002`**:

- **Fundação (`P1-001`):**
  - Inicialização do pacote Node.js 24 (`"type": "module"`) e TypeScript (`5.9.3`).
  - Instalação exata e reproduzível das dependências de base (`ajv@8.20.0`, `ajv-formats@3.0.1`, `typescript@5.9.3`, `@types/node@24.19.2`).
  - Estrutura canônica de diretórios do laboratório, compilação (`tsc`), verificação estática de tipos (`tsc --noEmit`) e suíte de fundação (`tests/unit/foundation.test.ts`).
- **Validação Estrutural de Contratos (`P1-002`):**
  - Sete arquivos JSON Schema Draft 2020-12 em `schemas/` (`TaskContract`, `ApprovalRecord`, `ExecutionAttempt`, `ExecutionResult`, `EvidenceManifest`, `ReviewHandoffPackage`, `ReviewReport`).
  - Carregador determinístico de schemas independente de `process.cwd()` (`src/contracts/schema-loader.ts`).
  - Validador estrito `Ajv2020` + `ajv-formats` (`strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false, allowUnionTypes: true`) em `src/contracts/validator.ts` e tipos normativos em `src/contracts/types.ts`.
  - Suíte unitária completa para os sete contratos (`tests/unit/contracts-validation.test.ts`).

## 4. Limitações Atuais e Funcionalidades Reservadas às Etapas Posteriores

**Importante:** A conclusão das tarefas `P1-001` e `P1-002` fornece a infraestrutura base e a validação estrutural estática de contratos isolados. Os seguintes componentes **ainda não estão implementados** e pertencem às tarefas subsequentes (sujeitas aos respectivos gates de autorização):

- **`P1-003`**: Canonicalização JSON (`JCS-RFC8785-v1`), hashing SHA-256 e validação semântica/relacional de `ApprovalRecord`.
- **`P1-004`**: Ciclo de vida de `ExecutionAttempt`, detecção de tentativas órfãs (`Reconciler`) e rollback controlado.
- **`P1-005`**: `FixtureWorkspaceManager`, `ExecutionAdapter`, executor sintético determinístico (`SYN-001` a `SYN-010`), protocolo `RED → GREEN` em duas fases e experimento de isolamento preventivo no WSL2.
- **`P1-006`**: `EvidenceCollector`, `EvidenceManifest` e geração/validação semântica de `ReviewHandoffPackage`.
- **`P1-007`**: Implementação dos predicados `TASK-READY`, `ValidationGate` e `PR-GATE`.
- **`P1-008`**: Simulação adversarial de ponta a ponta (16 cenários obrigatórios) e relatórios finais de evidência da P1.
- **`P2` a `P4`**: Benchmark de executores reais (Codex e Antigravity), automação de handoffs de revisão e piloto controlado.

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

> O script `npm test` executa `npm run build` seguido de `node --test --test-reporter=spec 'dist/tests/**/*.test.js'`, utilizando o resolvedor interno de globs do Node.js 24 (entre aspas simples para evitar dependência de expansão de glob pelo shell `/bin/sh`).

## 7. Estrutura de Diretórios

```text
ai-orchestration-lab/
├── docs/
│   ├── specifications/   # Especificações aprovadas (P0 v0.3.0 e P1 v0.2.0)
│   └── evidence/         # Evidências e relatórios de validação
├── schemas/              # JSON Schemas Draft 2020-12 (reservado para P1-002)
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
