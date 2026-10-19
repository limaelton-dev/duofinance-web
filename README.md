# Prospera Mais — Web

Aplicação Web em Next.js, com foco em celulares. API REST e regras de negócio têm repositório próprio.

## Documentação oficial

- [Marca e experiência Web](<../Docs/04 — UX, fluxos e wireframes/Marca-e-experiencia-web/README.md>): produto, marca, direção visual, navegação, design system, governança e fichas de tela.
- [Contexto e decisões de execução](../Docs/Acompanhamentos/CONTEXTO-E-DECISOES.md).
- [Índice completo](../Docs/README.md): domínio, escopo, backlog, arquitetura e acompanhamentos.

Os links pressupõem o workspace com API, Web e `Docs` lado a lado. Neste ambiente, a documentação é acessível em `C:\Projs\ProsperaMais\Docs`, vinculada à pasta oficial do Drive. Em checkout isolado, consultar essa fonte; não criar cópia concorrente.

Em 19/10/2026, Elton confirmou **Prospera Mais**, escolheu a direção **preto e branco** e pediu inspiração no vidro do iPhone. O público principal é uma dupla que compartilha despesas e rotina, com espaço pessoal separado. A interface de acesso, espaços, Hoje e despesa aplica essa direção, com vidro restrito à navegação e alternativa opaca.

O [PRODUCT.md](PRODUCT.md) registra o briefing para o Impeccable. O [DESIGN.md](DESIGN.md) documenta os tokens e componentes implementados, com extensão em [.impeccable/design.json](.impeccable/design.json). Tailwind CSS 4, primitivas shadcn/ui sobre Radix, Manrope local e CSS Modules sustentam a interface. A lógica de sessão, contexto, comandos financeiros e consultas continua na arquitetura existente. Cards e critérios oficiais permanecem válidos.

## Desenvolvimento

Use Node 24 conforme `.nvmrc`, instale com `npm ci` e configure `.env.local` a partir de `.env.example`. `npm run dev` inicia a Web. A API deve estar disponível na URL configurada.

Hoje consome o contrato ampliado com seis blocos, inclusive fontes parcialmente indisponíveis. Os destinos implementados são Hoje e Finanças. Tarefas e compras retornadas pela composição aparecem como leitura; suas telas de operação seguem o backlog oficial.

## Verificação

- `npm run lint`, `npm run format:check`, `npm run typecheck` e `npm run build` verificam o projeto.
- `npm run test:interface` verifica apresentação, teclado, reflow e texto ampliado usando dados sintéticos, sem API real. Capturas opcionais com `IMPECCABLE_REVIEW=1` ficam em `.impeccable/review`, fora do Git.
- `npm run test:e2e -- card-010.spec.ts` executa uma suíte com API real e PostgreSQL descartável. A API deve estar no diretório irmão `prospera-mais-api`; inicie seu `compose.test.yaml` antes. O runner usa portas 3100/3101 e banco de teste na porta 55432.
- Execute os cards em processos separados, como na matriz da CI: uma execução conjunta pode atingir os limites reais de autenticação. Não desabilite essas proteções para fazer os testes passarem.

A CI fixa um commit da API compatível com a composição ampliada de Hoje. Aprovação local, CI remota, integração, deploy e validação com pessoas são evidências distintas; o acompanhamento oficial registra o estado de cada uma.
