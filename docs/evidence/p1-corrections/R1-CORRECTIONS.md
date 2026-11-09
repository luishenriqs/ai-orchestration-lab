# P1 — correções do primeiro ciclo

Autoridade: autorização expressa de Luís Henrique Pereira na sessão de 09/11/2026
para revisão independente, correções, homologação condicionada, merge e push.
Não representa revisão pessoal posterior do responsável. P2 continua excluído.
Baseline: `e25472ca3ae4b654bb5aac632f68e9a68e6bdb2f`.

| Achado | Causa e correção mínima | Arquivos | Validação |
|---|---|---|---|
| R1-001 ALTO | Módulo sob teste podia terminar o processo/assertions. Lista explícita dos quatro programas sintéticos fixos verificada antes de require no sandbox somente leitura; gate verifica novamente a fonte real. Não introduz executor JavaScript genérico. | fixtures.ts, synthetic.ts, collector.ts | Regressão de exit/marcador falso e adulteração de assert; mutação pós-GREEN rejeitada. |
| R1-002 ALTO | Objeto internamente consistente não era vinculado ao journal. Comparação integral com journal host, contrato/aprovação EXECUTION/lista de confiança/TASK-READY persistidos, execution/executor e identidade/tempos da observação. | gates.ts, collector.ts, gates.test.ts | Campos divergentes, journal adulterado e readiness ausente bloqueados. Teste positivo usa adapter real em vez de fabricar tentativa terminal. |
| R1-003 ALTO | Apenas flag blocking era considerado. HIGH e CRITICAL sempre bloqueiam PR-GATE. | gates.ts | Revisões confiáveis com severidades graves e blocking=false rejeitadas. |
| R1-004 MÉDIO | Parser público usava JSON.parse. Usa parseCanonicalJson e preserva diagnósticos estruturados. | validator.ts | Duplicações na raiz/aninhadas/escapadas rejeitadas; contrato válido aceito. |

Testes novos: `tests/integration/review-regressions.test.ts`. RED reproduzido antes
da correção em `r1-red-unrestricted.log`: três testes falharam pelas vulnerabilidades
esperadas. Log inicial restrito preservado em `r1-red.log`. O primeiro build do
arquivo novo apontou tipagem de unions/imports, corrigida antes da validação final.
O diagnóstico independente R1 também reproduziu os quatro achados separadamente.

Validação final deste conjunto: typecheck/build exit 0, 80/80 testes (77 anteriores
e três regressões), zero fail/skip; cobertura 95,10% linhas, 84,85% ramos e 99,24%
funções. CLI: 16 PASS, zero FAIL/BLOCKED, run
`run-1a1b9b49-0474-40d6-a003-bae14371bcb9`; verificador: 306 hashes OK.
Logs nesta pasta; relatório/bundle imutável em `../p1-execution/scenarios/`.
Os logs e bundles históricos não foram removidos. Inventário novo em
`corrected-file-hashes.json`; inventário antigo permanece histórico e divergências
nos arquivos corrigidos são esperadas.

Este conjunto ainda depende da revisão independente R2. O commit rastreável é o
commit que introduz este documento e pode ser consultado com `git log --follow`
sobre este arquivo; seu hash será registrado no relatório final.
