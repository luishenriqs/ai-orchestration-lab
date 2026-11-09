# P2-001 — implementação da fundação operacional

**Plano de referência:** `P2-001-EXECUTIVE-PLAN-v1.0.md`  
**Baseline P1:** `d54fadf4328cab1fede2c24e481855c3a02a4208`  
**Escopo:** contratos e adapters simulados. Nenhuma CLI real é iniciada.

## Mapa da implementação

| Unidade | Arquivos principais | Conteúdo | Verificação |
|---|---|---|---|
| G1 | `docs/specifications/P2-001-G1-Threat-Model.md` | Fronteiras de confiança, invariantes e mapa ameaça/controle/gate/teste/evidência | Revisão de matriz e testes adversariais P2 |
| G2 | `src/workflow/types.ts`, `machine.ts`, `protocol.ts`, `ledger.ts` | Entidades, lifecycle, protocolo, deduplicação, projeções e journal | `tests/unit/p2-workflow.test.ts` |
| G3 | `schemas/p2-*.schema.json`, `src/workflow/validation.ts` | Sete schemas Draft 2020-12 fechados; validação relacional; parsing estrito | Testes estruturais, payloads inválidos e regressão P1 |
| G4a | `src/workflow/ledger.ts`, `effects.ts` | Ledger sequencial com hash, reserva, intents, recuperação conservadora e reconciliação | Testes de replay, corrupção e efeito incerto |
| G4b | `src/workflow/governance.ts`, `machine.ts`, `ledger.ts` | Aprovação P1 confiável, autorização vinculada, revogação, catálogo e independência | Testes de alteração de escopo, revogação e identidade UNKNOWN |
| G4c | `src/workflow/limits.ts`, `ledger.ts`, `machine.ts` | Limites configuráveis, máximos globais, contadores, duração, saída e gates | Testes de teto, valores inválidos e gate fechado |
| G5 | `tests/unit/p2-workflow.test.ts` | Fluxos simulados, cenários positivos e adversariais | Regressão integral P1 + P2 |

## Contratos

Os sete contratos P1 e seus schemas permanecem inalterados. A versão P2 usa
`schema_version: 2.0-p2`, Draft 2020-12, objetos fechados e Ajv estrito. O
validador P2 não amplia `CONTRACT_TYPES` P1. Hashes de payload e eventos usam o
canonicalizador JCS/SHA-256 de P1. O sentinela inicial do ledger é
`P2-LEDGER-GENESIS-v1`.

O ledger é um diretório por workflow, com um arquivo imutável por sequência,
criado com `wx` e permissões restritas. Cada evento contém sequência, workflow,
payload, instante do host, predecessor e hash. Um lock exclusivo serializa
append; um proprietário vivo bloqueia escrita. Lock de processo comprovadamente
obsoleto é arquivado antes de nova aquisição; lock malformado ou impossível de
verificar falha fechado. `verify()` valida todos os arquivos
e deriva estados/invocações/efeitos do histórico. A projeção não é fonte de
autoridade. Hash encadeado detecta alteração relativa ao estado confiável; não
autentica o host contra um ator que controle e reescreva o armazenamento inteiro.

`AgentMessage` recebe `message_id`, `sequence`, `correlation_id`, `observed_at`
e hashes do host. `source_event_id` ou `source_cursor` estável é obrigatório.
Replay idêntico retorna o evento gravado; conteúdo ou tipo divergente bloqueia.
Mensagens precisam pertencer a invocação RUNNING e workflow ACTIVE. A resposta
referenciada precisa existir. JSONL requer linha completa com UTF-8 válido.
Envelope excede 1 MiB ou stream excede 10 MiB implica rejeição.

## Estado, autorização e operações

Workflow e `ExecutionAttempt` não compartilham máquina de estados. Uma tentativa
P1 vinculada é conferida por
`validateInvocationAttemptRelationship()`. A projeção de workflow deriva a
invocação ativa do ledger. Uma nova invocação exige reserva persistida e no
máximo uma pode estar STARTING, RUNNING ou CANCEL_REQUESTED.

`recordAuthorization()` valida o `ApprovalRecord` com `verifyApproval()` P1,
vincula contrato/hash, repositório, baseline, worktree, caminhos e limites e
registra grant e comprovante host-side no ledger. Revogação cria evento
append-only e altera a projeção: ACTIVE vai para CANCEL_REQUESTED; estados sem
execução vão para BLOCKED. Uma invocação STARTING/RUNNING recebe também uma
transição persistida para CANCEL_REQUESTED. Resultado de sucesso ou novo
progresso é recusado com autorização revogada; somente contenção e reconciliação
são aceitas. Não há nova invocação após revogação.

Operações de escrita/commit são representadas por intents e não executadas pelo
P2-001. O ledger só permite seu dispatch simulado com grant persistido, caminho
autorizado e certificado de sandbox correspondente e válido. Certificados de
teste nunca comprovam isolamento real. `recover()` verifica a cadeia antes de
reconstruir o estado. Crash com intent/dispatched pendente marca reconciliação
requerida, bloqueia o workflow e não permite novo dispatch; a retomada exige
processo parado, efeitos observados e confirmados e autorização ainda válida.
Uma reserva persistida sem invocation fica contabilizada conservadoramente, sem
ser liberada automaticamente.

Identidade VERIFIED requer catálogo cujo hash confira e metadado observado
compatível. A comparação usa provider e modelo canônico. Revisão requer registro
de autoria/revisão por hash de artefato no ledger e invocações distintas. A
verificação é host-side e não equivale a atestado criptográfico do fornecedor.

## Limites e gates

Defaults adotados do plano v1.0: 120 min/workflow ativo, 20 min/invocação, 30
invocações, 5 ciclos de revisão, 5 de correção, 10 MiB por stream, 1 MiB por
mensagem e zero retries operacionais. Os máximos aplicam-se pelo menor valor
entre a tarefa e o global. Limites só são reduzidos pela autorização armazenada;
reserva do contador é feita sob lock e falha consome a reserva. Espera em
`AWAITING_APPROVAL` fica fora da duração ativa. Custo/tokens permanecem
`UNKNOWN` quando ausentes; não existe teto financeiro garantido.

Gates reutilizam os nomes P1 (`TASK-READY`, `ValidationGate`, `PR-GATE`) com
provas vinculadas ao workflow/contrato. `REVIEW-GATE` é a especialização P2
necessária para independência e revisão, não replica gate de execução P1.
`COMPLETED` exige aprovação final P1 válida, ligada a diff, revisão e evidências;
no cenário integrado, a fonte é explicitamente `SIMULATED_HUMAN`.

## Limites conhecidos

- `WorkflowLedger` é uma fundação de estado e protocolo; não despacha CLIs.
- O lock é fail-closed. Lock obsoleto só é arquivado quando o token de processo
  comprova que o proprietário encerrou; lock ilegível exige intervenção.
- Controles de CPU/memória/PID e limites financeiros não são implementados.
- Prova de sandbox presente aqui é somente decisão contratual simulada.
- Adapter real deverá impor timers, limites de buffers antes do parse, processos
  filhos, rede, credenciais e contenção; nada disso é comprovado pelo P2-001.
- Persistência local detecta quebra de sequência/hash, mas não impede que um
  administrador do host reescreva o ledger e toda a cadeia; para ameaça contra
  o host serão necessários armazenamento/assinatura confiáveis fora do escopo.
