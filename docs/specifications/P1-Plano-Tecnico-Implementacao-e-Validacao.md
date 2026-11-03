# AI Engineering Operating Model v0.3

## P1 — Plano Técnico de Implementação e Validação

**Versão:** 0.2.0
**Estado:** APROVADO — BASELINE DEFINITIVA DA P1
**Revisão independente:** APROVADO COM RECOMENDAÇÕES — P1-REV-R2
**Aprovação humana:** Luís Henrique Pereira — 03/11/2026
**Gate P1-APV:** APROVADO
**Implementação:** NÃO AUTORIZADA
**Gate P1-START:** PENDENTE

---

# 1. Objetivo

Construir uma prova de conceito local, determinística e reproduzível dos mecanismos centrais de governança do *AI Engineering Operating Model v0.3*.

A P1 deverá demonstrar que nenhuma execução avança sem:

- Contrato estruturalmente válido.
- Integridade e versão do contrato verificadas.
- Aprovação humana correspondente e vigente.
- Escopo autorizado e delimitado.
- Contexto de workspace correto.
- Isolamento efetivo do executor.
- Evidências coletadas independentemente pelo host.
- Validação RED → GREEN quando aplicável.
- Preservação de testes protegidos.
- Gates obrigatórios satisfeitos.
- Revisão e autorização humana aplicáveis.

A P1 também deverá demonstrar a rejeição determinística de condições inválidas, evidências fraudulentas, adulteração de registros e violações de segurança.

**A P1 não deverá demonstrar apenas fluxos bem-sucedidos. A capacidade de rejeitar resultados indevidos é um critério central de aceite.**

# 2. Escopo técnico

## 2.1. Incluído

- Inicialização do laboratório Node.js/TypeScript.
- Implementação de sete contratos JSON normativos.
- Validação por JSON Schema Draft 2020-12.
- Canonicalização determinística e hashing SHA-256.
- Verificação de aprovação humana.
- Registro persistente de tentativas.
- Reconciliação de tentativas interrompidas.
- Rollback controlado.
- Gerenciamento de fixtures Git isoladas.
- Executor sintético determinístico.
- Execução controlada de processos.
- Proteção de registros de governança.
- Coleta independente de evidências.
- Verificação de arquivos alterados e não rastreados.
- Validação RED → GREEN em duas fases.
- Proteção de testes preexistentes.
- Geração e validação de `ReviewHandoffPackage`.
- Avaliação de TASK-READY e PR-GATE.
- Testes positivos, negativos e adversariais.
- Relatórios reproduzíveis de execução.

## 2.2. Excluído

- Integração programática com Codex.
- Integração programática com Antigravity.
- Integração com Gemini API.
- Uso de modelos de linguagem como executores.
- Interface gráfica.
- Servidor HTTP.
- Banco de dados.
- Filas e workers distribuídos.
- Execução paralela.
- Retries automáticos.
- Deploy.
- Push ou merge automáticos.
- Modificação do repositório IAS.
- Execução sobre dados reais ou confidenciais.

A integração com agentes reais permanece reservada à P2.

# 3. Stack e decisões técnicas

## 3.1. Stack aprovada

| Componente | Definição |
|---|---|
| Linguagem | TypeScript |
| Runtime | Node.js 24 |
| Contratos | JSON |
| Validação | JSON Schema Draft 2020-12 |
| Persistência | Arquivos locais |
| Versionamento | Git |
| Executor | Sintético determinístico |
| Interface | CLI |
| Execução | Processos locais controlados |
| Paralelismo | 1 |
| Banco de dados | Nenhum |

## 3.2. Dependências propostas

Adotar a diretriz **Zero-Dependency First**.

Dependências de runtime:

- `ajv` — linha principal 8.x.
- `ajv-formats` — versão compatível com o Ajv selecionado.

Dependências de desenvolvimento:

- `typescript` — linha principal 5.x.
- `@types/node` — linha principal 24.x.

