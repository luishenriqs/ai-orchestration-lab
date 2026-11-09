# AI Orchestration Lab — P2-001: Plano Executivo v1.0

**Data:** 09/11/2026  
**Estado:** consolidado para homologação humana; **implementação não autorizada**  
**Autoridade:** Luís Henrique Pereira  
**Base de análise:** `main` em `d54fadf4328cab1fede2c24e481855c3a02a4208`, conforme levantamento e revisões fornecidos. Não houve inspeção direta do repositório nesta consolidação.

## 1. Objetivo e limites

P2-001 especificará e, somente após autorização futura, implementará contratos, protocolo de eventos, lifecycle, autorização, persistência e políticas de segurança para workflows multiagentes. Os testes deste marco usam **adapters simulados**, sem invocar Codex, Gemini ou Antigravity reais. Integração operacional e provas de isolamento de CLIs reais pertencem a P2-002 e posteriores.

O P1 permanece como baseline: sete contratos JSON Schema fechados, parsing estrito, canonicalização RFC 8785 e SHA-256, `ExecutionAttempt`, journal, `TASK-READY`, `ValidationGate`, `PR-GATE`, evidências host-side e executor sintético. A regressão obrigatória é de 80 testes e 16 cenários, conforme homologação P1; tais testes não comprovam integração real.

## 2. Registro de decisões

### 2.1 Homologadas por Luís

| ID | Regra |
|---|---|
| P2-DEC-001 | Agentes iniciais: Codex, Gemini e Antigravity. |
| P2-DEC-002 | Aprovação humana no início e no final da tarefa. |
| P2-DEC-003 | Uma worktree Git isolada por tarefa. |
| P2-DEC-004 | Revisor utiliza modelo ou fornecedor diferente do autor. |
| P2-DEC-005 | Nenhum retry operacional automático inicialmente. |
| P2-DEC-006 | Limites configuráveis por tarefa. |
| P2-DEC-007 | Commit local permitido; merge/push somente após aprovação final. |
| P2-DEC-008 | Limites operacionais obrigatórios; custo e tokens registrados quando disponíveis, `UNKNOWN` quando não. Não há garantia de teto monetário. |

### 2.2 Propostas para homologação — não presumir aprovação

| ID | Regra proposta |
|---|---|
| P2-DEC-009 | Uma invocação ativa por workflow. |
| P2-DEC-010 | Espera por aprovação humana não consome tempo ativo do workflow. |
| P2-DEC-011 | Identidade de modelo desconhecida bloqueia revisão independente. |
| P2-DEC-012 | Identidade comparada por provider e modelo canônico em catálogo host-side. |
| P2-DEC-013 | Cancelamento permitido antes da execução. |
| P2-DEC-014 | Mensagem interna como JSON completo, estrito, versionado. |
| P2-DEC-015 | Deduplicação e replay governados por journal persistente. |
| P2-DEC-016 | Custo `UNKNOWN` permite continuidade dentro de limites operacionais; sem alegar teto monetário. |
| P2-DEC-017 | Escrita real requer prova de isolamento vinculada à configuração exata do agente. |
| P2-DEC-018 | Defaults globais provisórios da seção 9. |

Os nomes de contratos, estados e arquivos novos são propostas normativas deste plano, não uma alteração já efetuada no código.

## 3. Modelo de ameaças e invariantes (G1)

O host é a autoridade de estados, aprovações, limites, journal e evidências. Adapter traduz entradas/saídas; o agente e seu conteúdo são não confiáveis para decisões de autorização. Worktree organiza alterações Git, **não constitui sandbox**. Evidências e autorizações devem ficar fora da superfície gravável do executor.

Invariantes: (I1) efeito exige autorização válida; (I2) agente não amplia escopo; (I3) sucesso declarado não substitui observação host; (I4) revisão exige identidade verificável e independência; (I5) efeito incerto não é redespachado; (I6) merge/push exigem aprovação final vinculada ao diff; (I7) mensagem não altera diretamente estado autoritativo; (I8) limites controláveis são aplicados; (I9) escrita real exige prova de isolamento; (I10) journal append-only e íntegro.

