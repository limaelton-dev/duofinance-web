# Junelo — Web

Aplicação Web em Next.js, com foco em celulares. Repositórios: [Web](https://github.com/limaelton-dev/junelo-web) e [API](https://github.com/limaelton-dev/junelo-api). API REST e regras de negócio têm repositório próprio.

## Documentação oficial

- [Marca e experiência Web](<../Docs/04 — UX, fluxos e wireframes/Marca-e-experiencia-web/README.md>): produto, marca, direção visual, navegação, design system, governança e fichas de tela.
- [Contexto e decisões de execução](../Docs/Acompanhamentos/CONTEXTO-E-DECISOES.md).
- [Índice completo](../Docs/README.md): domínio, escopo, backlog, arquitetura e acompanhamentos.

Os links pressupõem o workspace com API, Web e `Docs` lado a lado em `C:\Projs\junelo`. A pasta `Docs` é vinculada à fonte oficial no Drive. Se a leitura local da junction estiver indisponível, consultar a mesma fonte pelo Google Drive conectado; não criar cópia concorrente.

Em 20/10/2026, Elton definiu o nome **Junelo**, substituindo DuoFinance e, anteriormente, Prospera Mais. A direção **preto e branco** e a inspiração no vidro do iPhone foram escolhidas em 19/10/2026. O público principal é uma dupla que compartilha despesas e rotina, com espaço pessoal separado. A interface de acesso, espaços, Hoje, Finanças, Rotina, Compras e encerramento aplica essa direção, com vidro restrito à navegação e alternativa opaca.

O [PRODUCT.md](PRODUCT.md) registra o briefing do produto. O [DESIGN.md](DESIGN.md) documenta o sistema efetivamente implementado; [MIGRATION.md](MIGRATION.md) registra o inventário das 49 páginas, o baseline e a cobertura da migração. Arquivos auxiliares locais ficam em `.impeccable/`, ignorada pelo Git. A lógica de sessão, contexto, comandos financeiros e consultas continua na arquitetura existente. Cards e critérios oficiais permanecem válidos.

## Sistema visual e componentes

A interface usa Tailwind CSS 4, CSS Modules, fontes do sistema e componentes próprios em [src/components/ui](src/components/ui). A adaptação dos princípios Apple usa hierarquia, geometria por papel e continuidade; o material CSS não reproduz o renderizador Liquid Glass nativo. Não há dependência visual de Radix, React DayPicker, Lucide ou Manrope.

[tokens.css](src/app/tokens.css) é a fonte única de valores semânticos para cores, tipografia, espaços, raios, dimensões, movimento e sombras. [globals.css](src/app/globals.css) importa esses tokens e os mapeia para Tailwind. Botões usam cápsulas, campos têm cantos moderados, listas e resumos são sólidos, e o material translúcido fica na navegação. A tipografia usa `system-ui` e fallbacks da plataforma, com números tabulares para valores; a apresentação varia conforme a fonte disponível no aparelho.

[Aparência](src/components/patterns/appearance.tsx) oferece Sistema, Claro, Escuro e Reduzir efeitos visuais, no acesso e no contexto autenticado. A preferência fica neste navegador em `junelo:appearance`; sem armazenamento disponível, funciona na sessão atual. O tema manual prevalece sobre o sistema. A navegação tem fallback opaco sem suporte ao desfoque e com redução de transparência, contraste aumentado, cores forçadas ou redução manual de efeitos. Movimento reduzido preserva as ações e seus resultados.

No compacto, a navegação principal flutua abaixo do conteúdo e considera as áreas seguras. A partir de **64rem**, passa a uma lateral sólida e o cabeçalho torna-se sticky. O [useShellViewport](src/features/auth/components/use-shell-viewport.ts) mede cabeçalho/barra, atualiza a reserva de rolagem e reconhece redução de viewport compatível com teclado sem tratar zoom como teclado. Os mesmos quatro destinos e URLs permanecem disponíveis em cada composição.

Os controles [Button](src/components/ui/button.tsx), [Input](src/components/ui/input.tsx), [menu](src/components/ui/dropdown-menu.tsx), [FloatingLayer](src/components/ui/floating-layer.tsx), [Slot](src/components/ui/slot.tsx) e [ícones](src/components/ui/icons.tsx) são mantidos pelo projeto. Datas e meses usam [DateInput](src/components/ui/date-input.tsx) para preservar o input nativo como fonte de verdade, com [DateCalendar](src/components/ui/date-calendar.tsx) para a grade e o teclado do calendário. Selects mantêm funcionamento nativo com melhoria progressiva. Camadas portadas conservam a propagação React até as guardas de saída do shell.

## Operações financeiras — waves 2 a 5

O recorte dos cards 011–032 amplia as superfícies de Finanças no sistema existente. As operações seguem as regras visuais de [DESIGN.md](DESIGN.md) e os critérios de produto da documentação oficial:

- Wave 2: receitas, realizações parciais, cartão, liquidação de obrigações externas, resumo, posição entre membros e compromissos do mês.
- Wave 3: composição e seleção de acertos, mudança de ciclo, regra específica, compensação, dispensa, finalização e reversão.
- Wave 4: despesas planejadas, recorrências, parcelas, antecipação, quitação global e cancelamento futuro.
- Wave 5: ajustes, cancelamentos, reversões e propostas de alteração onerosa, com impacto e histórico disponíveis.

As composições consomem os tokens semânticos de [tokens.css](src/app/tokens.css), os controles próprios e os estilos compartilhados de despesas e Finanças. Os módulos [registros](src/features/finances/components/financial-records.module.css), [planejamento](src/features/finances/components/planning.module.css) e [acertos](src/features/finances/components/settlement-depth.module.css) usam fontes do sistema, valores tabulares, superfícies opacas adaptadas ao tema, divisores e foco visível. A composição começa em coluna e se reorganiza conforme a largura; vidro e desfoque permanecem no shell.

### Organização e integridade

As rotas em `src/app` compõem as páginas de [Finanças](src/features/finances); os clientes em [src/lib/api](src/lib/api) preservam os contratos REST. Consultas e prévias respeitam pessoa, espaço e sessão. O [useFinancialCommand](src/features/finances/hooks/use-financial-command.ts) captura destino, entrada e chave da tentativa, aplica CSRF e permite reenvio explícito da mesma tentativa quando o resultado é incerto. Conflitos exigem atualização e revisão.

Planejar não registra realização. Prévia e confirmação permanecem etapas distintas; parcelas afetadas são selecionadas explicitamente, e a quitação usa seu valor global. Finalizar um ciclo preserva a composição histórica e bloqueia alterações nesse ciclo; correções aplicáveis usam um ciclo aberto. Essas orientações acompanham a implementação e os contratos vigentes; domínio, critérios e pendências continuam na documentação oficial.

## Rotina, Compras e encerramento — waves 6 a 8

Os cards 033–049 estendem o sistema existente conforme as regras visuais de [DESIGN.md](DESIGN.md) e os critérios de produto da documentação oficial. A navegação do espaço oferece Hoje, Finanças, Rotina e Compras. Hoje mantém os seis blocos, diferencia indisponibilidade parcial de ausência de pendências e leva ao detalhe de tarefas e ocorrências, às listas de compras e ao encerramento.

- **Rotina:** consultar e filtrar tarefas, criar tarefas avulsas ou recorrentes, consultar ocorrências e registrar ações com revisão. Prazo e urgência permanecem independentes; responsável, executor e autor do registro mantêm seus significados no detalhe e no histórico.
- **Compras:** criar e consultar listas, manter itens, registrar quantidades parciais, corrigir compras e consultar o histórico. A interface distingue quantidade desejada, comprada após correções e restante. Quantidades usam representação decimal exata, com até três casas; correções preservam o registro original. O vínculo com uma tarefa pode ser criado ou removido sem concluir automaticamente a tarefa ou a lista.
- **Encerramento:** acessar pelo gerenciamento do espaço ou pela atenção de Hoje, consultar o diagnóstico completo, definir corte e destinos futuros, revisar e apresentar o plano, registrar concordâncias e resolver bloqueadores nas origens financeiras. A conclusão e o cancelamento seguem as capacidades e versões retornadas pelo servidor; com duas pessoas, as confirmações aplicáveis são bilaterais. O histórico do espaço encerrado permanece disponível em somente leitura.

Os módulos [Rotina](src/features/routine), [Compras](src/features/shopping) e [encerramento](src/features/spaces/closure) compartilham tokens, controles próprios, Tailwind e CSS Modules. Fontes do sistema, superfícies opacas nos dois temas, divisores, valores tabulares e alvos confortáveis mantêm a mesma linguagem por papel. As listas não dependem de imagens de produtos. A reserva inferior do conteúdo e da rolagem acompanha a altura medida da navegação, inclusive quando os rótulos crescem.

### Arquitetura e integridade

As rotas em `src/app` compõem as features, e os clientes de [Rotina](src/lib/api/routine.ts), [Compras](src/lib/api/shopping.ts) e [encerramento](src/lib/api/space-closure.ts) preservam os contratos REST. A base comum fica em Espaços: [useSpaceQuery](src/features/spaces/hooks/use-space-query.ts) protege consultas por pessoa, sessão e contexto; [useSpaceOperation](src/features/spaces/hooks/use-space-operation.ts) captura destino, entrada e chave da tentativa, aplica CSRF e exige reenvio explícito quando o resultado é incerto. Finanças reutiliza essa base por seus aliases e pelo wrapper de comandos, evitando uma segunda implementação.

O [useSpaceLeaveGuard](src/features/spaces/hooks/use-space-leave-guard.ts) compartilha a proteção de formulários entre as features. O descarte só ocorre depois que todos os formulários permitem a saída; uma saída cancelada preserva as entradas. Respostas de Compras também conferem a identidade dos recursos aninhados, incluindo lista, item e compra, antes de apresentar ou aceitar o resultado.

O diagnóstico de encerramento carrega todas as páginas e verifica sua consistência antes de apresentar o conjunto de bloqueadores. Plano, corte e concordâncias usam a versão do espaço e a revisão do plano. Proposta, aprovação e confirmação enviam o `expectedFinancialFingerprint` bruto recebido na consulta revisada, sem reconstruí-lo na Web, para o servidor conferir se o estado financeiro permanece válido. Valores em aberto em cada direção continuam visíveis, inclusive quando a posição líquida é zero. A aprovação do plano, a resolução financeira e a conclusão são passos distintos. Estes são registros da implementação; os critérios completos e as decisões de domínio continuam nas fontes oficiais.

## Desenvolvimento

Use Node 24 conforme `.nvmrc`, instale com `npm ci` e configure `.env.local` a partir de `.env.example`. `npm run dev` inicia a Web. A API deve estar disponível na URL configurada.

Hoje consome o contrato ampliado com seis blocos, inclusive fontes parcialmente indisponíveis. Com um espaço selecionado, os quatro destinos e seus detalhes operacionais ficam disponíveis; o estado e as capacidades do espaço determinam as ações permitidas.

## Verificação

Os testes têm nomes de comportamento e estão separados pelo ambiente necessário:

- `tests/unit`: contratos, valores, datas e isolamento sem API ou navegador. Execute `npm run test:unit`.
- `tests/interface`: formulários, apresentação, teclado e estados de erro com respostas simuladas. Execute `npm run test:interface`. Os cenários com datas fixas controlam também o relógio.
- `npm run test:controls`: recorte de datas, meses e selects em Chromium, Firefox e WebKit, incluindo teclado, foco, datas civis e texto a 200%. Instale os motores com `npx playwright install chromium firefox webkit`. Selects usam o menu personalizado onde `appearance: base-select` está disponível e preservam o menu nativo nos demais navegadores.
- `tests/e2e`: jornadas com API e PostgreSQL reais. Execute uma suíte por processo, por exemplo `npm run test:e2e -- settlement-cycles.spec.ts`.
- `tests/support`: apoio compartilhado às jornadas.

`npm run lint`, `npm run format:check`, `npm run typecheck` e `npm run build` verificam o projeto. Interface e integração usam `.next-interface` e `.next-e2e`, preservando o servidor de desenvolvimento padrão. As configurações mantêm capturas automáticas, vídeo e traces desligados porque os fluxos de convite manipulam segredos. Evidência visual explícita deve usar apenas fixtures sintéticas sem segredos e excluir jornadas de convite. Testar WebKit desktop não comprova Safari de iPhone, teclado virtual ou VoiceOver em aparelho real.

Para a integração, a API deve estar no diretório irmão `junelo-api`; inicie seu `compose.test.yaml` antes. O runner usa portas 3100/3101 e banco de teste na porta 55432. Cada suíte inicia um processo novo da API para preservar seus limites reais de cadastro e autenticação. Não desabilite essas proteções para fazer os testes passarem.

Para validar sem disputar o ambiente de outro trabalho, `E2E_API_DIR` permite indicar uma cópia da API e `E2E_DATABASE_URL` permite outra porta local. A conexão é compartilhada pelo servidor e pelas fixtures; o runner exige o banco `junelo_test` em localhost.

Checkouts em outro local podem definir `E2E_API_DIR` com o caminho absoluto da API. Antes de iniciar o Compose, confira se a porta 55432 já pertence a outro ambiente; não interrompa processos alheios para liberar uma execução. A troca do nome do banco se aplica somente ao ambiente descartável de testes; a conexão configurada de desenvolvimento ou produção não é renomeada.

Para reaproveitar compilações locais, compile a API e a Web antes das jornadas, com `NEXT_DIST_DIR=.next-e2e` e `NEXT_PUBLIC_API_URL=http://localhost:3101/v2` no build da Web. Depois use `E2E_PREBUILT=1` e execute cada arquivo em um processo separado. O runner continua aplicando migrations apenas no banco de testes configurado e iniciando novos processos nas portas 3100/3101. Não compile Web/API simultaneamente às suítes que usam esses artefatos. Em ambientes com sandbox que bloqueia sockets ou processos de navegador, servidor e runner precisam executar no ambiente autorizado com acesso a localhost.

A atualização migra a preferência de espaço armazenada na sessão do navegador para o prefixo `junelo`, preservando a seleção anterior por pessoa. A precedência é Junelo → DuoFinance → Prospera Mais; uma seleção mais recente inválida não recupera uma seleção antiga. A seleção continua sendo revalidada pela API antes do uso. Logout limpa as chaves das três marcas; entradas anteriores do histórico de navegação continuam protegidas pelos avisos de saída de formulário.

A CI executa unitários uma única vez, sem instalar Chromium ou subir banco nesse job. Todas as jornadas são distribuídas em três grupos, independentemente do nome do arquivo ou dos caminhos alterados. Cada grupo instala e compila Web e API uma vez; `E2E_PREBUILT=1` reaproveita essas compilações, mas mantém os processos da API isolados por suíte. Uma falha não impede a execução das demais suítes do grupo.

O job final **Web checks**, já exigido pela proteção da `main`, só aprova quando qualidade, unitários, interface e todos os grupos integrados passam. Falhas, cancelamentos e verificações não executadas bloqueiam a aprovação. O commit da API continua fixado em [.github/workflows/ci.yml](.github/workflows/ci.yml); `workflow_dispatch` permite validar outro SHA completo.

A auditoria de todas as dependências, incluindo desenvolvimento, faz parte do CI. Em 20/10/2026, Next 16.3.8 e sharp 0.35.5 eliminaram os alertas de produção identificados na revisão. Para eliminar a cadeia vulnerável de `braces` ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)), sem correção publicada, o override de `@next/eslint-plugin-next` substitui somente seu `fast-glob` por `tinyglobby@0.2.17`. O plugin usa a API compatível `globSync` com `onlyDirectories`; testes verificam a descoberta das rotas e a aplicação da regra de navegação com diretórios explícitos e padrões glob. Ao atualizar o plugin, revise esse contrato e remova o override quando a dependência original estiver corrigida. Não use o downgrade incompatível sugerido por `npm audit fix --force`.

O histórico de entregas e evidências anteriores permanece na [documentação oficial](../Docs/Acompanhamentos/CONTEXTO-E-DECISOES.md). Aprovação dos testes, deploy e validação com pessoas são etapas distintas.