Preferir os módulos nativos:

- `node:test`.
- `node:assert/strict`.
- `node:crypto`.
- `node:fs/promises`.
- `node:path`.
- `node:child_process`.
- `node:os`.

O documento aprova as famílias de dependências, não versões exatas ainda não verificadas.

Durante P1-001, o executor deverá registrar as versões efetivamente resolvidas e o lockfile correspondente. Não será permitida substituição silenciosa por bibliotecas alternativas.

Não instalar frameworks adicionais de teste, execução de subprocessos ou criptografia sem justificativa e aprovação.

A estratégia de lint e formatação deverá ser definida durante o detalhamento de P1-001, antes de instalar ferramentas adicionais.

## 3.3. Política de schemas

Os sete contratos da P0 deverão ser representados por arquivos JSON Schema individuais.

Todos deverão declarar:

`"$schema": "https://json-schema.org/draft/2020-12/schema"`

Os campos normativos deverão ser definidos explicitamente.

Objetos normativos fechados deverão rejeitar propriedades adicionais, conforme a estrutura e a extensibilidade efetivamente previstas pela P0.

**Não adicionar campos, estados, enums ou exigências inexistentes na baseline.**

Os schemas deverão espelhar os contratos normativos da P0, preservando seus nomes, tipos, obrigatoriedades e regras de evolução.

## 3.4. Canonicalização e hashing

Adotar como formato normativo:

`canonicalization_version: "JCS-RFC8785-v1"`

A canonicalização deverá produzir representação determinística compatível com a RFC 8785, seguida de hashing SHA-256.

A implementação deverá:

- Rejeitar valores não representáveis em JSON válido.
- Aplicar ordenação de propriedades compatível com a especificação.
- Preservar a semântica de serialização exigida pela RFC 8785.
- Produzir resultado idêntico para objetos semanticamente equivalentes segundo o padrão.
- Ser validada com vetores de teste conhecidos.
- Não depender da ordem de inserção das propriedades de objetos.

A implementação própria somente será aceita após testes de conformidade suficientes.

Não presumir conformidade apenas porque uma função ordena chaves e utiliza `JSON.stringify`.

## 3.5. Execução controlada de processos

Utilizar `spawn` ou `execFile`, com:

- `shell: false`.
- Executável e argumentos separados.
- Diretório de trabalho explícito.
- Ambiente reduzido às variáveis necessárias.
- Timeout definido.
- Captura limitada de stdout e stderr.
- Registro de código de saída e motivo de encerramento.
- Encerramento controlado de processos e descendentes quando necessário.

Política inicial para cenários sintéticos:

| Parâmetro | Valor proposto |
|---|---|
| Timeout padrão | 10 segundos |
| Timeout do SYN-003 | 1 segundo |
| Limite de captura stdout | 1 MiB |
| Limite de captura stderr | 1 MiB |
| Paralelismo | 1 |
| Retry automático | 0 |

Os limites de captura não substituem controles sobre consumo total de memória, CPU ou processos.

A implementação deverá documentar quais limites são efetivamente aplicados pelo sistema operacional e quais são apenas limites da aplicação.

# 4. Arquitetura mínima

```text
TaskContract
    ↓
JSON Schema Validator
    ↓
ApprovalGate
    ↓
TASK-READY
    ↓
ExecutionAdapter
    ↓
SyntheticExecutor
    ↓
Host EvidenceCollector
    ↓
ValidationGate
    ↓
ReviewHandoffPackage
    ↓
ReviewReport
    ↓
ValidationGate
    ↓
ApprovalGate (PR-GATE)
```

O fluxo acima representa responsabilidades lógicas. Ele não exige que todos os componentes sejam implementados como processos ou serviços separados.

O `SyntheticExecutor` será considerado não confiável.

Os componentes responsáveis por aprovação, coleta independente, validação e decisão de gates pertencem ao domínio confiável do host.

O executor não poderá:

- Criar aprovações humanas válidas.
- Alterar contratos aprovados.
- Modificar schemas normativos.
- Alterar relatórios de revisão independentes.
- Declarar suas próprias evidências como verificadas.
- Aprovar sua própria execução.
- Aprovar merge ou conclusão.

O PR-GATE deverá permanecer dependente das condições e autorizações exigidas pela P0.

# 5. Estrutura do laboratório

```text
ai-orchestration-lab/
├── docs/
│   ├── specifications/
│   └── evidence/
├── schemas/
├── contracts/
├── approvals/
├── reviews/
├── runs/
├── worktrees/
├── src/
│   ├── contracts/
│   ├── governance/
│   ├── execution/
│   ├── evidence/
│   └── cli/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── scenarios/
├── package.json
├── package-lock.json
└── tsconfig.json
```

## 5.1. Separação obrigatória

A árvore Git principal do laboratório armazena o código-fonte e a documentação.

Os cenários sintéticos deverão operar exclusivamente em repositórios Git de fixtures, separados da árvore Git principal.

Estrutura prevista:

`worktrees/<execution-id>/<attempt-id>/workspace/`

Cada fixture deverá possuir:

- Repositório Git próprio.
- Identidade de autor sintética e local.
- Commit inicial determinístico.
- Referência persistida ao `base_commit`.
- Identificadores próprios de execução e tentativa.
- Limites explícitos de diretórios autorizados.

A criação de fixtures não poderá alterar o índice, o histórico ou os arquivos rastreados do repositório principal.

## 5.2. Proteção de governança

Os diretórios a seguir são considerados protegidos:

- `contracts/`.
- `approvals/`.
- `schemas/`.
- `reviews/`.

O executor não deverá ter permissão efetiva para modificá-los.

A P1 deverá comprovar essa restrição em experimento executável.

Verificações de caminho dentro da aplicação não constituem, isoladamente, uma barreira suficiente.

# 6. Backlog de implementação

A implementação permanece dividida em oito tarefas sequenciais.

Cada tarefa deverá possuir testes, evidências, revisão e possibilidade de rollback controlado.

## P1-001 — Inicializar o laboratório

**Objetivo:** preparar o ambiente mínimo e reproduzível.

### Entregas

- Projeto Node.js 24 e TypeScript.
- Estrutura inicial de diretórios.
- `package.json`.
- Lockfile.
- `tsconfig.json`.
- Configuração de compilação.
- Runner de testes nativo.
- Scripts de build e teste.
- Estratégia mínima de qualidade estática.
- Documentação de execução.

### Critérios de aceite

- Instalação reproduzível.
- Compilação bem-sucedida.
- Testes executáveis.
- Versões registradas.
- Dependências justificadas.
- Nenhum acesso ao IAS.
- Nenhum serviço externo obrigatório durante os testes.

**Dependência:** P1-START autorizado.

## P1-002 — Implementar validação de contratos

**Objetivo:** aceitar contratos válidos e rejeitar entradas estruturalmente inválidas.

### Entregas

Schemas para:

1. `TaskContract`.
2. `ApprovalRecord`.
3. `ExecutionAttempt`.
4. `ExecutionResult`.
5. `EvidenceManifest`.
6. `ReviewHandoffPackage`.
7. `ReviewReport`.

### Testes positivos

- Contratos válidos aceitos.
- Campos opcionais válidos aceitos.
- Enums reconhecidos.
- Versões compatíveis aceitas.

### Testes negativos

- Campo obrigatório ausente.
- Tipo inválido.
- Enum inválido.
- Versão incompatível.
- Propriedade proibida.
- Identificador inconsistente.
- Estrutura incompatível com o contrato da P0.

### Critério de aceite

Nenhum contrato estruturalmente inválido poderá alcançar a execução.

**Dependência:** P1-001.

## P1-003 — Implementar integridade e autorização

**Objetivo:** impedir execução com contratos adulterados ou aprovações inválidas.

### Entregas