Entregável G1: matriz ameaça → invariante → controle/gate → teste simulado → prova operacional futura. Não afirmar proteção efetiva de CLIs antes do P2-002.

## 4. Entidades e cardinalidades (G2)

- `Workflow`: tarefa, contrato, autorização, revisão, fase, estado e journal. Um workflow possui 0..N invocações, no máximo uma ativa.
- `AgentInvocation`: chamada individual, papel, identidade observada, entrada, processo/sessão, resultado e tempo. Possui 0..N mensagens e 0..1 `ExecutionAttempt` vinculada; nova tentativa operacional requer nova invocação.
- `AgentMessage`: envelope normalizado; pertence a workflow e invocação, salvo evento host de controle tipado.
- `NativeSession`: referência opaca opcional do provedor; jamais chave autoritativa.
- `AgentCapability`: produto, versão, capacidades declaradas/observadas e permissões autorizadas separadamente.
- `WorkflowAuthorization`: documento versionado derivado/composição de `ApprovalRecord`, com referência imutável e única autoridade host-side; jamais um grant concorrente.
- `EffectRecord`: `effectId`, autorização, intenção, observação e estado de reconciliação.

IDs internos são atribuídos pelo host. IDs externos e sessões nativas são dados observados. Novos contratos devem usar JSON Schema Draft 2020-12 fechado, parsing estrito, canonicalização RFC 8785, hash SHA-256 e versionamento próprio; não acrescentar campos aos schemas históricos P1 sem migração aprovada.

## 5. Estados e transições (G2/G4a)

Estados globais: `CREATED`, `AUTHORIZED`, `ACTIVE`, `AWAITING_APPROVAL`, `BLOCKED`, `CANCEL_REQUESTED`, `CANCELLED`, `REJECTED`, `FAILED`, `COMPLETED`. Os quatro últimos, exceto `CANCEL_REQUESTED`, são terminais quando `CANCELLED`, `REJECTED`, `FAILED` ou `COMPLETED`.

| Origem | Evento | Destino | Guarda essencial |
|---|---|---|---|
| CREATED | AUTHORIZE / REJECT / CANCEL | AUTHORIZED / REJECTED / CANCELLED | Autorização válida / decisão humana / sem efeitos |
| AUTHORIZED | START / CANCEL / REVOKE | ACTIVE / CANCELLED / BLOCKED | Gates válidos / sem processo / revogação registrada |
| ACTIVE | ADVANCE_PHASE | ACTIVE | Gate da fase e limites válidos |
| ACTIVE | REQUEST_FINAL_APPROVAL | AWAITING_APPROVAL | Validação, revisão, evidências e invocações encerradas |
| ACTIVE | BLOCK / FAIL / CANCEL / REVOKE | BLOCKED / FAILED / CANCEL_REQUESTED / CANCEL_REQUESTED | Motivo observado; revogação bloqueia progresso imediatamente |
| AWAITING_APPROVAL | APPROVE / REJECT / CANCEL / REVOKE | COMPLETED / REJECTED / CANCELLED / BLOCKED | Aprovação ligada ao resultado / decisão humana / sem efeitos / revogação |
| BLOCKED | RESUME / FAIL | ACTIVE / FAILED | Causa resolvida e **nova autorização quando a anterior expirou/revogou** / irrecuperável |
| BLOCKED | CANCEL_NO_EFFECT | CANCELLED | Ausência comprovada de processos e efeitos pendentes |
| BLOCKED | CANCEL | CANCEL_REQUESTED | Pendências presentes ou desconhecidas |
| CANCEL_REQUESTED | CONFIRM_CANCEL / CANCEL_UNCERTAIN | CANCELLED / BLOCKED | Processos/filhos encerrados e efeitos reconciliados / incerteza persistente |

