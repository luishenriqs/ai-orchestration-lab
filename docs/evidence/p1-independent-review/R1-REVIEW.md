# P1 — revisão crítica independente R1

Data: 09/11/2026, 12:17–12:20 UTC (aproximadamente três minutos). Commit analisado: `e25472c`. Branch: `feat/p1-autonomous-implementation`.

**Parecer: REPROVADO. Homologação bloqueada por três achados ALTOS e um MÉDIO obrigatório.**

## Independência e método

Revisor: agente separado `/root/p1_independent_review`, acionado pelo coordenador `/root` pelo mecanismo `collaboration.spawn_agent`. Este agente não implementou o código analisado e não alterou implementação, schemas, testes ou configurações versionados. Modelo disponibilizado na identidade do ambiente: GPT-6; não foi fornecido identificador exato de variante nem telemetria verificável de tokens/custo. Mesma família de modelo não implica o mesmo agente; a independência aqui é de instância/papel, não de fornecedor.

Foram lidos o plano P1, plano normativo P1-002, seções aplicáveis de P0, relatório anterior, todos os módulos de execução, integridade, autorização, coleta, handoff, gates e cenários, e testes associados. Foram reproduzidos typecheck, build, suíte completa com cobertura, os 16 cenários separadamente, os hashes críticos e os históricos. Diagnósticos adversariais usam somente fixtures Git descartáveis e os mecanismos de sandbox da própria implementação. O script diagnóstico está arquivado em `r1-diagnostics.mjs`; seu destino de cenários deve ser novo antes de repetir, pois os artefatos usam criação exclusiva. A execução não acionou CLI `simulate`, para preservar os ponteiros e relatórios históricos versionados; chamou as mesmas 16 funções `runScenario` serialmente.

## Resultados reproduzidos

| Verificação | Observado | Evidência |
|---|---|---|
| Typecheck | exit 0 | `r1-typecheck.log` |
| Build | exit 0 | `r1-build.log` |
| Cobertura/suíte original | 77 PASS, 0 FAIL, 9 suítes, 6,23 s | `r1-coverage-unrestricted.log` |
| Cobertura | 94,68% linhas, 83,41% ramos, 98,47% funções | mesmo log |
| 16 cenários obrigatórios separados | 16 PASS; 306 hashes recalculados | `r1-scenarios.json`, `r1-scenarios/` |
| Evidência histórica | 16 casos, 306 artefatos, PASS | `r1-historical-evidence.log` |
| Hashes de arquivos críticos | 45 conferidos, zero divergências | `r1-critical-hashes.log` |
| Baseline protegida | quatro hashes OK | `r1-protected-hashes.log` |
| Diagnósticos adicionais | quatro desvios confirmados | `r1-diagnostics.json`, `r1-diagnostics.log`, `r1-diagnostics.mjs` |

Node v24.22.2, npm 11.19.1. A primeira suíte no sandbox do agente falhou por `spawnSync /usr/bin/git EPERM`; o log negativo foi preservado em `r1-coverage.log`. A repetição autorizada fora desse sandbox passou; o bubblewrap de produto permaneceu ativo. Os cenários e diagnósticos foram executados em série, sem execução simultânea de outro validador.

## R1-001 — ALTO — falso GREEN por saída do código sob teste

**Localização:** `src/execution/fixtures.ts:17`, `src/execution/synthetic.ts:61`, `src/evidence/collector.ts:33-39`, `src/evidence/collector.ts:104-121`.

**Descrição e reprodução:** após um RED legítimo, uma execução pelo mesmo sandbox e com escrita permitida somente em `src/sum.cjs` substituiu a implementação por `console.log('SYN_TEST_PASS');process.exit(0);module.exports=()=>999;`. Ao carregar o módulo, o processo termina antes de executar qualquer assertion. `observeTest` registrou `PASS`, código 0, e `validationGate` aprovou com `reasons: []`. Testes protegidos permaneceram byte a byte intactos. Ver `false_green` em `r1-diagnostics.json` e o diretório de evidências ali identificado.

**Impacto:** código não funcional consegue apresentar GREEN observado e avançar o gate sem executar as verificações exigidas. Contraria a independência da validação e a resistência a falso sucesso exigidas em P1-005/006/007.

**Causa provável:** teste confiável e módulo não confiável compartilham processo e stdout; o coletor usa texto e exit code como testemunha de conclusão das assertions.

**Recomendação:** remover a possibilidade de o código sob teste fabricar o protocolo de sucesso. Para a P1 estritamente sintética, uma verificação host da identidade/conteúdo dos programas fixos pode complementar a execução; qualquer protocolo alternativo deve ter a decisão de conclusão fora do controle do módulo. Incluir regressão de término antecipado, marcador falso, adulteração de assertions/console e programa que apenas imprime o marcador. Reavaliar RED com o mesmo rigor.

## R1-002 — ALTO — ValidationGate aceita tentativa divergente e não persistida

**Localização:** `src/governance/gates.ts:78-101`, `src/evidence/collector.ts:57-64`.

**Descrição e reprodução:** partir de `executeAttempt` legítimo aprovado e trocar somente o objeto de tentativa por `execution_id='UNRELATED-EXECUTION'`, `approval_id='NONEXISTENT'`, `executor='codex'`, `process_identity={pid:1,process_start_token:'FAKE'}`. Ajustar no `ExecutionResult` execution/executor para os valores fabricados. Evidências, contrato e journal originais ficam intactos. ValidationGate retorna `allowed:true`, sem motivos, emitindo decisão para execução alheia. Ver `forged_attempt` em `r1-diagnostics.json`. O diagnóstico de falso GREEN também mostra que objetos terminais sem journal bastam para aprovar.

