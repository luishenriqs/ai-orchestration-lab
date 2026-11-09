# P2-DEC-019 — Supervisão estratégica baseada em GPT

**Status:** Aprovada por Luís Henrique Pereira para registro arquitetural do Marco P2.  
**Escopo:** Orientação estratégica para os marcos P2; não altera a implementação contratual do P2-001.

## Decisão

O GPT atua como supervisor técnico estratégico do orquestrador, enquanto o orquestrador é o controlador operacional que transforma decisões em ações autorizadas, controladas e auditáveis.

1. O GPT interpreta requisitos e elabora planos.
2. O GPT avalia resultados e revisões.
3. O GPT propõe próximas ações e agentes responsáveis.
4. O orquestrador recebe propostas estruturadas e valida permissões, estados, gates e limites.
5. O orquestrador aciona agentes especializados e apresenta seus resultados ao supervisor para novas decisões.
6. As aprovações humanas permanecem obrigatórias nos pontos previamente homologados.
7. Nenhuma decisão do GPT pode contornar os controles determinísticos do host.

## Limites

Esta decisão não autoriza integração GPT nesta implementação P2-001, não altera seus contratos e não antecipa a implementação de capacidades planejadas para P2-004 ou outros marcos. A integração e seus contratos operacionais deverão ser planejados na etapa correspondente.

## Rastreabilidade

Registrada sob autorização expressa de Luís Henrique Pereira na instrução de execução **P2-001-R2-FIX**, que identifica esta decisão como `P2-DEC-019`. O registro é documental e preserva o limite de escopo do P2-001.