- Canonicalização compatível com RFC 8785.
- Hash SHA-256.
- Verificação de revisão.
- Verificação da identidade do contrato aprovado.
- Verificação do escopo e da finalidade da aprovação.
- Rejeição de aprovações obsoletas.
- Verificação de vínculo de aprovação MERGE.

### Testes positivos

- Contrato intacto e aprovado.
- Aprovação EXECUTION correspondente à revisão autorizada.
- Hash reproduzível.

### Testes negativos

- Contrato alterado após aprovação.
- Hash divergente.
- Revisão divergente.
- Aprovação ausente.
- Aprovação de outra tarefa.
- Escopo insuficiente.
- Aprovação de finalidade incompatível.
- Aprovação MERGE sem vínculo correto com tentativa, diff e revisão.
- Entrada malformada de canonicalização.

### Critério de aceite

A decisão de autorização deverá derivar de registros confiáveis e verificáveis, nunca de uma declaração unilateral do executor.

**Dependência:** P1-002.

## P1-004 — Implementar registro e recuperação de tentativas

**Objetivo:** manter histórico confiável do ciclo de vida de execução.

### Entregas

- Criação de `attempt_id`.
- Registro persistente de início e encerramento.
- Transições internas de tentativa.
- Preservação de tentativas anteriores.
- Identificação de tentativas órfãs.
- Componente `Reconciler`.
- Mecanismo de rollback controlado.

### Reconciliação

O reconciliador deverá identificar tentativas registradas como `RUNNING` cujo processo não esteja mais ativo.

Deverá permitir o registro de interrupção e a preservação do estado parcial, respeitando as transições admitidas pela P0.

Não poderá transformar automaticamente uma tentativa interrompida em concluída.

### Rollback

O rollback deverá:

- Operar somente sobre a fixture identificada.
- Verificar o `base_commit`.
- Preservar evidências previamente coletadas.
- Não remover dados fora da fixture autorizada.
- Não executar limpeza indiscriminada.
- Registrar resultado e falhas.
- Exigir a autorização aplicável quando prevista pelo contrato.

### Testes

- `CREATED → RUNNING`.
- `CREATED → BLOCKED`.
- `RUNNING → COMPLETED`.
- `RUNNING → FAILED`.
- `RUNNING → INTERRUPTED`.
- Tentativa duplicada rejeitada.
- Recuperação de tentativa órfã.
- Falha parcial preservada.
- Rollback limitado à fixture.
- Ausência de retry automático.

### Critério de aceite

Uma interrupção não poderá apagar o histórico, mascarar a falha ou provocar nova execução automática.

**Dependência:** P1-003.

## P1-005 — Implementar executor sintético e isolamento

**Objetivo:** produzir comportamentos controlados para testar o sistema de governança.

O executor não utilizará modelos de linguagem.

### Entregas

- `FixtureWorkspaceManager`.
- Criação de repositórios Git sintéticos independentes.
- `ExecutionAdapter`.
- Executor sintético por cenário.
- Controle de timeout.
- Limites de saída.
- Verificação de isolamento.
- Suporte às fases RED e GREEN.

### Cenários

| ID | Comportamento |
|---|---|
| SYN-001 | Execução bem-sucedida com RED → GREEN |
| SYN-002 | Falha operacional |
| SYN-003 | Timeout |
| SYN-004 | Alteração fora do escopo |
| SYN-005 | Declaração falsa de sucesso |
| SYN-006 | Interrupção |
| SYN-007 | Tentativa de modificar aprovação protegida |
| SYN-008 | Criação de arquivo não rastreado |
| SYN-009 | Teste tautológico ou ausência de RED legítimo |
| SYN-010 | Alteração não autorizada de teste protegido |

### Protocolo RED → GREEN

**Fase A — RED**

- Preparar o estado-base da fixture.
- Introduzir ou executar o teste relevante.
- Verificar que o teste falha pela razão esperada.
- Rejeitar o cenário se o teste já passar.
- Registrar evidências independentes do RED.

