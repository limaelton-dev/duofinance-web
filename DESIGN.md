---
name: DuoFinance
description: Sistema visual monocromático para organização financeira pessoal e compartilhada.
colors:
    primary: '#171717'
    primary-foreground: '#ffffff'
    background: '#f7f7f7'
    foreground: '#171717'
    card: '#ffffff'
    secondary: '#eeeeee'
    accent: '#eeeeee'
    muted: '#efefef'
    muted-foreground: '#595959'
    border: '#dedede'
    input: '#858585'
    ring: '#171717'
    destructive: '#ba3035'
    warning: '#7a4b00'
    warning-surface: '#fff4d8'
    success: '#246b57'
    success-surface: '#e8f2ec'
    navigation-surface: '#ffffff'
    navigation-glass: 'rgb(255 255 255 / 88%)'
typography:
    display:
        fontFamily: "'Manrope Variable', 'Segoe UI', sans-serif"
        fontSize: '2rem'
        fontWeight: 700
        lineHeight: 1.25
        letterSpacing: '-0.035em'
    headline:
        fontFamily: "'Manrope Variable', 'Segoe UI', sans-serif"
        fontSize: '1.75rem'
        fontWeight: 700
        lineHeight: 1.22
        letterSpacing: '-0.035em'
    title:
        fontFamily: "'Manrope Variable', 'Segoe UI', sans-serif"
        fontSize: '1.25rem'
        fontWeight: 650
        lineHeight: 1.4
        letterSpacing: '-0.02em'
    title-small:
        fontFamily: "'Manrope Variable', 'Segoe UI', sans-serif"
        fontSize: '1rem'
        fontWeight: 650
        lineHeight: 1.5
    body:
        fontFamily: "'Manrope Variable', 'Segoe UI', sans-serif"
        fontSize: '1rem'
        fontWeight: 400
        lineHeight: 1.5
    label:
        fontFamily: "'Manrope Variable', 'Segoe UI', sans-serif"
        fontSize: '0.875rem'
        fontWeight: 600
        lineHeight: '1.25rem'
    supporting:
        fontFamily: "'Manrope Variable', 'Segoe UI', sans-serif"
        fontSize: '0.875rem'
        fontWeight: 400
        lineHeight: 1.5
    money:
        fontFamily: "'Manrope Variable', 'Segoe UI', sans-serif"
        fontSize: '1.125rem'
        fontWeight: 650
        lineHeight: '1.5rem'
rounded:
    sm: '0.5rem'
    md: '0.75rem'
    lg: '1rem'
    xl: '1.5rem'
spacing:
    '1': '0.25rem'
    '2': '0.5rem'
    '3': '0.75rem'
    '4': '1rem'
    '5': '1.25rem'
    '6': '1.5rem'
    '8': '2rem'
    '10': '2.5rem'
    '12': '3rem'
