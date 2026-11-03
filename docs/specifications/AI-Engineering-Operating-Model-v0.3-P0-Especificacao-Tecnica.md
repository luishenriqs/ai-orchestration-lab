# AI Engineering Operating Model v0.3
## P0 — Especificação Técnica de Contratos, Interfaces e Governança

**Responsável:** Luís Henrique Pereira  
**Data:** 03/11/2026  
**Versão:** 0.3.0  
**Estado:** APROVADO — BASELINE DOCUMENTAL P0  
**Projeto:** AI Engineering Operating Model  
**Etapa:** P0 — Contratos, interfaces e governança  
**Ambiente de referência:** Ubuntu 22.04 / WSL2  
**Laboratório:** `~/projects/ai-orchestration-lab`  

**Antecedentes:**
- P0 v0.1.0-proposta;
- P0-REV — revisão independente inicial;
- P0 v0.2.0-proposta;
- P0-REV-R2 — revisão regressiva independente;
- autorização condicional de consolidação v0.3.0 pelo owner.

> **Limite da aprovação:** Esta baseline é exclusivamente documental e
> pertence ao laboratório de orquestração.
>
> Sua aprovação não autoriza a implementação do orquestrador, a execução
> da P1, modificações no IAS, alterações de infraestrutura, push,
> merge ou deploy.
>
> Toda atividade executável exige autorização específica.

---

# 1. Objetivo

Estabelecer contratos e controles verificáveis para a coordenação de:

1. Planejamento técnico com GPT.
2. Revisão independente com Gemini.
3. Execução alternativa com Codex ou Antigravity.
4. Validação mediante evidências externas às declarações dos agentes.
5. Aprovação humana.

O modelo deverá preservar:

- autoridade humana;
- controle de escopo;
- rastreabilidade;
- integridade das aprovações;
- isolamento entre ambientes;
- recuperação após falhas;
- independência entre execução e validação;
- neutralidade de fornecedor;
- desenvolvimento incremental;
- execução reversível.

A P0 estabelece os requisitos e contratos do processo.

Ela não comprova que esses mecanismos já foram implementados
ou validados em execução.

---

# 2. Escopo e fontes

## 2.1 Incluído

Esta especificação contempla:

- TaskContract;
- ApprovalRecord;
- ExecutionAttempt;
- ExecutionResult;
- EvidenceManifest;
- ReviewHandoffPackage;
- ReviewReport;
- interfaces lógicas;
- estados operacionais;
- gates;
- isolamento;
- tratamento de falhas;
- recuperação;
- estratégia de evidências;
- plano incremental;
- critérios de aceite.

## 2.2 Excluído

Não estão autorizados:

- execução de tarefas reais;
- implementação do orquestrador;
- integração automática não autorizada;
- criação de bancos de dados;
- criação de serviços;
- execução concorrente na P1;
- alterações nos documentos normativos IAS;
- modificações no repositório IAS;
- deploy;
- push ou merge;
- alterações de infraestrutura;
- utilização indevida de credenciais pessoais.

## 2.3 Referências

### Modelo operacional

- AI Engineering Operating Model v0.1.
- AI Engineering Operating Model v0.2.
- Proposta arquitetural híbrida v0.3.
- Relatório P0-REV.
- Relatório P0-REV-R2.

### IAS

Quando a atividade envolver o Identity and Access Server,
prevalecem:

1. `00-decisoes-canônicas.md`.
2. `01-requisitos-consolidados.md`.
3. Documentos especializados pertinentes.
4. `14-backlog-por-fases.md`.
5. `15-plano-mestre-de-implementacao.md`.

Para validações de produto, também deverá ser
consultado `13-testes-e-validacao.md`.

## 2.4 Separação entre projetos

O AI Engineering Operating Model é independente do IAS.

O laboratório poderá utilizar tarefas sintéticas inspiradas
no IAS, mas não poderá alterar a governança, os requisitos
ou os estados normativos do produto.

O documento `15-plano-mestre-de-implementacao.md`,
especialmente suas seções 3 e 4, permanece como referência
para gates, cartões e estados de execução do IAS.

---

# 3. Princípios arquiteturais

## 3.1 Responsabilidade humana

O owner permanece como autoridade final.

Agentes podem:

- analisar;
- planejar;
- propor;
- executar tarefas autorizadas;
- produzir testes;
- revisar;
- gerar evidências.

Agentes não podem, por iniciativa própria:

- alterar requisitos;
- modificar decisões arquiteturais;
- ampliar escopo;
- alterar contratos públicos;
- modificar políticas de segurança;
- realizar deploy;
- aprovar sua própria implementação;
- realizar merge não autorizado.

## 3.2 Independência de fornecedor

O modelo deve permitir diferentes fornecedores
de inteligência artificial.

A arquitetura não dependerá obrigatoriamente de:

- modelo específico;
- formato proprietário de resposta;
- mecanismo único de autenticação;
- sistema operacional exclusivo;
- interface específica de determinado agente.

As diferenças serão tratadas por interfaces
ou procedimentos próprios.

## 3.3 Separação de responsabilidades

O fluxo operacional será organizado em:

1. Planejamento.
2. Revisão do planejamento.
3. Aprovação.
4. Execução.
5. Coleta independente de evidências.
6. Validação técnica.
7. Revisão independente.
8. Aprovação humana final.

Nenhuma etapa substitui automaticamente outra.

---

# 4. Arquitetura operacional

## 4.1 Papéis

### Owner

Responsável por:

- aprovar escopo;
- autorizar execução;
- aprovar exceções;
- definir limites;
- decidir sobre mudanças;
- aprovar resultados;
- autorizar integração.

### Planner

Responsável por:

- analisar requisitos;
- identificar dependências;
- definir critérios de aceite;
- elaborar planos;
- identificar riscos;
- planejar testes;
- definir rollback.

Plataforma inicialmente prevista:

GPT, mediante handoff controlado.

### Independent Reviewer

Responsável por:

- contestar premissas;
- avaliar riscos;
- identificar regressões;
- verificar conformidade;
- revisar evidências;
- recomendar correções.

Plataforma inicialmente prevista:

Gemini 4 Argon.

### Executor

Responsável pela implementação de tarefas autorizadas.

Executores elegíveis:

- OpenAI Codex;
- Google Antigravity.

O executor não possui autoridade para alterar
seu próprio escopo.

### Host Validator

Responsável pela produção e validação determinística
das evidências observadas pelo ambiente.

Não deve confiar em declarações textuais do executor.

## 4.2 Modalidade A — Programática

Um coordenador poderá utilizar interfaces oficialmente
permitidas e previamente verificadas.

O Codex é candidato inicial.

A viabilidade completa da integração, seus mecanismos
de autenticação e suas permissões deverão ser comprovados
antes do piloto correspondente.

A sessão atual do ChatGPT não representa automaticamente
uma API programática disponível ao orquestrador.

## 4.3 Modalidade B — Antigravity nativo

O Antigravity operará inicialmente por interface oficial,
com handoff humano controlado.

A disponibilidade técnica de `agy -p` não comprova
autorização para encapsulamento externo utilizando
autenticação de assinatura pessoal.

Integrações adicionais dependerão de confirmação
de permissões aplicáveis.

## 4.4 Revisão Gemini

A revisão independente será realizada inicialmente
por handoff controlado.

Não está aprovada integração automática com Gemini API.

Antes de utilizar código real, será necessário verificar:

- termos aplicáveis;
- autorização contratual;
- retenção de dados;
- utilização para treinamento;
- permissões de integração;
- confidencialidade.

---

# 5. Evidências de ambiente

## 5.1 Codex

Versão observada:

`0.166.0`

Autenticação:

ChatGPT.

Teste não interativo:

```bash
codex exec \
  --sandbox read-only \
  --skip-git-repo-check \
  "Responda exclusivamente com o texto IAS-CODEX-OK. Não execute comandos, não utilize ferramentas e não modifique arquivos."
```

Resultado:

```text
IAS-CODEX-OK
```

### Conclusão

A execução não interativa básica foi demonstrada.

Esse teste não comprova:

- integração completa;
- capacidade de escrita segura;
- qualidade de implementação;
- isolamento efetivo;
- permissões adicionais.

## 5.2 Antigravity

Versão observada:

`1.4.12`

Autenticação:

Google AI Pro.

Modelo utilizado:

`Gemini 4 Argon (Medium)`

Teste interativo:

```text
IAS-AGY-OK
```

Teste headless:

```bash
agy -p \
  "Responda exclusivamente com IAS-AGY-HEADLESS-OK. Não execute comandos, não utilize ferramentas e não modifique arquivos." \
  --output-format json
```

Resultado observado:

```json
{
  "status": "SUCCESS",
  "response": "IAS-AGY-HEADLESS-OK\n"
}
```

### Conclusão

As modalidades interativa e headless direta
foram demonstradas.

O resultado não comprova autorização para integração
em aplicações externas.

## 5.3 Gemini CLI

Versão observada:

`0.66.0`

Instalação concluída.

Autenticação individual rejeitada no canal testado.

A revisão Gemini permanece prevista
por handoff controlado.

## 5.4 Limites das evidências

Nenhum teste completo do orquestrador foi executado.

Também não foram comprovados:

- concorrência;
- isolamento efetivo do sandbox;
- segurança com código real;
- integridade de evidências;
- interoperabilidade entre executores;
- recuperação após falhas.

---

# 6. Modelo de confiança

## 6.1 Classificação

O modelo distingue três categorias.

### UNTRUSTED_AGENT_OUTPUT

Informações declaradas pelo agente.

Exemplos:

- resumo;
- supostos arquivos modificados;
- supostos testes executados;
- resultados declarados;
- justificativas.

### HOST_OBSERVED

Informações observadas pelo ambiente.

Exemplos:

- Git status;
- Git diff;
- comandos executados pelo host;
- códigos de saída;
- timestamps;
- hashes;
- logs.

### HUMAN_AUTHORIZATION

Decisões humanas verificáveis.

Exemplos:

- autorização de execução;
- aprovação de escopo;
- aprovação de merge;
- autorização de exceção.

## 6.2 Regra de confiança

O modelo de linguagem não é fonte autoritativa
para comprovar sua própria execução.

Declarações do agente não podem substituir
evidências observadas independentemente.

## 6.3 Proteção

O agente executor não poderá modificar:

- registros de aprovação;
- schemas autoritativos;
- validadores;
- runners de teste;
- contratos aprovados;
- evidências autoritativas.

A separação deve existir também nas permissões
efetivas do ambiente.

A mera separação em diretórios não constitui
uma fronteira de segurança suficiente.

---

# 7. Interfaces lógicas

As interfaces representam responsabilidades.

Não implicam necessariamente a criação de seis
classes, serviços ou processos separados.

## 7.1 TaskRegistry

Responsável pelo registro das tarefas.

**Entrada:**

- identificador;
- contrato;
- referências de histórico.

**Saída:**

- versão;
- estado;
- dependências;
- histórico de decisões.

Não cria estados normativos do IAS.

## 7.2 ApprovalGate

Responsável pela verificação de autorizações.

**Entrada:**

- contrato;
- ApprovalRecord;
- evidências pertinentes.

**Saída:**

- autorização;
- negação;
- justificativa.