**Fase B — GREEN**

- Executar a alteração sintética autorizada.
- Verificar que o teste passa.
- Confirmar a integridade dos testes protegidos.
- Registrar evidências independentes do GREEN.

Nenhuma declaração textual do executor substituirá os resultados observados pelo host.

### Critério de aceite

Todos os cenários deverão ser determinísticos, reproduzíveis e executados exclusivamente em fixtures isoladas.

**Dependência:** P1-004.

## P1-006 — Implementar coleta independente e handoff

**Objetivo:** produzir evidências observadas pelo host e preparar um pacote seguro para revisão.

### Entregas

- `EvidenceCollector`.
- Inspeção Git da fixture.
- Identificação de arquivos alterados, adicionados e não rastreados.
- Registro de códigos de saída.
- Registro de duração.
- Captura controlada de logs.
- Hashes de artefatos.
- Evidências RED e GREEN.
- `EvidenceManifest`.
- Construção de `ReviewHandoffPackage`.
- Validação semântica pré-exportação.

### Regras de validação do handoff

Antes da exportação:

- Resolver caminhos reais.
- Verificar limites do workspace autorizado.
- Rejeitar symlinks que escapem da área permitida.
- Verificar `workspace_context_id`.
- Verificar referências e hashes aplicáveis.
- Inspecionar evidências quanto a padrões de segredo.
- Rejeitar pacotes inconsistentes.
- Preservar a distinção entre alegações do executor e observações do host.

A detecção de segredos deverá utilizar regras explícitas, testáveis e documentadas. Ela não será considerada garantia absoluta de ausência de segredos.

### Testes negativos

- Sucesso declarado sem teste executado.
- Arquivo modificado e omitido pelo executor.
- Arquivo não rastreado.
- Modificação fora do escopo.
- Evidência declarada divergente.
- Symlink escapando do workspace.
- `workspace_context_id` incorreto.
- Evidência com padrão de segredo.
- Handoff com referência inválida.

### Critério de aceite

A evidência utilizada nos gates deverá ser produzida ou confirmada pelo host, independentemente da declaração do executor.

**Dependência:** P1-005.

## P1-007 — Implementar validação de gates

**Objetivo:** aplicar as condições de avanço da P0.

### TASK-READY

Verificar:

- Contrato válido.
- Aprovação correspondente.
- Hash correto.
- Workspace autorizado.
- Escopo delimitado.
- Dependências satisfeitas.
- Ambiente permitido.
- Ausência de conflito.
- Restrições de segurança atendidas.

### ValidationGate

Verificar:

- Consistência do resultado observado.
- Evidências obrigatórias.
- Integridade de artefatos.
- RED legítimo quando exigido.
- GREEN válido quando exigido.
- Preservação de testes protegidos.
- Ausência de alterações proibidas.
- Consistência do handoff e do relatório de revisão.

### PR-GATE

Verificar:

- Evidências presentes e válidas.
- Diff correspondente à tentativa.
- Escopo respeitado.
- Testes exigidos aprovados.
- Revisão correspondente.
- Relatório de revisão válido.
- Aprovação humana vinculada aos identificadores e hashes aplicáveis.

### Critério de aceite

Toda condição obrigatória falsa deverá bloquear o respectivo gate.

TASK-READY e PR-GATE são **gates**, não estados adicionais de tarefa.

**Dependência:** P1-006.

## P1-008 — Executar simulação adversarial e validação final

**Objetivo:** demonstrar os controles da P1 mediante cenários positivos e negativos.

### Cenários obrigatórios

1. Contrato alterado após aprovação.
2. Aprovação inexistente.
3. Resultado falso do executor.
4. Arquivo alterado fora do escopo.
5. Falha parcial.
6. Tentativa interrompida.
7. Revisão obsoleta.
8. Aprovação MERGE vinculada a outra tentativa.
9. Tentativa de alterar registros protegidos.
10. Contrato com schema inválido.
11. Teste tautológico rejeitado antes da fase GREEN.
12. Modificação de teste protegido rejeitada.
13. Symlink escapando do workspace autorizado.
14. Handoff com `workspace_context_id` divergente.
15. Evidência contendo padrão de segredo.
16. Fluxo positivo RED → GREEN com evidências válidas.

