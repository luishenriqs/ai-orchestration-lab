# Validação integrada P1

Execução run-ddff974f-f26e-4639-9c20-88c565f86da7. PASS=16, FAIL=0, BLOCKED=0.

Identificadores P1-008-01..16 são convenção local que mapeia os números oficiais 1..16 da P1 §6; os nomes oficiais foram preservados.

| # oficial | Cenário | Resultado | Evidência |
|---|---|---|---|
| 1 | Contrato alterado após aprovação. | PASS | [artefatos](p1-execution/scenarios/run-ddff974f-f26e-4639-9c20-88c565f86da7/P1-008-01/scenario-result.json) |
| 2 | Aprovação inexistente. | PASS | [artefatos](p1-execution/scenarios/run-ddff974f-f26e-4639-9c20-88c565f86da7/P1-008-02/scenario-result.json) |
| 3 | Resultado falso do executor. | PASS | [artefatos](p1-execution/scenarios/run-ddff974f-f26e-4639-9c20-88c565f86da7/P1-008-03/scenario-result.json) |
| 4 | Arquivo alterado fora do escopo. | PASS | [artefatos](p1-execution/scenarios/run-ddff974f-f26e-4639-9c20-88c565f86da7/P1-008-04/scenario-result.json) |
| 5 | Falha parcial. | PASS | [artefatos](p1-execution/scenarios/run-ddff974f-f26e-4639-9c20-88c565f86da7/P1-008-05/scenario-result.json) |
| 6 | Tentativa interrompida. | PASS | [artefatos](p1-execution/scenarios/run-ddff974f-f26e-4639-9c20-88c565f86da7/P1-008-06/scenario-result.json) |
| 7 | Revisão obsoleta. | PASS | [artefatos](p1-execution/scenarios/run-ddff974f-f26e-4639-9c20-88c565f86da7/P1-008-07/scenario-result.json) |
| 8 | Aprovação MERGE vinculada a outra tentativa. | PASS | [artefatos](p1-execution/scenarios/run-ddff974f-f26e-4639-9c20-88c565f86da7/P1-008-08/scenario-result.json) |
| 9 | Tentativa de alterar registros protegidos. | PASS | [artefatos](p1-execution/scenarios/run-ddff974f-f26e-4639-9c20-88c565f86da7/P1-008-09/scenario-result.json) |
| 10 | Contrato com schema inválido. | PASS | [artefatos](p1-execution/scenarios/run-ddff974f-f26e-4639-9c20-88c565f86da7/P1-008-10/scenario-result.json) |
| 11 | Teste tautológico rejeitado antes da fase GREEN. | PASS | [artefatos](p1-execution/scenarios/run-ddff974f-f26e-4639-9c20-88c565f86da7/P1-008-11/scenario-result.json) |
| 12 | Modificação de teste protegido rejeitada. | PASS | [artefatos](p1-execution/scenarios/run-ddff974f-f26e-4639-9c20-88c565f86da7/P1-008-12/scenario-result.json) |
| 13 | Symlink escapando do workspace autorizado. | PASS | [artefatos](p1-execution/scenarios/run-ddff974f-f26e-4639-9c20-88c565f86da7/P1-008-13/scenario-result.json) |
| 14 | Handoff com `workspace_context_id` divergente. | PASS | [artefatos](p1-execution/scenarios/run-ddff974f-f26e-4639-9c20-88c565f86da7/P1-008-14/scenario-result.json) |
| 15 | Evidência contendo padrão de segredo. | PASS | [artefatos](p1-execution/scenarios/run-ddff974f-f26e-4639-9c20-88c565f86da7/P1-008-15/scenario-result.json) |
| 16 | Fluxo positivo RED → GREEN com evidências válidas. | PASS | [artefatos](p1-execution/scenarios/run-ddff974f-f26e-4639-9c20-88c565f86da7/P1-008-16/scenario-result.json) |

Aprovações e revisões usadas pelos cenários são sintéticas. Nenhum merge, push, exportação externa ou revisão independente real foi realizado. A avaliação preventiva e a detecção por injeção host estão discriminadas nos procedimentos individuais.
