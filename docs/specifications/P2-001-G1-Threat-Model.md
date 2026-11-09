# P2-001 G1 — modelo de ameaças e invariantes

**Baseline:** P1 em `d54fadf4328cab1fede2c24e481855c3a02a4208`.
**Autoridade:** autorização expressa de implementação P2-001 nesta sessão.
**Escopo:** protocolos, contratos e adapters simulados. Não é prova de isolamento de CLI real.

## Fronteiras de confiança

- **Host:** fonte autoritativa de workflow, autorização, limites, ledger, gates,
  aprovação humana simulada em testes e evidências observadas.
- **Adapter:** executa parsing/framing e informa observações. A saída é não
  confiável até validação; não pode autorizar operação nem promover estado.
- **Agente:** conteúdo e declarações são dados não confiáveis. Não decide
  autorização, identidade verificada, conclusão ou integridade.
- **Worktree:** delimita repositório/alterações Git por tarefa; não é sandbox.
- **Sandbox proof:** registro host-side vinculado a provider/produto/versão,
  configuração, perfil e permissões. P2-001 testa somente decisão simulada.

## Matriz ameaça → invariante → controle → gate → teste → evidência

| Ameaça | Invariante | Controle | Gate | Teste simulado | Evidência |
|---|---|---|---|---|---|
| Agente amplia paths/operações | I1/I2 | Hash do grant, allowlist, revalidação antes de cada efeito | TASK-READY/ValidationGate | Mutar path/operação após aprovação | evento de negação, hash aprovado/recebido |
| Sucesso autodeclarado | I3 | Resultado observado e terminal host-side obrigatório | ValidationGate | exit zero sem terminal / terminal sem evidência | observação, terminal e decisão |
| Replay de mensagem/efeito | I5/I10 | sourceEventId/cursor, effectId, ledger e reserva antes do dispatch | TASK-READY/ValidationGate | repetição após crash simulado | registro de dedupe, intenção e efeito |
| Identidade ou independência falsa | I4 | catálogo versionado e status VERIFIED | review/PR-GATE | UNKNOWN, alias igual, metadado divergente | fontes, catálogo/hash e decisão |
| Revogação durante efeito | I1/I5 | bloquear progresso, conter, reconciliar | TASK-READY/ValidationGate | revogar após dispatch | revogação, containment, reconciliação |
| Eventos adulterados | I10 | sequência e hash encadeados; projeção reconstruída | ValidationGate | hash, predecessor ou projeção adulterada | diagnóstico e bloqueio |
| Uso além de limites | I8 | limites por tarefa vs máximos, reserva atômica, relógio host | TASK-READY | valor inválido, contador no teto, timeout | limite efetivo, reserva, motivo |
| Escrita fora do sandbox | I9 | negar escrita sem prova vinculada a configuração exata | execução (simulada via TASK-READY) | certificado ausente/vencido/divergente | certificado avaliado e decisão |
| Reabertura de terminal | I7/I10 | rejeitar eventos tardios na projeção terminal | ValidationGate | mensagem após terminal | evento auditado sem mutação |
| Segredo ou dado fora de escopo | I2/I3 | paths controlados e evidência host-side; sanitização conservadora | ValidationGate | artifact/credencial fora do grant | hash, alerta e gate |

## Invariantes implementadas

I1 efeito requer grant válido; I2 agente não amplia grant; I3 alegação não é
evidência; I4 revisão requer identidade VERIFIED e diferença de provider/modelo;
I5 efeito incerto nunca é redespachado; I6 merge/push requer aprovação final;
I7 mensagem não altera projeção autoritativa sem evento/gate host; I8 limites
configuráveis por tarefa são validados contra defaults globais aprovados no plano;
I9 worktree não prova isolamento; I10 ledger é append-only e hash-encadeado.

## Decisões de precedência

O documento de plano v1.0 contém texto histórico “implementação não autorizada”
e propostas P2-DEC-009..018 ainda sujeitas à homologação. A autorização atual de
Luís homologa expressamente o plano v1.0 e autoriza execução integral G1–G5 sem
aprovação intermediária; portanto os valores, regras e defaults do v1.0 são
aplicados como baseline de implementação desta tarefa. Isso não autoriza agentes
reais, P2-002, merge ou push. P2-DEC-001..008 permanecem preservadas.

## Provas futuras

Este artefato e os testes P2-001 são especificação e decisão simulada. A prova
operacional de Codex/Gemini/Antigravity, credenciais, rede, filesystem, filhos,
plugins/MCP e sandbox real pertence a P2-002; sem ela, nenhuma escrita real é
permitida.