components:
    button-primary:
        backgroundColor: '{colors.primary}'
        textColor: '{colors.primary-foreground}'
        typography: '{typography.label}'
        rounded: '{rounded.md}'
        padding: '0.75rem 1.25rem'
    button-destructive:
        backgroundColor: '{colors.destructive}'
        textColor: '{colors.primary-foreground}'
        typography: '{typography.label}'
        rounded: '{rounded.md}'
        padding: '0.75rem 1.25rem'
    button-outline:
        backgroundColor: '{colors.card}'
        textColor: '{colors.foreground}'
        typography: '{typography.label}'
        rounded: '{rounded.md}'
        padding: '0.75rem 1.25rem'
    button-secondary:
        backgroundColor: '{colors.secondary}'
        textColor: '{colors.foreground}'
        typography: '{typography.label}'
        rounded: '{rounded.md}'
        padding: '0.75rem 1.25rem'
    button-ghost:
        textColor: '{colors.foreground}'
        typography: '{typography.label}'
        rounded: '{rounded.md}'
        padding: '0.75rem 1.25rem'
    button-link:
        textColor: '{colors.foreground}'
        typography: '{typography.label}'
        rounded: '{rounded.md}'
        padding: '0.75rem 1.25rem'
    input:
        backgroundColor: '{colors.card}'
        textColor: '{colors.foreground}'
        typography: '{typography.body}'
        rounded: '{rounded.md}'
        padding: '0.75rem'
        width: '100%'
    navigation-mobile:
        backgroundColor: '{colors.navigation-glass}'
        textColor: '{colors.muted-foreground}'
        rounded: '{rounded.xl}'
        padding: '0.5rem'
    navigation-current:
        backgroundColor: '{colors.primary}'
        textColor: '{colors.primary-foreground}'
        rounded: '{rounded.lg}'
        padding: '0.5rem 1rem'
    summary:
        backgroundColor: '{colors.card}'
        textColor: '{colors.foreground}'
        rounded: '{rounded.sm}'
        padding: '1.5rem'
    count:
        backgroundColor: '{colors.muted}'
        textColor: '{colors.muted-foreground}'
        rounded: '{rounded.sm}'
        padding: '0 0.375rem'
        height: '1.5rem'
---

# Design System: DuoFinance

## Overview

**Creative North Star: "Clareza em preto e branco"**

O DuoFinance usa contraste, espaço e texto para tornar a organização financeira compreensível. A composição é sóbria e próxima: fundo claro, superfícies brancas, Manrope e ação principal preta. A densidade permite ler contexto, valor e consequência sem depender de ornamentação.

A materialidade combina conteúdo opaco e navegação com vidro branco discreto. Bordas finas organizam listas e resumos; profundidade identifica elementos sobrepostos. O contexto pessoal ou compartilhado permanece reconhecível, e os estados são nomeados em texto, respeitando os compromissos de clareza e autonomia de PRODUCT.md.

Este registro foi extraído do código final em 19/10/2026. Fontes: tokens globais, primitivas de interface e estilos de acesso, navegação, seleção de espaço, Hoje, Finanças e despesas. O contrato de superfície orienta o recorte; valores e comportamentos abaixo descrevem a implementação. As capturas locais consultadas contêm dados sintéticos.

**Key Characteristics:**

- Monocromia como identidade; cor reservada ao significado de estados.
- Uma família tipográfica, com contraste de tamanho e peso.
- Controles confortáveis, superfícies sólidas e listas com separadores.
- Vidro restrito à navegação, sempre com alternativa opaca.
- Contexto visível, foco perceptível e composição que se reorganiza com a largura.

## Colors

A paleta usa preto suave, branco e cinzas neutros; vermelho, âmbar e verde comunicam erro, atenção e confirmação.

As rampas tonais do sidecar são derivações para a prévia do painel, não novas cores normativas da interface.

### Primary

- **Preto de ação** (`primary`): ação principal e destino atual na navegação. **Branco de contraste** (`primary-foreground`) acompanha essas superfícies.
- **Vermelho de erro** (`destructive`): mensagem, contorno inválido e variante de ação destrutiva existente.
- **Âmbar de atenção** (`warning`, `warning-surface`): informação que exige atenção, acompanhada de descrição.
- **Verde de confirmação** (`success`, `success-surface`): confirmação e estado concluído. As cores de estado são funcionais; não formam uma segunda identidade de marca.

### Neutral

- **Papel claro** (`background`): fundo geral e acesso.
- **Branco sólido** (`card`, `navigation-surface`): conteúdo, campos e alternativa opaca da navegação.
- **Tinta** (`foreground`): leitura principal. **Tinta secundária** (`muted-foreground`): contexto, data, ajuda e metadados.
- **Cinza de interação** (`secondary`, `accent`): ações secundárias e resposta ao apontar.
- **Cinza de apoio** (`muted`): contadores, suporte de ícones e carregamento.
- **Linha de estrutura** (`border`): divisores e contornos de superfícies. **Linha de campo** (`input`): limite mais forte de controles.
- **Foco** (`ring`): contorno de navegação por teclado.
- **Vidro branco** (`navigation-glass`): material translúcido do cabeçalho e da navegação inferior.