Não fabrica aprovações humanas.

Atua sobre pré-condições de execução e sobre
a verificação de aprovações pós-revisão.

## 7.3 ExecutionAdapter

Responsável pela interface com executores.

**Entrada:**

- contrato autorizado.

**Saída:**

- ExecutionAttempt;
- resultado declarado pelo agente;
- telemetria operacional.

Utiliza somente canais autorizados.

## 7.4 EvidenceCollector

Responsável pela coleta independente.

**Entrada:**

- workspace;
- Git;
- runner;
- logs.

**Saída:**

- EvidenceManifest.

Não depende exclusivamente de declarações do agente.

## 7.5 ReviewHandoff

Responsável pela preparação do pacote de revisão.

**Entrada:**

- contrato;
- diff;
- evidências;
- critérios de aceite.

**Saída:**

- ReviewHandoffPackage.

A exportação depende de política de dados satisfeita.

## 7.6 ValidationGate

Responsável pela verificação técnica pós-execução.

**Entrada:**

- EvidenceManifest;
- contrato;
- ReviewReport.

**Saída:**

- avaliação dos critérios técnicos;
- identificação de bloqueios.

Não concede aprovação humana.

## 7.7 Fluxo lógico

```text
TaskRegistry
    |
    v
ApprovalGate
    |
    | TASK-READY
    v
ExecutionAdapter
    |
    v
EvidenceCollector
    |
    v
ValidationGate
    |
    v
ReviewHandoff
    |
    v
Independent Reviewer
    |
    v
ReviewReport
    |
    v
ValidationGate
    |
    v
ApprovalGate
    |
    | PR-GATE
    v
Owner
```

A ordem concreta das validações poderá incluir
verificações adicionais antes e depois da revisão.

A revisão independente deverá utilizar
o diff e as evidências reais.

---

# 8. Contratos: formato e integridade

## 8.1 Formato

Contratos estruturados:

**JSON**

Validação estrutural:

**JSON Schema Draft 2020-12**

Markdown poderá ser gerado para leitura humana.

A representação Markdown não substitui o contrato
estruturado nas verificações determinísticas.

## 8.2 Versionamento

`schema_version` identifica a versão do formato.

`contract_revision` identifica a revisão
de determinada tarefa.

A alteração de conteúdo sujeito a aprovação
exige nova revisão.

## 8.3 Canonicalização

O cálculo de hashes exige serialização
JSON determinística.

A implementação deverá selecionar, documentar
e testar um procedimento de canonicalização.

O algoritmo e sua versão deverão ser identificáveis.

Calcular SHA-256 diretamente sobre JSON arbitrário
não garante correspondência estável entre
representações equivalentes.

## 8.4 Integridade e autenticidade

O hash demonstra correspondência de conteúdo.

Ele não comprova, sozinho, a identidade do aprovador.

A autenticidade da autorização dependerá de
mecanismo externo ao agente.

## 8.5 Validação

Contratos inválidos serão rejeitados antes da execução.

O mecanismo deverá detectar:

- campos obrigatórios ausentes;
- tipos inválidos;
- enums incompatíveis;
- versões incompatíveis;
- identificadores inconsistentes;
- hashes divergentes;
- caminhos inválidos;
- referências obsoletas;
- campos adicionais proibidos pelo schema.

---

# 9. TaskContract

## 9.1 Responsabilidade

Representar a tarefa autorizável.

Contém:

- identificação;
- contexto;
- escopo;
- dependências;
- critérios de aceite;
- testes;
- restrições;
- executor;
- permissões;
- rollback.

## 9.2 Estrutura proposta

```json
{
  "schema_version": "0.3-p0",
  "contract_revision": 1,
  "identity": {
    "execution_id": "IAS-EX-F00-002",
    "backlog_id": "IAS-BL-F00-002",
    "repository": "identity-and-access-server",
    "workspace_context_id": "ias-lab",
    "workspace_root": "<caminho absoluto validado>",
    "base_commit": "<SHA verificado>"
  },
  "governance": {
    "risk_level": "LOW",
    "approval_required": true
  },
  "scope": {
    "objective": "<objetivo aprovado>",
    "allowed_impl_paths": [],
    "allowed_test_paths": [],
    "forbidden_changes": [],
    "protected_existing_tests": true
  },
  "validation": {
    "strategy": "RED_GREEN_WHEN_APPLICABLE",
    "positive_tests": [],
    "negative_tests": [],
    "boundary_tests": [],
    "acceptance_checks": [],
    "validation_commands": []
  },
  "execution": {
    "selected_executor": "codex",
    "mode": "CONTROLLED",
    "timeout_seconds": 600,
    "retry_limit": 0
  },
  "rollback": {
    "procedure": "<procedimento aprovado>"
  },
  "ias_normative_card": null
}
```

**Observação:** exemplo estrutural, sem autorização
de execução de F00-002.

Placeholders, valores nulos e listas vazias
não tornam uma tarefa real automaticamente válida.

## 9.3 Compatibilidade com IAS

Quando aplicável, `ias_normative_card` deverá preservar
literalmente os campos do cartão estabelecido
em `15 §4.2`.

Campos:

1. `execution_id`
2. `backlog_id`
3. `status`
4. `objective`
5. `source_sections`
6. `predecessors`
7. `files_or_packages_expected`
8. `invariants`
9. `api_contracts`
10. `database_tables_and_locks`
11. `security_controls`
12. `audit_and_observability`
13. `test_plan`
14. `evidence_expected`
15. `rollback_plan`
16. `acceptance_checks`
17. `review_required`
18. `human_authorization`

O contrato externo não poderá substituir,
renomear ou omitir esses campos.

## 9.4 Caminhos autorizados

