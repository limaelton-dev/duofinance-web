---
name: Junelo
description: Sistema visual próprio, monocromático e mobile first para organização pessoal e compartilhada.
---

# Sistema visual Junelo

Registro da implementação inspecionada em 21/10/2026. A direção preserva Junelo, preto e branco e o contexto pessoal/compartilhado de [PRODUCT.md](PRODUCT.md), aplicando os princípios de hierarquia, harmonia e continuidade dos cinco documentos em `../apple-mobile-first-design/`. O alvo conceitual é o design apresentado na WWDC 2025; medidas CSS são escolhas do projeto. A translucidez web aproxima uma camada funcional, sem equivalência com o renderizador Liquid Glass nativo.

Este documento descreve arquitetura e contratos de apresentação. O inventário, o baseline e a cobertura por rota estão em [MIGRATION.md](MIGRATION.md). Resultados de testes, aceite em aparelho real, compreensão por pessoas e deploy exigem evidências próprias; a descrição de um componente não comprova esses resultados.

## Fonte única de tokens

[src/app/tokens.css](src/app/tokens.css) concentra os valores de cor, tipografia, espaço, forma, dimensão, movimento e profundidade. As features consomem esses tokens por CSS Modules; [globals.css](src/app/globals.css) importa a fonte única, estabelece semântica global, melhorias progressivas e o mapeamento `@theme inline` para Tailwind 4. Os aliases existentes, como `--card`, `--primary` e `--muted-foreground`, continuam disponíveis e apontam para papéis semânticos.

O sistema usa componentes próprios em [src/components/ui](src/components/ui), CSS Modules e utilitários Tailwind. Não usa Radix, React DayPicker, Lucide ou fonte Manrope. Ícones vetoriais próprios ficam em [icons.tsx](src/components/ui/icons.tsx); a composição de um único filho interativo usa [Slot](src/components/ui/slot.tsx). Não criar uma segunda paleta ou escala nas telas, nem copiar valores de tokens para um sidecar como fonte normativa.

| Papel             | Tokens/aliases                                                                                      | Aplicação                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Página e conteúdo | `surface-page`, `surface-content`, `background`, `card`                                             | Fundo da aplicação e superfícies estáveis de listas, números e formulários |
| Sobreposição      | `surface-raised`, `popover`, `overlay`                                                              | Menus, calendários, diálogos e fundo modal                                 |
| Texto             | `text-primary`, `text-secondary`, `text-tertiary`, `foreground`, `muted-foreground`                 | Hierarquia de leitura, metadados e apoio                                   |
| Ação              | `action-primary`, `on-action`, `primary`, `primary-foreground`                                      | Ação principal e seleção atual, com par de contraste definido              |
| Interação         | `surface-subtle`, `surface-hover`, `secondary`, `accent`                                            | Ações secundárias, hover, foco de item e apoio                             |
| Limites e foco    | `separator`, `control-border`, `focus-ring`, `border`, `input`, `ring`                              | Divisores, identificação de campos e navegação por teclado                 |
| Estados           | `destructive`, `destructive-foreground`, `warning`, `warning-surface`, `success`, `success-surface` | Erro, atenção e confirmação, sempre acompanhados de texto                  |
| Navegação         | `glass-fill`, `glass-border`, `glass-highlight`, `navigation-*`                                     | Material funcional, contorno e profundidade do shell                       |

A identidade é monocromática. Claro e escuro usam superfícies e pares de texto próprios; o tema escuro inverte o par da ação principal em vez de manter texto branco sobre ação clara. Vermelho, âmbar e verde continuam reservados ao significado. Valores financeiros usam números tabulares, rótulo, unidade e sinal apropriados; a cor não substitui a explicação.

## Aparência e preferências

[AppearanceProvider e AppearanceSettings](src/components/patterns/appearance.tsx) oferecem **Sistema**, **Claro**, **Escuro** e **Reduzir efeitos visuais** no acesso e no shell autenticado. É uma preferência deste navegador, armazenada em `localStorage` sob `junelo:appearance`; ela não altera conta, sessão, dados ou autorização. Se o armazenamento falhar, a seleção funciona na sessão atual. Eventos `storage` mantêm abas coerentes.