**Impacto:** quebra de correspondência entre aprovação, processo, tentativa persistida, contrato e decisão; estado inconsistente pode avançar. A política P1 que proíbe executores reais não é revalidada nesta fronteira.

**Causa provável:** `assertAttemptConsistent` avalia consistência interna, mas o gate não confere o objeto completo contra o journal autoritativo nem o processo observado/decisão TASK-READY. `verifyEvidence` omite `attempt.execution_id` e a identidade de executor/aprovação.

**Recomendação:** carregar a tentativa do store autorizado, comparar integralmente seu estado e vínculos imutáveis, conferir correspondência com observação de processo e TASK-READY persistido, vincular execution IDs de todos os artefatos e revalidar política P1. Falhar fechado se journal/autorizações estiverem ausentes ou divergentes; criar regressões para cada campo, tentativa inexistente e ausência de readiness.

## R1-003 — ALTO — PR-GATE aceita achado HIGH marcado não bloqueante

**Localização:** `src/governance/gates.ts:149-150`.

**Descrição e reprodução:** revisão sintética confiável, atual e com hashes corretos recebe um achado `severity:'HIGH', blocking:false` e parecer `APPROVED_WITH_RECOMMENDATIONS`. Com autorização MERGE válida e demais controles satisfeitos, PR-GATE permite avanço. Ver `high_nonblocking` em `r1-diagnostics.json`.

**Impacto:** o flag unilateral do relatório neutraliza a regra obrigatória de bloqueio por severidade alta/crítica estabelecida na autorização de homologação. A decisão passa apesar de defeito grave reconhecido.

**Causa provável:** a regra do gate considera apenas `blocking`, sem impor severidades obrigatoriamente bloqueantes.

**Recomendação:** rejeitar qualquer achado HIGH/CRITICAL, independentemente de `blocking`; preservar bloqueio para demais severidades quando o flag é verdadeiro. Adicionar combinações adversariais de severidade, parecer e flag.

## R1-004 — MÉDIO — parser público normaliza chaves duplicadas antes do hash

**Localização:** `src/contracts/validator.ts:169-171`.

**Descrição e reprodução:** serializar contrato válido e substituir `"contract_revision":1` por `"contract_revision":666,"contract_revision":1`. `parseAndValidateContract('TaskContract',raw)` aceita e produz o mesmo hash do contrato original. O parser estrito `parseCanonicalJson` rejeitaria a entrada. Ver `duplicate_key` em `r1-diagnostics.json`.

**Impacto:** a API pública aceita representação ambígua que contradiz a garantia documentada de rejeitar nomes duplicados antes da canonicalização. O caminho host `readJson` está protegido; o defeito está na fronteira pública alternativa, sem prova de escape de confiança no fluxo fixo atual.

**Causa provável:** coexistência de parser rigoroso e `JSON.parse` diretamente na validação pública.

**Recomendação:** usar parser rigoroso em todas as fronteiras textuais de contratos, mantendo diagnóstico estruturado em vez de exceção não tratada. Testar duplicações na raiz e em objetos aninhados, inclusive nomes equivalentes por escape Unicode.

## Segurança, arquitetura e limites

O isolamento preventivo bubblewrap foi reproduzido: escrita de governança, chmod/unlink/criação em área protegida, escrita fora de escopo, testes e `.git` negadas; escrita autorizada no arquivo de implementação funciona. Namespaces, raiz somente leitura e captura limitada estão implementados; não foi observado escape de filesystem neste ensaio. O falso GREEN não depende de escape: ocorre integralmente dentro da permissão concedida.

Canonicalização usa ordenação UTF-16, representação ECMAScript e SHA-256; testes de vetores e rejeições passam. Autenticidade depende da lista confiável host, distinguida corretamente de hash/declaração do executor. Não há comprovação de PKI humana de produção, nem isso foi exigido para os inputs sintéticos. Journal, transições, reconciliação por identidade de processo e rollback arquivado passaram nos testes originais; o defeito R1-002 é o uso insuficiente desse journal na decisão final. Rollback opera fixtures registradas com base correspondente e preserva bytes; contrato P1 possui procedimento textual, sem campo específico de autorização adicional a exercitar.

Organização modular e separação do host/executor são adequadas ao escopo sintético, mas a validação ainda confia em canal controlável pelo código sob teste. Nenhum resultado de cobertura ou dos 16 cenários invalida os quatro contraexemplos adicionais. Os cenários oficiais são necessários e, isoladamente, insuficientes para a homologação.

Riscos residuais já documentados permanecem: sem quotas rígidas de CPU/memória/PIDs, domínio host confiável, locks inválidos falham fechados, sem comprovação de queda física de energia, detecção de segredos por padrões e executor fixo. Não houve operação em IAS, executor real do produto, merge, push, P2 ou alteração de critérios.

## Decisão e passagem ao coordenador

Primeiro ciclo de revisão concluído, zero ciclos de correção pelo revisor. As quatro ocorrências foram comunicadas ao coordenador antes deste parecer. Exigir correções, testes de regressão e nova revisão independente. **Não homologar, integrar ou publicar com estes achados abertos.**
