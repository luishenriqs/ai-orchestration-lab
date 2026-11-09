# P2-001-R2-FIX — Relatório final de correções

**Projeto:** AI Orchestration Lab  
**Tarefa:** P2-001 — Operational Foundation  
**Estado:** Corrigido e validado; aguardando revisão adversarial R3  
**Branch:** `feat/p2-001-operational-foundation`  
**Baseline inicial:** `007e5e6de1829432b48de663080f034f66d4fe09`  
**Baseline P1:** `d54fadf4328cab1fede2c24e481855c3a02a4208`

## 1. Resumo executivo

Foram corrigidos os sete achados da revisão adversarial R2, reforçando o lifecycle, a reconciliação, a vinculação de gates a ciclos e artefatos atuais, a verificação do ledger e a aplicação de limites. O host permanece a autoridade de estado, autorização, identidade observada, gates e aprovação final. Não houve alteração dos contratos P1 nem execução de agentes reais.

**Resultado:** pronto para revisão adversarial R3. A validação final passou com 109 testes, incluindo os 80 testes/cenários P1 e os 16 cenários obrigatórios. Cobertura global: 94,65% de linhas.

O relatório e os scripts R2 não estavam disponíveis no checkout ou nos diretórios temporários pesquisáveis sem varredura de áreas pessoais. As correções foram implementadas contra os achados e critérios transcritos na autorização, com regressões equivalentes. Nenhuma reprodução foi atribuída aos artefatos ausentes.

## 2. Baseline Git inicial e final

| Item | Valor |
|---|---|
| Branch | `feat/p2-001-operational-foundation` |
| HEAD inicial | `007e5e6de1829432b48de663080f034f66d4fe09` |
| Commit P1 | `d54fadf4328cab1fede2c24e481855c3a02a4208` |
| Commit de correção | `9d4a29e47fd028a4cadc29b054f8ef632470f4e4` — `fix(p2-001): close adversarial workflow lifecycle gaps` |
| Commit P2-DEC-019 | `a4eb80923e6288492840493454c698e61e9da12d` — `docs(p2): record GPT strategic supervision decision` |
| HEAD após commits acima | `a4eb80923e6288492840493454c698e61e9da12d` |
| Working tree antes deste relatório | Limpa quanto a arquivos versionados; permanece somente o arquivo não rastreado preexistente `P2-001-EXECUTIVE-PLAN-v1.0.md:Zone.Identifier` |
| Remoto / `main` | Não alterados; sem merge ou push |

O relatório R2 `P2-001-INDEPENDENT-ADVERSARIAL-REVIEW-R2.md` e os scripts/saídas adversariais não foram encontrados no checkout. A procura limitada em `/tmp` não localizou tais artefatos. O relatório R1 de correções foi lido para manter o contexto dos controles já introduzidos. O arquivo `P2-001-EXECUTIVE-PLAN-v1.0.md:Zone.Identifier` foi preservado e não foi incluído em commits.

## 3. Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `src/workflow/ledger.ts` | Gates vinculados a fase/ciclo e evidências atuais; validação semântica de gates, PR-GATE e aprovação final durante `verify()`; falha com pendências passa por contenção; cancelamento inclui invocações `CREATED`; efeitos `BLOCKED` contam como reconciliados para cancelamento, mas não como sucesso; timeout bloqueia e solicita contenção; evidências de host vinculadas a artefatos; deduplicação por ID/cursor conflitante rejeitada. |
| `src/workflow/machine.ts` | Corrigidas transições de fase, retomada com fase `NONE`, cancelamento de invocação ainda não iniciada, eventos de contenção e falha após reconciliação. |
| `src/workflow/governance.ts` | Política central de paths aplicada na autorização inicial e na verificação de operação, incluindo traversal, caminhos absolutos, `.git` e interseção com `forbidden_changes`. |
| `src/workflow/protocol.ts` | Validação de predecessor não tautológica: genesis na primeira mensagem e hash predecessor válido nas seguintes. |
| `tests/unit/p2-workflow.test.ts` | Regressões dos achados R2 para histórico de falha, gate obsoleto, fail/cancel com trabalho ativo, invocação `CREATED`, timeout, efeito `BLOCKED`, cursor divergente, retomada e paths. |
| `docs/specifications/P2-DEC-019-GPT-Strategic-Supervision.md` | Registro documental da decisão aprovada, sem integração GPT nem alteração do plano v1.0. |
| `P2-001-R2-CORRECTION-FINAL-REPORT.md` | Este relatório. |

