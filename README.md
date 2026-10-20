# Prospera Mais — Web

Aplicação Web em Next.js, com foco em celulares. API REST e regras de negócio têm repositório próprio.

## Documentação oficial

- [Marca e experiência Web](<../Docs/04 — UX, fluxos e wireframes/Marca-e-experiencia-web/README.md>): produto, marca, direção visual, navegação, design system, governança e fichas de tela.
- [Contexto e decisões de execução](../Docs/Acompanhamentos/CONTEXTO-E-DECISOES.md).
- [Índice completo](../Docs/README.md): domínio, escopo, backlog, arquitetura e acompanhamentos.

Os links pressupõem o workspace com API, Web e `Docs` lado a lado. Neste ambiente, a documentação é acessível em `C:\Projs\ProsperaMais\Docs`, vinculada à pasta oficial do Drive. Em checkout isolado, consultar essa fonte; não criar cópia concorrente.

Em 19/10/2026, Elton confirmou **Prospera Mais**, escolheu a direção **preto e branco** e pediu inspiração no vidro do iPhone. O público principal é uma dupla que compartilha despesas e rotina, com espaço pessoal separado. A interface de acesso, espaços, Hoje, Finanças, Rotina, Compras e encerramento aplica essa direção, com vidro restrito à navegação e alternativa opaca.

O [PRODUCT.md](PRODUCT.md) registra o briefing para o Impeccable. O [DESIGN.md](DESIGN.md) documenta os tokens e componentes implementados, com extensão em [.impeccable/design.json](.impeccable/design.json). Tailwind CSS 4, primitivas shadcn/ui sobre Radix, Manrope local e CSS Modules sustentam a interface. A lógica de sessão, contexto, comandos financeiros e consultas continua na arquitetura existente. Cards e critérios oficiais permanecem válidos.

## Operações financeiras — waves 2 a 5

O recorte dos cards 011–032 amplia as superfícies de Finanças no sistema existente. O [contrato de superfície](.impeccable/surfaces/financial-operations.md) orienta esse trabalho no modo Operate:

- Wave 2: receitas, realizações parciais, cartão, liquidação de obrigações externas, resumo, posição entre membros e compromissos do mês.
- Wave 3: composição e seleção de acertos, mudança de ciclo, regra específica, compensação, dispensa, finalização e reversão.
- Wave 4: despesas planejadas, recorrências, parcelas, antecipação, quitação global e cancelamento futuro.
- Wave 5: ajustes, cancelamentos, reversões e propostas de alteração onerosa, com impacto e histórico disponíveis.

As novas composições herdam as cores semânticas de [globals.css](src/app/globals.css), os controles [Button](src/components/ui/button.tsx) e [Input](src/components/ui/input.tsx), além dos estilos existentes de despesas e Finanças. Os módulos [registros](src/features/finances/components/financial-records.module.css), [planejamento](src/features/finances/components/planning.module.css) e [acertos](src/features/finances/components/settlement-depth.module.css) mantêm Manrope, valores tabulares, superfícies brancas, separadores finos e foco visível. A composição começa em coluna e se reorganiza conforme a largura; vidro e desfoque permanecem restritos ao shell. Isso estende as superfícies sem estabelecer novos tokens ou uma nova direção visual.

### Organização e integridade

As rotas em `src/app` compõem as páginas de [Finanças](src/features/finances); os clientes em [src/lib/api](src/lib/api) preservam os contratos REST. Consultas e prévias respeitam pessoa, espaço e sessão. O [useFinancialCommand](src/features/finances/hooks/use-financial-command.ts) captura destino, entrada e chave da tentativa, aplica CSRF e permite reenvio explícito da mesma tentativa quando o resultado é incerto. Conflitos exigem atualização e revisão.

Planejar não registra realização. Prévia e confirmação permanecem etapas distintas; parcelas afetadas são selecionadas explicitamente, e a quitação usa seu valor global. Finalizar um ciclo preserva a composição histórica e bloqueia alterações nesse ciclo; correções aplicáveis usam um ciclo aberto. Essas orientações acompanham a implementação e os contratos vigentes; domínio, critérios e pendências continuam na documentação oficial.

## Rotina, Compras e encerramento — waves 6 a 8

Os cards 033–049 estendem o sistema existente conforme o [contrato de superfície](.impeccable/surfaces/domestic-and-closure.md). A navegação do espaço oferece Hoje, Finanças, Rotina e Compras. Hoje mantém os seis blocos, diferencia indisponibilidade parcial de ausência de pendências e leva ao detalhe de tarefas e ocorrências, às listas de compras e ao encerramento.