### Named Rules

**The Cor com significado Rule.** Use vermelho, âmbar e verde para estados nomeados em texto; mantenha ações comuns, conteúdo e navegação na paleta neutra.

## Typography

**Display Font:** Manrope Variable, com Segoe UI e sans-serif como alternativas.

**Body Font:** a mesma família, carregada localmente pelo pacote de fonte.

**Label/Mono Font:** Manrope; números usam algarismos tabulares nos valores financeiros, sem uma família monoespaçada.

**Character:** formas abertas e pesos intermediários dão clareza sem a aparência de um painel bancário. Títulos são compactos, em caixa natural, com espaçamento entre letras ligeiramente reduzido.

### Hierarchy

- **Display** (`display`): valor principal do resumo e do comprovante de despesa. Não é uma chamada promocional.
- **Headline** (`headline`): título de página no acesso, Hoje, Finanças e despesas. O título de Hoje usa entrelinha local (2.125rem).
- **Title** (`title`): seções e resumos. Hoje aplica peso local (700) aos títulos de seção; a base reutilizada permanece no token.
- **Title small** (`title-small`): nome de item, subtítulo e título de terceiro nível.
- **Body** (`body`): explicações e conteúdo de campos. Ajuda e metadados usam `supporting`; as listas de Hoje têm entrelinha local (1.25rem).
- **Label** (`label`): rótulos e botões; caixa natural e sem espaçamento artificial.
- **Money** (`money`): valores nas linhas de Hoje e saldos em listas. Totais de Finanças usam destaque local (1.5rem), peso (650) e espaçamento entre letras (-0.025em).

O texto explicativo de Finanças limita-se a (70ch); avisos parciais de Hoje a (65ch). Valores podem quebrar linha em larguras estreitas. A marca DuoFinance usa a mesma família tipográfica, sem ícone de adição.

### Named Rules

**The Número legível Rule.** Use algarismos tabulares nos valores financeiros e preserve o rótulo que explica o valor; permita a quebra de linha quando a largura exigir.

## Layout

A composição parte de uma coluna. O acesso usa largura máxima de (25rem), centralização vertical e margem interna de (2rem 1rem), ampliada em telas maiores. Formulários de espaços e a coluna principal de despesas limitam-se a (35rem); o comprovante limita-se a (46rem).

O shell tem conteúdo central de até (70rem). No mobile, o cabeçalho participa do fluxo e o conteúdo recebe margem interna lateral de (1.25rem). A marca e a conta ocupam a primeira linha; o seletor de espaço ocupa a largura seguinte. Tipo e estado ficam abaixo do seletor. O cabeçalho não fica fixo em telas estreitas, liberando a leitura com ampliação de texto.

A partir de (768px), a navegação passa para uma barra lateral sólida e fixa de (14rem); o cabeçalho torna-se aderente ao topo. A margem interna do conteúdo passa para (2.5rem 2rem 4rem). O contexto continua podendo ocupar duas linhas até (1100px), quando seletor, estado e gerenciamento cabem em três colunas. A partir de (1280px), o conteúdo usa margem interna superior e lateral de (3rem).

A navegação inferior fica centralizada, com largura de até (22rem), afastamento inferior de (0.75rem) mais a área segura e largura máxima disponível descontando (2.5rem). Com quatro destinos, o conteúdo e a rolagem reservam espaço inferior de (10rem) mais a área segura, mantendo o foco visível com texto ampliado. Essa reserva é uma extensão do layout do shell, sem ampliar a escala de tokens.

