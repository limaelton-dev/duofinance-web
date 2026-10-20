# Rotina, Compras e encerramento — waves 6 a 8

Modo: Operate. Extensão do sistema existente para CARD-033–049, autorizada por Elton em 19/10/2026. Fontes normativas: backlog e acompanhamentos oficiais das waves 06, 07 e 08 no Drive, contratos REST da API e documentação de marca e experiência Web.

THESIS: identificar o que fazer e comprar, registrar progresso real e concluir o compartilhamento com consequências explícitas e histórico preservado.

OWN-WORLD: preservar DESIGN.md, Manrope local, preto e branco, superfícies opacas, listas com divisores, ações confortáveis, foco visível e vidro apenas no shell existente.

STORY: reconhecer o espaço; consultar atenção, tarefa ou lista; registrar uma ação e conferir o resultado. No encerramento, diagnosticar, definir corte e destinos, revisar o plano, obter concordância, resolver finanças e confirmar conforme capacidades do servidor.

FIRST VIEWPORT: título, contexto e ação principal; atenção antes de listas completas; formulários em coluna no celular. Dados desconhecidos não viram zero. Prazo, urgência, responsável, executor e autor do registro mantêm significados distintos.

FORM: código direto e extensão fiel, sem nova escolha estética. Navegação Hoje, Finanças, Rotina e Compras; encerramento pelo gerenciamento do espaço e atenção de Hoje. Histórico encerrado em somente leitura. Nenhuma captura nova em `.impeccable/review`, conforme preferência existente do usuário.

SIGNATURE INTERACTION: progresso parcial de compras com quantidade restante explícita e plano de encerramento revisável antes de cada decisão; respostas, versões e tentativas permanecem vinculadas à pessoa e ao espaço originais.

FINISH: revisão independente de código e interação, validações de dados, interface e API real; documentar evidências e limites sem atribuir aprovação visual a capturas ausentes. Extensões preservam os tokens e as regras de DESIGN.md e seu sidecar.

## Registro de execução — 19/10/2026

Os cards 033–049 foram implementados em `src/features/routine`, `src/features/shopping` e `src/features/spaces/closure`, com rotas compostas em `src/app` e clientes REST em `src/lib/api`. Hoje conduz às tarefas e ocorrências, às listas e ao encerramento; o shell oferece Hoje, Finanças, Rotina e Compras. O gerenciamento do espaço também dá acesso ao encerramento.

A extensão preserva a identidade existente: Manrope local, preto e branco, cores de estado semânticas, Button e Input sobre as primitivas atuais, superfícies opacas, bordas e divisores. Rotina e Compras usam CSS Modules; o encerramento compõe os mesmos tokens com Tailwind. As listas de compras usam texto, quantidades e histórico, sem imagens de produtos. O conteúdo e a rolagem do shell passaram de 7rem para 10rem mais a área segura para preservar o foco com quatro destinos em 320px e texto a 200%; isso é ajuste de layout, sem token novo.

Consultas, comandos e proteção de saída usam a base genérica de Espaços; Finanças reutiliza a mesma base por aliases e wrapper. As tentativas permanecem vinculadas a pessoa, sessão, espaço e entrada capturados. Compras verifica também a identidade de lista, item, compra e recursos aninhados; quantidades decimais exatas, correções e vínculos preservam suas histórias. O descarte de vários formulários só ocorre quando todos permitem a saída.

O encerramento apresenta diagnóstico paginado completo, corte, destinos, plano e concordâncias por revisão. Proposta, aprovação e confirmação enviam o fingerprint financeiro bruto recebido na consulta revisada, junto às versões, para o servidor conferir o estado vigente. A interface mostra montantes em aberto por direção. Aprovar plano, resolver bloqueadores, concluir e cancelar são decisões distintas, com confirmações aplicáveis às duas pessoas e histórico encerrado em somente leitura. As regras completas continuam nas fontes normativas; este registro descreve a composição entregue.

Evidência confirmada: 125 testes de dados e isolamento, 77 da interface sintética completa e 54 com API e PostgreSQL reais aprovados: 10 das novas jornadas e 44 regressões de contexto, Hoje e Finanças. Tipos, lint sem avisos, formatação e builds de produção aprovados. Suítes reais em processos separados, sem alterar as proteções de autenticação. A revisão independente de código e interação marcou como resolvidos os ajustes na identidade de recursos de Compras e no descarte atômico de múltiplos formulários, inclusive evento de navegação já cancelado. Resultados finais e comandos de reprodução ficam no README, preservando o histórico das waves 2–5.

Não houve geração ou salvamento de capturas em `.impeccable/review`; não se declara aprovação visual por imagens. DESIGN.md recebeu apenas atualização descritiva dos quatro destinos e da reserva inferior. Seu frontmatter e `.impeccable/design.json` permanecem intocados. A data preexistente do sidecar não foi sincronizada automaticamente, pois essa sincronização não foi autorizada nesta extensão.
