# Prospera Mais — Web

Aplicação Web em Next.js, com foco em celulares. API REST e regras de negócio têm repositório próprio.

## Documentação oficial

- [Marca e experiência Web](<../Docs/04 — UX, fluxos e wireframes/Marca-e-experiencia-web/README.md>): produto, marca, direção visual, navegação, design system, governança e fichas de tela.
- [Contexto e decisões de execução](../Docs/Acompanhamentos/CONTEXTO-E-DECISOES.md).
- [Índice completo](../Docs/README.md): domínio, escopo, backlog, arquitetura e acompanhamentos.

Os links pressupõem o workspace com API, Web e `Docs` lado a lado. Neste ambiente, a documentação é acessível em `C:\Projs\ProsperaMais\Docs`, vinculada à pasta oficial do Drive. Em checkout isolado, consultar essa fonte; não criar cópia concorrente.

Em 19/10/2026, Elton confirmou **Prospera Mais**, escolheu a direção **preto e branco** e pediu inspiração no vidro do iPhone. O público principal é uma dupla que compartilha despesas e rotina, com espaço pessoal separado. A interface de acesso, espaços, Hoje e despesa aplica essa direção, com vidro restrito à navegação e alternativa opaca.

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

## Desenvolvimento

Use Node 24 conforme `.nvmrc`, instale com `npm ci` e configure `.env.local` a partir de `.env.example`. `npm run dev` inicia a Web. A API deve estar disponível na URL configurada.

Hoje consome o contrato ampliado com seis blocos, inclusive fontes parcialmente indisponíveis. Os destinos implementados são Hoje e Finanças. Tarefas e compras retornadas pela composição aparecem como leitura; suas telas de operação seguem o backlog oficial.

## Verificação

- `npm run lint`, `npm run format:check`, `npm run typecheck` e `npm run build` verificam o projeto.
- `npm run test:interface` executa as suítes de interface, incluindo waves 2–5, com dados sintéticos e sem API real. Verifica apresentação, teclado, reflow e texto ampliado. Neste recorte, não habilitar `IMPECCABLE_REVIEW`: o usuário pediu execução sem gerar ou salvar imagens em `.impeccable/review`.
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

A CI fixa um commit da API e seleciona cards, waves e testes de dados conforme as alterações; `full_e2e` permite solicitar a matriz completa. Confira a compatibilidade da API em [.github/workflows/ci.yml](.github/workflows/ci.yml).

Evidência local desta rodada, em 19/10/2026, na branch `feat/web-waves-2-5-interface`, com API `d73c388e49ba972c526073b4533ac379a7be5049`:

- 113 testes de dados e isolamento aprovados.
- 46 testes de interface sintética aprovados, incluindo larguras de 320, 390, 768 e 1280 px, teclado, reflow e texto ampliado.
- 113 testes com API e PostgreSQL reais aprovados: 69 dos cards 011–017, 28 dos cards 004/010 e 16 das novas jornadas nas waves 3–5, incluindo os três casos corretivos.
- Lint, formatação, tipos e builds aprovados. Suítes reais executadas em processos separados, sem alterar limites de autenticação.

A CI remota não foi executada nesta entrega. Não foram geradas capturas; a revisão independente do Impeccable conferiu código e interação e marcou os dois ajustes solicitados como resolvidos. A API não recebeu alterações. Aprovação local, CI remota, integração, deploy e validação com pessoas são evidências distintas; o acompanhamento oficial registra o estado de cada uma. Esse recorte não declara o MVP concluído nem substitui a validação em aparelho real, com tecnologias assistivas e com o público.