Os sete schemas e tipos P1, a persistência de `ExecutionAttempt` P1 e os módulos P1 não foram alterados. Não houve instalação de dependências.

## 4. Matriz F-01 a F-19

Os achados F-01 a F-19 foram tratados no pacote R1. Nesta execução, os controles preservados foram exercitados pela regressão integral e os pontos diretamente relacionados aos achados R2 foram reforçados. “Mantido/regredido” significa que os testes existentes voltaram a passar; não representa nova auditoria independente dos achados R1.

| Achado | Situação nesta execução | Evidência |
|---|---|---|
| F-01 | Mantido/regredido | Fluxo positivo exige aprovação confiável P1 MERGE e PR-GATE; APIs continuam rejeitando `APPROVE` com prova fornecida pelo chamador. |
| F-02 | Reforçado | `verify()` confere decisão e base do gate, e a transição exige o registro de gate atual correspondente. |
| F-03 | Mantido/regredido | Identidade continua vinculada à invocação observada; identidade não autorizada/UNKNOWN permanece bloqueada. |
| F-04 | Mantido/regredido | Catálogo host-side e resolução canônica continuam na regressão P2. |
| F-05 | Mantido/regredido | Autorização atual e revogação verificadas pelo ledger; operações continuam bloqueadas após revogação. |
| F-06 | Mantido/regredido | Prova de sandbox continua exigida em WRITE/LOCAL_COMMIT e revalidada no dispatch. |
| F-07 | Reforçado | Timeout de workflow/invocação agora persiste BLOCK e solicita cancelamento/contensão; expiração segue bloqueando progresso. |
| F-08 | Reforçado | Eventos de invocação respeitam estado do workflow; sucesso após cancelamento não é aceito; chegada tardia é limitada à contenção. |
| F-09 | Reforçado | Cancelamento e falha verificam invocações/efeitos pendentes; uma invocação `CREATED` é encerrável sem processo. |
| F-10 | Mantido/regredido | Limites globais/tarefa e reserva persistente permanecem cobertos pela suíte. |
| F-11 | Mantido/regredido | Limite de mensagem usa o valor efetivo da autorização e cursor permanece persistente e monotônico. |
| F-12 | Mantido/regredido | `RESUME` produz fase válida e continua condicionado a autorização e TASK-READY. |
| F-13 | Reforçado | Invocações históricas FAILED não bloqueiam conclusão quando o conjunto atual de autoria, revisão e validação é válido; nenhuma invocação pendente é permitida. |
| F-14 | Mantido, risco residual | Append/hash chain e recuperação continuam; não foi introduzida âncora externa contra reescrita integral do armazenamento. |
| F-15 | Mantido/regredido | Parsing de lock/eventos e erros tipados continuam exercitados pelos testes P1/P2. |
| F-16 | Reforçado | Revogação também move workflow ACTIVE para contenção e cancela invocações não iniciadas, STARTING ou RUNNING. |
| F-17 | Reforçado | Paths iniciais e destinos são validados pela mesma política central; traversal, absoluto, `.git` e paths proibidos são rejeitados. |
| F-18 | Reforçado | Testes adicionais agora verificam falhas de ciclo, reconciliação, gate obsoleto, timeout e replay de cursor. |
| F-19 | Reforçado | Duplicata com mesmo `source_event_id` e cursor diferente conflita; predecessor exige genesis ou hash válido. |

## 5. Matriz R2-FIX-01 a R2-FIX-07