Na P1 serão utilizados caminhos relativos
literais à raiz do workspace autorizado.

Padrões glob não serão suportados inicialmente.

O ambiente deverá validar:

- caminhos reais;
- symlinks;
- arquivos criados;
- arquivos alterados;
- arquivos excluídos;
- arquivos não rastreados.

## 9.5 Testes protegidos

Testes preexistentes não poderão ser enfraquecidos,
alterados ou removidos sem autorização específica.

## 9.6 TASK-READY

O campo `task_ready` não integra o contrato estático.

Ele representa o resultado dinâmico da avaliação
do gate de pré-execução.

Essa separação impede que a atualização do resultado
do gate altere o hash do contrato aprovado.

---

# 10. ApprovalRecord

## 10.1 Responsabilidade

Comprovar decisão humana específica.

O registro deverá permanecer fora da área
gravável pelo executor.

## 10.2 Estrutura

```json
{
  "schema_version": "0.3-p0",
  "approval_id": "<ID único>",
  "execution_id": "IAS-EX-F00-002",
  "contract_revision": 1,
  "approved_contract_sha256": "<digest canônico>",
  "canonicalization_version": "<versão>",
  "approval_scope": "EXECUTION",
  "authorized_by": "<identidade humana verificada>",
  "authorized_at": "<ISO-8601>",
  "approval_source": "<referência verificável>"
}
```

## 10.3 Escopos

Valores previstos:

- `PLAN_ONLY`
- `EXECUTION`
- `MERGE`

A aprovação de um escopo não autoriza automaticamente
os demais.

## 10.4 Aprovação MERGE

Quando:

```text
approval_scope = MERGE
```

os seguintes campos adicionais são obrigatórios:

```json
{
  "attempt_id": "<tentativa aprovada>",
  "approved_diff_sha256": "<digest do diff aprovado>",
  "review_id": "<revisão correspondente>"
}
```

Para `PLAN_ONLY` e `EXECUTION`, esses campos
não são obrigatórios e poderão estar ausentes
conforme o schema.

## 10.5 Validação

O ApprovalGate deverá rejeitar continuidade quando:

- não existir aprovação;
- a revisão divergir;
- o digest divergir;
- o escopo solicitado exceder o aprovado;
- a identidade do aprovador não for verificável;
- o registro estiver invalidado;
- o contrato tiver mudado após a aprovação;
- o diff não corresponder à aprovação de merge;
- a tentativa não corresponder à tentativa aprovada;
- o review não corresponder ao resultado aprovado.

## 10.6 Autenticidade

Na P1 não será obrigatória infraestrutura de PKI.

Entretanto, o procedimento de aprovação deverá
garantir que o agente executor não possa criar
ou alterar a autorização humana.

---

# 11. ExecutionAttempt

## 11.1 Responsabilidade

Registrar uma tentativa observável de execução.

Cada tentativa deverá possuir identificação própria.

## 11.2 Estados

Estados internos:

- `CREATED`
- `RUNNING`
- `COMPLETED`
- `FAILED`
- `INTERRUPTED`
- `BLOCKED`

Esses estados não representam estados
normativos do backlog IAS.

## 11.3 Registro inicial

Antes de invocar o agente, o host deverá registrar:

- tentativa;
- contrato aprovado;
- ambiente;
- commit base;
- horário;
- executor;
- autorização correspondente.

## 11.4 Estrutura de attempt.json

```json
{
  "schema_version": "0.3-p0",
  "execution_id": "IAS-EX-F00-002",
  "attempt_id": "<ID único>",
  "approval_id": "<aprovação EXECUTION>",
  "approved_contract_sha256": "<digest>",
  "executor": "codex",
  "state": "CREATED",
  "started_at": null,
  "finished_at": null,
  "base_commit": "<SHA>",
  "workspace_root": "<caminho validado>",
  "process_identity": null,
  "termination_reason": null
}
```

## 11.5 Termination reason

Valores inicialmente propostos:

- `NORMAL`
- `TIMEOUT`
- `AUTH_FAILURE`
- `QUOTA_EXCEEDED`
- `PROVIDER_FAILURE`
- `SCOPE_VIOLATION`
- `PROCESS_FAILURE`
- `INTERRUPTED`
- `COLLECTION_FAILURE`

O schema deverá estabelecer um enum fechado.

`null` será permitido somente enquanto
a tentativa não possuir encerramento registrado.

## 11.6 Histórico

Tentativas anteriores não serão sobrescritas.

Uma nova execução exigirá novo `attempt_id`.

---

# 12. ExecutionResult

## 12.1 Responsabilidade

Representar o resultado declarado pelo agente.

Não constitui evidência autoritativa.

## 12.2 Estrutura

```json
{
  "schema_version": "0.3-p0",
  "execution_id": "IAS-EX-F00-002",
  "attempt_id": "<ID único>",
  "executor": "codex",
  "agent_declared_outcome": "completed",
  "agent_summary": "<resumo>",
  "agent_reported_blockers": []
}
```

## 12.3 Limites

O resultado:

```text
completed
```

significa apenas conclusão declarada pelo agente.

Não demonstra:

- testes executados;
- critérios satisfeitos;
- escopo respeitado;
- revisão concluída;
- autorização de merge;
- conclusão normativa do backlog.

---

# 13. EvidenceManifest

## 13.1 Responsabilidade

Consolidar evidências observadas diretamente
pelo ambiente.

Deverá ser produzido por mecanismo determinístico
fora da esfera de escrita do executor.

## 13.2 Estrutura