Outras arestas são inválidas. Eventos tardios em estado terminal são auditáveis mas não reabrem a projeção. `ACTIVE.phase` é persistido e segue `PLANNING → REVIEWING → EXECUTING → VALIDATING`; voltas `REVIEWING → PLANNING` e `VALIDATING → EXECUTING` consomem ciclos autorizados. Rejeição, falha e cancelamento não são intercambiáveis.

`AgentInvocation` tem estados `CREATED`, `STARTING`, `RUNNING`, `CANCEL_REQUESTED`, `SUCCEEDED`, `FAILED`, `INTERRUPTED`, `CANCELLED`, `BLOCKED`:

| Origem | Evento | Destino |
|---|---|---|
| CREATED | START / BLOCK | STARTING / BLOCKED |
| STARTING | PROCESS_STARTED / START_FAILED / INTERRUPTED / CANCEL | RUNNING / FAILED / INTERRUPTED / CANCEL_REQUESTED |
| RUNNING | RESULT_SUCCESS / RESULT_FAILURE / INTERRUPTED / CANCEL | SUCCEEDED / FAILED / INTERRUPTED / CANCEL_REQUESTED |
| CANCEL_REQUESTED | CONFIRM_CANCEL / RESULT_UNCERTAIN / RESULT_FAILURE | CANCELLED / INTERRUPTED / FAILED |

Sucesso exige evento terminal válido, encerramento consistente, identidade/correlação, protocolo íntegro e observação host-side; nunca aprova automaticamente o workflow. `PROCESS_STARTED` tardio durante cancelamento exige contenção e reconciliação, não retorno a RUNNING. `ExecutionAttempt` P1 preserva seus estados próprios.

## 6. Protocolo, ledger e replay (G2/G3/G4a)

Envelope JSON interno UTF-8 completo: `protocolVersion`, `messageId`, `workflowId`, `invocationId`, `correlationId`, `replyToMessageId?`, `sourceEventId?`, `sourceCursor?`, `sequence`, `messageType`, `payload`, `payloadSha256`, `observedAt`, `previousEventHash`, `eventHash`. Os IDs internos, sequência e horário autoritativo são atribuídos pelo host. IDs e cursores externos são observações, não autoridade.

Um único ledger append-only por workflow contém eventos de workflow, invocação, mensagens, decisões, autorização/revogação, intenções, resultados e reconciliação. Sequência global monotônica sob exclusão mútua; projeção derivada e revalidada na recuperação.

**Fórmula normativa da ressalva R2-01:** `payloadSha256 = SHA256(UTF8(JCS(payload)))`. `eventHash = SHA256(UTF8(JCS(eventWithoutEventHash)))`, incluindo `eventId`, `workflowId`, `sequence`, `eventType/messageType`, `payload`, `observedAt`, `previousEventHash` e demais campos persistidos do envelope, exceto `eventHash`. O primeiro `previousEventHash` usa sentinela versionada fixa a definir no schema; não usar valor implícito. Campos voláteis são fixados pelo host antes da canonicalização. Hash não autentica usuário ou fornecedor.

Deduplicação: `(workflowId, invocationId, sourceEventId)` quando estável; caso contrário `(workflowId, invocationId, sourceCursor)` comprovadamente estável entre reinícios. Mesmo ID + mesmo hash retorna registro/ack anterior sem reaplicar efeito; mesmo ID + hash diferente bloqueia. Ausência de ID e cursor confiáveis impede desencadear efeitos. `messageId` host-side não prova que uma reentrega é nova. Cursor ausente/reiniciado sem reconciliação bloqueia. JSON/JSONL incompleto, versão desconhecida, UTF-8 inválido, terminal ausente, exit 0 sem resultado terminal ou saída truncada não satisfazem sucesso.

