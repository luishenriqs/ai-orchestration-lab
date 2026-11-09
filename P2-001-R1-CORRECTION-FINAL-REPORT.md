# P2-001 — Relatório final de correções da revisão R1

**Projeto:** AI Orchestration Lab  
**Tarefa:** P2-001 — Operational Foundation  
**Estado:** Implementação corrigida, validada e aguardando revisão adversarial R2  
**Baseline:** `feat/p2-001-operational-foundation` em `6bbc83341dc1ce8530a60044d24b1b20010d3b9d`  
**Baseline P1:** `d54fadf4328cab1fede2c24e481855c3a02a4208`

## 1. Resumo executivo

O pacote de correções reforçou o ledger como autoridade para autorização, identidade, gates, efeitos e aprovação final. Provas e booleanos enviados por chamadores deixaram de promover o workflow ou de liberar efeitos. A aprovação final agora exige autorização P1 de escopo MERGE, verificação host-side do PR-GATE, autoria/revisão/evidências registradas e vínculos exatos ao workflow e ao diff.

Foram acrescentadas regressões para o bypass de aprovação e gate, identidade declarada pelo chamador, snapshot da configuração confiável, expiração pelo relógio host, limites de mensagem, cursor regressivo, reserva idempotente, workflow simulado positivo, revogação, recuperação, sandbox/path e locks malformados.

**Resultado técnico:** pronto para revisão independente R2, sem homologação técnica ou humana nesta etapa. A suíte completa passou com 101 testes; os 16 cenários P1 passaram. Cobertura global será registrada abaixo após a execução final do relatório de cobertura.

## 2. Baseline Git inicial e final

| Item | Valor |
|---|---|
| Branch | `feat/p2-001-operational-foundation` |
| HEAD inicial | `6bbc83341dc1ce8530a60044d24b1b20010d3b9d` |
| Commit P1 | `d54fadf4328cab1fede2c24e481855c3a02a4208` |
| Commit de correção | `c697f0a` — `fix(p2): enforce host-authoritative workflow governance` |
| Working tree inicial | Limpa quanto a alterações rastreadas; apenas `P2-001-EXECUTIVE-PLAN-v1.0.md:Zone.Identifier` preexistente e não rastreado |
| HEAD final | A preencher após commits locais abaixo |
| Main/remoto | Não alterados; sem merge ou push |

O plano v1.0 foi lido e tratado como normativa desta execução, conforme autorização de Luís posterior ao texto histórico que ainda dizia implementação não autorizada. O relatório e scripts R1 (`P2-001-INDEPENDENT-ADVERSARIAL-REVIEW-R1.md`, `adversarial.mjs` e `adversarial.out.json`) não estavam presentes no checkout. Nenhum resultado foi atribuído a esses artefatos ausentes. Os achados e IDs descritos na autorização foram convertidos em regressões locais equivalentes.

## 3. Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `src/workflow/ledger.ts` | Autoridade derivada do journal, validação de autorização atual, identidade/catalog, gates calculados, provas de aprovação final, expiração, contenção, deduplicação, atomicidade, recuperação, path/sandbox, limites e erros tipados |
| `src/workflow/machine.ts` | Máquina pública não aceita `APPROVE` baseado em prova fornecida por chamador; projeção privada de conclusão validada pelo ledger |
| `src/workflow/governance.ts` | Catálogo sem aliases conflitantes, resolução coerente de metadados e paths sem traversal/`.git`; removida fábrica pública de prova final |
| `src/workflow/effects.ts` | Intent inclui autorização, operação, destino, hash de sandbox e hash do payload |
| `src/workflow/types.ts` | Opções de autoridade host-side, observações e vinculações do P1; intent com destino e autorização persistidos |
| `schemas/p2-agent-message.schema.json` | Cursor estável decimal e remoção de `CONTROL_EVENT` da mensagem de agente |
| `schemas/p2-effect-record.schema.json` | Vínculos de autorização/destino/sandbox obrigatórios conforme operação |
| `tests/unit/p2-workflow.test.ts` | Regressões adversariais, ciclos de sucesso/rejeição, expiração, limites e recuperação |
| `P2-001-R1-CORRECTION-FINAL-REPORT.md` | Este relatório |

Os sete schemas P1, os tipos P1, os módulos P1 de execução/governança/evidências e os contratos históricos não foram modificados. Nenhuma dependência foi instalada. Nenhum agente real foi iniciado.

## 4. Matriz F-01 a F-19