```json
{
  "schema_version": "0.3-p0",
  "execution_id": "IAS-EX-F00-002",
  "attempt_id": "<ID único>",
  "evidence_origin": "HOST_OBSERVED",
  "git": {
    "base_sha": "<SHA>",
    "head_sha": "<SHA>",
    "dirty_worktree_files": [],
    "diff_sha256": "<digest>"
  },
  "test_evidence": {
    "strategy": "RED_GREEN_WHEN_APPLICABLE",
    "red": null,
    "green": null,
    "baseline": null
  },
  "independent_test_runs": [],
  "scope_validation": {
    "result": "PENDING",
    "unexpected_files": []
  },
  "evidence_integrity": {
    "artifact_hashes": []
  }
}
```

## 13.3 Coleta independente

O EvidenceCollector deverá consultar diretamente:

- Git status;
- índice;
- diff contra o commit base;
- arquivos não rastreados;
- arquivos criados;
- arquivos alterados;
- arquivos excluídos;
- symlinks;
- caminhos efetivamente afetados.

Não poderá confiar exclusivamente na lista
de arquivos declarada pelo agente.

## 13.4 Testes

O runner independente deverá registrar:

- comando aprovado;
- diretório;
- início;
- duração;
- código de saída;
- logs;
- hashes;
- resultado observado.

Os logs deverão ser sanitizados quando necessário.

## 13.5 Proteção

O agente não deverá possuir acesso de escrita
aos mecanismos que produzem evidências autoritativas.

Isso inclui:

- runners;
- validadores;
- configurações de validação;
- registros finais de evidências.

---

# 14. Test-First e Failure-Validation

## 14.1 Estratégias

Estratégias previstas:

- `RED_GREEN`
- `REGRESSION_BASELINE`
- `STRUCTURAL_VALIDATION`
- `CONFIGURATION_VALIDATION`

A estratégia apropriada deverá ser definida
antes da execução.

## 14.2 Modalidade preferencial na P1

Para alterações funcionais em que RED/GREEN
seja tecnicamente aplicável, utilizar
execução em duas fases.

### Fase A — Testes

1. O agente recebe autorização para preparar testes.
2. O agente produz os testes dentro do escopo.
3. O Host Validator executa os testes.
4. A falha esperada é verificada.
5. O estado RED é registrado.
6. O checkpoint é preservado fora da escrita do agente.

### Fase B — Implementação

1. O agente recebe autorização para implementar.
2. A mudança mínima é produzida.
3. O Host Validator executa os testes.
4. O resultado GREEN é registrado.
5. A regressão aplicável é executada.
6. A integridade dos testes é verificada.

## 14.3 Independência do RED

Uma execução única em que o agente produz
testes e implementação simultaneamente não comprova,
por si só, a sequência RED/GREEN.

Logs declarados pelo próprio agente não poderão
ser considerados evidência RED autoritativa.

## 14.4 Modalidade alternativa

A reconstrução diferencial posterior do estado RED
poderá ser considerada futuramente.

Essa modalidade exigirá validação específica,
pois alterações em testes e implementação podem
possuir dependências técnicas.

Não está aprovada como mecanismo padrão da P1.

## 14.5 Aplicabilidade

### Alteração funcional

RED/GREEN quando tecnicamente viável.

### Correção de bug

Teste que reproduza a falha anterior
e comprove sua correção.

### Refatoração

Baseline de testes e verificação
de preservação de comportamento.

### Documentação

Validação estrutural e consistência.

### Configuração

Verificação adequada do comportamento
anterior e posterior.

## 14.6 Proteção contra testes inválidos

A revisão deverá procurar:

- testes tautológicos;
- mocks que escondam o problema;
- asserções enfraquecidas;
- testes removidos;
- cenários negativos ausentes;
- falsos positivos.

---

# 15. ReviewHandoffPackage

## 15.1 Responsabilidade

Preparar um pacote delimitado e verificável
para revisão independente.

## 15.2 Estrutura

```json
{
  "schema_version": "0.3-p0",
  "handoff_id": "<ID único>",
  "execution_id": "IAS-EX-F00-002",
  "attempt_id": "<ID único>",
  "contract_sha256": "<digest canônico>",
  "diff_sha256": "<digest>",
  "workspace_context_id": "ias-lab",
  "data_classification": "SYNTHETIC_LAB",
  "evidence_manifest_path": "<caminho validado>",
  "included_artifacts": [],
  "review_questions": [],
  "sanitization_status": "PENDING",
  "export_authorization_ref": null
}
```

## 15.3 Pré-exportação

Antes do envio:

1. Verificar workspace.
2. Resolver caminhos reais.
3. Inspecionar symlinks.
4. Confirmar origem dos artefatos.
5. Conferir classificação dos dados.
6. Validar permissão de compartilhamento.
7. Inspecionar possíveis segredos.
8. Registrar os arquivos exportados.

## 15.4 Confidencialidade

A sanitização automatizada não garante,
isoladamente, ausência de dados sensíveis.

Para informações confidenciais será necessária
verificação de política e autorização.

Na dúvida:

```text
BLOCKED
```

---

# 16. ReviewReport

## 16.1 Responsabilidade

Registrar avaliação independente sobre
uma tentativa e um diff específicos.

## 16.2 Estrutura

```json
{
  "schema_version": "0.3-p0",
  "review_id": "<ID único>",
  "execution_id": "IAS-EX-F00-002",
  "attempt_id": "<ID único>",
  "reviewed_contract_sha256": "<digest>",
  "reviewed_diff_sha256": "<digest>",
  "reviewer_model": "Gemini 4 Argon",
  "review_timestamp": "<ISO-8601>",
  "categories_evaluated": [],
  "findings": [],
  "verdict": "REJECTED",
  "limitations": []
}
```

## 16.3 Finding

Cada achado deverá conter:

- `finding_id`;
- `severity`;
- `category`;
- `evidence`;
- `source_reference`;
- `recommendation`;
- `blocking`.

## 16.4 Categorias

1. Requisitos.
2. Comportamento.
3. Segurança.
4. Confidencialidade.
5. Concorrência.
6. Integridade.
7. Testes positivos.
8. Testes negativos.
9. Casos de borda.
10. Escopo.
11. Rollback.
12. Compatibilidade normativa.

Categorias não aplicáveis deverão ser justificadas.

## 16.5 Vereditos

- `APPROVED`
- `APPROVED_WITH_RECOMMENDATIONS`
- `REJECTED`

Os vereditos são recomendações técnicas.

Não substituem aprovação humana.

## 16.6 Obsolescência

O PR-GATE deverá rejeitar relatórios
cujos hashes de contrato ou diff
não correspondam ao estado submetido.

Também deverá verificar o `attempt_id`.

---

# 17. Estados e gates

## 17.1 Estados normativos IAS

Preservar:

- `planned`
- `in_progress`
- `implemented`
- `validated`
- `done`
- `blocked`

O orquestrador não poderá introduzir estados
adicionais no backlog IAS.

## 17.2 Estados operacionais

Os estados internos das tentativas são independentes.

| Origem | Evento | Destino |
|---|---|---|
| CREATED | TASK-READY satisfeito e início registrado | RUNNING |
| CREATED | Pré-condição negada | BLOCKED |
| RUNNING | Encerramento normal | COMPLETED |
| RUNNING | Falha observada | FAILED |
| RUNNING | Interrupção detectada | INTERRUPTED |
| FAILED | Nova tentativa autorizada | Novo CREATED |
| INTERRUPTED | Reconciliação e nova autorização | Novo CREATED |
| BLOCKED | Bloqueio resolvido e nova autorização | Novo CREATED |

Cada nova tentativa deverá receber identificação própria.

## 17.3 Transições IAS

O orquestrador não definirá unilateralmente
transições regressivas do backlog.

Antes de alterar o estado normativo,
deverá consultar as regras aplicáveis
de `14 §3` e `15 §3.3`.

Quando uma transição não estiver prevista,
será necessária decisão humana.

## 17.4 TASK-READY

O gate exige:

- contrato válido;
- aprovação autêntica;
- hash correspondente;
- escopo aprovado;
- dependências satisfeitas;
- commit verificado;
- workspace verificado;
- ambiente autorizado;
- política de dados satisfeita;
- permissões suficientes;
- ausência de conflito operacional.

O resultado do gate não será armazenado
como campo mutável do TaskContract aprovado.

## 17.5 PR-GATE

O gate exige:

- evidências independentes;
- diff inspecionado;
- conformidade de escopo;
- testes aplicáveis;
- revisão atual;
- riscos tratados;
- rollback avaliado;
- aprovação humana MERGE válida.

A aprovação MERGE deverá corresponder:

- ao contrato;
- à tentativa;
- ao diff;
- ao relatório de revisão.

Nenhum resultado `SUCCESS` de agente
poderá substituir essas condições.

## 17.6 Gates superiores IAS

Preservar:

- `D15-REV`;
- `D15-APV`;
- `DEV-START`;
- `Fxx-GATE`;
- `REL-GATE`.

A aprovação documental não equivale
à autorização de implementação.

---

# 18. Organização de artefatos

## 18.1 Estrutura proposta

```text
ai-orchestration-lab/
├── docs/
│   └── specifications/
├── schemas/
├── contracts/
│   └── <execution-id>.v<revision>.json
├── approvals/
│   └── <approval-id>.json
├── reviews/
│   └── <review-id>.json
├── runs/
│   └── <execution-id>/
│       └── attempts/
│           └── <attempt-id>/
│               ├── attempt.json
│               ├── execution-result.json
│               ├── evidence-manifest.json
│               ├── review-handoff.json
│               └── logs/
└── worktrees/
```

## 18.2 Separação de permissões

Os diretórios:

- `contracts/`;
- `approvals/`;
- `schemas/`;
- `reviews/`;

não deverão estar disponíveis para escrita
pelo executor durante a execução.

Também deverão ser protegidos os mecanismos
autoritativos de coleta e validação.

## 18.3 Histórico

Artefatos de tentativas anteriores
não serão sobrescritos.

## 18.4 Persistência

A primeira implementação poderá utilizar
arquivos locais versionados.

Nenhum banco de dados está autorizado nesta etapa.

A implementação física deverá comprovar
a integridade dos registros relevantes.

---

# 19. Segurança e isolamento

## 19.1 Workspace Context

`workspace_context_id` identifica
o contexto operacional isolado.

Não representa tenant do IAS.

## 19.2 Workspace Root

Todo contrato deverá identificar
uma raiz autorizada.

O host deverá verificar:

- caminhos reais;
- symlinks;
- repositório;
- origem dos artefatos;
- destinos de escrita.

## 19.3 Sandbox

O agente deverá utilizar privilégio mínimo.

Política pretendida:

- escrita limitada;
- leitura restrita quando suportada;
- proteção de diretórios sensíveis;
- rede limitada;
- comandos controlados.

A eficácia real dessas restrições no WSL2
ainda não foi validada.

Essa validação deverá ser feita
com dados sintéticos.

## 19.4 Isolamento de clientes

Não compartilhar indevidamente:

- repositórios;
- worktrees;
- prompts;
- conversas;
- credenciais;
- tokens;
- chaves;
- logs;
- arquivos de ambiente;
- contextos de execução.

## 19.5 Prompt injection

Arquivos, tickets, logs e dependências
devem ser tratados como dados potencialmente
não confiáveis.

Instruções nesses materiais não podem
ampliar autoridade.