| Pacote | Status | Alteração e evidência |
|---|---|---|
| R2-FIX-01 — Invocações históricas | Corrigido | Removida a exigência de sucesso histórico universal. A conclusão exige invocações assentadas e autoria/revisão independente/validação bem-sucedidas vinculadas a artefato atual. Teste de fluxo conserva uma invocação PLANNER FAILED no histórico e conclui com artefato atual validado. |
| R2-FIX-02 — Gates obsoletos | Corrigido | Gate registra fase, ciclos, autorização e hash da base de evidências; a transição compara a base atual e `verify()` reconstrói evidência e valida o vínculo do gate. Novo artefato após REVIEW-GATE torna o gate obsoleto e impede avanço. |
| R2-FIX-03 — Deadlocks | Corrigido | FAIL com processo/efeito pendente entra em `CANCEL_REQUESTED`, solicita contenção e só terminaliza após reconciliação; `CREATED` é cancelado sem processo; efeito `BLOCKED` não impede cancelamento, mas continua insuficiente para retomada/sucesso. Testes cobrem os três casos. |
| R2-FIX-04 — RESUME/NONE | Corrigido | Retomada de fase `NONE` inicializa em `PLANNING`; teste da máquina confirma que `ACTIVE/NONE` não é produzido. |
| R2-FIX-05 — Paths de autorização | Corrigido | `authorizeWorkflow` e `checkAuthorization` chamam validador central; teste rejeita traversal e interseção com mudança proibida. |
| R2-FIX-06 — Timeout e `verify()` | Corrigido | Orçamento excedido registra BLOCK e cancela invocação ativa. `verify()` valida gates, vínculos P1 PR-GATE, snapshot de confiança, aprovação final, artefato, revisão e evidência. Teste de relógio avança além do limite e observa workflow BLOCKED/invocação CANCEL_REQUESTED. |
| R2-FIX-07 — Deduplicação/protocolo | Corrigido | Reuso de `source_event_id` com cursor divergente resulta em `SOURCE_EVENT_CONFLICT`; predecessor inválido é rejeitado por regra não tautológica. |

### Matriz P2R2-001 a P2R2-007

| Achado | Status | Evidência |
|---|---|---|
| P2R2-001 — Histórico de invocações | Corrigido | Teste do fluxo válido mantém tentativa anterior FAILED, sem omitir o histórico, e completa com o trabalho vigente. |
| P2R2-002 — Gate obsoleto | Corrigido | Teste altera o conjunto de artefatos após gate de revisão; avanço é negado. |
| P2R2-003 — Deadlocks | Corrigido | Testes de FAIL com trabalho ativo, cancelamento de CREATED e efeito BLOCKED reconciliado. |
| P2R2-004 — RESUME em NONE | Corrigido | Retomada inicia em PLANNING. |
| P2R2-005 — Paths | Corrigido | Autorizações e destinos rejeitam traversal/paths proibidos. |
| P2R2-006 — Duração e `verify()` | Corrigido | Limite gera contenção; validação semântica do ledger exercitada pelo fluxo G5 e regressão. |
| P2R2-007 — Cursor/predecessor | Corrigido | Teste rejeita cursor divergente para o mesmo evento; suíte valida framing e hash predecessor. |

## 6. Evidências RED e GREEN

Os scripts R2 ausentes não puderam ser executados. Os casos foram reproduzidos como testes locais equivalentes. No ciclo inicial RED, os testes para retomada em `NONE`, autorização de paths inválidos e cursor divergente falharam contra a implementação anterior; o teste de fluxo também expôs a exigência incorreta de gate ao sair de PLANNING. Após correções, os mesmos comportamentos ficaram verdes. Os testes adicionados posteriormente para contenção, gate obsoleto, histórico de falha e timeout passaram na suíte integrada final.

| Comportamento | RED observado | GREEN final |
|---|---|---|
| Histórico de invocação falhada não bloqueia resultado válido | O código anterior tinha condição explícita que rejeitava qualquer invocação histórica não-SUCCEEDED; o primeiro teste integrado encontrou antes o gate prematuro, então esse RED não foi capturado isoladamente | Fluxo G5/R2 termina COMPLETED e mantém o registro FAILED |
| Gate de revisão obsoleto | Sem invalidade de base em novo artefato | Avanço para EXECUTING rejeitado |
| FAIL com processo ativo | Estado terminal prematuro era possível | CANCEL_REQUESTED, reconciliação e FAILED após confirmação |
| Invocação CREATED ao cancelar | Podia permanecer pendente | CANCELLED sem processo e workflow cancelável |
| Limite de duração | Erro sem mudar workflow ACTIVE | BLOCKED e invocação CANCEL_REQUESTED |
| Paths inválidos | Autorização podia aceitar entrada inválida | Autorização negada |
| Cursor divergente | Replay podia ser aceito como duplicata idêntica | `SOURCE_EVENT_CONFLICT` |