O modo Sistema deixa `data-theme` ausente e acompanha `prefers-color-scheme`. A escolha manual aplica `data-theme="light"` ou `"dark"`; a escolha clara prevalece sobre a preferência escura do sistema. A opção de efeitos escreve `data-effects="reduced"`: torna a navegação opaca e desativa animações/transições da interface. A preferência de movimento reduzido do sistema também reduz o movimento independentemente dessa opção.

O ajuste abre um `<dialog>` por `showModal()`, com nome acessível, título inicialmente focado, radios nativos, checkbox, saída Concluir e Escape. O foco permanece na tarefa e retorna ao acionador no fechamento. Tema e efeitos são aplicados imediatamente; Concluir fecha a tarefa, sem comando de domínio.

## Tipografia e ritmo

A família dos textos é a do sistema: `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`. O navegador escolhe a fonte disponível; não há download de SF Pro nem promessa de renderização igual em sistemas diferentes.

A marca fica concentrada em [src/components/brand](src/components/brand): `index.tsx` expõe o componente `Brand`, `artwork.ts` contém os contornos aprovados e `brand.module.css` controla sua apresentação. `Brand` aplica a composição completa (Ju sobre nelo) no acesso, nos convites e na lateral desktop; a assinatura Ju aparece no cabeçalho compacto e na verificação de sessão. O nome acessível permanece Junelo. A cor `--brand-ink` é preto puro no tema claro e branco no escuro; cores forçadas usam `CanvasText`. Não há dependência de fonte ou imagem externa. O repositório mantém apenas os recursos usados pelo aplicativo; estudos e entregáveis ficam em `../design`, na raiz do workspace Junelo, fora deste repositório.

Os arquivos de navegador e instalação ficam em `public/brand`. O favicon SVG acompanha Sistema ou a escolha manual do AppearanceProvider, inclusive na navegação e recarga; `public/favicon.ico` fornece o fallback. O [manifest](src/app/manifest.ts) usa Ju branco sobre preto nos ícones de instalação de 192/512 px, com arquivos separados para recorte maskable. O ícone Apple touch tem 180 px. Ícones de instalação têm fundo próprio de alto contraste; não mudam com a preferência de tema de uma página. O manifest registra identidade e ícones, sem adicionar cache offline ou service worker.

A raiz mantém `100%`, e tamanhos em `rem` respeitam ampliação. A tabela documenta a escala extraída dos tokens; a definição executável continua em `tokens.css`.

| Token            | Tamanho   | Papel                                           |
| ---------------- | --------- | ----------------------------------------------- |
| `type-display`   | 2.125rem  | Título principal de destino                     |
| `type-title`     | 1.75rem   | Título de formulário/detalhe e destaque         |
| `type-section`   | 1.375rem  | Seção importante                                |
| `type-heading`   | 1.0625rem | Título compacto e ação                          |
| `type-body`      | 1.0625rem | Conteúdo e campos                               |
| `type-secondary` | 0.9375rem | Ajuda e metadados                               |
| `type-caption`   | 0.8125rem | Informação auxiliar e rótulo compacto           |
| `type-amount`    | 2.5rem    | Montante destacado quando a composição comporta |

O peso de cabeçalho compartilhado é 650; a entrelinha base é 1,5 e a de título é 1,15. Variações locais servem ao papel do conteúdo, sem criar outra família visual. Títulos usam caixa natural e espaçamento entre letras compacto. Valores e nomes podem quebrar linha; layouts usam `min-width: 0` e não fixam altura de blocos textuais.

A escala usa passos de 0.25rem. A tese espacial é: contexto compacto, próxima ação visível cedo, dados relacionados próximos e separação clara entre assuntos. O pai controla o intervalo; não somar `gap`, margem do filho e preenchimento externo para resolver a mesma distância.

