# AI Engineering Operating Model v0.3
## P1-002 — Plano Técnico de Implementação e Validação

**Versão:** 0.3.1  
**Data:** 03/11/2026  
**Estado:** APROVADO — PLANEJAMENTO TÉCNICO P1-002  
**Responsável técnico:** Planejamento Técnico (consolidação documental v0.3.1)  
**Autoridade de aprovação:** Luís Henrique Pereira  
**Fundamento da aprovação:** Autorização humana expressa e condicional de 03/11/2026, após parecer `P1-002-REV-R2` e verificação de compatibilidade normativa com `15 §4.2` do IAS  
**Revisão independente inicial (`P1-002-REV` sobre v0.1.0):** REJEITADO (3 achados bloqueantes, 2 não bloqueantes — todos resolvidos)  
**Decisões normativas humanas (`DEC-P1-002-01` a `DEC-P1-002-09`):** APROVADAS POR LUÍS HENRIQUE PEREIRA EM 03/11/2026  
**Revisão independente regressiva (`P1-002-REV-R2` sobre v0.3.0):** APROVADO COM RECOMENDAÇÕES (sem pendências bloqueantes)  
**Gate documental (`P1-002-APV`):** APROVADO  
**Implementação de código:** NÃO AUTORIZADA  
**Gate de implementação (`P1-002-START`):** PENDENTE

### Histórico de Revisões Documentais
- **`v0.1.0` (03/11/2026):** Planejamento inicial da tarefa `P1-002`, submetido à revisão técnica independente (`P1-002-REV`).
- **`v0.2.0` (03/11/2026):** Tratamento estrutural dos cinco achados do relatório `P1-002-REV` (`P1-002-REV-001` a `P1-002-REV-005`) e da recomendação `P1-001-REV-001`, com explicitação das nove decisões normativas pendentes (`DEC-P1-002-01` a `DEC-P1-002-09`).
- **`v0.3.0` (03/11/2026):** Consolidação das nove decisões humanas (`DEC-P1-002-01` a `DEC-P1-002-09`) aprovadas por Luís Henrique Pereira, alinhamento das matrizes de contratos e de testes, e submissão à revisão independente regressiva (`P1-002-REV-R2`).
- **`v0.3.1` (03/11/2026):** Correção pontual de `TaskContract.ias_normative_card.test_plan` para objeto estruturado fechado (`positive`, `negative`, `concurrency`, `integration`) conforme a estrutura de referência de `15-plano-mestre-de-implementacao.md §4.2` do IAS, e registro da aprovação documental (`Gate B — P1-002-APV`) mediante autorização condicional expressa de Luís Henrique Pereira.

> **Limite da aprovação (`P1-002-APV`):** Esta aprovação refere-se **exclusivamente ao planejamento técnico documental da tarefa `P1-002`**. Ela **não autoriza o início da implementação de código, a criação de schemas executáveis, commits, merges ou o avanço para `P1-003`**. O início da implementação depende de autorização humana posterior, específica e expressa no gate `P1-002-START`.

---

# 1. Objetivo

Implementar a infraestrutura de validação estrutural determinística dos sete contratos normativos definidos no *AI Engineering Operating Model v0.3* (`P0 v0.3.0`) e detalhados no plano da Fase P1 (`P1 v0.2.0`).

A tarefa `P1-002` deverá demonstrar que contratos estruturalmente válidos são aceitos e que entradas estruturalmente inválidas são rejeitadas de maneira determinística (*fail-closed*), antes de serem encaminhadas às etapas seguintes de integridade criptográfica, autorização, execução, coleta de evidências ou avaliação de gates.

O mecanismo utilizará exclusivamente a stack aprovada e instalada na `P1-001`:

- **Runtime:** Node.js 24 (`"type": "module"`).
- **Linguagem:** TypeScript `5.9.3` (`"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"strict": true`).
- **Padrão de Schema:** JSON Schema Draft 2020-12 (`"$schema": "https://json-schema.org/draft/2020-12/schema"`).
- **Motor de validação:** `ajv@8.20.0` via entrypoint `Ajv2020` (`ajv/dist/2020.js`).
- **Validação de formatos:** `ajv-formats@3.0.1`.
- **Runner de testes:** `node:test` e `node:assert/strict`.

A implementação não deverá modificar os contratos aprovados na `P0 v0.3.0`, não deverá alterar a configuração de base da `P1-001` (`package.json`, `package-lock.json`, `tsconfig.json`, `tests/unit/foundation.test.ts`), nem antecipar responsabilidades atribuídas às tarefas `P1-003` a `P1-008`.

**Critério central de aceite (P1 §6 — P1-002):** nenhum contrato estruturalmente inválido poderá alcançar a execução.

---

# 2. Fontes Normativas e Precedência

## 2.1. Documentos Autoritativos Verificados

### 1. P0 — Especificação Técnica de Contratos, Interfaces e Governança
- **Arquivo:** `docs/specifications/AI-Engineering-Operating-Model-v0.3-P0-Especificacao-Tecnica.md`
- **Versão:** `0.3.0` — **Estado:** APROVADO (Baseline Documental P0)
- **SHA-256 verificado:** `abd9ca761c188d4a2974d853edb1274acd6ccdce9c4a3b580ad6f200fd999b20`
- **Seções de referência direta para a P1-002:**
  - §3.1 — Responsabilidade humana e limites de iniciativa dos agentes.
  - §6 — Modelo de confiança (`UNTRUSTED_AGENT_OUTPUT`, `HOST_OBSERVED`, `HUMAN_AUTHORIZATION`).
  - §7 — Interfaces lógicas.
  - §8 — Contratos: formato (JSON Schema Draft 2020-12), versionamento (`schema_version`, `contract_revision`) e validação (§8.5).
  - §9 — `TaskContract` (§9.2 estrutura, §9.3 compatibilidade com os 18 campos do cartão IAS `15 §4.2`, §9.4 caminhos relativos literais sem glob, §9.5 testes protegidos, §9.6 exclusão de `task_ready` do contrato estático).
  - §10 — `ApprovalRecord` (§10.2 estrutura, §10.3 escopos `PLAN_ONLY`, `EXECUTION`, `MERGE`, §10.4 campos obrigatórios condicionais em `MERGE`).
  - §11 — `ExecutionAttempt` (§11.2 estados internos, §11.4 estrutura de `attempt.json`, §11.5 enum fechado de `termination_reason` e regra de nulabilidade).
  - §12 — `ExecutionResult` (§12.2 estrutura e §12.3 limites semânticos de `completed`).
  - §13 — `EvidenceManifest` (§13.2 estrutura, `evidence_origin: "HOST_OBSERVED"`, §13.3 coleta independente, §13.4 campos de execuções independentes de teste).
  - §14 — Test-First e Failure-Validation (§14.1 estratégias previstas, §14.2 protocolo em duas fases RED e GREEN, §14.6 proteção contra testes inválidos).
  - §15 — `ReviewHandoffPackage` (§15.2 estrutura, §15.3 pré-exportação, §15.4 confidencialidade e estado `BLOCKED`).
  - §16 — `ReviewReport` (§16.2 estrutura, §16.3 estrutura de `finding`, §16.4 12 categorias avaliadas e justificativa de não aplicáveis, §16.5 enum de `verdict`).
  - §17 — Estados e gates (§17.1 estados normativos IAS preservados, §17.2 estados operacionais de tentativa).
  - §18 — Organização de artefatos e diretórios protegidos (`contracts/`, `approvals/`, `schemas/`, `reviews/`).
  - §20.2 — Detecção de tentativas órfãs sem confiar exclusivamente em PID reutilizável.
  - §21.1 e §25 (`PEND-003`) — Execução serial e `retry_limit = 0` na P1.
  - §22.1 — Categorias de classificação de dados (`SYNTHETIC_LAB`, `INTERNAL_NON_SENSITIVE`, `CLIENT_CONFIDENTIAL`).

### 2. P1 — Plano Técnico de Implementação e Validação
- **Arquivo:** `docs/specifications/P1-Plano-Tecnico-Implementacao-e-Validacao.md`
- **Versão:** `0.2.0` — **Estado:** APROVADO (Baseline Definitiva da P1)
- **SHA-256 verificado:** `66fd42bf8b64c5c252bf93db897deb84b60623822a10ff2c5498e43dff6a7a38`
- **Seções de referência direta para a P1-002:**
  - §2.1 e §2.2 — Escopo técnico incluído e excluído.
  - §3.1 e §3.2 — Stack aprovada e diretriz *Zero-Dependency First* (`ajv`, `ajv-formats`, `typescript`, `@types/node`).
  - §3.3 — Política de schemas (sete arquivos JSON Schema individuais com `"$schema": "https://json-schema.org/draft/2020-12/schema"`, campos explícitos, rejeição de propriedades adicionais em objetos normativos fechados, proibição de inventar estados/enums fora da baseline).
  - §3.4 — Formato normativo `canonicalization_version: "JCS-RFC8785-v1"`.
  - §4 e §5 — Arquitetura mínima e estrutura de diretórios do laboratório.
  - §6 — Definição da tarefa `P1-002 — Implementar validação de contratos` e fronteira com `P1-003` a `P1-008`.
  - §7, §8, §9 e §10 — Estratégia de testes, política de execução (`SYNTHETIC_LAB`, `parallelism: 1`, `retry_limit: 0`), plano de rollback e gates.

### 3. Deliberação Humana de 03/11/2026 (`DEC-P1-002-01` a `DEC-P1-002-09`)
- **Autoridade:** Luís Henrique Pereira.
- **Escopo:** Aprovação das nove decisões normativas de detalhamento estrutural dos contratos para a `P1-002` (consolidadas na Seção 6 deste documento).

### 4. Revisão Regressiva `P1-002-REV-R2` e Verificação de Compatibilidade com `15-plano-mestre-de-implementacao.md` (§4.2)
- **Parecer `P1-002-REV-R2`:** `APROVADO COM RECOMENDAÇÕES — sem pendências bloqueantes`.
- **Autorização humana condicional (03/11/2026):** Verificação de compatibilidade dos 18 campos de `TaskContract.ias_normative_card` contra a estrutura de referência de `15-plano-mestre-de-implementacao.md` (§4.2) fornecida por Luís Henrique Pereira, correção pontual de `ias_normative_card.test_plan` para objeto fechado (`positive`, `negative`, `concurrency`, `integration`) e encerramento do gate documental `P1-002-APV`.

## 2.2. Hierarquia Normativa

1. Prevalece a `P0 v0.3.0`, seguida pela `P1 v0.2.0` e pelas decisões humanas `DEC-P1-002-01` a `DEC-P1-002-09` aprovadas por Luís Henrique Pereira.
2. Este documento (`P1-002 v0.3.1`) detalha o plano técnico aprovado da tarefa `P1-002`.
3. Nenhuma disposição deste planejamento modifica a baseline aprovada da `P0`, da `P1` ou do projeto `IAS`.

---

# 3. Estado Verificado da Baseline

## 3.1. Inspeção Direta do Repositório

A estrutura real do repositório `/home/luishenriqs/projects/ai-orchestration-lab` foi verificada nesta sessão:

- **Branch atual:** `main`
- **Commit `HEAD`:** `d95f13610b591f826e9c489d767fa03edf2c370a` (`chore(p1-001): initialize AI orchestration laboratory`)
- **Commit ancestral imediato:** `ae66511701b022a37fdc07bd970aa20592cfa1db` (`docs(baseline): add approved P0 v0.3.0 and P1 v0.2.0 specifications`)
- **Arquivos rastreados da fundação `P1-001`:**
  - `.gitignore`
  - `README.md`
  - `package.json` (`ajv@8.20.0`, `ajv-formats@3.0.1`, `typescript@5.9.3`, `@types/node@24.19.2`)
  - `package-lock.json`
  - `tsconfig.json`
  - `src/index.ts` (caminho literal verificado: `/home/luishenriqs/projects/ai-orchestration-lab/src/index.ts`; exporta `LAB_NAME`, `LAB_SCHEMA_VERSION`, `LAB_FOUNDATION_TASK`, `REQUIRED_LAB_DIRECTORIES`, `NORMATIVE_SPECIFICATION_FILES`)
  - `tests/unit/foundation.test.ts` (3 testes validando constantes, 16 diretórios obrigatórios e presença/tamanho dos 2 documentos normativos)
  - Arquivos `.gitkeep` nos diretórios vazios (`approvals/`, `contracts/`, `docs/evidence/`, `reviews/`, `runs/`, `schemas/`, `src/cli/`, `src/contracts/`, `src/evidence/`, `src/execution/`, `src/governance/`, `tests/integration/`, `tests/scenarios/`, `worktrees/`).

## 3.2. Checklist de Pré-Condição Antes de Qualquer Implementação Futura

Quando a implementação da `P1-002` vier a ser expressamente autorizada (Gate C), o executor deverá confirmar em modo *read-only*:

1. `git rev-parse --abbrev-ref HEAD` $\rightarrow$ `main`.
2. `git rev-parse HEAD` $\rightarrow$ `d95f13610b591f826e9c489d767fa03edf2c370a` (ou o commit que vier a registrar a aprovação documental deste plano, se autorizado pelo Owner).
3. `git status --short` $\rightarrow$ árvore limpa.
4. `sha256sum` de `P0` e `P1` $\rightarrow$ idênticos aos hashes da Seção 2.1.
5. `npm run typecheck` e `npm test` $\rightarrow$ passando sem alterações na baseline `P1-001`.

Se qualquer item divergir, a implementação deverá ser imediatamente interrompida (`STOP / BLOCKED`).

---

# 4. Escopo e Fronteiras de Responsabilidade da P1-002

## 4.1. Incluído na P1-002 (Validação Estrutural Estática Individual)

1. Criação dos **sete arquivos JSON Schema Draft 2020-12** em `schemas/`.
2. Implementação do carregador e compilador de schemas com `Ajv2020` e `ajv-formats` em `src/contracts/`.
3. Validação estrutural individual de qualquer payload desconhecido (`unknown`) contra cada um dos sete contratos normativos.
4. Rejeição determinística de:
   - `schema_version` ausente ou diferente de `"0.3-p0"`;
   - campos obrigatórios ausentes (na raiz ou em subobjetos);
   - tipos primitivos ou compostos inválidos (sem coerção silenciosa);
   - valores `null` em campos não nuláveis;
   - valores fora dos enums normativos ou constantes (`const`);
   - propriedades adicionais não previstas (`additionalProperties: false` em todos os objetos normativos fechados), incluindo a rejeição explícita de `task_ready` em `TaskContract` (P0 §9.6);
   - formatos inválidos (`date-time` ISO-8601, hashes SHA-256 hexadecimais de 64 caracteres, caminhos relativos literais sem glob/barra inicial/`..`);
   - violações das regras condicionais internas ao documento aprovadas nas decisões `DEC-P1-002-03`, `DEC-P1-002-05` e `DEC-P1-002-09`.