Listas de Hoje alinham texto e valor em colunas a partir de (640px). Antes disso, o valor fica abaixo, alinhado ao texto após o ícone. Os totais de Finanças formam três colunas a partir de (768px). Na despesa, a partir de (1024px), campos e confirmação ocupam a primeira coluna e o resumo ocupa a segunda, aderente ao topo em (6.5rem). Abaixo disso, a ordem do documento mantém resumo antes da confirmação. Em larguras de até (359px), pares de rótulo e valor passam a uma coluna. As ações de espaços se empilham até (36rem).

O ritmo recorrente usa intervalos de (0.5rem) entre rótulo e campo, (0.75rem) entre ações, (1rem) dentro de blocos, (1.5rem) entre grupos e (2rem) entre seções. Quebra de texto, largura mínima zero e ações flexíveis preservam o conteúdo quando o espaço diminui.

## Elevation & Depth

O conteúdo permanece plano: branco sobre papel claro, bordas finas e separadores. Sombras pertencem à navegação flutuante, aos menus e ao diálogo. Não há elevação de cards ao apontar.

### Shadow Vocabulary

- **Navegação flutuante** (`0 4px 20px rgb(0 0 0 / 8%)`): separa a barra inferior do conteúdo.
- **Menu** (`0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`): elevação da primitiva de menu.
- **Diálogo** (`0 12px 40px rgb(0 0 0 / 15%)`): confirmações de espaços, sobre fundo escurecido (`rgb(0 0 0 / 45%)`).

### Named Rules

**The Vidro na navegação Rule.** Aplique translucidez e desfoque apenas ao cabeçalho e à navegação inferior; mantenha conteúdo, campos e navegação lateral opacos.

O vidro usa desfoque de (12px) quando suportado. Sem suporte, com redução de transparência ou em cores forçadas, o fundo torna-se sólido e o desfoque é removido. A sombra não substitui o contorno.

## Shapes

Controles principais usam o raio `md` (12px). Listas, resumos e painéis de conteúdo usam `sm` (8px); a primitiva de alerta usa `lg` (16px). Na navegação inferior, a moldura usa `xl` (24px) e o destino usa `lg`; na lateral, o destino usa `md`.

As bordas estruturais e de campos têm espessura de (1px). Chips são compactos e não simulam botões: o contador de Hoje usa `sm`, e o estado de despesa tem raio local de (0.375rem). Esse detalhe local não amplia a escala global de raios. Ícones são vetores de traço, geralmente entre (16px) e (24px), acompanhados de texto ou de nome acessível.

## Components

### Buttons

Ações firmes, com texto curto e forma estável.

- **Shape:** raio `md`, altura mínima padrão de (48px), intervalo entre ícone e texto de (0.5rem). A altura é mínima; o conteúdo pode crescer.
- **Primary:** preto de ação e texto branco. A variante `default` é registrada no frontmatter como `button-primary`.
- **Secondary / Outline / Ghost / Link:** cinza de interação; branco com contorno de campo; fundo transparente; ou texto que ganha sublinhado ao apontar, respectivamente.
- **Destructive:** usa a cor de erro, mantendo a mesma geometria.
- **Hover / Focus:** primário com opacidade de fundo (85%), destrutivo (90%) e secundário (75%). Contorno e ghost recebem o cinza de interação. Foco de (2px) com afastamento de (4px).
- **Sizes:** compacto com mínimo de (44px), grande com mínimo de (52px) e botão de ícone de (48px). O controle de revelar senha é uma aplicação local de (44px), encaixada no campo.
- **Disabled:** opacidade (50%) e interação suprimida na primitiva. Transições de cor usam (150ms); a preferência por movimento reduzido é respeitada.

### Chips

Informativos, sem sugerir uma ação.

- O contador de Hoje usa fundo de apoio, texto secundário, algarismos tabulares e altura de (24px).
- O estado de despesa usa fundo da superfície, contorno estrutural e texto semibold. A cor sozinha não informa o estado.
- Esses elementos não têm estados de hover ou foco porque não são controles.

### Cards / Containers

Superfícies sólidas para leitura, sem decoração concorrente.