- **Rotina:** consultar e filtrar tarefas, criar tarefas avulsas ou recorrentes, consultar ocorrências e registrar ações com revisão. Prazo e urgência permanecem independentes; responsável, executor e autor do registro mantêm seus significados no detalhe e no histórico.
- **Compras:** criar e consultar listas, manter itens, registrar quantidades parciais, corrigir compras e consultar o histórico. A interface distingue quantidade desejada, comprada após correções e restante. Quantidades usam representação decimal exata, com até três casas; correções preservam o registro original. O vínculo com uma tarefa pode ser criado ou removido sem concluir automaticamente a tarefa ou a lista.
- **Encerramento:** acessar pelo gerenciamento do espaço ou pela atenção de Hoje, consultar o diagnóstico completo, definir corte e destinos futuros, revisar e apresentar o plano, registrar concordâncias e resolver bloqueadores nas origens financeiras. A conclusão e o cancelamento seguem as capacidades e versões retornadas pelo servidor; com duas pessoas, as confirmações aplicáveis são bilaterais. O histórico do espaço encerrado permanece disponível em somente leitura.

Os módulos [Rotina](src/features/routine) e [Compras](src/features/shopping), além da composição de [encerramento](src/features/spaces/closure), usam os tokens globais, Button, Input, Tailwind e os estilos locais existentes. Manrope, superfícies opacas, divisores, valores tabulares e controles confortáveis permanecem; as listas não dependem de imagens de produtos. A reserva inferior do shell e da rolagem passou de 7rem para 10rem mais a área segura para acomodar os quatro destinos e o foco com texto ampliado. É uma extensão de layout, sem novos tokens de cor, tipo ou espaçamento.

### Arquitetura e integridade

As rotas em `src/app` compõem as features, e os clientes de [Rotina](src/lib/api/routine.ts), [Compras](src/lib/api/shopping.ts) e [encerramento](src/lib/api/space-closure.ts) preservam os contratos REST. A base comum fica em Espaços: [useSpaceQuery](src/features/spaces/hooks/use-space-query.ts) protege consultas por pessoa, sessão e contexto; [useSpaceOperation](src/features/spaces/hooks/use-space-operation.ts) captura destino, entrada e chave da tentativa, aplica CSRF e exige reenvio explícito quando o resultado é incerto. Finanças reutiliza essa base por seus aliases e pelo wrapper de comandos, evitando uma segunda implementação.

O [useSpaceLeaveGuard](src/features/spaces/hooks/use-space-leave-guard.ts) compartilha a proteção de formulários entre as features. O descarte só ocorre depois que todos os formulários permitem a saída; uma saída cancelada preserva as entradas. Respostas de Compras também conferem a identidade dos recursos aninhados, incluindo lista, item e compra, antes de apresentar ou aceitar o resultado.

O diagnóstico de encerramento carrega todas as páginas e verifica sua consistência antes de apresentar o conjunto de bloqueadores. Plano, corte e concordâncias usam a versão do espaço e a revisão do plano. Proposta, aprovação e confirmação enviam o `expectedFinancialFingerprint` bruto recebido na consulta revisada, sem reconstruí-lo na Web, para o servidor conferir se o estado financeiro permanece válido. Valores em aberto em cada direção continuam visíveis, inclusive quando a posição líquida é zero. A aprovação do plano, a resolução financeira e a conclusão são passos distintos. Estes são registros da implementação; os critérios completos e as decisões de domínio continuam nas fontes oficiais.

## Desenvolvimento

Use Node 24 conforme `.nvmrc`, instale com `npm ci` e configure `.env.local` a partir de `.env.example`. `npm run dev` inicia a Web. A API deve estar disponível na URL configurada.

Hoje consome o contrato ampliado com seis blocos, inclusive fontes parcialmente indisponíveis. Com um espaço selecionado, os quatro destinos e seus detalhes operacionais ficam disponíveis; o estado e as capacidades do espaço determinam as ações permitidas.

## Verificação

- `npm run lint`, `npm run format:check`, `npm run typecheck` e `npm run build` verificam o projeto.
- `npm run test:interface` executa as suítes de interface, incluindo waves 2–8, com dados sintéticos e sem API real. Verifica apresentação, teclado, reflow e texto ampliado. Neste recorte, não habilitar `IMPECCABLE_REVIEW`: o usuário pediu execução sem gerar ou salvar imagens em `.impeccable/review`.
- `npm run test:data` verifica contratos e isolamento sem iniciar API ou navegador. Os runners de interface e integração usam `.next-interface` e `.next-e2e`, preservando o servidor de desenvolvimento padrão.
- `npm run test:e2e -- card-010.spec.ts` executa uma suíte com API real e PostgreSQL descartável. A API deve estar no diretório irmão `prospera-mais-api`; inicie seu `compose.test.yaml` antes. O runner usa portas 3100/3101 e banco de teste na porta 55432.
- Execute os cards em processos separados, como na matriz da CI: uma execução conjunta pode atingir os limites reais de autenticação. Não desabilite essas proteções para fazer os testes passarem.