Limites propostos: envelope interno completo até 1 MiB em bytes UTF-8; saída capturada até 10 MiB **por stream** (`stdout` e `stderr` medidos separadamente); resultados maiores como artefatos referenciados e controlados. Adapter normaliza streaming nativo, limita buffers antes do parse e não executa conteúdo de mensagem diretamente.

## 7. Operações incertas e recuperação (G4a)

Toda operação com efeito recebe `effectId`: `INTENT_RECORDED → DISPATCHED → OBSERVED → CONFIRMED`; incerteza leva a `UNKNOWN → RECONCILIATION_REQUIRED → CONFIRMED | BLOCKED`. Persistir intenção antes de dispatch, observar resultado e registrar conclusão. Se o host cair pós-dispatch e não puder provar o efeito, **não redespachar**, bloquear e exigir reconciliação ou decisão explícita. Não prometer exactly-once em API/CLI sem suporte. Uma invocação iniciada conta no limite mesmo se falhar; reserva pendente após crash exige inspeção antes de liberar ou contabilizar definitivamente.

## 8. Autorização, identidade e gates (G4b)

Autorização inicial vincula workflow, contrato/hash, repositório, baseline, worktree, paths, operações, agentes/modelos, limites, rede, expiração/revogação. Alteração de contrato, repositório, worktree, ampliação de escopo/rede/limite exige nova autorização; modelo autorizado trocado exige revalidação de identidade/independência; versão/configuração do adapter diferente invalida prova de isolamento; baseline divergente bloqueia até revalidação e nova aprovação humana se alterar materialmente o objeto aprovado. Revogação em ACTIVE gera CANCEL_REQUESTED, impede progresso e permite apenas contenção (encerrar, reconciliar, preservar evidência). Aprovação final vincula workflow, árvore/commit, diff, revisão, evidências e gates; mudança posterior invalida-a. Merge/push só depois de aprovação final revalidada antes de cada operação.

Independência: identidades do autor e revisor com status `VERIFIED` conforme configuração host corroborada por metadados compatíveis e catálogo versionado/hashado. `DECLARED`/`UNKNOWN` bloqueiam; alias conhecido normaliza ao modelo canônico. `independent = authorVerified && reviewerVerified && reviewerDidNotImplementArtifact && (providerDifferent || canonicalModelDifferent)`. **Ressalva R2-02:** registrar no ledger cada `artifactHash`/`diffHash` e invocações autoras, e vincular a invocação revisora; `reviewerDidNotImplementArtifact` deve ser testado contra essas relações, não só string autodeclarada. A evidência não equivale a atestado criptográfico do modelo real.

Mapear as novas verificações como especializações de `TASK-READY`, `ValidationGate` e `PR-GATE`, justificando qualquer gate adicional. Uma decisão host-side não é executada pelo conteúdo de um agente.

## 9. Limites e prova de isolamento (G4c)

Limite efetivo comparável = `min(taskLimit, globalMaximum)`; valores ausentes, inválidos, negativos ou overflow são rejeitados quando obrigatórios. Defaults globais **provisórios**: workflow ativo 120 minutos, invocação 20 minutos, 30 invocações, 5 ciclos de revisão, 5 de correção, saída 10 MiB por stream, envelope 1 MiB, retry operacional 0. Espera em `AWAITING_APPROVAL` não consome duração ativa e não pode manter invocação aberta. Reserva de invocação atômica antes do dispatch; planejar/revisar/executar/validar via agente contam; teste host local não. Custo/tokens indisponíveis são `UNKNOWN`, nunca zero, sem garantia de teto financeiro; continuidade dentro dos limites operacionais é permitida pela política proposta.

Escrita real é negada sem registro host-side válido de isolamento associado a provider, produto, versão, configurationHash, sandboxProfileHash, permissionSetHash, testEvidenceHash, validade e status. P2-001 só testa a decisão com registros falsos; P2-002 deve provar o isolamento real por agente/configuração, incluindo filesystem, credenciais, rede, filhos, plugins/MCP, logs e evidências. Worktree não é sandbox.