Os cenários SYN-001 a SYN-010 constituem comportamentos do executor sintético. A lista acima representa casos de validação de ponta a ponta, podendo reutilizar esses comportamentos.

### Evidências

Cada caso deverá registrar:

- Entrada.
- Resultado esperado.
- Resultado observado.
- Identificadores de execução e tentativa.
- Código de saída.
- Logs relevantes.
- Hashes.
- Caminhos de evidências.
- Gate avaliado.
- Motivo da aprovação ou rejeição.
- Conclusão.

### Relatórios

Gerar:

- `docs/evidence/p1-simulation-report.json`.
- `docs/evidence/P1-Relatorio-Final-Validacao.md`.

O relatório JSON deverá conter os resultados estruturados dos casos executados.

O relatório Markdown deverá apresentar o resumo técnico, as divergências encontradas, as limitações conhecidas e a conclusão sobre os critérios de aceite.

### Critério de aceite

Os casos obrigatórios deverão produzir os resultados previstos, com evidências verificáveis.

Uma falha de teste não poderá ser transformada em sucesso por alteração do resultado declarado.

**Dependência:** P1-007.

# 7. Estratégia de testes

## 7.1. Testes unitários

Validar:

- Schemas.
- Canonicalização.
- Hashing.
- Identificadores.
- Transições de tentativas.
- Predicados de autorização.
- Predicados dos gates.
- Validação de caminhos.
- Verificação de hashes.

## 7.2. Testes de integração

Validar os vínculos entre:

- Contratos.
- Aprovações.
- Tentativas.
- Fixtures.
- Executor.
- Coletor de evidências.
- Handoff.
- Revisão.
- Gates.

## 7.3. Testes adversariais

Cobrir:

- Adulteração.
- Alteração fora do escopo.
- Falsificação de sucesso.
- Falha de processo.
- Timeout.
- Teste tautológico.
- Alteração de testes protegidos.
- Symlink malicioso.
- Divergência de contexto.
- Alteração de registros humanos.
- Aprovação obsoleta.
- Aprovação de outra tentativa.

## 7.4. Verificação de isolamento no WSL2

A P1 deverá executar um experimento específico para comprovar a proteção dos diretórios de governança.

### Defesa preventiva

Avaliar isolamento de filesystem por `bubblewrap`, com áreas protegidas em modo somente leitura e a fixture como área gravável.

A disponibilidade e eficácia do mecanismo deverão ser testadas no ambiente WSL2 real.

Não presumir que a instalação da ferramenta ou a presença de parâmetros de configuração comprovem isolamento.

### Defesa detectiva

O processo host confiável deverá:

1. Calcular snapshots de integridade antes da execução.
2. Iniciar o processo sintético.
3. Capturar seu resultado.
4. Recalcular a integridade após o encerramento.
5. Detectar alterações indevidas.
6. Bloquear o gate e preservar evidências em caso de divergência.

A verificação deverá contemplar o conjunto esperado de arquivos e seus conteúdos, incluindo criação, remoção e substituição de entradas.

### Limite do fallback

Permissões POSIX e verificação de integridade podem atuar como medidas adicionais.

Entretanto, `chmod` não será considerado proteção preventiva suficiente quando o executor puder modificar permissões por compartilhar a mesma identidade de usuário e propriedade dos arquivos.

Se nenhuma barreira preventiva efetiva puder ser demonstrada, o requisito de isolamento permanecerá **não validado**, e o gate correspondente deverá ser bloqueado.

Não haverá aceitação por equivalência presumida entre detecção e prevenção.

# 8. Política de execução