| Papel                                                        | Token              | Medida base                                                                     |
| ------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------- |
| Rótulo → campo; título → descrição                           | `gap-label`        | 0.5rem                                                                          |
| Ações irmãs, aviso → recuperação, título → conteúdo compacto | `gap-related`      | 0.75rem                                                                         |
| Campos relacionados                                          | `gap-field`        | 1.25rem                                                                         |
| Grupos de formulário; cabeçalho → conteúdo                   | `gap-group`        | 1.5rem                                                                          |
| Assuntos independentes                                       | `gap-section`      | 2rem                                                                            |
| Preenchimento de cartões, listas e fieldsets                 | `inset-card`       | 1rem estreito / 1.25rem móvel / 1.5rem a partir de 48rem                        |
| Margem lateral de página e cabeçalho                         | `gutter-page`      | 1rem estreito / 1.25rem móvel / 2rem a partir de 48rem / 3rem a partir de 80rem |
| Início do conteúdo abaixo do shell                           | `inset-page-start` | 1.5rem móvel / 2rem a partir de 48rem                                           |

O compacto estreito termina em 22.4375rem. As áreas seguras podem ampliar o gutter; o texto ampliado continua respeitando os tokens em `rem`. Labels separados do controle pertencem a um grupo explícito, sem margem negativa. Erros com ação têm ritmo interno próprio. Em Hoje, os estados vazios usam preenchimento vertical menor; o resumo e os itens se reorganizam por largura de contêiner quando o texto cresce. A revisão financeira fica no fluxo da página, inclusive em desktop curto, para manter todos os valores alcançáveis.

O conteúdo amplo limita-se a `layout-content` (72rem), formulários a `layout-form` (38rem) quando aplicável, e a lateral a `layout-sidebar` (15rem). A compactação não reduz os alvos de toque: 44px no mínimo e 3rem nos campos.

## Geometria por papel

Uma linguagem corresponde a cada papel: ações em cápsulas; campos com cantos moderados; grupos de conteúdo sólidos; navegação flutuante com cantos amplos e encaixe interno concêntrico. Não aplicar o mesmo raio a todo elemento.

| Papel              | Geometria e interação                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Botão              | Cápsula `radius-pill`; altura mínima padrão 3rem, compacto 2.75rem, grande 3.25rem; ícone 3rem                    |
| Campo              | `radius-md` de 1rem; mínimo 3rem; contorno de campo, rótulo persistente e espaço para ícone interno               |
| Conteúdo           | `radius-sm`/`radius-lg` conforme grupo ou resumo; superfícies opacas, divisores e ausência de elevação ao apontar |
| Navegação inferior | Contêiner `radius-xl` de 2rem; destino deriva o raio do contêiner menos preenchimento e borda                     |
| Menu/calendário    | Superfície opaca elevada, limite de viewport, contorno e rolagem local                                            |
| Diálogo            | Superfície opaca, cantos amplos, fundo modal e ações explícitas                                                   |
| Estado/contador    | Texto compacto, limite/fundo semântico quando necessário; não simula uma ação                                     |

Os demais raios semânticos são `radius-sm` 0.75rem e `radius-lg` 1.5rem. `target-min` é 44 CSS px como decisão do projeto; alturas são mínimas e crescem com texto.

## Navegação e adaptação

[AuthenticatedShell](src/features/auth/components/authenticated-shell.tsx) preserva Hoje, Finanças, Rotina e Compras, o nome e tipo do espaço, seu estado, gerenciamento e conta. Destinos usam links e `aria-current="page"`; ações como adicionar registro ficam em botões ou menus. Ícones acompanham rótulos reconhecíveis. O encerramento continua no gerenciamento do espaço e na atenção de Hoje.

No compacto, cabeçalho e seletor participam do fluxo, e a barra inferior flutua centralizada com largura máxima de 26rem. A posição inferior considera o maior valor entre o espaço de projeto e a área segura. Os destinos podem reorganizar-se com texto ampliado. A partir de **64rem**, a barra inferior fica oculta e a navegação usa lateral sólida de 15rem; o cabeçalho passa a sticky. Existe uma única navegação principal visível/operável em cada largura. Em 80rem, o conteúdo recebe maior respiro lateral.