5. Suíte completa de testes unitários em `tests/unit/contracts-validation.test.ts` executada sob protocolo **RED $\rightarrow$ GREEN**.
6. Registro de evidências da execução RED e GREEN em `docs/evidence/P1-002-evidencia-validacao-contratos.md`.

## 4.2. Excluído da P1-002 (Reservado às Tarefas P1-003 a P1-008)

| Responsabilidade Excluída da P1-002 | Tarefa Responsável | Justificativa de Fronteira |
|---|---|---|
| Canonicalização determinística `JCS-RFC8785-v1` e cálculo de hash SHA-256 real sobre contratos | `P1-003` | A `P1-002` valida apenas o formato estrutural dos campos `*_sha256` e `canonicalization_version: "JCS-RFC8785-v1"`, sem recalcular digests sobre artefatos. |
| Verificação cruzada entre registros (`TaskContract` $\leftrightarrow$ `ApprovalRecord`, revisão, digest, autenticidade humana, vigência e obsolescência) | `P1-003` | Um JSON Schema valida um registro isolado; vínculos relacionais e autenticidade pertencem à `P1-003` e aos gates (`P1-007`). |
| Máquina de estados de `ExecutionAttempt`, consistência completa entre `state`/`started_at`/`finished_at`/`termination_reason`, detecção de órfãs (`Reconciler`) e rollback de fixture | `P1-004` | A `P1-002` valida a estrutura estática de `attempt.json` e a regra unidirecional `finished_at !== null -> termination_reason !== null`, sem implementar transições de ciclo de vida. |
| `FixtureWorkspaceManager`, `ExecutionAdapter`, executor sintético (`SYN-001` a `SYN-010`), obtenção de `process_start_token` real do SO e isolamento `bubblewrap` no WSL2 | `P1-005` | Nenhum processo sintético ou repositório Git de fixture é criado na `P1-002`. |
| `EvidenceCollector`, inspeção Git real, recálculo de hashes de `included_artifacts`, resolução de symlinks em disco, varredura de segredos e exportação de `ReviewHandoffPackage` | `P1-006` | A `P1-002` valida a estrutura JSON de `EvidenceManifest` e `ReviewHandoffPackage`, sem inspecionar o filesystem da fixture. |
| Predicados de `TASK-READY`, `ValidationGate` e `PR-GATE` (incluindo imposição operacional de `selected_executor === "synthetic"`, `retry_limit === 0` e `data_classification === "SYNTHETIC_LAB"` na P1) | `P1-007` | Os gates combinam validação estrutural (`P1-002`), integridade/aprovação (`P1-003`) e evidências/políticas operacionais (`P1-006`/`P1-007`). |
| Simulação adversarial ponta a ponta (16 cenários) e relatórios finais da P1 | `P1-008` | Execução integrada de encerramento da Fase P1. |

---

# 5. Matriz Detalhada dos Sete Contratos Normativos (Consolidada com `DEC-P1-002-01` a `DEC-P1-002-09`)

Esta seção estabelece a especificação estrutural completa para os sete contratos e todos os seus subobjetos, incorporando as decisões aprovadas por Luís Henrique Pereira em 03/11/2026.

### Legenda de Classificação do Estado da Definição
- **`DOCUMENTADA (P0/P1)`**: Regra, campo, tipo, nulabilidade, constante ou enum expressamente determinado no texto da `P0 v0.3.0` ou `P1 v0.2.0`.
- **`APROVADA (DEC-P1-002-xx)`**: Regra, tipo, enum ou condicional expressamente aprovado por Luís Henrique Pereira na deliberação de 03/11/2026.
- **`CONVENÇÃO ESTRUTURAL`**: Restrição sintática padrão derivada da P0/P1 (`minLength: 1` para strings obrigatórias não vazias, regex hex de 64 caracteres para SHA-256, `format: "date-time"` para ISO-8601).

---

## 5.1. Contrato 1 — `TaskContract` (`schemas/task-contract.schema.json`)

- **Referência normativa:** P0 §9 (§9.1 a §9.6), §14.1, §17.1, §21.1; P1 §3.3, §6 (`P1-002`); `DEC-P1-002-01`, `DEC-P1-002-02`.
- **Tipo raiz:** `object`
- **Política de propriedades adicionais na raiz:** `additionalProperties: false` (`DOCUMENTADA (P0/P1)` — P1 §3.3 e P0 §8.5; garante também a rejeição determinística do campo proibido `task_ready` conforme P0 §9.6).

### 5.1.1. Campos de Topo de `TaskContract`

| Campo Literal | Tipo JSON | Obrigatório | Nulável | Enum / Constante / Formato | Restrições Condicionais / Estruturais | `additionalProperties` | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|---|---|
| `schema_version` | `string` | Sim (`required`) | Não | `const: "0.3-p0"` | Versão exata da baseline P0 | N/A | P0 §8.2, §9.2; P1 §3.3 | `DOCUMENTADA (P0/P1)` |
| `contract_revision` | `integer` | Sim (`required`) | Não | `minimum: 1` | Inteiro positivo identificando a revisão | N/A | P0 §8.2, §9.2 | `DOCUMENTADA (P0/P1)` |
| `identity` | `object` | Sim (`required`) | Não | Subobjeto (§5.1.2) | 6 campos obrigatórios | `false` | P0 §9.2 | `DOCUMENTADA (P0/P1)` |
| `governance` | `object` | Sim (`required`) | Não | Subobjeto (§5.1.3) | 2 campos obrigatórios | `false` | P0 §9.2; `DEC-P1-002-01` | `APROVADA (DEC-P1-002-01)` |
| `scope` | `object` | Sim (`required`) | Não | Subobjeto (§5.1.4) | 5 campos obrigatórios | `false` | P0 §9.2, §9.4, §9.5 | `DOCUMENTADA (P0/P1)` |
| `validation` | `object` | Sim (`required`) | Não | Subobjeto (§5.1.5) | 6 campos obrigatórios | `false` | P0 §9.2, §14.1; `DEC-P1-002-01` | `APROVADA (DEC-P1-002-01)` |
| `execution` | `object` | Sim (`required`) | Não | Subobjeto (§5.1.6) | 4 campos obrigatórios | `false` | P0 §9.2, §21.1; `DEC-P1-002-01` | `APROVADA (DEC-P1-002-01)` |
| `rollback` | `object` | Sim (`required`) | Não | Subobjeto (§5.1.7) | 1 campo obrigatório | `false` | P0 §9.2 | `DOCUMENTADA (P0/P1)` |
| `ias_normative_card` | `object \| null` | Sim (`required`) | **Sim** (`null` permitido) | `null` ou Subobjeto fechado (§5.1.8) | Quando `object`, exige literalmente os 18 campos da P0 §9.3 | `false` (quando `object`) | P0 §9.2, §9.3; `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |

### 5.1.2. Subobjeto `TaskContract.identity` (`additionalProperties: false`)

| Campo Literal | Tipo JSON | Obrigatório | Nulável | Enum / Constante / Formato | Restrições Estruturais | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|---|
| `execution_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Identificador da execução | P0 §9.2 | `DOCUMENTADA (P0/P1)` |
| `backlog_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Identificador do item de backlog | P0 §9.2 | `DOCUMENTADA (P0/P1)` |
| `repository` | `string` | Sim (`required`) | Não | `minLength: 1` | Nome/identificador do repositório | P0 §9.2 | `DOCUMENTADA (P0/P1)` |
| `workspace_context_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Contexto operacional isolado | P0 §9.2, §19.1 | `DOCUMENTADA (P0/P1)` |
| `workspace_root` | `string` | Sim (`required`) | Não | `minLength: 1`, `pattern: "^/[^\\0]*$"` | Caminho absoluto da raiz autorizada | P0 §9.2, §19.2 | `DOCUMENTADA (P0/P1)` |
| `base_commit` | `string` | Sim (`required`) | Não | `pattern: "^[0-9a-f]{40}$"` | SHA-1 hexadecimal de 40 caracteres do commit base | P0 §9.2, §11.3 | `CONVENÇÃO ESTRUTURAL` |

### 5.1.3. Subobjeto `TaskContract.governance` (`additionalProperties: false`)

| Campo Literal | Tipo JSON | Obrigatório | Nulável | Enum / Constante / Formato | Restrições Estruturais | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|---|
| `risk_level` | `string` | Sim (`required`) | Não | Enum: `["LOW", "MEDIUM", "HIGH", "CRITICAL"]` | Nível de risco da tarefa | P0 §9.2; `DEC-P1-002-01` | `APROVADA (DEC-P1-002-01)` |
| `approval_required` | `boolean` | Sim (`required`) | Não | `boolean` | Indica exigência de aprovação humana | P0 §9.2 | `DOCUMENTADA (P0/P1)` |

### 5.1.4. Subobjeto `TaskContract.scope` (`additionalProperties: false`)

| Campo Literal | Tipo JSON | Obrigatório | Nulável | Enum / Constante / Formato | Restrições Estruturais | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|---|
| `objective` | `string` | Sim (`required`) | Não | `minLength: 1` | Objetivo aprovado da tarefa | P0 §9.2 | `DOCUMENTADA (P0/P1)` |
| `allowed_impl_paths` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`, `pattern: "^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$))[^*?\\[\\]\\0]+$"`) | Caminhos relativos literais sem `/` inicial, sem `..` e sem globs `* ? [ ]` (permite `[]`) | P0 §9.2, §9.4 | `DOCUMENTADA (P0/P1)` |
| `allowed_test_paths` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`, `pattern: "^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$))[^*?\\[\\]\\0]+$"`) | Caminhos relativos literais sem `/` inicial, sem `..` e sem globs `* ? [ ]` (permite `[]`) | P0 §9.2, §9.4 | `DOCUMENTADA (P0/P1)` |
| `forbidden_changes` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | Caminhos ou restrições proibidas (permite `[]`) | P0 §9.2 | `DOCUMENTADA (P0/P1)` |
| `protected_existing_tests` | `boolean` | Sim (`required`) | Não | `boolean` | Proteção de testes preexistentes | P0 §9.2, §9.5 | `DOCUMENTADA (P0/P1)` |

### 5.1.5. Subobjeto `TaskContract.validation` (`additionalProperties: false`)

| Campo Literal | Tipo JSON | Obrigatório | Nulável | Enum / Constante / Formato | Restrições Estruturais | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|---|
| `strategy` | `string` | Sim (`required`) | Não | Enum: `["RED_GREEN", "RED_GREEN_WHEN_APPLICABLE", "REGRESSION_BASELINE", "STRUCTURAL_VALIDATION", "CONFIGURATION_VALIDATION"]` | Estratégia de validação da tarefa | P0 §9.2, §13.2, §14.1; `DEC-P1-002-01` | `APROVADA (DEC-P1-002-01)` |
| `positive_tests` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | Casos positivos previstos (permite `[]`) | P0 §9.2 | `DOCUMENTADA (P0/P1)` |
| `negative_tests` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | Casos negativos previstos (permite `[]`) | P0 §9.2 | `DOCUMENTADA (P0/P1)` |
| `boundary_tests` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | Casos de borda previstos (permite `[]`) | P0 §9.2 | `DOCUMENTADA (P0/P1)` |
| `acceptance_checks` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | Verificações de aceite (permite `[]`) | P0 §9.2 | `DOCUMENTADA (P0/P1)` |
| `validation_commands` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | Comandos de validação aprovados (permite `[]`) | P0 §9.2 | `DOCUMENTADA (P0/P1)` |

### 5.1.6. Subobjeto `TaskContract.execution` (`additionalProperties: false`)

| Campo Literal | Tipo JSON | Obrigatório | Nulável | Enum / Constante / Formato | Restrições Estruturais | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|---|
| `selected_executor` | `string` | Sim (`required`) | Não | Enum: `["codex", "antigravity", "synthetic"]` | Identificador do executor (reconhecimento estrutural não autoriza integração real; P1 restrita a `synthetic`) | P0 §4.1, §9.2; P1 §3.1; `DEC-P1-002-01` | `APROVADA (DEC-P1-002-01)` |
| `mode` | `string` | Sim (`required`) | Não | `const: "CONTROLLED"` (ou `enum: ["CONTROLLED"]`) | Modo operacional de execução | P0 §9.2; `DEC-P1-002-01` | `APROVADA (DEC-P1-002-01)` |
| `timeout_seconds` | `integer` | Sim (`required`) | Não | `minimum: 1` | Timeout máximo da execução em segundos | P0 §9.2, §25 (`PEND-004`) | `DOCUMENTADA (P0/P1)` |
| `retry_limit` | `integer` | Sim (`required`) | Não | `minimum: 0` | Inteiro não negativo (política operacional da P1 exige `0` nos gates) | P0 §9.2, §21.1, §25 (`PEND-003`); `DEC-P1-002-01` | `APROVADA (DEC-P1-002-01)` |

### 5.1.7. Subobjeto `TaskContract.rollback` (`additionalProperties: false`)

| Campo Literal | Tipo JSON | Obrigatório | Nulável | Enum / Constante / Formato | Restrições Estruturais | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|---|
| `procedure` | `string` | Sim (`required`) | Não | `minLength: 1` | Procedimento aprovado de reversão | P0 §9.2 | `DOCUMENTADA (P0/P1)` |

### 5.1.8. Subobjeto `TaskContract.ias_normative_card` (quando não `null` — `additionalProperties: false`)

Conforme a **P0 §9.3** e a decisão **`DEC-P1-002-02`**, `ias_normative_card` é `null` ou um objeto fechado (`additionalProperties: false`) contendo obrigatoriamente (`required`) os **18 campos literais** abaixo:

| # | Campo Literal (P0 §9.3) | Tipo JSON | Obrigatório (quando objeto) | Nulável | Enum / Formato | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|---|
| 1 | `execution_id` | `string` | Sim (`required`) | Não | `minLength: 1` | P0 §9.3 (1); `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| 2 | `backlog_id` | `string` | Sim (`required`) | Não | `minLength: 1` | P0 §9.3 (2); `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| 3 | `status` | `string` | Sim (`required`) | Não | Enum: `["planned", "in_progress", "implemented", "validated", "done", "blocked"]` | P0 §9.3 (3), §17.1; `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| 4 | `objective` | `string` | Sim (`required`) | Não | `minLength: 1` | P0 §9.3 (4); `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| 5 | `source_sections` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | P0 §9.3 (5); `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| 6 | `predecessors` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | P0 §9.3 (6); `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| 7 | `files_or_packages_expected` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | P0 §9.3 (7); `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| 8 | `invariants` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | P0 §9.3 (8); `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| 9 | `api_contracts` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | P0 §9.3 (9); `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| 10 | `database_tables_and_locks` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | P0 §9.3 (10); `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| 11 | `security_controls` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | P0 §9.3 (11); `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| 12 | `audit_and_observability` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | P0 §9.3 (12); `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| 13 | `test_plan` | `object` | Sim (`required`) | Não | Subobjeto fechado (§5.1.9): `required: ["positive", "negative", "concurrency", "integration"]`, `additionalProperties: false` | P0 §9.3 (13); `15 §4.2`; `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| 14 | `evidence_expected` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | P0 §9.3 (14); `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| 15 | `rollback_plan` | `string` | Sim (`required`) | Não | `minLength: 1` | P0 §9.3 (15); `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| 16 | `acceptance_checks` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | P0 §9.3 (16); `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| 17 | `review_required` | `boolean` | Sim (`required`) | Não | `boolean` | P0 §9.3 (17); `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| 18 | `human_authorization` | `string` | Sim (`required`) | Não | `minLength: 1` | P0 §9.3 (18); `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |

### 5.1.9. Subobjeto `TaskContract.ias_normative_card.test_plan` (`additionalProperties: false`)

Conforme a estrutura de referência de **`15-plano-mestre-de-implementacao.md` (§4.2)** do IAS e a decisão **`DEC-P1-002-02`** (em atendimento à recomendação `P1-002-REV-R2-001`), o campo `ias_normative_card.test_plan` (item 13 da P0 §9.3) é um objeto fechado (`type: "object"`, `additionalProperties: false`, não nulável) que exige obrigatoriamente (`required`) as 4 categorias estruturadas abaixo:

| Campo Literal (`15 §4.2`) | Tipo JSON | Obrigatório | Nulável | Enum / Formato / Restrição | `additionalProperties` | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|---|
| `positive` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) (permite `[]`) | N/A | P0 §9.3 (13); `15 §4.2`; `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| `negative` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) (permite `[]`) | N/A | P0 §9.3 (13); `15 §4.2`; `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| `concurrency` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) (permite `[]`) | N/A | P0 §9.3 (13); `15 §4.2`; `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |
| `integration` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) (permite `[]`) | N/A | P0 §9.3 (13); `15 §4.2`; `DEC-P1-002-02` | `APROVADA (DEC-P1-002-02)` |

> **Definição estrutural em Draft 2020-12 para `ias_normative_card.properties.test_plan`:**
> ```json
> "test_plan": {
>   "type": "object",
>   "additionalProperties": false,
>   "required": ["positive", "negative", "concurrency", "integration"],
>   "properties": {
>     "positive": {
>       "type": "array",
>       "items": { "type": "string", "minLength": 1 }
>     },
>     "negative": {
>       "type": "array",
>       "items": { "type": "string", "minLength": 1 }
>     },
>     "concurrency": {
>       "type": "array",
>       "items": { "type": "string", "minLength": 1 }
>     },
>     "integration": {
>       "type": "array",
>       "items": { "type": "string", "minLength": 1 }
>     }
>   }
> }
> ```

---

## 5.2. Contrato 2 — `ApprovalRecord` (`schemas/approval-record.schema.json`)

- **Referência normativa:** P0 §10 (§10.1 a §10.6); P1 §3.3, §3.4, §6 (`P1-002`, `P1-003`); `DEC-P1-002-03`.
- **Tipo raiz:** `object`
- **Política de propriedades adicionais na raiz:** `additionalProperties: false` (`DOCUMENTADA (P0/P1)` — P1 §3.3).

| Campo Literal | Tipo JSON | Obrigatório | Nulável | Enum / Constante / Formato | Restrições Condicionais / Estruturais | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|---|
| `schema_version` | `string` | Sim (`required`) | Não | `const: "0.3-p0"` | Versão do contrato | P0 §8.2, §10.2 | `DOCUMENTADA (P0/P1)` |
| `approval_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Identificador único da aprovação | P0 §10.2 | `DOCUMENTADA (P0/P1)` |
| `execution_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Identificador da tarefa/execução | P0 §10.2 | `DOCUMENTADA (P0/P1)` |
| `contract_revision` | `integer` | Sim (`required`) | Não | `minimum: 1` | Revisão aprovada do contrato | P0 §8.2, §10.2 | `DOCUMENTADA (P0/P1)` |
| `approved_contract_sha256` | `string` | Sim (`required`) | Não | `pattern: "^[0-9a-f]{64}$"` | Digest SHA-256 canônico do contrato aprovado | P0 §8.3, §10.2 | `DOCUMENTADA (P0/P1)` |
| `canonicalization_version` | `string` | Sim (`required`) | Não | `const: "JCS-RFC8785-v1"` | Versão normativa de canonicalização | P0 §8.3, §10.2; P1 §3.4; `DEC-P1-002-03` | `APROVADA (DEC-P1-002-03)` |
| `approval_scope` | `string` | Sim (`required`) | Não | Enum: `["PLAN_ONLY", "EXECUTION", "MERGE"]` | Escopo da decisão humana | P0 §10.3; `DEC-P1-002-03` | `APROVADA (DEC-P1-002-03)` |
| `authorized_by` | `string` | Sim (`required`) | Não | `minLength: 1` | Identidade humana do aprovador | P0 §10.2 | `DOCUMENTADA (P0/P1)` |
| `authorized_at` | `string` | Sim (`required`) | Não | `format: "date-time"` (ISO-8601) | Data/hora da aprovação | P0 §10.2 | `DOCUMENTADA (P0/P1)` |
| `approval_source` | `string` | Sim (`required`) | Não | `minLength: 1` | Referência verificável da decisão | P0 §10.2 | `DOCUMENTADA (P0/P1)` |
| `attempt_id` | `string` | **Condicional** (`required` quando `approval_scope === "MERGE"`; opcional em `PLAN_ONLY` e `EXECUTION`) | **Não** (`null` proibido em todos os escopos) | `minLength: 1` | Quando presente (em qualquer escopo), deve ser string não vazia; obrigatório em `MERGE` | P0 §10.4; `DEC-P1-002-03` | `APROVADA (DEC-P1-002-03)` |
| `approved_diff_sha256` | `string` | **Condicional** (`required` quando `approval_scope === "MERGE"`; opcional em `PLAN_ONLY` e `EXECUTION`) | **Não** (`null` proibido em todos os escopos) | `pattern: "^[0-9a-f]{64}$"` | Quando presente (em qualquer escopo), deve ser hex SHA-256 de 64 caracteres; obrigatório em `MERGE` | P0 §10.4; `DEC-P1-002-03` | `APROVADA (DEC-P1-002-03)` |
| `review_id` | `string` | **Condicional** (`required` quando `approval_scope === "MERGE"`; opcional em `PLAN_ONLY` e `EXECUTION`) | **Não** (`null` proibido em todos os escopos) | `minLength: 1` | Quando presente (em qualquer escopo), deve ser string não vazia; obrigatório em `MERGE` | P0 §10.4; `DEC-P1-002-03` | `APROVADA (DEC-P1-002-03)` |

> **Regra condicional em Draft 2020-12 para `ApprovalRecord` (`DEC-P1-002-03`):**
> Em `properties`, `attempt_id` (`type: "string", minLength: 1`), `approved_diff_sha256` (`type: "string", pattern: "^[0-9a-f]{64}$"`) e `review_id` (`type: "string", minLength: 1`) são declarados sem aceitar `null`. A cláusula condicional impõe:
> ```json
> "if": {
>   "properties": { "approval_scope": { "const": "MERGE" } },
>   "required": ["approval_scope"]
> },
> "then": {
>   "required": ["attempt_id", "approved_diff_sha256", "review_id"]
> }
> ```

---

## 5.3. Contrato 3 — `ExecutionAttempt` (`schemas/execution-attempt.schema.json`)

- **Referência normativa:** P0 §11 (§11.1 a §11.6), §17.2, §20.2; P1 §3.3, §6 (`P1-002`, `P1-004`); `DEC-P1-002-04`, `DEC-P1-002-05`.
- **Tipo raiz:** `object`
- **Política de propriedades adicionais na raiz:** `additionalProperties: false` (`DOCUMENTADA (P0/P1)` — P1 §3.3).

### 5.3.1. Campos de Topo de `ExecutionAttempt`

| Campo Literal | Tipo JSON | Obrigatório | Nulável | Enum / Constante / Formato | Restrições Condicionais / Estruturais | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|---|
| `schema_version` | `string` | Sim (`required`) | Não | `const: "0.3-p0"` | Versão do schema | P0 §11.4 | `DOCUMENTADA (P0/P1)` |
| `execution_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Identificador da execução | P0 §11.4 | `DOCUMENTADA (P0/P1)` |
| `attempt_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Identificador único da tentativa | P0 §11.1, §11.4 | `DOCUMENTADA (P0/P1)` |
| `approval_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Referência à aprovação `EXECUTION` | P0 §11.4 | `DOCUMENTADA (P0/P1)` |
| `approved_contract_sha256` | `string` | Sim (`required`) | Não | `pattern: "^[0-9a-f]{64}$"` | Digest SHA-256 do contrato aprovado | P0 §11.4 | `DOCUMENTADA (P0/P1)` |
| `executor` | `string` | Sim (`required`) | Não | Enum: `["codex", "antigravity", "synthetic"]` | Identificador do executor | P0 §11.4; `DEC-P1-002-01` | `APROVADA (DEC-P1-002-01)` |
| `state` | `string` | Sim (`required`) | Não | Enum: `["CREATED", "RUNNING", "COMPLETED", "FAILED", "INTERRUPTED", "BLOCKED"]` | Estado operacional interno da tentativa | P0 §11.2, §11.4, §17.2 | `DOCUMENTADA (P0/P1)` |
| `started_at` | `string \| null` | Sim (`required`) | **Sim** (`null` permitido) | Quando `string`: `format: "date-time"` | Timestamp de início (`null` enquanto não iniciada) | P0 §11.4 | `DOCUMENTADA (P0/P1)` |
| `finished_at` | `string \| null` | Sim (`required`) | **Sim** (`null` permitido) | Quando `string`: `format: "date-time"` | Timestamp de encerramento (`null` enquanto não encerrada) | P0 §11.4 | `DOCUMENTADA (P0/P1)` |
| `base_commit` | `string` | Sim (`required`) | Não | `pattern: "^[0-9a-f]{40}$"` | SHA-1 de 40 caracteres do commit base | P0 §11.3, §11.4 | `CONVENÇÃO ESTRUTURAL` |
| `workspace_root` | `string` | Sim (`required`) | Não | `minLength: 1`, `pattern: "^/[^\\0]*$"` | Caminho absoluto validado do workspace | P0 §11.4, §19.2 | `DOCUMENTADA (P0/P1)` |
| `process_identity` | `object \| null` | Sim (`required`) | **Sim** (`null` permitido) | `null` ou Subobjeto fechado (§5.3.2) | Identificação estrutural do processo | P0 §11.4, §20.2; `DEC-P1-002-04` | `APROVADA (DEC-P1-002-04)` |
| `termination_reason` | `string \| null` | Sim (`required`) | **Sim** (`null` permitido apenas quando `finished_at === null`) | Quando `string`, Enum fechado: `["NORMAL", "TIMEOUT", "AUTH_FAILURE", "QUOTA_EXCEEDED", "PROVIDER_FAILURE", "SCOPE_VIOLATION", "PROCESS_FAILURE", "INTERRUPTED", "COLLECTION_FAILURE"]` | **Regra unidirecional (`DEC-P1-002-05`):** `finished_at !== null → termination_reason !== null` (sem impor a condição inversa no schema) | P0 §11.4, §11.5; `DEC-P1-002-05` | `APROVADA (DEC-P1-002-05)` |

### 5.3.2. Subobjeto `ExecutionAttempt.process_identity` (quando não `null` — `additionalProperties: false`)

Conforme **`DEC-P1-002-04`**:

| Campo Literal | Tipo JSON | Obrigatório (quando objeto) | Nulável | Formato / Restrição | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|
| `pid` | `integer` | Sim (`required`) | Não | `minimum: 1` (inteiro positivo) | P0 §20.2; `DEC-P1-002-04` | `APROVADA (DEC-P1-002-04)` |
| `process_start_token` | `string` | Sim (`required`) | Não | `minLength: 1` (string não vazia) | P0 §20.2; `DEC-P1-002-04` | `APROVADA (DEC-P1-002-04)` |
| `executable` | `string` | Não (opcional) | Não (`null` proibido quando presente) | `minLength: 1` (string não vazia) | `DEC-P1-002-04` | `APROVADA (DEC-P1-002-04)` |

> **Nota normativa de segurança (`DEC-P1-002-04`):** A existência estrutural de `process_start_token` não comprova, por si só, a identidade real do processo. Na `P1-004`/`P1-005`, o host confiável deverá obter e verificar informações confiáveis do sistema operacional que permitam diferenciar instâncias de processos mesmo quando houver reutilização de PID.

> **Regra condicional unidirecional em Draft 2020-12 para `ExecutionAttempt` (`DEC-P1-002-05`):**
> ```json
> "if": {
>   "properties": { "finished_at": { "type": "string" } },
>   "required": ["finished_at"]
> },
> "then": {
>   "properties": {
>     "termination_reason": {
>       "type": "string",
>       "enum": [
>         "NORMAL",
>         "TIMEOUT",
>         "AUTH_FAILURE",
>         "QUOTA_EXCEEDED",
>         "PROVIDER_FAILURE",
>         "SCOPE_VIOLATION",
>         "PROCESS_FAILURE",
>         "INTERRUPTED",
>         "COLLECTION_FAILURE"
>       ]
>     }
>   },
>   "required": ["termination_reason"]
> }
> ```
> Não é introduzida a condição inversa (`termination_reason !== null → finished_at !== null`) no JSON Schema; a verificação completa de consistência operacional entre `state`, `started_at`, `finished_at` e `termination_reason` pertence à `P1-004`.

---

## 5.4. Contrato 4 — `ExecutionResult` (`schemas/execution-result.schema.json`)

- **Referência normativa:** P0 §6.1 (`UNTRUSTED_AGENT_OUTPUT`), §12 (§12.1 a §12.3); P1 §3.3, §6 (`P1-002`); `DEC-P1-002-01`.
- **Tipo raiz:** `object`
- **Política de propriedades adicionais na raiz:** `additionalProperties: false` (`DOCUMENTADA (P0/P1)` — P1 §3.3).

| Campo Literal | Tipo JSON | Obrigatório | Nulável | Enum / Constante / Formato | Restrições Estruturais | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|---|
| `schema_version` | `string` | Sim (`required`) | Não | `const: "0.3-p0"` | Versão do schema | P0 §12.2 | `DOCUMENTADA (P0/P1)` |
| `execution_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Identificador da execução | P0 §12.2 | `DOCUMENTADA (P0/P1)` |
| `attempt_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Identificador da tentativa | P0 §12.2 | `DOCUMENTADA (P0/P1)` |
| `executor` | `string` | Sim (`required`) | Não | Enum: `["codex", "antigravity", "synthetic"]` | Executor que declarou o resultado | P0 §12.2; `DEC-P1-002-01` | `APROVADA (DEC-P1-002-01)` |
| `agent_declared_outcome` | `string` | Sim (`required`) | Não | `minLength: 1` (string não vazia) | Resultado autodeclarado pelo agente (não autoritativo) | P0 §12.2, §12.3; `DEC-P1-002-01` | `APROVADA (DEC-P1-002-01)` |
| `agent_summary` | `string` | Sim (`required`) | Não | `minLength: 1` | Resumo declarado pelo agente | P0 §12.2 | `DOCUMENTADA (P0/P1)` |
| `agent_reported_blockers` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | Lista de bloqueios reportados pelo agente (permite `[]`) | P0 §12.2 | `DOCUMENTADA (P0/P1)` |