```yaml
execution_policy:
  data_classification: SYNTHETIC_LAB
  parallelism: 1
  retry_limit: 0
  external_integrations: false
  automatic_merge: false
  automatic_push: false
  deployment: false
```

Regras adicionais:

- Executar apenas fixtures autorizadas.
- Não acessar o repositório IAS.
- Não operar sobre a árvore Git principal como fixture.
- Não executar subprocessos por shell.
- Não reutilizar aprovações para contratos ou tentativas incompatíveis.
- Não permitir que o executor grave registros de governança.
- Não considerar resultado autodeclarado como evidência verificada.

# 9. Plano de rollback

O rollback deverá ser pequeno, identificável e reversível.

Para cada atividade:

1. Identificar alterações realizadas.
2. Registrar o estado anterior.
3. Preservar evidências.
4. Limitar a operação à fixture identificada.
5. Validar o alvo antes de qualquer ação destrutiva.
6. Restaurar o estado autorizado.
7. Registrar o resultado.

A remoção de fixtures temporárias somente poderá ocorrer quando não comprometer evidências obrigatórias e depois da validação explícita do caminho-alvo.

Não utilizar operações destrutivas sobre diretórios amplos, diretórios de usuário ou o repositório principal.

# 10. Gates de implementação

| Gate | Condição | Autoridade |
|---|---|---|
| P1-REV | Revisão independente do plano | Revisor |
| P1-APV | Aprovação documental do plano | Luís |
| P1-START | Autorização explícita para implementação | Luís |
| TASK-READY | Contrato e pré-condições satisfeitos | Governança técnica |
| P1-VALIDATION | Testes e evidências completos | Validação técnica |
| P1-DONE | Aceite formal da fase | Luís |

A aprovação documental P1-APV não substitui P1-START.

Nenhum gate posterior poderá dispensar uma autorização humana obrigatória.

# 11. Critérios de conclusão

A P1 somente será considerada concluída quando:

- Os sete contratos estiverem implementados e validados.
- A canonicalização possuir testes de conformidade.
- Aprovações inválidas forem rejeitadas.
- O histórico de tentativas estiver preservado.
- A reconciliação de tentativas órfãs for demonstrada.
- O rollback controlado for demonstrado.
- Fixtures não contaminarem o repositório principal.
- Resultados falsos forem detectados.
- Arquivos fora do escopo forem detectados.
- RED → GREEN for demonstrado com evidências.
- Testes tautológicos forem rejeitados.
- Testes protegidos não puderem ser modificados sem autorização.
- Handoffs inválidos forem rejeitados.
- A proteção de governança for testada.
- O isolamento preventivo for comprovado.
- Falhas de isolamento bloquearem os gates aplicáveis.
- Nenhum retry automático ocorrer.
- Relatórios estruturados e legíveis forem gerados.
- Nenhuma modificação ocorrer no IAS.
- A revisão independente final for concluída.
- A aprovação humana final for registrada.

Não declarar qualquer critério como validado sem evidência de execução.

# 12. Decisões preservadas

| Decisão | Resultado |
|---|---|
| Stack | Node.js 24 + TypeScript |
| Contratos | JSON |
| Schemas | JSON Schema Draft 2020-12 |
| Persistência | Arquivos locais |
| Executor P1 | Sintético determinístico |
| Execução | Serial |
| Retries automáticos | Desabilitados |
| Codex e Antigravity | Reservados à P2 |
| Dados | Exclusivamente sintéticos |
| Banco de dados | Não utilizar |
| Integrações externas | Desabilitadas |
| Merge/push automáticos | Desabilitados |

# 13. Resolução das pendências técnicas