- **Corner Style:** `sm` para listas, painéis e resumos; exceção da primitiva de alerta descrita em Shapes.
- **Background / Border:** branco sólido e linha de estrutura. Sem sombra em repouso ou hover.
- **Internal Padding:** resumos e painéis usam (1.5rem); linhas de Hoje usam (1rem), ampliando para (1.25rem) a partir de (640px); linhas de Finanças usam (1.25rem).
- **Listas:** uma superfície compartilhada, com divisores entre itens. Os textos de vazio são diretos, acompanhados de ícone apenas quando existente.
- **Alertas:** texto e contorno de estado; atenção e sucesso também têm fundo tonal. Falhas parciais permanecem próximas ao bloco afetado.

### Inputs / Fields

Campos brancos com contorno visível e rótulo persistente.

- **Style:** raio `md`, altura mínima de (48px), conteúdo em `body`, preenchimento interno de (0.75rem) e contorno de campo.
- **Focus:** a primitiva usa contorno de foco de (2px), afastado em (2px); formulários de despesas usam afastamento local de (3px). O foco global e os links usam (4px).
- **Error / Disabled:** cor de erro no limite inválido, com mensagem associada; a primitiva desabilitada usa opacidade de (60%).
- **Senha:** alternância vetorial de visibilidade dentro do campo, com espaço reservado à direita; a ação não desloca o texto.
- **Seletor de espaço:** campo nativo com texto semibold, estado e tipo associados. O rótulo visível no mobile permanece disponível à tecnologia assistiva no desktop.

### Navigation

Navegação em caixa natural, com ícone e rótulo. O destino atual usa preto e branco, com `aria-current`; os demais usam texto secundário e recebem fundo de interação ao apontar. O foco usa o contorno global.

A barra inferior tem destinos com altura mínima de (52px) e ícone sobre o texto. A barra lateral usa altura mínima de (48px), com ícone ao lado do texto. O cabeçalho contém contexto e gerenciamento; não recebe uma sombra adicional.

O menu de ações é opaco, com raio `md`, preenchimento de (0.5rem), largura mínima de (14rem), largura máxima descontando (2rem) da tela e rolagem limitada à altura disponível. Itens têm altura mínima de (48px), raio `lg` e estado de foco tonal.

O shell do espaço expõe Hoje, Finanças, Rotina e Compras, preservando ícones, rótulos e estados das mesmas primitivas. O encerramento é acessado pelo gerenciamento do espaço e pela atenção de Hoje.

### Resumo e comprovante financeiro

A assinatura recorrente é um bloco branco com título, rótulos explicativos e valores alinhados. O resumo apresenta pares em duas colunas quando há espaço; o comprovante destaca o valor e separa divisão, pagamento e acerto com linhas finas. O destaque verde pertence à confirmação textual. Montantes e nomes de demonstração não são tokens nem regras de negócio.

## Do's and Don'ts

### Do:

- **Do** usar os tokens existentes e Manrope para manter a mesma hierarquia entre acesso, contexto e conteúdo.
- **Do** manter controles padrão com altura mínima de 48px e raio de 12px, permitindo crescimento do conteúdo.
- **Do** identificar o espaço e nomear estados em texto junto ao sinal visual.
- **Do** preservar foco visível, quebra de texto, área segura e alternativa opaca para a navegação.
- **Do** usar algarismos tabulares em valores financeiros e separar rótulo, valor e consequência.

### Don't:

- **Don't** aplicar vidro ou desfoque a campos, resumos, listas ou navegação lateral.
- **Don't** usar cores de estado como decoração ou para substituir uma mensagem compreensível.
- **Don't** transformar listas e resumos em cards elevados ao apontar.
- **Don't** fixar alturas de blocos de texto, impedir quebra de valores ou remover o contorno de foco.
- **Don't** promover diferenças locais de peso, raio ou tamanho a novos tokens sem confirmar um padrão reutilizado.