---

## 5.5. Contrato 5 — `EvidenceManifest` (`schemas/evidence-manifest.schema.json`)

- **Referência normativa:** P0 §6.1 (`HOST_OBSERVED`), §13 (§13.1 a §13.5), §14.1, §14.2; P1 §3.3, §6 (`P1-002`, `P1-006`); `DEC-P1-002-01`, `DEC-P1-002-06`.
- **Tipo raiz:** `object`
- **Política de propriedades adicionais na raiz:** `additionalProperties: false` (`DOCUMENTADA (P0/P1)` — P1 §3.3).

### 5.5.1. Campos de Topo de `EvidenceManifest`

| Campo Literal | Tipo JSON | Obrigatório | Nulável | Enum / Constante / Formato | Restrições Estruturais | `additionalProperties` | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|---|---|
| `schema_version` | `string` | Sim (`required`) | Não | `const: "0.3-p0"` | Versão do schema | N/A | P0 §13.2 | `DOCUMENTADA (P0/P1)` |
| `execution_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Identificador da execução | N/A | P0 §13.2 | `DOCUMENTADA (P0/P1)` |
| `attempt_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Identificador da tentativa | N/A | P0 §13.2 | `DOCUMENTADA (P0/P1)` |
| `evidence_origin` | `string` | Sim (`required`) | Não | `const: "HOST_OBSERVED"` | Origem obrigatória das evidências autoritativas | N/A | P0 §6.1, §13.2 | `DOCUMENTADA (P0/P1)` |
| `git` | `object` | Sim (`required`) | Não | Subobjeto (§5.5.2) | 4 campos obrigatórios | `false` | P0 §13.2, §13.3 | `DOCUMENTADA (P0/P1)` |
| `test_evidence` | `object` | Sim (`required`) | Não | Subobjeto (§5.5.3) | 4 campos obrigatórios | `false` | P0 §13.2, §14.2; `DEC-P1-002-06` | `APROVADA (DEC-P1-002-06)` |
| `independent_test_runs` | `array` de `object` | Sim (`required`) | Não | Items: `TestRunRecord` (§5.5.4) | Execuções independentes registradas pelo host (permite `[]`) | `false` (nos itens) | P0 §13.2, §13.4; `DEC-P1-002-06` | `APROVADA (DEC-P1-002-06)` |
| `scope_validation` | `object` | Sim (`required`) | Não | Subobjeto (§5.5.5) | 2 campos obrigatórios | `false` | P0 §13.2; `DEC-P1-002-06` | `APROVADA (DEC-P1-002-06)` |
| `evidence_integrity` | `object` | Sim (`required`) | Não | Subobjeto (§5.5.6) | 1 campo obrigatório (`artifact_hashes`) | `false` | P0 §13.2; `DEC-P1-002-06` | `APROVADA (DEC-P1-002-06)` |

### 5.5.2. Subobjeto `EvidenceManifest.git` (`additionalProperties: false`)

| Campo Literal | Tipo JSON | Obrigatório | Nulável | Enum / Formato | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|
| `base_sha` | `string` | Sim (`required`) | Não | `pattern: "^[0-9a-f]{40}$"` | P0 §13.2 | `DOCUMENTADA (P0/P1)` |
| `head_sha` | `string` | Sim (`required`) | Não | `pattern: "^[0-9a-f]{40}$"` | P0 §13.2 | `DOCUMENTADA (P0/P1)` |
| `dirty_worktree_files` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | P0 §13.2, §13.3 | `DOCUMENTADA (P0/P1)` |
| `diff_sha256` | `string` | Sim (`required`) | Não | `pattern: "^[0-9a-f]{64}$"` | P0 §13.2 | `DOCUMENTADA (P0/P1)` |

### 5.5.3. Subobjeto `EvidenceManifest.test_evidence` (`additionalProperties: false`)

| Campo Literal | Tipo JSON | Obrigatório | Nulável | Enum / Formato | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|
| `strategy` | `string` | Sim (`required`) | Não | Enum: `["RED_GREEN", "RED_GREEN_WHEN_APPLICABLE", "REGRESSION_BASELINE", "STRUCTURAL_VALIDATION", "CONFIGURATION_VALIDATION"]` | P0 §13.2, §14.1; `DEC-P1-002-01` | `APROVADA (DEC-P1-002-01)` |
| `red` | `object \| null` | Sim (`required`) | **Sim** (`null` permitido) | Quando `object`: `TestRunRecord` (§5.5.4) | P0 §13.2, §14.2; `DEC-P1-002-06` | `APROVADA (DEC-P1-002-06)` |
| `green` | `object \| null` | Sim (`required`) | **Sim** (`null` permitido) | Quando `object`: `TestRunRecord` (§5.5.4) | P0 §13.2, §14.2; `DEC-P1-002-06` | `APROVADA (DEC-P1-002-06)` |
| `baseline` | `object \| null` | Sim (`required`) | **Sim** (`null` permitido) | Quando `object`: `TestRunRecord` (§5.5.4) | P0 §13.2, §14.2; `DEC-P1-002-06` | `APROVADA (DEC-P1-002-06)` |

### 5.5.4. Definição Reutilizável `TestRunRecord` (`$defs/TestRunRecord` — `additionalProperties: false`)

Conforme **`DEC-P1-002-06`**, aplicável aos itens de `independent_test_runs[]` e aos registros não nulos de `test_evidence.red`, `test_evidence.green` e `test_evidence.baseline`:

| Campo Literal (`DEC-P1-002-06`) | Tipo JSON | Obrigatório | Nulável | Formato / Enum | Correspondência na P0 §13.4 | Estado da Definição |
|---|---|---|---|---|---|---|
| `command` | `string` | Sim (`required`) | Não | `minLength: 1` | "comando aprovado" | `APROVADA (DEC-P1-002-06)` |
| `working_directory` | `string` | Sim (`required`) | Não | `minLength: 1` | "diretório" | `APROVADA (DEC-P1-002-06)` |
| `started_at` | `string` | Sim (`required`) | Não | `format: "date-time"` | "início" | `APROVADA (DEC-P1-002-06)` |
| `duration_ms` | `integer` | Sim (`required`) | Não | `minimum: 0` (inteiro não negativo) | "duração" | `APROVADA (DEC-P1-002-06)` |
| `exit_code` | `integer \| null` | Sim (`required`) | **Sim** (`null` permitido) | `type: ["integer", "null"]` | "código de saída" | `APROVADA (DEC-P1-002-06)` |
| `log_path` | `string` | Sim (`required`) | Não | `minLength: 1` | "logs" | `APROVADA (DEC-P1-002-06)` |
| `log_sha256` | `string` | Sim (`required`) | Não | `pattern: "^[0-9a-f]{64}$"` | "hashes" | `APROVADA (DEC-P1-002-06)` |
| `observed_outcome` | `string` | Sim (`required`) | Não | Enum: `["PASS", "FAIL", "ERROR", "TIMEOUT"]` | "resultado observado" | `APROVADA (DEC-P1-002-06)` |

### 5.5.5. Subobjeto `EvidenceManifest.scope_validation` (`additionalProperties: false`)

| Campo Literal | Tipo JSON | Obrigatório | Nulável | Enum / Formato | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|
| `result` | `string` | Sim (`required`) | Não | Enum: `["PENDING", "PASS", "FAIL"]` | P0 §13.2; `DEC-P1-002-06` | `APROVADA (DEC-P1-002-06)` |
| `unexpected_files` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | P0 §13.2 | `DOCUMENTADA (P0/P1)` |

### 5.5.6. Subobjeto `EvidenceManifest.evidence_integrity` (`additionalProperties: false`)

| Campo Literal | Tipo JSON | Obrigatório | Nulável | Estrutura dos Itens de `artifact_hashes` | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|
| `artifact_hashes` | `array` de `object` | Sim (`required`) | Não | Cada item (`additionalProperties: false`): `path` (`string`, `minLength: 1`, `required`) e `sha256` (`string`, `pattern: "^[0-9a-f]{64}$"`, `required`) | P0 §13.2; `DEC-P1-002-06` | `APROVADA (DEC-P1-002-06)` |

---

## 5.6. Contrato 6 — `ReviewHandoffPackage` (`schemas/review-handoff-package.schema.json`)

- **Referência normativa:** P0 §15 (§15.1 a §15.4), §22.1; P1 §3.3, §6 (`P1-002`, `P1-006`); `DEC-P1-002-07`, `DEC-P1-002-08`.
- **Tipo raiz:** `object`
- **Política de propriedades adicionais na raiz:** `additionalProperties: false` (`DOCUMENTADA (P0/P1)` — P1 §3.3).

### 5.6.1. Campos de Topo de `ReviewHandoffPackage`

| Campo Literal | Tipo JSON | Obrigatório | Nulável | Enum / Constante / Formato | Restrições Estruturais | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|---|
| `schema_version` | `string` | Sim (`required`) | Não | `const: "0.3-p0"` | Versão do schema | P0 §15.2 | `DOCUMENTADA (P0/P1)` |
| `handoff_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Identificador único do pacote de handoff | P0 §15.2 | `DOCUMENTADA (P0/P1)` |
| `execution_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Identificador da execução | P0 §15.2 | `DOCUMENTADA (P0/P1)` |
| `attempt_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Identificador da tentativa | P0 §15.2 | `DOCUMENTADA (P0/P1)` |
| `contract_sha256` | `string` | Sim (`required`) | Não | `pattern: "^[0-9a-f]{64}$"` | Digest SHA-256 canônico do contrato | P0 §15.2 | `DOCUMENTADA (P0/P1)` |
| `diff_sha256` | `string` | Sim (`required`) | Não | `pattern: "^[0-9a-f]{64}$"` | Digest SHA-256 do diff | P0 §15.2 | `DOCUMENTADA (P0/P1)` |
| `workspace_context_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Contexto operacional isolado | P0 §15.2, §19.1 | `DOCUMENTADA (P0/P1)` |
| `data_classification` | `string` | Sim (`required`) | Não | Enum: `["SYNTHETIC_LAB", "INTERNAL_NON_SENSITIVE", "CLIENT_CONFIDENTIAL"]` | Categorias de dados da P0 §22.1 (P1 permanece restrita operacionalmente a `SYNTHETIC_LAB`) | P0 §15.2, §22.1; `DEC-P1-002-07` | `APROVADA (DEC-P1-002-07)` |
| `evidence_manifest_path` | `string` | Sim (`required`) | Não | `minLength: 1` | Caminho validado do `evidence-manifest.json` | P0 §15.2 | `DOCUMENTADA (P0/P1)` |
| `included_artifacts` | `array` de `object` | Sim (`required`) | Não | Items: Subobjeto fechado (§5.6.2) | Lista de artefatos incluídos no pacote (permite `[]`) | P0 §15.2, §15.3; `DEC-P1-002-08` | `APROVADA (DEC-P1-002-08)` |
| `review_questions` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | Questões submetidas ao revisor (permite `[]`) | P0 §15.2 | `DOCUMENTADA (P0/P1)` |
| `sanitization_status` | `string` | Sim (`required`) | Não | Enum: `["PENDING", "APPROVED", "BLOCKED"]` | Estado de sanitização (`APPROVED` indica conclusão da sanitização, não autorização de exportação) | P0 §15.2, §15.4; `DEC-P1-002-07` | `APROVADA (DEC-P1-002-07)` |
| `export_authorization_ref` | `string \| null` | Sim (`required`) | **Sim** (`null` permitido) | Quando `string`: `minLength: 1` | Referência à autorização de exportação (`null` quando não aplicável/pendente) | P0 §15.2 | `DOCUMENTADA (P0/P1)` |

### 5.6.2. Subobjeto Item de `ReviewHandoffPackage.included_artifacts[]` (`additionalProperties: false`)

Conforme **`DEC-P1-002-08`**, cada elemento de `included_artifacts` é um objeto fechado contendo:

| Campo Literal (`DEC-P1-002-08`) | Tipo JSON | Obrigatório | Nulável | Formato / Restrição | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|
| `path` | `string` | Sim (`required`) | Não | `minLength: 1` (string não vazia) | P0 §15.3; `DEC-P1-002-08` | `APROVADA (DEC-P1-002-08)` |
| `sha256` | `string` | Sim (`required`) | Não | `pattern: "^[0-9a-f]{64}$"` (hexadecimal de 64 caracteres) | P0 §15.3; `DEC-P1-002-08` | `APROVADA (DEC-P1-002-08)` |

> **Nota normativa de segurança (`DEC-P1-002-08`):** A `P1-002` valida apenas a estrutura do array `included_artifacts`. Na `P1-006`, o host deverá resolver e validar os caminhos reais, verificar os limites do workspace autorizado, recalcular os hashes dos arquivos em disco e confirmar a correspondência dos artefatos exportados, jamais considerando hashes fornecidos pelo executor como evidências autoritativas.

---

## 5.7. Contrato 7 — `ReviewReport` (`schemas/review-report.schema.json`)

- **Referência normativa:** P0 §16 (§16.1 a §16.6); P1 §3.3, §6 (`P1-002`, `P1-007`); `DEC-P1-002-09`.
- **Tipo raiz:** `object`
- **Política de propriedades adicionais na raiz:** `additionalProperties: false` (`DOCUMENTADA (P0/P1)` — P1 §3.3).

### 5.7.1. Campos de Topo de `ReviewReport`