| ID | Pendência | Definição consolidada |
|---|---|---|
| P1-DEC-001 | Bibliotecas | Ajv, ajv-formats, TypeScript, @types/node e módulos nativos; versões exatas registradas em P1-001 |
| P1-DEC-002 | Schemas | Sete schemas JSON Draft 2020-12, alinhados à P0 |
| P1-DEC-003 | Canonicalização | RFC 8785, identificador `JCS-RFC8785-v1`, com testes de conformidade |
| P1-DEC-004 | Registros humanos | Isolamento preventivo comprovado e verificação independente de integridade |
| P1-DEC-005 | Timeouts | 10s padrão, 1s no SYN-003 e captura limitada a 1 MiB por stream |
| P1-DEC-006 | Fixtures | Repositórios Git independentes em `worktrees/<execution-id>/<attempt-id>/workspace/` |
| P1-DEC-007 | Isolamento WSL2 | Experimento com isolamento de filesystem; bloqueio se a prevenção não for comprovada |
| P1-DEC-008 | Relatórios | JSON estruturado e Markdown legível em `docs/evidence/` |

As definições desta seção constituem **propostas de decisão técnica para aprovação juntamente com a v0.2.0**.

Nenhuma delas deverá ser tratada como comprovada por execução antes da realização dos testes correspondentes.

# 14. Rastreabilidade dos achados P1-REV

| Achado | Tratamento |
|---|---|
| P1-REV-001 | RED → GREEN, SYN-009, SYN-010 e proteção de testes |
| P1-REV-002 | Consolidação das oito decisões técnicas |
| P1-REV-003 | FixtureWorkspaceManager, Reconciler e rollback |
| P1-REV-004 | Isolamento preventivo e integridade independente |
| P1-REV-005 | Validação semântica do ReviewHandoffPackage |
| P1-REV-006 | Substituição do diagrama corrompido |
| P1-REV-007 | Política Zero-Dependency First |

As correções são documentais.

Não há evidência de implementação ou validação operacional nesta versão.

## Recomendações não bloqueantes da revisão P1-REV-R2

- **P1-REV-R2-001:** Durante P1-005, avaliar `bubblewrap` e, se necessário,
  `unshare` como mecanismos candidatos de isolamento no WSL2.
  A eficácia deverá ser demonstrada experimentalmente.

- **P1-REV-R2-002:** Durante P1-005, executar RED e GREEN em duas invocações
  controladas vinculadas ao mesmo `attempt_id`, preservando a integridade
  dos testes entre as fases. A falha RED deverá corresponder ao
  comportamento esperado, não apenas apresentar código de saída diferente de zero.

Estas recomendações não bloqueiam P1-START e não alteram a baseline
arquitetural aprovada.

# 15. Estado do planejamento

**Documento:** P1 — Plano Técnico de Implementação e Validação  
**Versão:** 0.2.0  
**Estado:** APROVADO — BASELINE DEFINITIVA  
**Baseline normativa:** P0 v0.3.0 — APROVADA  
**Revisão independente:** P1-REV-R2 — APROVADO COM RECOMENDAÇÕES  
**Aprovação humana:** Luís Henrique Pereira — 03/11/2026  
**Stack:** APROVADA  
**Executor sintético:** APROVADO  
**Decisões técnicas P1-DEC-001 a P1-DEC-008:** APROVADAS  
**Gate P1-APV:** APROVADO  
**Implementação:** NÃO AUTORIZADA  
**Gate P1-START:** PENDENTE

## Próxima etapa

Submeter a v0.2.0 ao Gemini 4 Argon para:

1. Verificar a resolução dos achados P1-REV-001 a P1-REV-007.
2. Confirmar compatibilidade com a baseline P0 v0.3.0.
3. Verificar ausência de alterações indevidas em contratos e conceitos.
4. Avaliar a viabilidade do isolamento proposto no WSL2.
5. Examinar a cobertura RED → GREEN e os testes negativos.
6. Confirmar que todas as entregas necessárias estão alocadas no backlog.
7. Identificar eventuais decisões ainda não resolvidas.
8. Emitir parecer de aprovação ou reprovação fundamentado.

Após o parecer independente, a aprovação documental dependerá de Luís Henrique Pereira.

**A implementação não poderá ser iniciada sem autorização explícita P1-START.**