O RED acima reflete o comportamento da implementação anterior comprovado por execução local inicial; logs transitórios de RED não foram mantidos como artefatos versionados. Nenhum teste foi removido para obter aprovação.

## 7. Validação consolidada

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | Passou |
| `npm run build` | Passou |
| `npm test` | **109 passaram, 0 falharam** |
| Testes/casos P1 na regressão | **80 passaram**, incluindo **16/16 cenários P1** |
| Testes P2 | 29 passaram |
| `npm run test:coverage` | Passou; linhas **94,65%**, branches **77,14%**, funções **96,04%** |
| Cobertura de `src/workflow/ledger.ts` | Linhas **96,05%**, branches **72,91%**, funções **97,73%** |
| `git diff --check` | Passou antes dos commits; sem whitespace errors |
| Diagnósticos adversariais R2 originais | Não executados: arquivo/script não encontrado |
| Agentes reais / isolamento real de CLIs | Não executados; fora do escopo P2-001-R2-FIX |

O teste de cobertura executou a mesma suíte: 109 aprovados, 0 falhas. Typecheck, build e suíte completa foram executados após as alterações de código; a renomeação posterior dos títulos dos testes não mudou seu conteúdo.

## 8. Compatibilidade com P1

- Os contratos e schemas P1 não foram modificados.
- A suíte preserva os testes de contratos, aprovação MERGE, execução, evidências, isolamento sintético e os 16 cenários P1.
- O workflow P2 continua separado de `ExecutionAttempt` P1.
- Gates continuam relacionados aos mecanismos host-side e às verificações P1; aprovação final requer aprovação MERGE confiável e binding PR-GATE.
- Nenhum agente real foi executado e nenhuma alegação de isolamento real de Codex, Gemini ou Antigravity foi feita.
- O ledger continua com hash chain local, sem promessa de resistência a reescrita integral por ator com controle de armazenamento e sem âncora externa.

## 9. Riscos residuais e limitações

1. Relatório/scripts R2 independentes indisponíveis; os testes equivalentes derivam dos achados resumidos na autorização e não substituem a revisão R3.
2. A integridade encadeada detecta adulteração localizada e inconsistência de sequência; reescrita/truncamento integral da cauda não possui âncora externa no planejamento atual.
3. Provas de sandbox continuam simuladas no P2-001; o isolamento de cada provider/CLI deve ser demonstrado antes de escrita real em etapa posterior.
4. Identidade VERIFIED representa correspondência da configuração e metadados observados disponíveis, não autenticação criptográfica do fornecedor.
5. Controles de rede/processos, quotas de CPU/memória e custos reais dependem dos adapters e enforcement operacional posteriores.

Nenhum risco residual identificado autoriza considerar a execução de agentes reais comprovada nesta etapa.

## 10. Decisão P2-DEC-019

A decisão aprovada por Luís foi registrada em [`P2-DEC-019-GPT-Strategic-Supervision.md`](docs/specifications/P2-DEC-019-GPT-Strategic-Supervision.md) e commitada separadamente. O texto define o GPT como supervisor estratégico e o orquestrador como controlador operacional sujeito a validações determinísticas do host. O registro não altera contratos do P2-001, não integra GPT e não inicia P2-002/P2-004.

## 11. Instruções de reprodução

Na raiz do repositório:

```sh
npm run typecheck
npm run build
npm test
npm run test:coverage
git diff --check
```

Para a suíte P2 focalizada:

```sh
npm run build
node --test --test-isolation=none --test-concurrency=1 --test-reporter=spec dist/tests/unit/p2-workflow.test.js
```

Os comandos de validação produziram os resultados registrados acima. Para R3, priorizar gates após correção, efeitos BLOCKED/UNKNOWN, eventos tardios após cancelamento, verificação semântica do journal e vinculações entre artefatos, revisão, validação e aprovação.

## 12. Recomendação para R3

**Recomendação:** iniciar revisão adversarial independente R3 sobre o HEAD `a4eb80923e6288492840493454c698e61e9da12d`, acrescido do commit deste relatório. Focar nos 7 casos R2 e nas regressões indicadas. A implementação não está homologada; não houve merge, push ou publicação.