[useShellViewport](src/features/auth/components/use-shell-viewport.ts) observa as dimensões reais do cabeçalho e da navegação com `ResizeObserver`, reagindo a resize, foco e `VisualViewport`. Escreve `--top-occupied` e `--bottom-occupied`; o conteúdo e `scroll-padding` reservam a ocupação medida em vez de depender de uma altura fixa da barra. Com foco em edição, escala visual 1 e redução de altura compatível com teclado, aplica `data-keyboard="open"` e esconde a navegação inferior. Zoom não é tratado como teclado. Observadores e listeners são removidos no desmontar.

Filtros não sensíveis usam [useUrlPreferences](src/components/patterns/use-url-preferences.ts): mês, membro, painel e visão de Finanças; responsabilidade, situação, atenção e período de Rotina; filtros de listas e itens de Compras. Valores são validados, padrões são omitidos e `history.replaceState` preserva o estado do roteador e das guardas. Voltar de um detalhe e recarregar restabelecem o recorte; rascunhos e tentativas de comando continuam sob os controles existentes, fora da URL.

O acesso usa [AccessLayout](src/features/auth/components/access-layout.tsx), formulário compacto de até 26rem e cabeçalho com marca/aparência. Em 64rem, acrescenta uma coluna editorial monocromática e mantém o formulário legível. As features começam em coluna e só promovem resumos/listas/campos quando o conteúdo comporta; desktop não cria outra lógica de seleção.

## Material, profundidade e movimento

Conteúdo financeiro, formulários, listas e lateral são opacos. O material da classe `.navigation-glass` pertence ao cabeçalho e à navegação inferior: começa sólido e recebe desfoque apenas em navegadores com suporte a `backdrop-filter`. O desfoque atual é 20px; preenchimento, contorno, brilho e sombras vêm dos tokens de cada tema. A profundidade separa navegação, menu e diálogo; não eleva cada linha ou card.

Sem suporte ao filtro, com redução de transparência, contraste aumentado, cores forçadas ou escolha manual de efeitos reduzidos, a navegação usa superfície sólida e remove o desfoque. Efeitos reduzidos também retiram a sombra da navegação. Cores forçadas preservam contornos e foco do sistema. Não aplicar opacidade ao pai para simular material, pois isso também enfraquece texto e ícones.

Movimento comunica resposta e continuidade. Os tokens disponíveis são `motion-fast` 120ms e `motion-base` 180ms; cada componente usa somente o que precisa. Ações assíncronas não dependem do fim de uma animação. Movimento reduzido e a preferência manual preservam resultado, navegação e leitura sem deslocamento.

## Controles próprios e seus contratos

| Componente                                                                        | Contrato de uso e estados                                                                                                                                                                          |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Button](src/components/ui/button.tsx)                                            | Ação principal, contorno, ghost ou destrutiva; rótulo específico, ocupado/desabilitado e foco. `asChild` compõe um filho sem criar controles interativos aninhados                                 |
| [Slot](src/components/ui/slot.tsx)                                                | Combina propriedades, classes, handlers e refs de um filho sem acrescentar elemento; handlers da primitiva verificam cancelamento quando necessário                                                |
| [Input](src/components/ui/input.tsx) e [Label](src/components/ui/label.tsx)       | Entrada nativa, autocomplete/inputMode/validação preservados; borda de erro, dados mantidos e rótulo persistente; date/month delegam ao DateInput                                                  |
| [DropdownMenu](src/components/ui/dropdown-menu.tsx)                               | Menu de comandos/links com nome no acionador, aberto/fechado, seleção e disabled; setas, Home/End, busca por texto, Enter/Space, Escape e Tab; fechamento devolve foco quando apropriado           |
| [FloatingLayer](src/components/ui/floating-layer.tsx)                             | Camada não modal portada, ancoragem e colisão com viewport visual, altura limitada e rolagem; foco inicial, clique/foco externo, Escape, retorno e continuação de Tab próximos à origem            |
| [DateInput](src/components/ui/date-input.tsx)                                     | Entrada nativa permanece fonte de verdade, refs, eventos input/change, validação, dirty tracking e submissão; botão abre calendário, Alt+seta abaixo também; seleção/Escape devolvem foco ao campo |
| [DateCalendar](src/components/ui/date-calendar.tsx)                               | Grade de dias ou meses em português; estado selecionado/hoje/focado/indisponível, setas/Home/End/PageUp/PageDown, limites inclusivos e step; Hoje/Mês atual e Limpar conforme obrigatoriedade      |
| [Alert](src/components/ui/alert.tsx) e [Skeleton](src/components/ui/skeleton.tsx) | Mensagem textual e papel semântico; erro/atenção/sucesso diferenciados; carregamento acompanha estado real da consulta                                                                             |
| [Ícones](src/components/ui/icons.tsx)                                             | SVG próprio em canvas de 24 unidades, traço compartilhado e `currentColor`; decorativos recebem `aria-hidden`, ação sem texto exige nome acessível                                                 |