Para as novas jornadas, execute cada comando separadamente, com o mesmo ambiente integrado acima:

| Suíte                             | Comando                                   |
| --------------------------------- | ----------------------------------------- |
| Acertos com API real              | `npm run test:e2e -- wave3.spec.ts`       |
| Planejamento com API real         | `npm run test:e2e -- wave4.spec.ts`       |
| Integridade com API real          | `npm run test:e2e -- wave5.spec.ts`       |
| Casos corretivos com API real     | `npm run test:e2e -- wave5-edge.spec.ts`  |
| Contratos e dados de acertos      | `npm run test:data -- wave3-data.spec.ts` |
| Contratos e dados de planejamento | `npm run test:data -- wave4-data.spec.ts` |
| Todas as suítes de dados          | `npm run test:data`                       |

As jornadas das waves 6–8 usam o mesmo ambiente. Execute também cada suíte com API real em um processo separado, preservando os limites reais de cadastro e autenticação:

| Suíte                             | Comando                                            |
| --------------------------------- | -------------------------------------------------- |
| Rotina com API real               | `npm run test:e2e -- wave6.spec.ts`                |
| Compras com API real              | `npm run test:e2e -- wave7-shopping.spec.ts`       |
| Vínculos entre tarefa e lista     | `npm run test:e2e -- wave7-links.spec.ts`          |
| Encerramento com API real         | `npm run test:e2e -- wave8.spec.ts`                |
| Identidade de recursos de Compras | `npm run test:data -- wave7-shopping-data.spec.ts` |

A CI fixa um commit da API e seleciona cards, waves e testes de dados conforme as alterações, incluindo suítes com sufixos como `wave7-shopping` e `wave7-links`; `full_e2e` permite solicitar a matriz completa. Confira a compatibilidade da API em [.github/workflows/ci.yml](.github/workflows/ci.yml).

Evidência local da entrega anterior, waves 2–5, em 19/10/2026, na branch `feat/web-waves-2-5-interface`, com API `d73c388e49ba972c526073b4533ac379a7be5049`:

- 113 testes de dados e isolamento aprovados.
- 46 testes de interface sintética aprovados, incluindo larguras de 320, 390, 768 e 1280 px, teclado, reflow e texto ampliado.
- 113 testes com API e PostgreSQL reais aprovados: 69 dos cards 011–017, 28 dos cards 004/010 e 16 das novas jornadas nas waves 3–5, incluindo os três casos corretivos.
- Lint, formatação, tipos e builds aprovados. Suítes reais executadas em processos separados, sem alterar limites de autenticação.

A CI remota não foi executada nesta entrega. Não foram geradas capturas; a revisão independente do Impeccable conferiu código e interação e marcou os dois ajustes solicitados como resolvidos. A API não recebeu alterações. Aprovação local, CI remota, integração, deploy e validação com pessoas são evidências distintas; o acompanhamento oficial registra o estado de cada uma. Esse recorte não declara o MVP concluído nem substitui a validação em aparelho real, com tecnologias assistivas e com o público.

Evidência local da extensão das waves 6–8, em 19/10/2026, na branch `feat/web-waves-6-8-interface`, baseada na main `b6dc889`, com API `d73c388e49ba972c526073b4533ac379a7be5049`:

- 125 testes de dados e isolamento aprovados, incluindo identidade dos recursos de Compras e descarte atômico de múltiplos formulários.
- 77 testes da interface sintética completa aprovados, incluindo as novas superfícies e a navegação com quatro destinos, foco, reflow e texto ampliado.
- 10 testes das novas jornadas com API e PostgreSQL reais aprovados: 2 de Rotina, 4 de Compras, 1 de vínculos e 3 de encerramento, em processos separados.
- 44 regressões adicionais com API e PostgreSQL aprovadas: 11 do CARD-004, 17 do CARD-010 e 16 de acertos, planejamento, integridade e casos corretivos das waves 3–5. Total integrado desta rodada: 54 testes aprovados.
- Tipos, lint sem avisos, formatação e builds de produção aprovados. Os runners integrados compilaram a Web e a API; as suítes foram executadas em processos separados, preservando os limites reais de autenticação.
- A revisão independente de código e interação marcou como resolvidos os ajustes na identidade de recursos de Compras e no descarte atômico de múltiplos formulários, inclusive quando o evento de navegação já foi cancelado.

Não foram geradas ou salvas capturas em `.impeccable/review`, e esta rodada não declara aprovação visual por imagens. Os tokens do DESIGN.md e o sidecar foram preservados. A API e a documentação oficial não receberam alterações por esta extensão Web.

Branch e commits desta entrega permanecem locais; Elton abrirá o PR. A CI remota e o deploy desta branch não foram executados.