| Achado | Status | Correção/evidência |
|---|---|---|
| F-01 | Corrigido | `transitionWorkflowEvent(APPROVE)` rejeita prova arbitrária; `recordFinalApproval()` exige aprovação MERGE P1 confiável, PR-GATE configurado, autorização vigente e referências registradas. Fluxo positivo simulado cobre conclusão legítima. |
| F-02 | Corrigido | Gates não são aceitos do contexto do chamador. `evaluateGate()` deriva decisão de invocações, autoria, revisão independente e evidências persistidas. Teste de caller gate falso rejeitado. |
| F-03 | Corrigido | Identidade é re-resolvida pelo catálogo host-side; `allowed_agents` verificado; UNKNOWN/divergência bloqueiam. Contexto de transição de invocação é ignorado e observações fixture são registradas pelo ledger. |
| F-04 | Corrigido | Catálogo e confiança são snapshots imutáveis do host; hash do catálogo e metadados observados precisam corresponder; alias ambíguo é rejeitado. Teste de mutação do objeto original e de identidade forjada. |
| F-05 | Corrigido | Operações derivam somente da autorização selecionada no workflow e da lista de confiança host-side; contrato, hash, repositório, baseline e worktree são vinculados. |
| F-06 | Corrigido | WRITE/LOCAL_COMMIT exigem perfil e validação de sandbox host-side correspondentes ao provider/produto/versão/configuração. Prova é reavaliada no dispatch e vinculada ao efeito. |
| F-07 | Corrigido | Relógio injetado/host é autoridade; expiração antes de progresso grava BLOCKED e cancela invocação ativa. Mensagem, invocação, operação, gate e aprovação são bloqueados após expiração. |
| F-08 | Corrigido | Estado da invocação é projetado do ledger; transições de sucesso exigem observações de processo e resultado; workflow não ativo/revogado não aceita progresso. |
| F-09 | Corrigido | Ausência de pendências em cancelamento é derivada de invocações/efeitos projetados, não de booleano; recuperação reporta pendências mesmo em estado terminal. |
| F-10 | Corrigido | Duração e ciclos usam limites efetivos tarefa/global e relógio host; reservas são persistidas sob lock e repetição do mesmo ID retorna reserva prévia. |
| F-11 | Corrigido | `message_bytes` é aplicado à entrada e envelope normalizado; limite de stream disponível por validação host-side; custo/tokens UNKNOWN não se convertem em zero; retry permanece zero. |
| F-12 | Corrigido | RESUME exige autorização atual e TASK-READY persistido, reconciliação de invocações e efeitos; não reabre invocação encerrada. |
| F-13 | Corrigido | Fluxo de correção cria novas invocações após encerramento; conclusão requer todas as invocações encerradas e evidência/gates. Fluxo integrado positivo exercitado. |
| F-14 | Corrigido com risco residual documentado | Append grava arquivo temporário completo, fsync e link atômico; cadeia e sequência são verificadas. Reescrita/truncamento integral da cauda por ator com controle do armazenamento não tem âncora externa, conforme risco explícito do plano. |
| F-15 | Corrigido | JSON de evento e lock malformados geram erro tipado; formato de identidade do lock é validado antes de consultar processo. Teste confirma `LEDGER_LOCK_MALFORMED`. |
| F-16 | Corrigido | Revogação é derivada e persistida no mesmo ledger, bloqueia progresso e cancela invocação ativa; não existe autoridade de revogação paralela. |
| F-17 | Corrigido | Destino obrigatório para escrita/commit, persistido no efeito e revalidado antes do dispatch. Traversal, caminho absoluto, `.git`, caminhos proibidos e agente fora de escopo são recusados. |
| F-18 | Corrigido | Regressões incluem mensagens duplicadas/conflitantes, replay e cursor regressivo, bytes limitados, eventos de controle de agente rejeitados e fluxo válido. |
| F-19 | Corrigido | Eventos de controle são host-only; framing UTF-8/JSONL completo e schemas P2 estritos continuam validados; idempotência e relações são conferidas no ledger. |

### Resultado por pacote

| Pacote | Resultado | Evidência principal |
|---|---|---|
| C-01 | Corrigido | Aprovação MERGE P1 verificada e vinculada; API de transição não aceita APPROVE |
| C-02 | Corrigido | Decisões de gate gravadas por método host-side e calculadas do ledger |
| C-03 | Corrigido | Identidade vinculada à invocação e à allowlist |
| C-04 | Corrigido | Snapshot/hash de catálogo e metadados compatíveis |
| C-05 | Corrigido | Grant atual, revogação e vínculo P1 |
| C-06 | Corrigido | Sandbox, caminho e destino persistidos/revalidados |
| C-07 | Corrigido | Relógio host e expiração com bloqueio/contensão |
| C-08 | Corrigido | Lifecycle e resultados host-side |
| C-09 | Corrigido | Cancelamento/recovery derivados do ledger |
| C-10 | Corrigido | Limites e reserva idempotente |
| C-11 | Corrigido | RESUME controlado e novas invocações para correção |
| C-12 | Corrigido com risco residual | Append atômico, integridade detectável; sem âncora externa contra reescrita total do armazenamento |
| C-13 | Corrigido | Regressões adversariais locais e validações de protocolo |