| Campo Literal | Tipo JSON | Obrigatório | Nulável | Enum / Constante / Formato | Restrições Estruturais | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|---|
| `schema_version` | `string` | Sim (`required`) | Não | `const: "0.3-p0"` | Versão do schema | P0 §16.2 | `DOCUMENTADA (P0/P1)` |
| `review_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Identificador único da revisão | P0 §16.2 | `DOCUMENTADA (P0/P1)` |
| `execution_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Identificador da execução | P0 §16.2 | `DOCUMENTADA (P0/P1)` |
| `attempt_id` | `string` | Sim (`required`) | Não | `minLength: 1` | Identificador da tentativa revisada | P0 §16.2, §16.6 | `DOCUMENTADA (P0/P1)` |
| `reviewed_contract_sha256` | `string` | Sim (`required`) | Não | `pattern: "^[0-9a-f]{64}$"` | Digest SHA-256 do contrato revisado | P0 §16.2, §16.6 | `DOCUMENTADA (P0/P1)` |
| `reviewed_diff_sha256` | `string` | Sim (`required`) | Não | `pattern: "^[0-9a-f]{64}$"` | Digest SHA-256 do diff revisado | P0 §16.2, §16.6 | `DOCUMENTADA (P0/P1)` |
| `reviewer_model` | `string` | Sim (`required`) | Não | `minLength: 1` | Modelo revisor independente | P0 §16.2 | `DOCUMENTADA (P0/P1)` |
| `review_timestamp` | `string` | Sim (`required`) | Não | `format: "date-time"` (ISO-8601) | Data/hora da revisão | P0 §16.2 | `DOCUMENTADA (P0/P1)` |
| `categories_evaluated` | `array` de `object` | Sim (`required`) | Não | Items: Subobjeto `CategoryEvaluation` (§5.7.2) | Categorias avaliadas e justificativas de não aplicáveis | P0 §16.2, §16.4; `DEC-P1-002-09` | `APROVADA (DEC-P1-002-09)` |
| `findings` | `array` de `object` | Sim (`required`) | Não | Items: Subobjeto `Finding` (§5.7.3) | Lista de achados da revisão (permite `[]`) | P0 §16.2, §16.3; `DEC-P1-002-09` | `APROVADA (DEC-P1-002-09)` |
| `verdict` | `string` | Sim (`required`) | Não | Enum: `["APPROVED", "APPROVED_WITH_RECOMMENDATIONS", "REJECTED"]` | Veredito técnico do revisor independente | P0 §16.2, §16.5 | `DOCUMENTADA (P0/P1)` |
| `limitations` | `array` de `string` | Sim (`required`) | Não | Items: `string` (`minLength: 1`) | Limitações declaradas da revisão (permite `[]`) | P0 §16.2 | `DOCUMENTADA (P0/P1)` |

### 5.7.2. Subobjeto Item de `ReviewReport.categories_evaluated[]` (`additionalProperties: false`)

Conforme **`DEC-P1-002-09`** e **P0 §16.4**:

| Campo Literal (`DEC-P1-002-09`) | Tipo JSON | Obrigatório | Nulável | Enum / Formato / Restrição Condicional | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|
| `category` | `string` | Sim (`required`) | Não | Enum fechado das 12 categorias da P0 §16.4: `["Requisitos", "Comportamento", "Segurança", "Confidencialidade", "Concorrência", "Integridade", "Testes positivos", "Testes negativos", "Casos de borda", "Escopo", "Rollback", "Compatibilidade normativa"]` | P0 §16.4; `DEC-P1-002-09` | `APROVADA (DEC-P1-002-09)` |
| `applicable` | `boolean` | Sim (`required`) | Não | `boolean` | P0 §16.4; `DEC-P1-002-09` | `APROVADA (DEC-P1-002-09)` |
| `justification` | `string` | **Condicional** (`required` quando `applicable === false`; opcional quando `applicable === true`) | Não (`null` proibido quando presente) | `type: "string", minLength: 1` | P0 §16.4; `DEC-P1-002-09` | `APROVADA (DEC-P1-002-09)` |

> **Regra condicional em Draft 2020-12 para cada item de `categories_evaluated[]` (`DEC-P1-002-09`):**
> ```json
> "if": {
>   "properties": { "applicable": { "const": false } },
>   "required": ["applicable"]
> },
> "then": {
>   "required": ["justification"],
>   "properties": {
>     "justification": { "type": "string", "minLength": 1 }
>   }
> }
> ```

### 5.7.3. Subobjeto `Finding` em `ReviewReport.findings[]` (`additionalProperties: false`)

Conforme a **P0 §16.3** e **`DEC-P1-002-09`**, cada achado contém obrigatoriamente (`required`) os 7 campos abaixo:

| Campo Literal (P0 §16.3) | Tipo JSON | Obrigatório | Nulável | Enum / Formato | Ref. Normativa | Estado da Definição |
|---|---|---|---|---|---|---|
| `finding_id` | `string` | Sim (`required`) | Não | `minLength: 1` | P0 §16.3 | `DOCUMENTADA (P0/P1)` |
| `severity` | `string` | Sim (`required`) | Não | Enum: `["LOW", "MEDIUM", "HIGH", "CRITICAL"]` | P0 §16.3; `DEC-P1-002-09` | `APROVADA (DEC-P1-002-09)` |
| `category` | `string` | Sim (`required`) | Não | Enum das 12 categorias da P0 §16.4: `["Requisitos", "Comportamento", "Segurança", "Confidencialidade", "Concorrência", "Integridade", "Testes positivos", "Testes negativos", "Casos de borda", "Escopo", "Rollback", "Compatibilidade normativa"]` | P0 §16.3, §16.4; `DEC-P1-002-09` | `APROVADA (DEC-P1-002-09)` |
| `evidence` | `string` | Sim (`required`) | Não | `minLength: 1` | P0 §16.3 | `DOCUMENTADA (P0/P1)` |
| `source_reference` | `string` | Sim (`required`) | Não | `minLength: 1` | P0 §16.3 | `DOCUMENTADA (P0/P1)` |
| `recommendation` | `string` | Sim (`required`) | Não | `minLength: 1` | P0 §16.3 | `DOCUMENTADA (P0/P1)` |
| `blocking` | `boolean` | Sim (`required`) | Não | `boolean` | P0 §16.3 | `DOCUMENTADA (P0/P1)` |

> **Nota normativa (`DEC-P1-002-09`):** A conformidade estrutural de um `ReviewReport` contra seu JSON Schema não comprova a correção técnica de suas conclusões nem substitui a aprovação humana final.

---

# 6. Registro das Nove Decisões Humanas Incorporadas (`DEC-P1-002-01` a `DEC-P1-002-09`)

A tabela a seguir registra as nove decisões aprovadas por **Luís Henrique Pereira** em 03/11/2026, sua consolidação neste plano e as salvaguardas operacionais preservadas para as tarefas posteriores (`P1-003` a `P1-008`):

| ID da Decisão | Estado da Decisão | Definição Consolidada para os Schemas (`P1-002`) | Salvaguardas e Limites Operacionais Preservados | Seção do Plano |
|---|---|---|---|---|
| `DEC-P1-002-01` | **APROVADA** (Luís Henrique Pereira — 03/11/2026) | `strategy` $\in$ `["RED_GREEN", "RED_GREEN_WHEN_APPLICABLE", "REGRESSION_BASELINE", "STRUCTURAL_VALIDATION", "CONFIGURATION_VALIDATION"]`; `risk_level` $\in$ `["LOW", "MEDIUM", "HIGH", "CRITICAL"]`; `selected_executor` (e `executor`) $\in$ `["codex", "antigravity", "synthetic"]`; `execution.mode` = `"CONTROLLED"`; `retry_limit`: `integer >= 0`; `agent_declared_outcome`: `string` (`minLength: 1`). | O reconhecimento estrutural de `codex` e `antigravity` não autoriza integração real; a P1 permanece restrita ao executor `synthetic` e a `retry_limit = 0` nos gates operacionais. | §5.1.3, §5.1.5, §5.1.6, §5.3.1, §5.4, §5.5.3 |
| `DEC-P1-002-02` | **APROVADA** (Luís Henrique Pereira — 03/11/2026) | `ias_normative_card`: `null` ou objeto fechado (`additionalProperties: false`) com os 18 campos literais da P0 §9.3 obrigatórios (`required`), `status` restrito aos 6 estados normativos da P0 §17.1 (`planned`, `in_progress`, `implemented`, `validated`, `done`, `blocked`) e `test_plan` definido como objeto fechado (`additionalProperties: false`) com as 4 propriedades obrigatórias `positive`, `negative`, `concurrency` e `integration` (cada uma `array` de `string`, conforme `15 §4.2`). | O arquivo original `15-plano-mestre-de-implementacao.md` do IAS não reside no filesystem local (conforme `identity-and-access-server/AGENTS.md §3`); os 18 campos foram confrontados com a estrutura de referência de `15 §4.2` fornecida pelo responsável humano, alinhando `test_plan` ao objeto estruturado do IAS sem modificar o repositório do IAS. | §5.1.1, §5.1.8, §5.1.9, §6.1 |
| `DEC-P1-002-03` | **APROVADA** (Luís Henrique Pereira — 03/11/2026) | `approval_scope` $\in$ `["PLAN_ONLY", "EXECUTION", "MERGE"]`; `canonicalization_version` = `"JCS-RFC8785-v1"`; quando `MERGE`, exige `attempt_id` (`string` não vazia), `approved_diff_sha256` (hex 64) e `review_id` (`string` não vazia); para `PLAN_ONLY` e `EXECUTION`, os 3 campos podem estar ausentes ou, se presentes, devem ser `string` válida (**sem aceitar `null`**). | A `P1-002` valida apenas formato e estrutura; autenticidade humana, correspondência de hashes e validade operacional permanecem na `P1-003`. | §5.2 |
| `DEC-P1-002-04` | **APROVADA** (Luís Henrique Pereira — 03/11/2026) | `process_identity`: `null` ou objeto fechado (`additionalProperties: false`) com `pid` (`integer >= 1`, `required`), `process_start_token` (`string` não vazia, `required`) e `executable` (`string` não vazia, opcional). | A presença de `process_start_token` não comprova a identidade do processo; na `P1-004`/`P1-005`, o host deverá coletar e verificar dados reais do SO para diferenciar instâncias de processos mesmo com reutilização de PID. | §5.3.1, §5.3.2 |
| `DEC-P1-002-05` | **APROVADA** (Luís Henrique Pereira — 03/11/2026) | Regra condicional **unidirecional** em `ExecutionAttempt`: `finished_at !== null → termination_reason !== null` (pertencente ao enum de 9 valores da P0 §11.5), sem introduzir a condição inversa no schema. | A verificação completa de consistência entre `state`, `started_at`, `finished_at` e `termination_reason` pertence à `P1-004`. | §5.3.1, §5.3.2 |
| `DEC-P1-002-06` | **APROVADA** (Luís Henrique Pereira — 03/11/2026) | `TestRunRecord` fechado (`additionalProperties: false`) com `command`, `working_directory`, `started_at`, `duration_ms` (`integer >= 0`), `exit_code` (`integer \| null`), `log_path`, `log_sha256` (hex 64) e `observed_outcome` $\in$ `["PASS", "FAIL", "ERROR", "TIMEOUT"]` aplicado a `red`, `green`, `baseline` (quando não nulos) e `independent_test_runs[]`; `scope_validation.result` $\in$ `["PENDING", "PASS", "FAIL"]`; `artifact_hashes[]` com `{ path, sha256 }`. | A validação estrutural não substitui a coleta independente pelo host, que permanece responsabilidade da `P1-006`. | §5.5.1 a §5.5.6 |
| `DEC-P1-002-07` | **APROVADA** (Luís Henrique Pereira — 03/11/2026) | `data_classification` $\in$ `["SYNTHETIC_LAB", "INTERNAL_NON_SENSITIVE", "CLIENT_CONFIDENTIAL"]`; `sanitization_status` $\in$ `["PENDING", "APPROVED", "BLOCKED"]`. | `APPROVED` representa apenas conclusão satisfatória da sanitização e não constitui autorização de exportação; a P1 permanece restrita a `SYNTHETIC_LAB`; segurança e exportação permanecem na `P1-006`. | §5.6.1 |
| `DEC-P1-002-08` | **APROVADA** (Luís Henrique Pereira — 03/11/2026) | `included_artifacts` definido como array de objetos fechados (`additionalProperties: false`) contendo obrigatoriamente `path` (`string` não vazia) e `sha256` (hex 64). | Na `P1-006`, o host deverá resolver caminhos reais, verificar limites do workspace, recalcular hashes reais e confirmar correspondência, sem confiar em hashes declarados pelo executor. | §5.6.1, §5.6.2 |
| `DEC-P1-002-09` | **APROVADA** (Luís Henrique Pereira — 03/11/2026) | `categories_evaluated` como array de objetos fechados (`additionalProperties: false`) com `category` (enum das 12 categorias da P0 §16.4), `applicable` (`boolean`) e `justification` (`string` não vazia obrigatória quando `applicable = false`); `finding.severity` $\in$ `["LOW", "MEDIUM", "HIGH", "CRITICAL"]`. | A conformidade estrutural do `ReviewReport` não comprova a correção técnica de suas conclusões. | §5.7.1, §5.7.2, §5.7.3 |

## 6.1. Verificação de Compatibilidade Normativa com o Documento 15 do IAS (`P1-002-REV-R2-001`)

1. **Verificação da estrutura de `15-plano-mestre-de-implementacao.md` (§4.2) do IAS:**
   - **Limitação de evidência de filesystem:** Durante a inspeção *read-only* desta sessão, confirmou-se que o arquivo original `15-plano-mestre-de-implementacao.md` não está armazenado nos diretórios locais `/home/luishenriqs/projects/identity-and-access-server` nem `/home/luishenriqs/projects/ai-orchestration-lab` (conforme documentado em `/home/luishenriqs/projects/identity-and-access-server/AGENTS.md §3`: *"O projeto possui documentação normativa separada dos registros operacionais de implementação"*).
   - **Confronto integral com a estrutura de referência de `15 §4.2` fornecida pelo responsável humano:** Os 18 campos de `TaskContract.ias_normative_card` foram comparados individualmente contra a definição YAML de referência do cartão normativo do IAS (`15-plano-mestre-de-implementacao.md`, §4.2):
     - **17 campos compatíveis sem divergência:** `execution_id` (`string`), `backlog_id` (`string`), `status` (enum de 6 estados: `planned`, `in_progress`, `implemented`, `validated`, `done`, `blocked`), `objective` (`string`), `source_sections` (`array` de `string`), `predecessors` (`array` de `string`), `files_or_packages_expected` (`array` de `string`), `invariants` (`array` de `string`), `api_contracts` (`array` de `string`), `database_tables_and_locks` (`array` de `string`), `security_controls` (`array` de `string`), `audit_and_observability` (`array` de `string`), `evidence_expected` (`array` de `string`), `rollback_plan` (`string`), `acceptance_checks` (`array` de `string`), `review_required` (`boolean`) e `human_authorization` (`string`).
     - **1 divergência identificada e corrigida nesta versão (`v0.3.1`):** O campo #13 (`test_plan`), definido na `v0.3.0` como `array` de `string`, possui em `15 §4.2` estrutura de objeto com quatro listas categorizadas (`positive`, `negative`, `concurrency`, `integration`). Em cumprimento à diretriz de correção pontual autorizada por Luís Henrique Pereira, `ias_normative_card.test_plan` foi atualizado nas Seções 5.1.8, 5.1.9, 6 e 10.1 para `object` fechado (`additionalProperties: false`, `required: ["positive", "negative", "concurrency", "integration"]`), onde cada propriedade é `array` de `string` (`items: { type: "string", minLength: 1 }`).
2. **Conclusão sobre pendências:** Todas as nove questões normativas da `P1-002` (`DEC-P1-002-01` a `DEC-P1-002-09`) e a recomendação `P1-002-REV-R2-001` estão integralmente resolvidas. **Não restam ambiguidades ou divergências pendentes para a `P1-002`.**