## 19.6 Ações proibidas inicialmente

Sem autorização específica:

- push;
- merge;
- deploy;
- alterações de credenciais;
- criação de recursos cloud;
- alterações de infraestrutura;
- mudanças de contratos;
- mudanças arquiteturais.

---

# 20. Falhas e recuperação

## 20.1 Falhas parciais

Quando ocorrer falha após alterações:

1. Encerrar a tentativa.
2. Preservar evidências disponíveis.
3. Capturar estado do workspace.
4. Registrar Git status e diff.
5. Impedir retry automático.
6. Solicitar inspeção.
7. Decidir rollback ou continuidade autorizada.

## 20.2 Tentativas órfãs

O mecanismo de reconciliação deverá detectar
tentativas registradas como RUNNING sem execução
ativa correspondente.

Não deverá confiar exclusivamente em PID,
pois identificadores de processo podem ser reutilizados.

## 20.3 Reconciliação

A recuperação deverá:

- identificar tentativas interrompidas;
- verificar estado real;
- preservar evidências;
- inspecionar Git;
- conferir integridade;
- bloquear execuções conflitantes;
- solicitar decisão humana.

## 20.4 Rollback

O rollback deverá preservar alterações
preexistentes do usuário.

Não são permitidas operações destrutivas
automáticas sobre diretórios amplos
ou worktrees não identificadas.

## 20.5 Mudança de executor

A troca entre Codex e Antigravity poderá alterar:

- permissões;
- políticas de dados;
- ambiente;
- capacidades;
- comportamento operacional.

Portanto, deverá ser reavaliada e autorizada
quando modificar o contrato aprovado.

---

# 21. Concorrência

## 21.1 Decisão para P1

**A P1 será exclusivamente serial.**

Também será adotado:

```text
retry_limit = 0
```

Não haverá retry automático.

## 21.2 Evolução futura

Antes de permitir paralelismo:

- worktrees independentes;
- locks exclusivos;
- identificação de tentativas;
- detecção de conflitos de caminhos;
- análise de contratos compartilhados;
- verificação de dependências;
- revalidação após alterações na branch-base.

## 21.3 Artefatos compartilhados

Exigem tratamento especial:

- migrations;
- contratos públicos;
- arquivos de dependências;
- configurações globais;
- mecanismos de autorização;
- infraestrutura compartilhada.

## 21.4 Commit base

Mudanças na branch de destino deverão
desencadear reavaliação de pressupostos
dependentes do commit anterior.

A política futura deverá definir
quando rebase e nova validação serão necessários.

Não se presume que igualdade literal de SHA
seja adequada a todos os workflows Git.

---

# 22. Governança de fornecedores e dados

## 22.1 Classificação

Categorias iniciais:

- `SYNTHETIC_LAB`;
- `INTERNAL_NON_SENSITIVE`;
- `CLIENT_CONFIDENTIAL`.

## 22.2 P1

A P1 utilizará exclusivamente
dados sintéticos.

## 22.3 Código real

Antes de utilizar código real,
será necessário verificar:

- termos de serviço;
- autorização contratual;
- política de retenção;
- política de treinamento;
- permissões comerciais;
- limites de integração;
- confidencialidade.

## 22.4 Evidências

Essas verificações deverão possuir
referências oficiais e registros próprios.

Uma assinatura paga não comprova
autorização para qualquer modalidade
de integração ou processamento.

---

# 23. Plano de validação incremental

## P0 — Especificação

Definir:

- contratos;
- interfaces;
- gates;
- estados;
- segurança;
- critérios de aceite.

**Estado:** baseline documental aprovada.

## P1 — Simulação controlada

Utilizar tarefa fictícia.

Validar:

- contratos;
- gates;
- integridade;
- transições;
- evidências;
- falhas;
- isolamento.

Restrições:

- dados sintéticos;
- execução serial;
- sem retries automáticos;
- sem alterações no IAS.

**Gate:** autorização P1-START separada.

## P2 — Benchmark de executores

Comparar Codex e Antigravity
com tarefas sintéticas equivalentes.

Avaliar:

- aderência ao escopo;
- qualidade;
- testes;
- evidências;
- duração;
- custo;
- intervenção humana.

**Gate:** aprovação específica
do plano de benchmark.

## P3 — Revisão e handoffs

Validar:

- transferência de artefatos;
- revisão independente;
- rastreabilidade;
- obsolescência de revisões;
- falhas de fornecedor;
- integridade dos resultados.

**Gate:** aprovação do plano de validação.

## P4 — Piloto controlado

Considerar uma tarefa real do IAS
somente após:

- documentação necessária;
- aprovação humana;
- validação de segurança;
- autorização de fornecedor;
- task card aprovado;
- permissões adequadas.

Os gates normativos do IAS prevalecem.

A aprovação da P0 não autoriza a P4.

---

# 24. Critérios de aceite P0

## 24.1 Critérios documentais

- [x] Estados normativos IAS preservados.
- [x] Gates separados dos estados.
- [x] Contratos identificados e versionados.
- [x] Aprovações vinculadas ao conteúdo aprovado.
- [x] Autenticidade separada da integridade.
- [x] `task_ready` removido do contrato estático.
- [x] Aprovação MERGE vinculada a tentativa, diff e review.
- [x] Declarações dos agentes separadas de evidências do host.
- [x] Protocolo RED/GREEN em duas fases quando aplicável.
- [x] Proteção de testes existentes especificada.
- [x] Compatibilidade com cartão IAS especificada.
- [x] ReviewReport rastreável.
- [x] ExecutionAttempt estruturado.
- [x] ReviewHandoffPackage estruturado.
- [x] Interfaces lógicas definidas.
- [x] JSON e JSON Schema Draft 2020-12 selecionados.
- [x] Política de isolamento estabelecida.
- [x] P1 definida como serial.
- [x] Ausência de retries automáticos na P1.
- [x] Evidências de ambiente registradas.
- [x] Roadmap P0–P4 preservado.
- [x] Nenhuma alteração normativa do IAS decorrente da P0.

