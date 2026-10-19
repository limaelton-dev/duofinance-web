# Product

<!-- impeccable:product-schema 1 -->

Registro iniciado com `impeccable init` em 19/10/2026. Respostas explícitas de Elton e regras vigentes estão identificadas abaixo. Este briefing orienta o trabalho de interface; domínio, arquitetura, backlog e evidências continuam na [documentação oficial](../Docs/README.md). Em divergências, consultar a fonte correspondente e registrar a decisão, sem criar regra de negócio neste arquivo.

## Platform

web

## Users

Público principal confirmado por Elton em 19/10/2026: **duas pessoas que compartilham despesas e rotina, mantendo o espaço pessoal separado**. Não presumir casamento, gênero, conta bancária conjunta ou mesmo grau de familiaridade financeira.

O espaço pessoal permanece parte do produto. Um espaço compartilhado admite até dois membros ativos e pode começar com uma pessoa aguardando a outra. Perfis demográficos, aparelhos, frequência de uso e necessidades assistivas específicas ainda não foram pesquisados.

## Product Purpose

Organizar compromissos financeiros e domésticos, mostrando o que exige atenção, o que cabe a cada pessoa e o efeito de cada registro. Finanças é o domínio central; Espaços e Participação, Rotina e Compras fazem parte do MVP vigente.

Sucesso proposto para a experiência: a pessoa identifica o espaço, registra um compromisso e explica o efeito sem ajuda e sem erro financeiro. Ainda não há resultado de teste com público que comprove isso.

## Positioning

Organizador pessoal e compartilhado que separa responsabilidade, previsão de pagamento e realização, preservando histórico e autonomia dos participantes. O produto registra fatos externos; não é banco e não transfere dinheiro. Não há diferenciação comercial exclusiva ou promessa de resultado financeiro validada.

## Operating Context

Interface em pt-BR, dinheiro em BRL e datas civis de America/Sao_Paulo. Web com foco em celulares, mantendo uso no desktop. Aplicativo nativo é intenção futura, fora desta etapa — confirmado por Elton. Consultar pendências do dia, registrar despesas e divisão, conferir acertos, tarefas e compras são situações centrais documentadas.

Hoje, Finanças, Rotina e Compras são a navegação vigente; espaço pessoal/compartilhado é contexto global. O usuário precisa reconhecer esse contexto antes de agir. Rede lenta, interrupção, teclado aberto e mudança de espaço são condições a verificar; frequência real ainda desconhecida.

## Capabilities and Constraints

- Preservar o MVP e os cards existentes. Começar por um fluxo visual não remove Rotina, Compras, integridade ou encerramento do escopo.
- Responsabilidade econômica, pagador previsto e realização são conceitos diferentes. Cartão não é desembolso imediato; previsão de compromissos não é saldo bancário. Usar centavos inteiros e os contratos vigentes.
- O servidor autoriza acesso. Contexto pessoal e compartilhado não pode vazar por cache, resposta atrasada, troca de espaço ou nova sessão.
- Sessão opaca no servidor, cookies protegidos e CSRF seguem a arquitetura. Não substituir autenticação nem proteções de comando durante o trabalho visual.
- Comando financeiro precisa tratar duplicação, conflito e resultado incerto. Não afirmar falha ou sucesso sem confirmação; repetir explicitamente a mesma tentativa quando o contrato permitir.
- Alterações onerosas, correções, reversões e encerramento preservam concordâncias e histórico conforme domínio. Ocultar um botão não substitui autorização.
- Acesso por e-mail e senha. Login social, verificação automática de e-mail e recuperação automática de senha não pertencem ao MVP atual. Procedimento operacional de perda de acesso e canal real de suporte seguem pendentes.
- A Web tem telas, clientes e testes para Hoje, Finanças, Rotina e Compras. A extensão dos cards 033–049 implementa operações de tarefas, recorrências, listas, compras e vínculos, além do encerramento pelo gerenciamento do espaço. Hoje usa os seis blocos do contrato ampliado, trata fontes parcialmente indisponíveis e conduz às tarefas, listas e ao encerramento. Implementação, integração e validação com pessoas permanecem evidências distintas.
- Tratamento de resultado incerto após recarga/fechamento, política operacional de privacidade e retenção permanecem decisões abertas na documentação oficial.

## Brand Commitments

- Nome público **Prospera Mais**, confirmado por Elton; manter os identificadores técnicos existentes.
- Direção **preto e branco**, escolhida após comparação. Elton também expressou preferência pelo efeito de vidro do iPhone. Essa preferência orienta a apresentação, sem transformar o produto Web em aplicativo nativo.
- **Neo Financial mobile do Canadá** é a referência principal escolhida. Não copiar marca nem introduzir funcionalidades bancárias por semelhança visual.
- Interface bonita, limpa, intuitiva e com valor prático, sem composição genérica de IA — intenção explícita. Transformar isso em critérios verificáveis, sem tratar preferência estética como prova de usabilidade.
- Feedback claro, respeito, segurança e integridade são requisitos do pedido. Tom próximo e discreto é a proposta detalhada no documento de marca, ainda sem validação de percepção pelo público.

## Evidence on Hand

- [Marca e experiência Web](<../Docs/04 — UX, fluxos e wireframes/Marca-e-experiencia-web/README.md>): direção, fluxos, fichas, governança e estados das decisões.
- [Contexto vigente](../Docs/Acompanhamentos/CONTEXTO-E-DECISOES.md) e [índice oficial](../Docs/README.md): domínio, escopo, arquitetura, cards e evidências por wave. Este briefing não substitui essas fontes.
- Código local da Web e contratos da API; a documentação de experiência distingue implementação, proposta e validação.
- Conversa “Identificar Neo Financial” lida nesta tarefa. Preferências de nome, direção monocromática, vidro e público foram fornecidas por Elton.
- A busca no Mobbin exigiu plano pago; as capturas mobile da Neo **não foram vistas**. Apenas o login web público foi inspecionado como referência secundária. Não inventar observações mobile, depoimentos, pesquisa com usuários ou certificação.
- Exemplos visuais usam dados fictícios e não se conectam à API. Nome/domínio/registro de marca ainda não tiveram disponibilidade verificada.

## Product Principles

1. **Contexto antes de ação:** a pessoa reconhece onde está e quem participa antes de criar ou alterar um registro.
2. **Efeito compreensível:** valor, participação, realização e consequência permanecem distinguíveis, inclusive em erro.
3. **Integridade antes de conveniência:** não duplicar fatos, esconder incerteza ou apagar histórico para simplificar a interface.
4. **Autonomia de cada pessoa:** acesso pessoal, consentimento aplicável e limites do compartilhamento continuam explícitos.
5. **Progresso verificável:** entregar uma jornada coerente por vez, preservar as fontes oficiais e distinguir hipótese, implementação e evidência.

## Accessibility & Inclusion

O pedido exige navegação fácil e feedbacks claros. A documentação propõe WCAG 2.2 AA como meta de implementação, sem declarar conformidade. Leitura, teclado, ampliação, tecnologias assistivas e redução de efeitos precisam ser verificadas em tarefas completas. Necessidades específicas do público ainda são desconhecidas.