## 10. Gates de trabalho e entregáveis

| Gate | Entrega | Aceite / evidência | Rollback |
|---|---|---|---|
| G1 | Threat model e invariantes | Matriz ameaça → controle → gate → teste; distinção entre prova simulada e operacional | Reverter somente documentos/configuração P2 |
| G2 | Entidades, protocolo e máquinas de estados | Cardinalidades, tabelas completas, framing, replay, cancelamento; fixtures válidas/inválidas | Reverter módulos P2 novos |
| G3 | Schemas/validadores versionados | RED/GREEN estrutural e relacional, vetores JCS, P1 intacto | Restaurar versão P2 sem reescrever P1 |
| G4a | Ledger, workflow e reconciliação | Crash antes/depois dispatch, corrupção, projeção, UNKNOWN sem retry | Descartar stores de fixture preservando evidências |
| G4b | Autorizações e independência | Revogação, expiração, mutação de escopo, autoria/revisão, aprovação final | Reverter grants de fixture, nunca histórico autoritativo |
| G4c | Limites e gates | Reservas, teto, UNKNOWN, certificado sandbox falso/incompatível | Reverter fixtures/configuração P2 |
| G5 | Validação integrada simulada | Matriz adversarial, regressão P1 (80 testes/16 cenários), relatório e hashes | Remover apenas fixtures descartáveis |

Requisitos mínimos negativos: replay com ID/cursor; ID conflitado; revogação em ACTIVE; contenção após revogação; arestas inválidas de invocation; PROCESS_STARTED tardio após cancelamento; BLOCKED com efeito incerto; ledger adulterado; crash pós-dispatch; `UNKNOWN` sem redespacho; alias/modelo igual; identidade UNKNOWN; autoria/revisão conflitante; autorização alterada; limites excedidos; certificado de sandbox ausente/divergente. Positivo: workflow simulado até `AWAITING_APPROVAL` e `COMPLETED` **somente** após aprovação final simulada explicitamente identificada como tal.

## 11. Riscos e condições de entrada nos marcos seguintes

- Integração com Codex/Gemini/Antigravity e descoberta de identidade efetiva não são comprovadas no P2-001.
- P2-002 requer testes de contrato por versão do adapter, autenticação com segregação de segredos, parser de saída e prova preventiva de isolamento antes de qualquer escrita.
- Persistência/retomada nativa de provedor não substitui workflow/journal interno.
- Limites monetários não são garantidos se provider só informa uso posteriormente.
- Hash detecta adulteração relativa ao domínio host confiável, não fornece autenticidade por si só.
- Nenhuma operação real no IAS ou outro projeto está autorizada por este plano.

## 12. Rastreabilidade de revisão e homologação

Revisões anteriores: v0.2, v0.3, v0.4 e v0.5 reprovadas; adendo v0.6 **aprovado com três ressalvas não bloqueantes**. Os sete achados P2R5-001..007 foram declarados resolvidos pelo revisor. Esta consolidação incorpora: (R2-01) fórmula de hash; (R2-02) autoria vinculada por artefato/diff e invocation; (R2-03) `PROCESS_STARTED` tardio após cancelamento implica contenção e reconciliação, nunca retomada.

### Pendências para homologação humana

1. Aprovar ou ajustar as propostas P2-DEC-009..018.
2. Confirmar máximos globais provisórios (120 min, 20 min, 30 invocações, 5+5 ciclos, 10 MiB/stream, 1 MiB/envelope).
3. Confirmar que a aprovação deste **plano** não autoriza implementação. Cada gate futuro requer autorização de execução conforme governança acordada.

**Status final:** pronto para apreciação/homologação do planejamento, sem autorização para implementar, executar agentes reais, criar commits, merge ou push.