Os itens assinalados indicam cobertura documental.

Não constituem comprovação de implementação
ou de validação executável.

---

# 25. Pendências para etapas seguintes

## PEND-003 — Retries

Na P1:

```text
retry_limit = 0
```

Retries automáticos permanecem fora
do escopo inicial.

## PEND-004 — Custos e timeout

Cada tentativa deverá possuir
timeout aprovado.

O limite concreto será definido
no cartão da simulação.

Métricas detalhadas poderão ser
aprofundadas na P2.

## PEND-005 — Fornecedores

Verificar políticas aplicáveis
antes de utilizar código real.

## PEND-006 — Planejamento

O planejamento permanecerá inicialmente
por handoff humano.

## PEND-008 — Sandbox

Comprovar experimentalmente
as restrições efetivas no WSL2.

## PEND-009 — Integridade do armazenamento

Definir o mecanismo concreto
de proteção dos registros humanos
antes de sua implementação.

## PEND-010 — Schemas executáveis

Selecionar e testar:

- canonicalização JSON;
- schemas;
- validação;
- regras condicionais;
- enums;
- referências;
- integridade de artefatos.

A P0 define os requisitos.

A implementação exigirá autorização específica.

---

# 26. Rastreabilidade dos achados

## 26.1 Revisão inicial

| Achado | Tratamento |
|---|---|
| P0-REV-001 | Seções 8 e 10 |
| P0-REV-002 | Seções 6, 12 e 13 |
| P0-REV-003 | Seções 9, 13 e 14 |
| P0-REV-004 | Seção 9 |
| P0-REV-005 | Seção 16 |
| P0-REV-006 | Seção 17 |
| P0-REV-007 | Seções 8 e 18 |
| P0-REV-008 | Seções 18, 19 e 22 |
| P0-REV-009 | Seção 21 |
| P0-REV-010 | Seção 22 |
| P0-REV-011 | Seção 7 |

## 26.2 Revisão regressiva

| Achado | Tratamento |
|---|---|
| P0-REV-R2-001 | Seções 9, 10 e 17 |
| P0-REV-R2-002 | Seção 14 |
| P0-REV-R2-003 | Seções 11, 15 e 18 |
| P0-REV-R2-004 | Seções 5, 7 e 23 |

## 26.3 Resultado

Os onze achados originais foram tratados
na evolução documental.

Os quatro ajustes residuais da revisão regressiva
foram incorporados nesta consolidação.

Não foram introduzidas alterações
nos estados normativos, cartões ou decisões do IAS.

---

# 27. Registro de aprovação

## 27.1 Histórico

A versão 0.1.0-proposta foi submetida
ao Gemini 4 Argon.

O relatório P0-REV recomendou
reprovação e correções.

A versão 0.2.0-proposta incorporou
as recomendações analisadas.

O relatório P0-REV-R2 classificou a proposta como:

**APROVAR COM RECOMENDAÇÕES**

Foram identificados quatro ajustes residuais
não bloqueantes.

## 27.2 Deliberação humana

Em 03/11/2026, o responsável Luís Henrique Pereira
autorizou consolidar a versão 0.3.0 e aprová-la
como definitiva, desde que não fossem
introduzidas alterações indevidas.

## 27.3 Verificação de escopo

A consolidação desta versão contempla:

1. Remoção de `task_ready` do TaskContract.
2. Vínculo de aprovações MERGE a tentativa, diff e review.
3. Protocolo RED/GREEN em duas fases.
4. Exemplos JSON de ExecutionAttempt e ReviewHandoffPackage.
5. Convenção dos arquivos de contratos e revisões.
6. Restauração das interfaces lógicas.
7. Restauração das evidências de ambiente.
8. Restauração do roadmap P0–P4.

Não houve autorização nem proposta de alteração
de decisões canônicas do IAS.

## 27.4 Resultado

**Versão:** 0.3.0  
**Estado:** APROVADO — BASELINE DOCUMENTAL P0  
**Autoridade:** Luís Henrique Pereira  
**Data:** 03/11/2026  

Esta aprovação não autoriza implementação.

---

# 28. Gate de continuidade

O fluxo a partir desta baseline será:

```text
P0 v0.3.0
   |
   v
Baseline documental aprovada
   |
   v
Planejamento técnico P1
   |
   v
Revisão do plano P1
   |
   v
Aprovação humana P1-START
   |
   v
Simulação executável controlada
```

A execução da P1 depende de autorização
expressa e separada.

---

# 29. Conclusão

A versão 0.3.0 consolida a especificação técnica
do AI Engineering Operating Model v0.3.

A arquitetura estabelece:

- contratos estruturados;
- aprovações verificáveis;
- separação entre confiança e evidência;
- revisão independente;
- validação técnica externa ao agente;
- mecanismos de isolamento;
- tratamento de falhas;
- rastreabilidade;
- execução incremental;
- compatibilidade com a governança IAS.

A especificação possui maturidade documental
para orientar o planejamento da P1.

A segurança operacional e a implementação
dos mecanismos definidos ainda deverão
ser demonstradas por testes próprios.

**ESTADO FINAL: P0 APROVADA — BASELINE DOCUMENTAL v0.3.0**

**IMPLEMENTAÇÃO: NÃO AUTORIZADA**

**P1-START: PENDENTE**

**ALTERAÇÕES NO IAS: NENHUMA**