---

# 7. Arquitetura de Validação e Viabilidade Técnica (Tratamento de `P1-002-REV-003` e `P1-002-REV-004`)

## 7.1. Motor `Ajv2020`, JSON Schema Draft 2020-12 e Configuração Estrita (`P1-002-REV-004`)

A inspeção técnica direta de `node_modules/ajv` (`8.20.0`) e `node_modules/ajv-formats` (`3.0.1`) confirma:

1. **Entrypoint obrigatório para Draft 2020-12:**
   No `ajv@8.20.0`, o entrypoint padrão (`ajv`) registra apenas o meta-schema Draft-07. Para suportar `"$schema": "https://json-schema.org/draft/2020-12/schema"`, o módulo `src/contracts/validator.ts` **deverá importar `Ajv2020` de `'ajv/dist/2020.js'`**.
2. **Opções estritas obrigatórias na instanciação do `Ajv2020`:**
   ```ts
   const ajv = new Ajv2020({
     strict: true,
     allErrors: true,
     coerceTypes: false,
     useDefaults: false,
     removeAdditional: false,
     allowUnionTypes: true,
   });
   ```
   - `strict: true`: impede palavras-chave desconhecidas ou schemas malformados.
   - `allErrors: true`: coleta todos os erros estruturais do documento em uma única passagem para diagnóstico completo.
   - `coerceTypes: false`: garante ausência total de coerção silenciosa de tipos.
   - `useDefaults: false`: garante que o validador nunca insira valores padrão nem mute o objeto recebido.
   - `removeAdditional: false`: garante que propriedades adicionais proibidas por `additionalProperties: false` causem **rejeição imediata** do documento, jamais remoção silenciosa.
   - `allowUnionTypes: true`: permite o uso de uniões de tipo nativas do JSON Schema como `["string", "null"]`, `["integer", "null"]` ou `["object", "null"]` sob `strict: true` no Ajv 8.

## 7.2. Compatibilidade ESM / CommonJS sob TypeScript `NodeNext` Sem Alterar `tsconfig.json` (`P1-002-REV-004`)

O laboratório opera com `"type": "module"` em `package.json` e `"module": "NodeNext"` / `"moduleResolution": "NodeNext"` em `tsconfig.json`.

- **Para `ajv/dist/2020.js`:** O arquivo `node_modules/ajv/dist/2020.d.ts` declara `export declare class Ajv2020 extends AjvCore` (exportação nomeada) e `node_modules/ajv/dist/2020.js` define `module.exports.Ajv2020 = Ajv2020`. Assim:
  ```ts
  import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
  ```
  é 100% compatível em tempo de compilação (`tsc --noEmit`) e em tempo de execução no Node.js 24 ESM.
- **Para `ajv-formats`:** O pacote `ajv-formats@3.0.1` é CommonJS (`module.exports = exports = formatsPlugin; exports.default = formatsPlugin;`), cujo `dist/index.d.ts` declara `export default formatsPlugin` sem `export =`. Sob `moduleResolution: "NodeNext"`, a importação padrão `import addFormatsPlugin from 'ajv-formats'` é tipada pelo TypeScript como `{ default: FormatsPlugin }`, enquanto em runtime `formatsPlugin.default === formatsPlugin`. Portanto:
  ```ts
  import addFormatsPlugin from 'ajv-formats';
  const addFormats = addFormatsPlugin.default ?? addFormatsPlugin;
  addFormats(ajv);
  ```
  (ou via `createRequire(import.meta.url)` de `'node:module'`) compila sem erros em `strict: true` + `NodeNext` e funciona nativamente em Node.js 24, **sem qualquer modificação em `tsconfig.json` ou `package.json`**.

## 7.3. Resolução Determinística de Caminhos Independente de `process.cwd()` (`P1-002-REV-004` e `P1-001-REV-001`)

Como `tsc` compila `src/contracts/*.ts` para `dist/src/contracts/*.js` e `tests/unit/*.ts` para `dist/tests/unit/*.js`, enquanto os arquivos `.schema.json` permanecem em `<workspaceRoot>/schemas/`, o carregamento dos schemas **não poderá depender de `process.cwd()`**.

Estratégia determinística a ser implementada em `src/contracts/schema-loader.ts`:
1. Obter o diretório do módulo atual via `path.dirname(fileURLToPath(import.meta.url))`.
2. Resolver a raiz do laboratório (`workspaceRoot`) subindo a árvore de diretórios até localizar o diretório que contém simultaneamente `package.json` (com `"name": "ai-orchestration-lab"`) e o diretório `schemas/` (ou resolvendo deterministicamente a partir da localização conhecida de `dist/src/contracts`).
3. Permitir opcionalmente a injeção de `schemasDir` por parâmetro para testes negativos de falha de carregamento, usando `<workspaceRoot>/schemas` como padrão determinístico.

## 7.4. Interface Pública do Validador e Política de Erros (`P1-002-REV-003`)

O módulo `src/contracts/` exporá as seguintes interfaces e funções públicas (sem lançar exceções não tratadas para entradas malformadas):

```ts
export const CONTRACT_TYPES = Object.freeze([
  'TaskContract',
  'ApprovalRecord',
  'ExecutionAttempt',
  'ExecutionResult',
  'EvidenceManifest',
  'ReviewHandoffPackage',
  'ReviewReport',
] as const);

export type ContractType = (typeof CONTRACT_TYPES)[number];

export interface ContractValidationDiagnostic {
  readonly contractType: ContractType;
  readonly instancePath: string;
  readonly schemaPath: string;
  readonly keyword: string;
  readonly message: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export type ContractValidationResult<T = unknown> =
  | {
      readonly valid: true;
      readonly contractType: ContractType;
      readonly schemaVersion: '0.3-p0';
      readonly value: T;
      readonly errors: readonly [];
    }
  | {
      readonly valid: false;
      readonly contractType: ContractType;
      readonly errors: readonly ContractValidationDiagnostic[];
    };

export function validateContract<T = unknown>(
  contractType: ContractType,
  input: unknown
): ContractValidationResult<T>;

export function parseAndValidateContract<T = unknown>(
  contractType: ContractType,
  rawJson: string
): ContractValidationResult<T>;
```

### Política de Erros (*Fail-Closed* — Seção 6.5):
1. Se `input` não for um objeto JSON válido (ex.: `null`, `undefined`, primitivo, array na raiz) ou violar qualquer regra do schema, `validateContract` retorna `{ valid: false, contractType, errors: [...] }` com pelo menos 1 diagnóstico estruturado.
2. Se `rawJson` em `parseAndValidateContract` contiver JSON sintaticamente inválido, captura o `SyntaxError` e retorna `{ valid: false, contractType, errors: [{ keyword: 'json-parse', instancePath: '', schemaPath: '', message: ... }] }`.
3. Se um `contractType` desconhecido for passado em runtime (por chamada não tipada), retorna `{ valid: false, ... }` com keyword `'unknown-contract-type'`.
4. Se um arquivo de schema estiver ausente, corrompido ou falhar na compilação do `Ajv2020`, a inicialização do validador falha explicitamente (*fail-closed*) e jamais retorna `valid: true`.
5. O objeto `input` recebido **nunca é mutado**.

---

# 8. Lista Literal de Arquivos Previstos e Protegidos (Tratamento de `P1-002-REV-003` e Seção 4.1)

Nenhum padrão glob é utilizado para autorizar escrita. Abaixo está a lista **exata, literal e exaustiva** dos arquivos que serão criados ou modificados quando a implementação da `P1-002` for autorizada.

## 8.1. Arquivos Novos a Criar (12 caminhos literais)

### A. Sete Schemas JSON Normativos em `schemas/`:
1. `schemas/task-contract.schema.json`
2. `schemas/approval-record.schema.json`
3. `schemas/execution-attempt.schema.json`
4. `schemas/execution-result.schema.json`
5. `schemas/evidence-manifest.schema.json`
6. `schemas/review-handoff-package.schema.json`
7. `schemas/review-report.schema.json`

### B. Três Módulos TypeScript de Implementação em `src/contracts/`:
8. `src/contracts/types.ts` — Identificadores literais dos 7 contratos (`CONTRACT_TYPES`), mapeamento de arquivos de schema, interfaces TypeScript dos 7 contratos (alinhadas às decisões `DEC-P1-002-01` a `DEC-P1-002-09`) e tipos de retorno/diagnóstico (`ContractValidationDiagnostic`, `ContractValidationResult`).
9. `src/contracts/schema-loader.ts` — Resolução determinística do diretório `<workspaceRoot>/schemas` via `import.meta.url` e leitura/parsing seguro dos 7 arquivos `.schema.json`.
10. `src/contracts/validator.ts` — Instanciação estrita de `Ajv2020` + `ajv-formats`, compilação dos 7 schemas e implementação de `validateContract`, `parseAndValidateContract` e helpers específicos por contrato.

### C. Um Arquivo de Testes Unitários em `tests/unit/`:
11. `tests/unit/contracts-validation.test.ts` — Suíte completa de testes positivos, negativos, de borda, condicionais e controles anti-falsos-positivos para os 7 contratos.

### D. Um Arquivo de Evidência de Execução da Tarefa em `docs/evidence/`:
12. `docs/evidence/P1-002-evidencia-validacao-contratos.md` — Registro estruturado das fases RED e GREEN, comandos executados, códigos de saída, contagens de testes e hashes dos artefatos da `P1-002`.

## 8.2. Arquivos Existentes que Poderão Ser Modificados (2 caminhos literais verificados na baseline)

1. `src/index.ts` *(caminho literal confirmado na baseline via inspeção direta em `/home/luishenriqs/projects/ai-orchestration-lab/src/index.ts`)* — Exclusivamente para reexportar a API pública de validação estrutural de `src/contracts/`, mantendo intactas todas as 5 constantes exportadas na `P1-001` (`LAB_NAME`, `LAB_SCHEMA_VERSION`, `LAB_FOUNDATION_TASK`, `REQUIRED_LAB_DIRECTORIES`, `NORMATIVE_SPECIFICATION_FILES`).
2. `README.md` — Exclusivamente para atualizar a seção de escopo atual documentando a entrega da `P1-002` após sua validação.

*(Artefatos derivados em `dist/` serão atualizados exclusivamente como saída determinística do comando `npm run build` / `npm test`, permanecendo ignorados pelo Git conforme `.gitignore`.)*

## 8.3. Arquivos Existentes Estritamente Protegidos (Modificação Proibida na `P1-002`)

É **expressamente proibido** modificar, renomear ou excluir qualquer um dos seguintes arquivos durante a `P1-002`:

1. `docs/specifications/AI-Engineering-Operating-Model-v0.3-P0-Especificacao-Tecnica.md`
2. `docs/specifications/P1-Plano-Tecnico-Implementacao-e-Validacao.md`
3. `package.json`
4. `package-lock.json`
5. `tsconfig.json`
6. `.gitignore`
7. `tests/unit/foundation.test.ts`
8. Todos os arquivos `.gitkeep` existentes nos diretórios do laboratório.
9. Qualquer arquivo fora de `/home/luishenriqs/projects/ai-orchestration-lab` (incluindo proibição absoluta de escrita ou alteração no repositório IAS).

---

# 9. Estratégia Test-First (RED $\rightarrow$ GREEN) e Controles contra Falsos Positivos

## 9.1. Fase A — RED (Antes da Implementação Funcional Completa)

1. Criar `tests/unit/contracts-validation.test.ts` contendo toda a matriz de testes dos 7 contratos (Seção 10) e um stub mínimo compilável em `src/contracts/` para que o TypeScript compile o teste e o runner `node:test` execute as asserções.
2. Executar `npm test`.
3. Verificar que a suíte `contracts-validation.test.ts` **falha pelas asserções funcionais esperadas** (código de saída $\neq 0$ em razão das asserções de validação ainda não satisfeitas, e não por erro de sintaxe ou configuração quebrada), enquanto `tests/unit/foundation.test.ts` continua passando.
4. Registrar o comando, o código de saída e o log resumido da Fase RED em `docs/evidence/P1-002-evidencia-validacao-contratos.md`.

## 9.2. Fase B — GREEN (Após a Implementação dos 7 Schemas e do Validador)

1. Implementar os 7 schemas JSON em `schemas/` e os módulos em `src/contracts/`.
2. Executar `npm run typecheck`, `npm run build` e `npm test`.
3. Confirmar que 100% dos testes unitários (`foundation.test.ts` + `contracts-validation.test.ts`) passam com código de saída `0`.
4. Registrar os resultados e hashes SHA-256 dos 7 schemas e módulos criados em `docs/evidence/P1-002-evidencia-validacao-contratos.md`.

## 9.3. Controles Obrigatórios Contra Testes Tautológicos e Falsos Positivos

A suíte `tests/unit/contracts-validation.test.ts` deverá conter verificações explícitas que garantam:
1. **Contra validador que aceita tudo:** Todo caso negativo não verifica apenas `result.valid === false`, mas também inspeciona `result.errors.length > 0` e verifica que o `keyword` ou `instancePath` do diagnóstico corresponde exatamente à violação injetada (`required`, `additionalProperties`, `enum`, `const`, `type`, `pattern`, `format`, `minimum`, `minLength`).
2. **Contra validador que rejeita tudo:** Todo contrato possui fixture válida mínima e fixture válida completa onde `result.valid === true` e `result.errors.length === 0`.
3. **Contra mutação de entrada:** Os testes congelam (`Object.freeze` recursivo) os payloads de entrada antes de chamar `validateContract`, provando que o validador não muta objetos nem injeta defaults.
4. **Contra coerção silenciosa:** Testes específicos passam `"1"` em `contract_revision` e `"true"` em `approval_required` / `applicable` / `blocking` e comprovam rejeição com `keyword === 'type'`.

---

# 10. Matriz Individualizada de Testes por Contrato (Consolidada com `DEC-P1-002-01` a `DEC-P1-002-09`)

## 10.1. Casos Estruturais Obrigatórios por Contrato na `P1-002`

Cada um dos **7 contratos** terá seu próprio bloco `describe()` em `tests/unit/contracts-validation.test.ts` cobrindo obrigatoriamente todas as linhas abaixo:

| # | Contrato | Casos Positivos Obrigatórios (`valid: true`) | Casos Negativos Obrigatórios (`valid: false` + verificação de `keyword`/`instancePath`) | Casos de Borda e Condicionais Obrigatórios |
|---|---|---|---|---|
| 1 | `TaskContract` | (P1) Contrato válido com `ias_normative_card: null` e listas vazias `[]`.<br>(P2) Contrato válido completo com `ias_normative_card` preenchido com os 18 campos literais da P0 §9.3 (`DEC-P1-002-02`), todos os 6 estados normativos (`planned`, `in_progress`, `implemented`, `validated`, `done`, `blocked`) e `ias_normative_card.test_plan` válido como objeto fechado contendo `positive`, `negative`, `concurrency` e `integration` (tanto com listas vazias `[]` quanto populadas com strings não vazias, conforme `15 §4.2`).<br>(P3) Todas as 5 estratégias válidas em `validation.strategy`, os 4 níveis de `risk_level`, os 3 valores de `selected_executor` (`codex`, `antigravity`, `synthetic`) e `mode: "CONTROLLED"` (`DEC-P1-002-01`). | (N1) Omissão individual de cada um dos 9 campos obrigatórios de topo.<br>(N2) Omissão de subcampos obrigatórios em `identity`, `governance`, `scope`, `validation`, `execution`, `rollback`.<br>(N3) Omissão individual de qualquer um dos 18 campos de `ias_normative_card` quando objeto, ou omissão individual de qualquer uma das 4 propriedades obrigatórias de `ias_normative_card.test_plan` (`positive`, `negative`, `concurrency`, `integration`).<br>(N4) `schema_version` diferente de `"0.3-p0"`.<br>(N5) Presença do campo proibido `task_ready: true` na raiz (P0 §9.6).<br>(N6) Propriedade adicional na raiz ou em subobjetos (`identity`, `scope`, `ias_normative_card`, `ias_normative_card.test_plan`).<br>(N7) Valores desconhecidos de enum em `validation.strategy`, `governance.risk_level`, `execution.selected_executor`, `execution.mode` e `ias_normative_card.status`.<br>(N8) Tipos inválidos (`contract_revision: "1"`, `timeout_seconds: 0`, `retry_limit: -1`, ou `ias_normative_card.test_plan` como array direto de strings `["t1"]`, string, `null` ou contendo itens não-string/vazios `""`). | (B1) Rejeição de padrão glob (`src/**/*.ts`), caminho absoluto (`/etc/passwd`) e travessia (`../secret.ts`) em `scope.allowed_impl_paths` e `scope.allowed_test_paths` (P0 §9.4).<br>(B2) Rejeição de número fracionário (`contract_revision: 1.5`, `timeout_seconds: 10.5`, `retry_limit: 0.5`).<br>(B3) Rejeição de string vazia `""` em identificadores obrigatórios ou dentro das listas de `ias_normative_card.test_plan`.<br>(B4) **Estrutura de `ias_normative_card.test_plan` (`15 §4.2` / `DEC-P1-002-02`):** rejeição de `test_plan: []` (array direto), de `test_plan` sem uma das 4 chaves (`positive`, `negative`, `concurrency`, `integration`) e de propriedade extra em `test_plan` (`additionalProperties: false`). |
| 2 | `ApprovalRecord` | (P1) Escopo `PLAN_ONLY` válido sem campos `MERGE` e com `canonicalization_version: "JCS-RFC8785-v1"`.<br>(P2) Escopo `EXECUTION` válido sem campos `MERGE` (e variante com campos opcionais contendo strings válidas).<br>(P3) Escopo `MERGE` estruturalmente completo com `attempt_id`, `approved_diff_sha256` (hex 64) e `review_id` preenchidos (`DEC-P1-002-03`). | (N1) Omissão individual dos 10 campos base obrigatórios.<br>(N2) `schema_version` diferente de `"0.3-p0"` ou `canonicalization_version` diferente de `"JCS-RFC8785-v1"`.<br>(N3) `approval_scope` fora de `["PLAN_ONLY", "EXECUTION", "MERGE"]`.<br>(N4) Propriedade adicional não declarada.<br>(N5) `approved_contract_sha256` ou `approved_diff_sha256` com tamanho $\neq 64$ ou caracteres não-hexadecimais.<br>(N6) `authorized_at` com data/hora inválida (`not-a-date`). | (B1) **Condicional `MERGE` incompleta (`DEC-P1-002-03`):** `approval_scope: "MERGE"` sem `attempt_id`, sem `approved_diff_sha256` ou sem `review_id` $\rightarrow$ rejeitado.<br>(B2) **Campos `MERGE` nulos ou vazios (`DEC-P1-002-03`):** `attempt_id: null`, `approved_diff_sha256: null`, `review_id: null` ou strings vazias `""` tanto em `MERGE` quanto quando presentes opcionalmente em `PLAN_ONLY` / `EXECUTION` $\rightarrow$ rejeitado.<br>(B3) `contract_revision: 0` ou fracionário $\rightarrow$ rejeitado. |
| 3 | `ExecutionAttempt` | (P1) Tentativa inicial em estado `CREATED` com `started_at: null`, `finished_at: null`, `process_identity: null`, `termination_reason: null`.<br>(P2) Tentativa em `RUNNING` com `started_at` preenchido, `process_identity` válido (`{ pid: 1234, process_start_token: "tok-1" }` e variante com `executable: "/usr/bin/node"`) e `finished_at: null`, `termination_reason: null` (`DEC-P1-002-04`).<br>(P3) Tentativa encerrada (`COMPLETED`/`FAILED`/`INTERRUPTED`) com `finished_at` preenchido e cada um dos 9 valores válidos do enum `termination_reason` da P0 §11.5 (`DEC-P1-002-05`). | (N1) Omissão individual dos 13 campos obrigatórios.<br>(N2) `state` fora dos 6 estados operacionais da P0 §11.2 (ex.: estado do IAS `"in_progress"` ou gate `"TASK-READY"`).<br>(N3) `termination_reason` com valor desconhecido fora dos 9 valores da P0 §11.5.<br>(N4) `executor` fora de `["codex", "antigravity", "synthetic"]`.<br>(N5) Propriedade adicional na raiz ou dentro de `process_identity`.<br>(N6) `started_at` ou `finished_at` com formato `date-time` inválido. | (B1) **Regra unidirecional de encerramento (`DEC-P1-002-05`):** `finished_at` preenchido (`string`) com `termination_reason: null` $\rightarrow$ rejeitado.<br>(B2) **`process_identity` estruturalmente inválido (`DEC-P1-002-04`):** objeto vazio `{}`, sem `pid`, sem `process_start_token`, com `pid: 0`, `pid: -1`, `pid: 1.5`, `process_start_token: ""`, `executable: ""` ou `executable: null` $\rightarrow$ rejeitado. |
| 4 | `ExecutionResult` | (P1) Resultado válido com `agent_declared_outcome: "completed"` e `agent_reported_blockers: []`.<br>(P2) Resultado válido com bloqueios reportados em `agent_reported_blockers` e diferentes strings não vazias em `agent_declared_outcome` (`DEC-P1-002-01`). | (N1) Omissão individual dos 7 campos obrigatórios.<br>(N2) `schema_version` incompatível ou `executor` inválido.<br>(N3) Propriedade adicional (ex.: tentativa do agente de injetar `"verified": true` ou `"host_approved": true`).<br>(N4) `agent_reported_blockers` contendo números, `null` ou string vazia `""`. | (B1) Strings vazias `""` em `execution_id`, `attempt_id`, `executor`, `agent_declared_outcome` ou `agent_summary` $\rightarrow$ rejeitado.<br>(B2) Valores `null` em qualquer campo de `ExecutionResult` $\rightarrow$ rejeitado. |
| 5 | `EvidenceManifest` | (P1) Manifesto válido inicial com `red: null`, `green: null`, `baseline: null`, `independent_test_runs: []`, `scope_validation.result: "PENDING"`, `artifact_hashes: []`.<br>(P2) Manifesto completo com `TestRunRecord` válidos em `red`, `green`, `baseline` e `independent_test_runs[]` (incluindo `exit_code: 0`, `exit_code: 1` e `exit_code: null` para `TIMEOUT`) e itens válidos em `artifact_hashes[]` (`DEC-P1-002-06`). | (N1) Omissão individual dos 9 campos de topo ou de subcampos obrigatórios em `git`, `test_evidence`, `scope_validation`, `evidence_integrity`.<br>(N2) `evidence_origin` diferente de `"HOST_OBSERVED"` (ex.: `"UNTRUSTED_AGENT_OUTPUT"`).<br>(N3) Propriedade adicional na raiz, em `git`, em `test_evidence`, em `TestRunRecord` ou em item de `artifact_hashes`.<br>(N4) Valores desconhecidos de enum em `test_evidence.strategy`, `scope_validation.result` (`PENDING`, `PASS`, `FAIL`) ou `observed_outcome` (`PASS`, `FAIL`, `ERROR`, `TIMEOUT`). | (B1) **`TestRunRecord` inválido (`DEC-P1-002-06`):** omissão de qualquer um dos 8 campos obrigatórios, `duration_ms: -1`, `duration_ms: 1.5`, `exit_code: 1.5`, `exit_code: "0"`, `log_sha256` inválido ou `started_at` inválido $\rightarrow$ rejeitado.<br>(B2) Item de `artifact_hashes` sem `path`, com `path: ""` ou com `sha256` malformado $\rightarrow$ rejeitado.<br>(B3) `git.dirty_worktree_files` ou `scope_validation.unexpected_files` contendo string vazia `""` $\rightarrow$ rejeitado. |
| 6 | `ReviewHandoffPackage` | (P1) Pacote válido com `data_classification: "SYNTHETIC_LAB"`, `sanitization_status: "PENDING"`, `included_artifacts: []` e `export_authorization_ref: null` (`DEC-P1-002-07`).<br>(P2) Pacote válido com `sanitization_status: "APPROVED"` / `"BLOCKED"`, `export_authorization_ref` preenchido (`string`), `included_artifacts` populado com objetos `{ path, sha256 }` válidos (`DEC-P1-002-08`) e `review_questions` populado. | (N1) Omissão individual dos 13 campos obrigatórios.<br>(N2) `data_classification` fora de `["SYNTHETIC_LAB", "INTERNAL_NON_SENSITIVE", "CLIENT_CONFIDENTIAL"]`.<br>(N3) `sanitization_status` fora de `["PENDING", "APPROVED", "BLOCKED"]`.<br>(N4) Propriedade adicional na raiz ou dentro de item de `included_artifacts`.<br>(N5) `contract_sha256` ou `diff_sha256` inválidos. | (B1) **`included_artifacts` inválido (`DEC-P1-002-08`):** elemento como string simples `["file.ts"]` em vez de objeto, objeto sem `path`, objeto sem `sha256`, `path: ""`, `sha256` com formato não-hexadecimal/tamanho $\neq 64$, ou propriedade adicional no item $\rightarrow$ rejeitado.<br>(B2) Valores `null` em campos não nuláveis ou `export_authorization_ref: ""` (string vazia) $\rightarrow$ rejeitado. |
| 7 | `ReviewReport` | (P1) Relatório válido sem achados (`findings: []`, `verdict: "APPROVED"`, `limitations: []`) e com `categories_evaluated` contendo categorias aplicáveis (`applicable: true`).<br>(P2) Relatório válido com achados completos (`findings` contendo todos os 7 campos da P0 §16.3 e severidades `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) e `verdict: "REJECTED"` ou `"APPROVED_WITH_RECOMMENDATIONS"`.<br>(P3) Categoria avaliada com `applicable: false` acompanhada de `justification` não vazia (`DEC-P1-002-09`). | (N1) Omissão individual dos 12 campos de topo.<br>(N2) Omissão individual de qualquer um dos 7 campos obrigatórios de um `finding` (`finding_id`, `severity`, `category`, `evidence`, `source_reference`, `recommendation`, `blocking`).<br>(N3) `verdict` fora de `["APPROVED", "APPROVED_WITH_RECOMMENDATIONS", "REJECTED"]`.<br>(N4) `finding.severity` fora de `["LOW", "MEDIUM", "HIGH", "CRITICAL"]`.<br>(N5) `category` (em `categories_evaluated` ou `findings`) fora das 12 categorias da P0 §16.4.<br>(N6) Propriedade adicional na raiz, em `finding` ou em item de `categories_evaluated`. | (B1) **Condicional de `categories_evaluated` (`DEC-P1-002-09`):** item com `applicable: false` sem `justification`, com `justification: ""` ou com `justification: null` $\rightarrow$ rejeitado.<br>(B2) Item de `categories_evaluated` como string simples `"Requisitos"` em vez de objeto fechado $\rightarrow$ rejeitado.<br>(B3) `finding.blocking` ou `applicable` com string `"true"` em vez de `boolean` $\rightarrow$ rejeitado. |

## 10.2. Distinção Entre Testes Executáveis na `P1-002` e Testes Reservados às Etapas Posteriores

| Tipo de Verificação | Executado na `P1-002`? | Onde Será Executado |
|---|---|---|
| Validação de estrutura, tipos, nulabilidade, formatos, `schema_version`, enums, `additionalProperties: false` e condicionais internas (`MERGE` em `ApprovalRecord`, regra unidirecional `finished_at -> termination_reason` em `ExecutionAttempt`, `applicable === false -> justification` em `ReviewReport`) | **SIM** (`tests/unit/contracts-validation.test.ts`) | `P1-002` |
| Rejeição de JSON malformado e entradas não-objeto (`null`, `[]`, primitivos) sem exceção não tratada | **SIM** (`tests/unit/contracts-validation.test.ts`) | `P1-002` |
| Cálculo de canonicalização RFC 8785 e comparação do SHA-256 real do `TaskContract` contra `ApprovalRecord.approved_contract_sha256` | **NÃO** | `P1-003` |
| Verificação se `ApprovalRecord.execution_id` e `contract_revision` correspondem ao `TaskContract` carregado | **NÃO** | `P1-003` / `P1-007` |
| Verificação completa de consistência temporal entre `state`, `started_at`, `finished_at` e `termination_reason` e detecção de processos órfãos | **NÃO** | `P1-004` |
| Obtenção de `process_start_token` real do sistema operacional e execução isolada em fixture | **NÃO** | `P1-004` / `P1-005` |
| Resolução de caminhos reais, recálculo de hashes de `included_artifacts`, inspeção de symlinks e varredura de segredos no `ReviewHandoffPackage` | **NÃO** | `P1-006` |
| Imposição operacional na P1 de `selected_executor === "synthetic"`, `retry_limit === 0` e `data_classification === "SYNTHETIC_LAB"` nos gates `TASK-READY`, `ValidationGate` e `PR-GATE` | **NÃO** | `P1-006` / `P1-007` |

---

# 11. Avaliação da Recomendação Não Bloqueante `P1-001-REV-001`

- **Descrição da recomendação:** Centralizar em uma função utilitária a resolução do diretório raiz do laboratório (`workspaceRoot`), evitando repetição de contagens relativas `'../../..'` em testes aninhados.
- **Decisão para a `P1-002`:**
  1. Para preservar a integridade estrita da baseline `P1-001` e evitar tocar em arquivos fora do domínio de contratos, **`tests/unit/foundation.test.ts` NÃO será modificado na `P1-002`**.
  2. O módulo `src/contracts/schema-loader.ts` implementará e exportará a função determinística `resolveWorkspaceRoot()` baseada em `import.meta.url` (Seção 7.3), que será utilizada tanto pelo carregador de schemas quanto pela nova suíte `tests/unit/contracts-validation.test.ts`.
  3. Dessa forma, a recomendação `P1-001-REV-001` é atendida para todo o código novo da `P1-002` sem introduzir refatoração fora de escopo em `tests/unit/foundation.test.ts`.

---

# 12. Riscos e Mitigações

| ID | Risco | Impacto | Mitigação |
|---|---|---|---|
| `R01` | Schemas excessivamente permissivos | Aceitação de contratos malformados ou propriedades injetadas | Uso obrigatório de `additionalProperties: false` em todos os objetos normativos fechados e `removeAdditional: false` no `Ajv2020`. |
| `R02` | Confusão entre validade estrutural e autorização operacional | Aceitação indevida de executor real, retries ou exportação apenas porque o JSON passou no schema | Documentação e separação estrita nas Seções 4.2, 5 e 6: o schema valida apenas o formato `0.3-p0`; as restrições operacionais da P1 e verificações de integridade pertencem às tarefas `P1-003` a `P1-007`. |
| `R03` | Incompatibilidade ESM/CJS com `Ajv2020` e `ajv-formats` sob `NodeNext` | Falha em `npm run typecheck` ou em runtime no Node.js 24 | Uso do padrão verificado na Seção 7.2 sem modificar `tsconfig.json` ou `package.json`. |
| `R04` | Dependência de `process.cwd()` ao carregar schemas | Quebra de testes ou CLI quando invocados fora da raiz do repositório | Resolução determinística a partir de `fileURLToPath(import.meta.url)` em `src/contracts/schema-loader.ts`. |
| `R05` | Coerção silenciosa ou mutação de payloads pelo Ajv | Contratos inválidos transformados silenciosamente em válidos | Configuração explícita `coerceTypes: false`, `useDefaults: false` e testes com payloads congelados (`Object.freeze`). |

---

# 13. Plano de Rollback Determinístico por Arquivo (Tratamento de `P1-002-REV-003`)

Nenhuma operação Git destrutiva ampla (`git reset --hard`, `git clean -fdx` indiscriminado) será utilizada. Caso a implementação futura da `P1-002` precise ser revertida total ou parcialmente:

## 13.1. Procedimento de Reversão Individual por Arquivo

| Categoria | Caminho Literal do Arquivo | Ação Exata de Rollback |
|---|---|---|
| Schema novo (1/7) | `schemas/task-contract.schema.json` | Remover exclusivamente o arquivo (`rm -f schemas/task-contract.schema.json`), preservando `schemas/.gitkeep`. |
| Schema novo (2/7) | `schemas/approval-record.schema.json` | Remover exclusivamente o arquivo (`rm -f schemas/approval-record.schema.json`). |
| Schema novo (3/7) | `schemas/execution-attempt.schema.json` | Remover exclusivamente o arquivo (`rm -f schemas/execution-attempt.schema.json`). |
| Schema novo (4/7) | `schemas/execution-result.schema.json` | Remover exclusivamente o arquivo (`rm -f schemas/execution-result.schema.json`). |
| Schema novo (5/7) | `schemas/evidence-manifest.schema.json` | Remover exclusivamente o arquivo (`rm -f schemas/evidence-manifest.schema.json`). |
| Schema novo (6/7) | `schemas/review-handoff-package.schema.json` | Remover exclusivamente o arquivo (`rm -f schemas/review-handoff-package.schema.json`). |
| Schema novo (7/7) | `schemas/review-report.schema.json` | Remover exclusivamente o arquivo (`rm -f schemas/review-report.schema.json`). |
| Código novo (1/3) | `src/contracts/types.ts` | Remover exclusivamente o arquivo (`rm -f src/contracts/types.ts`), preservando `src/contracts/.gitkeep`. |
| Código novo (2/3) | `src/contracts/schema-loader.ts` | Remover exclusivamente o arquivo (`rm -f src/contracts/schema-loader.ts`). |
| Código novo (3/3) | `src/contracts/validator.ts` | Remover exclusivamente o arquivo (`rm -f src/contracts/validator.ts`). |
| Teste novo (1/1) | `tests/unit/contracts-validation.test.ts` | Remover exclusivamente o arquivo (`rm -f tests/unit/contracts-validation.test.ts`), preservando `tests/unit/foundation.test.ts`. |
| Evidência (1/1) | `docs/evidence/P1-002-evidencia-validacao-contratos.md` | Preservar para auditoria de falha ou remover mediante autorização expressa do Owner, preservando `docs/evidence/.gitkeep`. |
| Arquivo existente (1/2) | `src/index.ts` | Restaurar à revisão `d95f13610b591f826e9c489d767fa03edf2c370a` (`git checkout d95f13610b591f826e9c489d767fa03edf2c370a -- src/index.ts`). |
| Arquivo existente (2/2) | `README.md` | Restaurar à revisão `d95f13610b591f826e9c489d767fa03edf2c370a` (`git checkout d95f13610b591f826e9c489d767fa03edf2c370a -- README.md`). |
| Artefatos compilados | `dist/` | Reexecutar `npm run build && npm test` (ou remover os artefatos correspondentes em `dist/src/contracts/` e `dist/tests/unit/contracts-validation.*` e recompilar). |

## 13.2. Verificação Pós-Rollback

Após eventual rollback, o executor deverá comprovar:
1. `sha256sum` de `P0 v0.3.0` e `P1 v0.2.0` inalterados.
2. `git status --short` sem modificações residuais na baseline `P1-001`.
3. `npm run typecheck` e `npm test` aprovados com os 3 testes originais de `tests/unit/foundation.test.ts`.

---

# 14. Rastreabilidade dos Achados das Revisões `P1-002-REV` e `P1-002-REV-R2` e Estado de Execução

A tabela abaixo distingue rigorosamente entre:
- **Tratamento documental no plano (`v0.3.1`)**,
- **Decisão humana (`DEC-P1-002-01` a `DEC-P1-002-09` e autorização condicional `P1-002-APV`)**,
- **Implementação de código/schemas**, e
- **Validação operacional executável**.

| ID do Achado / Item | Classificação nas Revisões | Decisões Humanas Relacionadas | Estado Documental no Plano (`v0.3.1`) | Estado da Decisão Humana | Estado da Implementação | Estado da Validação Operacional | Seções do Plano |
|---|---|---|---|---|---|---|---|
| `P1-002-REV-001` | ALTA — **Bloqueante** (em `P1-002-REV`; **Resolvido** em `P1-002-REV-R2`) | `DEC-P1-002-01` a `DEC-P1-002-09` | **TRATADO E APROVADO DOCUMENTALMENTE** (matrizes completas dos 7 contratos e subobjetos, incluindo `test_plan` em §5.1.9) | **APROVADA** (03/11/2026) | **PENDENTE** (Não autorizada) | **PENDENTE** | Seção 5 (§5.1 a §5.7) |
| `P1-002-REV-002` | ALTA — **Bloqueante** (em `P1-002-REV`; **Resolvido** em `P1-002-REV-R2`) | `DEC-P1-002-01` a `DEC-P1-002-09` | **TRATADO E APROVADO DOCUMENTALMENTE** (consolidação das 9 decisões sem contradições residuais) | **APROVADA** (03/11/2026) | **PENDENTE** (Não autorizada) | **PENDENTE** | Seção 5 e Seção 6 |
| `P1-002-REV-003` | ALTA — **Bloqueante** (em `P1-002-REV`; **Resolvido** em `P1-002-REV-R2`) | Autorização `P1-002-APV` | **TRATADO E APROVADO DOCUMENTALMENTE** (12 arquivos novos, 2 existentes modificáveis incluindo `src/index.ts`, arquivos protegidos, API e rollback por arquivo) | **APROVADA** (03/11/2026) | **PENDENTE** (Não autorizada) | **PENDENTE** | Seção 7.4, Seção 8 e Seção 13 |
| `P1-002-REV-004` | MÉDIA — **Não bloqueante** (**Resolvido** em `P1-002-REV-R2`) | Autorização `P1-002-APV` | **TRATADO E APROVADO DOCUMENTALMENTE** (`Ajv2020`, flags estritas, interop `NodeNext` e resolução via `import.meta.url`) | **APROVADA** (03/11/2026) | **PENDENTE** (Não autorizada) | **PENDENTE** | Seção 7 (§7.1 a §7.3) |
| `P1-002-REV-005` | BAIXA — **Não bloqueante** (**Resolvido** em `P1-002-REV-R2`) | `DEC-P1-002-01` a `DEC-P1-002-09` | **TRATADO E APROVADO DOCUMENTALMENTE** (matriz de testes individualizada para os 7 contratos atualizada com as 9 decisões e `test_plan`) | **APROVADA** (03/11/2026) | **PENDENTE** (Não autorizada) | **PENDENTE** | Seção 9 e Seção 10 (§10.1 e §10.2) |
| `P1-001-REV-001` | Recomendação anterior — **Não bloqueante** (**Resolvido** em `P1-002-REV-R2`) | Autorização `P1-002-APV` | **TRATADO E APROVADO DOCUMENTALMENTE** (`resolveWorkspaceRoot` em `src/contracts/schema-loader.ts`, preservando `tests/unit/foundation.test.ts` intacto) | **APROVADA** (03/11/2026) | **PENDENTE** (Não autorizada) | **PENDENTE** | Seção 7.3 e Seção 11 |
| `P1-002-REV-R2-001` | BAIXA — **Não bloqueante** (Recomendação da `P1-002-REV-R2`) | `DEC-P1-002-02` e Autorização `P1-002-APV` | **TRATADO E APROVADO DOCUMENTALMENTE** (verificação dos 18 campos contra `15 §4.2` e correção de `ias_normative_card.test_plan` para objeto fechado `{ positive, negative, concurrency, integration }`) | **APROVADA** (03/11/2026) | **PENDENTE** (Não autorizada) | **PENDENTE** | Seção 5.1.8, Seção 5.1.9, Seção 6.1 e Seção 10.1 |

---

# 15. Critérios de Aceite da P1-002

A tarefa `P1-002` somente poderá ser considerada tecnicamente concluída após autorização expressa de implementação (Gate C) e comprovação executável de que:

1. Os sete arquivos `.schema.json` em `schemas/` estão implementados e declaram `"$schema": "https://json-schema.org/draft/2020-12/schema"`.
2. Os sete schemas refletem exatamente as tabelas da Seção 5 e as nove decisões aprovadas na Seção 6 (`DEC-P1-002-01` a `DEC-P1-002-09`), incluindo a estrutura de `ias_normative_card.test_plan` (§5.1.9).
3. O validador em `src/contracts/` utiliza `Ajv2020` (`ajv/dist/2020.js`) e `ajv-formats` com `strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false, allowUnionTypes: true`.
4. O carregamento de schemas resolve o diretório `schemas/` de forma determinística via `import.meta.url`, independentemente de `process.cwd()`.
5. Todos os casos positivos, negativos, de borda e condicionais da Seção 10.1 para os 7 contratos estão implementados e aprovados em `tests/unit/contracts-validation.test.ts`.
6. O protocolo RED $\rightarrow$ GREEN foi executado e registrado com evidências verificáveis em `docs/evidence/P1-002-evidencia-validacao-contratos.md`.
7. `npm run typecheck`, `npm run build` e `npm test` executam com código de saída `0`.
8. Os 3 testes da `P1-001` (`tests/unit/foundation.test.ts`) permanecem inalterados e passando.
9. Nenhum arquivo protegido listado na Seção 8.3 foi modificado (hashes de P0 e P1 intactos).
10. O diff Git restringe-se exclusivamente aos arquivos autorizados nas Seções 8.1 e 8.2.
11. A revisão independente da implementação (Gate E) e o aceite humano final de Luís Henrique Pereira (Gate F) foram concluídos.

---

# 16. Gates de Governança da P1-002

| Gate | Condição | Autoridade | Estado Atual |
|---|---|---|---|
| **Gate A (`P1-002-REV-R2`)** | Revisão técnica independente regressiva do planejamento `P1-002` | Revisor Independente (Gemini 4 Argon) | **CONCLUÍDO — APROVADO COM RECOMENDAÇÕES** |
| **Gate B (`P1-002-APV`)** | Aprovação humana definitiva do planejamento `P1-002 v0.3.1` após parecer `P1-002-REV-R2` e verificação de compatibilidade normativa com `15 §4.2` | Luís Henrique Pereira | **APROVADO** |
| **Gate C (`P1-002-START`)** | Autorização humana expressa e separada para iniciar a implementação da `P1-002` | Luís Henrique Pereira | **PENDENTE — NÃO AUTORIZADO** |
| **Gate D (`P1-002-VAL`)** | Validação técnica executável (RED $\rightarrow$ GREEN, `typecheck`, `build`, `test`) | Host Validator | **PENDENTE** |
| **Gate E (`P1-002-IMPL-REV`)** | Revisão técnica independente do código, schemas, diff e evidências | Revisor Independente (Gemini) | **PENDENTE** |
| **Gate F (`P1-002-DONE`)** | Aceite humano final e autorização de commit na branch `main` | Luís Henrique Pereira | **PENDENTE** |

---

# 17. Estado Final do Documento

- **Documento:** `docs/specifications/P1-002-Plano-Tecnico-Implementacao.md`
- **Versão:** `0.3.1`
- **Data:** `03/11/2026`
- **Estado:** **APROVADO — PLANEJAMENTO TÉCNICO P1-002**
- **Gate:** **P1-002-APV — APROVADO**
- **Autoridade:** Luís Henrique Pereira
- **Fundamento:** Autorização humana expressa e condicional de 03/11/2026, após parecer `P1-002-REV-R2` e verificação de compatibilidade normativa.
- **Baseline P0 (`v0.3.0`):** APROVADA — ÍNTEGRA (`abd9ca761c188d4a2974d853edb1274acd6ccdce9c4a3b580ad6f200fd999b20`)
- **Baseline P1 (`v0.2.0`):** APROVADA — ÍNTEGRA (`66fd42bf8b64c5c252bf93db897deb84b60623822a10ff2c5498e43dff6a7a38`)
- **Baseline Git (`P1-001`):** `d95f13610b591f826e9c489d767fa03edf2c370a` (`main`)
- **Decisões Normativas `DEC-P1-002-01` a `DEC-P1-002-09`:** **APROVADAS POR LUÍS HENRIQUE PEREIRA EM 03/11/2026 E INCORPORADAS NESTA VERSÃO**
- **Revisão Independente `P1-002-REV-R2`:** **APROVADO COM RECOMENDAÇÕES (Sem pendências bloqueantes — Recomendação `P1-002-REV-R2-001` resolvida na `v0.3.1`)**
- **Gate de Implementação (`P1-002-START`):** **PENDENTE — NÃO AUTORIZADO**

> **Próxima atividade obrigatória:** Aguardar autorização humana expressa e separada para abertura do gate de implementação (`P1-002-START`). Nenhuma implementação de código, criação de schemas executáveis ou execução de commit Git está autorizada neste ato.