## 5. RED/GREEN e diagnósticos

Os artefatos originais R1 não estavam disponíveis. Por isso, não foi possível reproduzir a execução exata de `adversarial.mjs` nem preservar seu `adversarial.out.json`. Também não foi criada uma alegação retrospectiva de logs RED prévios para cada ADV.

Durante o ciclo local, os testes P2 falharam em regressões introduzidas/identificadas durante a integração (projeção de autorização, dados de fase e expectativas antigas de prova final); cada falha foi corrigida e a suíte focalizada terminou em **21/21**. As regressões de segurança agora verificam o comportamento final, inclusive rejeição de gates/provas literais, identidade forjada, replay, limite de bytes, cursor, expiração, lock malformado e aprovação final simulada válida. O conteúdo dos testes preserva as tentativas negativas; logs de execução temporários não foram versionados.

## 6. Validação consolidada

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | Passou |
| `npm run build` | Passou |
| `git diff --check` | Passou |
| `npm test` | **101 passaram, 0 falharam**; inclui 80 testes/cenários P1 previamente existentes e 21 testes P2 |
| Cenários P1 | **16/16 passaram** |
| `npm run test:coverage` | Passou; linha **94,30%**, branches **76,12%**, funções **95,31%** |
| Regressões R1 originais | Não reproduzidas: relatório e scripts ausentes no checkout |
| Agentes reais / isolamento real das CLIs | Não executados; pertencem ao P2-002 |

Os 80 casos P1 e os 16 cenários permaneceram ativos; nenhum teste foi removido ou desabilitado. O primeiro teste P1 sob sandbox falhou por `spawnSync /usr/bin/git EPERM`; a mesma suíte foi repetida fora do sandbox, com autorização do ambiente, e passou integralmente.

## 7. Segurança e riscos residuais

- As aprovações e os gates são verificados no host com registros de confiança P1; fontes `P2_TEST_FIXTURE` permanecem restritas ao fixture explicitamente configurado.
- A identidade VERIFIED é compatibilidade observada contra catálogo/configuração host-side; não é atestado criptográfico do fornecedor.
- A prova de sandbox P2-001 é simulada. Não autoriza escrita real em Codex, Gemini ou Antigravity; isso depende da prova operacional P2-002.
- Hash chain detecta edição localizada e quebra de sequência. Sem âncora externa, um usuário que possa reescrever/remover todo o diretório do ledger pode recalcular a cadeia ou truncar sua cauda final sem referência externa que revele a remoção. O plano v1.0 reconhece esse limite e não homologa nova chave/autoridade de confiança.
- O callback `p1_pr_gate_verifier` é configuração de bootstrap confiável e deve ser ligado à implementação host-side real de `prGate` no próximo runtime; a fixture positiva do P2-001 não comprova validação operacional do P1 fora do contrato.
- O P2-001 não executa comandos de agentes reais, não controla quotas monetárias de providers e não comprova limites de CPU/memória/rede/processos filhos.

## 8. Divergências em relação ao plano

Nenhuma decisão P2-DEC-001 a P2-DEC-008 foi alterada. Não houve merge, push, release, implementação P2-002 ou uso de agente real. O ledger aceita apenas operações P2 especificadas e registra intents; os testes não despacham efeitos externos reais.

## 9. Histórico Git e commits

Nenhum histórico existente foi reescrito; o arquivo preexistente `P2-001-EXECUTIVE-PLAN-v1.0.md:Zone.Identifier` será preservado sem inclusão. Este relatório será registrado em commit local próprio, após o commit de correção `c697f0a`.

## 10. Instruções de reprodução e revisão R2

Na raiz do repositório:

```sh
npm run typecheck
npm run build
npm test
npm run test:coverage
```

Para foco P2:

```sh
npm run build
node --test --test-isolation=none --test-concurrency=1 --test-reporter=spec dist/tests/unit/p2-workflow.test.js
```

Prioridades para R2: tentar falsificar aprovações/gates pelos métodos públicos; adulterar/reutilizar autorização e configuração após bootstrap; expirar/revogar durante cada fase e aprovação; explorar caminhos/symlinks/TOCTOU no adapter futuro; verificar corrupção de journal, replay e resultados incertos; confirmar que o bootstrap real usa `prGate` e trust P1 correto; revisar a limitação de truncamento de cauda sem assumir âncora externa.

**Recomendação:** iniciar revisão adversarial R2 sobre o HEAD final indicado após os commits locais. A implementação permanece não homologada e não publicada.