O calendário mantém datas civis de America/Sao_Paulo, sem converter valores do contrato em UTC. `min`, `max`, `step`, `required`, `disabled` e `readOnly` permanecem vinculados ao input. O seletor de meses é parte do mesmo componente, sem outra biblioteca. A grade pode rolar localmente quando a ampliação exige largura adicional; as ações permanecem alcançáveis.

Selects mantêm semântica, seleção, busca e teclado nativos. Onde existe `appearance: base-select`, recebem superfície opaca, contorno, seta própria, opções com realce semântico e altura confortável; os demais navegadores preservam o menu da plataforma. Não há select inteiramente reimplementado por aparência.

`FloatingLayer` monta o DOM em `document.body`, mas continua sob a árvore React original. A captura de cliques do shell alcança links dos menus e mantém a guarda `context.canLeave()`; portar uma ação não elimina proteção de rascunho ou tentativa incerta. Menus e calendários são não modais; tarefas realmente modais usam `<dialog>` com política explícita de saída.

## Estados, foco e integridade

O contorno global de foco tem 3px e afastamento de 4px; campos usam 2px de afastamento, menus e calendário ajustam o contorno à superfície. O link de pular conteúdo leva ao `main` focável. A ordem de documento acompanha contexto, conteúdo prioritário, revisão e confirmação. Focus não pode depender só de hover ou cor.

Carregando, atualizando, vazio, filtro sem resultados, erro, acesso perdido, conflito, resultado incerto e confirmado são situações distintas. Falha parcial permanece perto da fonte afetada. Sucesso financeiro depende da confirmação real; resultado incerto conserva a tentativa e exige reenvio explícito da mesma chave. Alterações onerosas, cancelamentos, reversões e encerramento preservam revisão, capacidades, consentimentos e histórico.

Valores continuam em centavos inteiros; quantidade de compra usa decimal exato. Responsabilidade, pagador previsto e realização permanecem separados. A apresentação não altera cookies, CSRF, autorização, versões, fingerprint do encerramento, isolamento de cache nem descarte de respostas antigas por pessoa/espaço/sessão.

## Verificação e limites

Revisar larguras compactas 320/375/390/430, amplas 768/1024/1440 e transições entre elas, janela curta, paisagem, texto 200%, valores/nomes longos e estados de erro. Conferir tema claro, escuro, sistema, opaco, redução de movimento, alto contraste, foco/teclado, URL direta, recarga, voltar e troca de espaço com rascunho.

Os testes de interface usam respostas sintéticas. Capturas permitidas são somente de cenários sintéticos sem segredos; convites não podem gerar capturas, vídeos ou traces. WebKit desktop não equivale a Safari de iPhone: teclado virtual, barras, safe areas, toque e leitura assistiva em aparelho real precisam de evidência específica. Este registro não declara conformidade WCAG nem aceite final de uso.
