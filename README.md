# FieldService App — TAAG

Aplicativo completo (frontend + backend) de gestão de equipes de campo:
agendamento de OS, check-in/checkout, evidências fotográficas, assinatura
digital, relatórios em PDF, cadastro de usuários com aprovação e
notificações. Login de verdade (senha com hash + sessão em cookie),
autorização aplicada no servidor (não mais confiável ao navegador).

Esta é a entrega final: frontend e backend rodam juntos, no mesmo processo,
na mesma origem. Um único `npm start` sobe o app inteiro.

## Por que cada peça existe (visão geral)

| Arquivo | Papel no app |
|---|---|
| `server.js` | Ponto de entrada: sessão, rotas da API e o frontend estático (`/public`), tudo na mesma origem. |
| `public/` | O frontend: `index.html`, `style.css`, `app.js`, `logo-taag.png` — servidos diretamente pelo Express. |
| `public/app.js` | Toda a lógica de tela do app. Não guarda mais nenhum dado sensível — fala com o backend via `fetch('/api/...')`. |
| `src/db.js` | "Banco de dados" em arquivos JSON — simples de propósito (zero instalação), com o esquema relacional real documentado em comentário para quando for migrar para Postgres. |
| `src/seed.js` | Popula `/data` na primeira execução com técnicos/usuários/OS de demonstração — mesmas credenciais que o app sempre usou. |
| `src/auth/hash.js` | Transforma senha em hash (bcrypt) — resolve o problema de senhas em texto puro que existia nas versões anteriores do frontend. |
| `src/auth/middleware.js` | O coração da segurança: decide no servidor (não mais no navegador) quem está logado, qual o perfil, e se a OS pedida pertence ao técnico que está pedindo. |
| `src/routes/auth.routes.js` | Login, sessão, cadastro (sem escolha de perfil) e aprovação (só admin decide Técnico/Admin/Visualizador). |
| `src/routes/os.routes.js` | CRUD de ordens de serviço, com o escopo "técnico só vê a própria agenda" garantido pelo servidor. |
| `src/routes/tecnicos.routes.js` | Lista de técnicos (usada nos formulários e filtros do frontend). |
| `src/routes/notifications.routes.js` | Notificações por sessão — técnico avisado de nova visita, admin avisado de novo cadastro. |

## Como rodar

```bash
cd backend
npm install
cp .env.example .env    # ajuste COOKIE_SECRET antes de produção
npm start
```

Abra **http://localhost:3000** no navegador — é só isso, frontend e backend
já estão juntos. Na primeira execução, uma pasta `/data` é criada com os
arquivos JSON já populados. Nas próximas execuções, os dados persistem —
apagar a pasta `/data` reseta tudo para o estado inicial.

## Contas de demonstração (senha para todas: `Taag@2026`)

| E-mail | Perfil |
|---|---|
| `charlys.wallace@taagbrasil.com.br` | ADMIN (principal — só ele aprova cadastros) |
| `programacao05@taagbrasil.com.br` | TECNICO (Charlys Wallace) |
| `programacao01@taagbrasil.com.br` | TECNICO (Bruno Gomes) |
| `tecnico01@taagbrasil.com.br` | TECNICO (Hebert Vinicios) |
| `visualizador@taagbrasil.com.br` | VISUALIZADOR |

## Endpoints

### Autenticação e cadastro

| Método | Rota | Quem pode | O que faz |
|---|---|---|---|
| POST | `/api/auth/login` | qualquer um | `{email, senha}` → cria a sessão |
| GET | `/api/auth/me` | logado | devolve o usuário da sessão atual (usado no F5 para não perder o login) |
| POST | `/api/auth/logout` | logado | encerra a sessão |
| POST | `/api/auth/register` | qualquer um | cria uma **solicitação** pendente (nunca escolhe o próprio perfil) |
| GET | `/api/auth/pending` | ADMIN | lista solicitações aguardando aprovação |
| POST | `/api/auth/pending/:id/approve` | ADMIN | `{perfil}` → aprova como TECNICO/ADMIN/VISUALIZADOR |
| POST | `/api/auth/pending/:id/reject` | ADMIN | recusa a solicitação |

### Técnicos e ordens de serviço

| Método | Rota | Quem pode | O que faz |
|---|---|---|---|
| GET | `/api/tecnicos` | logado | lista os técnicos cadastrados |
| GET | `/api/os` | logado | lista OS — técnico só vê as suas; admin/visualizador veem tudo |
| GET | `/api/os/:id` | dono ou ADMIN/VISUALIZADOR | detalhe de uma OS |
| POST | `/api/os` | ADMIN | cria OS (cliente existente ou novo) — notifica o técnico |
| DELETE | `/api/os/:id` | ADMIN | exclui a OS |
| POST | `/api/os/:id/checkin` | técnico dono | registra chegada |
| POST | `/api/os/:id/checkout` | técnico dono | `{descricao, camposServico, assinatura}` → conclui (assinatura obrigatória) |
| POST | `/api/os/:id/fotos` | técnico dono | `{categoria, dataUrl}` → anexa evidência fotográfica |

### Notificações

| Método | Rota | Quem pode | O que faz |
|---|---|---|---|
| GET | `/api/notificacoes` | logado | lista as notificações da sessão + contagem de não lidas |
| POST | `/api/notificacoes/marcar-lidas` | logado | marca todas como lidas |

## O que eu testei de verdade (fluxo completo, no navegador, contra o servidor rodando)

- Login errado → erro na tela. Login certo → entra na tela certa por perfil.
- Bruno (técnico) faz check-in, anexa foto "antes", tenta finalizar sem foto "depois" → bloqueado; anexa "depois" → libera; assina na tela → conclui. Tudo isso gravado no servidor, não no navegador.
- **F5 no meio da sessão → continua logado** (sessão restaurada via `/api/auth/me`).
- Visitante se cadastra sem escolher perfil → admin recebe notificação → admin aprova como Técnico → pessoa já loga na hora com a senha que ela mesma escolheu, e já aparece na lista de técnicos.
- Admin abre o atendimento que o Bruno concluiu → vê o botão "Enviar relatório ao cliente".
- Dados sobrevivem a reinício do servidor (persistência em arquivo confirmada).

## Limitações conhecidas (e o caminho de evolução)

- **Fotos em base64 dentro do JSON**: funciona bem até um volume moderado de uso, mas não escala indefinidamente. Evolução natural: subir para um object storage (S3/R2) e guardar só a URL.
- **Banco em arquivo JSON**: sem transações, não aguenta concorrência pesada (muitos técnicos gravando ao mesmo tempo). O esquema relacional para migrar a um Postgres de verdade já está comentado em `src/db.js`.
- **Sem rate limiting no login**: para produção, adicione algo como `express-rate-limit` para dificultar força bruta.
- **HTTPS**: o cookie de sessão só fica `Secure` quando `NODE_ENV=production` — implante atrás de um proxy com HTTPS (Nginx, Caddy, ou a própria hospedagem) antes de ir ao ar.
- **Notificações são "puxadas" (polling), não push**: o técnico só vê a notificação quando abre o app. Para avisar mesmo com o app fechado, o próximo passo é Web Push (Service Worker) ou WebSocket.


## PostgreSQL + GitHub + Render

Esta versão mantém o frontend exatamente igual e passa a aceitar PostgreSQL por `DATABASE_URL`.
Quando `DATABASE_URL` não existe, o app continua usando `data/*.json`, o que facilita testes locais.

### 1. Subir para o GitHub

Na pasta `backend`:

```bash
git init
git add .
git commit -m "Preparar app para PostgreSQL e deploy"
git branch -M main
git remote add origin URL_DO_SEU_REPOSITORIO
git push -u origin main
```

O `.gitignore` já impede que `.env`, `node_modules/` e os dados locais sejam enviados.

### 2. Criar o PostgreSQL

Você pode usar qualquer PostgreSQL que forneça uma `DATABASE_URL`. Existem duas opções:

- deixar o Node criar automaticamente a tabela na primeira inicialização; ou
- executar manualmente o arquivo `postgresql.sql` no painel SQL do provedor.

O seed inicial também roda automaticamente quando a coleção de usuários ainda está vazia.

### 3. Variáveis de ambiente no Render

Defina:

```text
NODE_ENV=production
COOKIE_SECRET=<segredo forte e aleatório>
DATABASE_URL=<URL de conexão PostgreSQL>
PGSSL=require
```

O arquivo `render.yaml` já informa build, start e health check. A `DATABASE_URL` não é salva no GitHub.

### 4. Deploy pelo GitHub

No Render, crie um Web Service conectado ao repositório GitHub. Use:

```text
Build Command: npm install
Start Command: npm start
Health Check: /api/health
```

A cada novo push para a branch configurada, o Render pode fazer novo deploy automaticamente.

### Arquivo PostgreSQL

`postgresql.sql` cria a tabela `app_collections` usando JSONB. Esta escolha é proposital para que a migração não mude nenhuma estrutura que o frontend já espera. Assim, telas, campos, rotas, login, OS, fotos, assinatura e notificações permanecem com o mesmo formato.

## Exclusões e permissões

- Apenas administradores excluem OS, inclusive concluídas. A confirmação informa que o relatório, fotos e assinatura também serão excluídos.
- Na aba de cadastro de clientes, o administrador pode excluir um cliente. Os dados históricos das OS existentes são preservados; o cliente deixa de estar disponível para novas OS.
- O técnico responsável pode remover fotos durante o atendimento. Após a conclusão, a remoção é feita na edição única, com nova assinatura e mantendo as fotos obrigatórias de antes e depois.
- O agente de IA e seus acessos foram removidos. O aplicativo não utiliza mais a API OpenAI.

## Relatórios sem agendamento

O técnico acessa “Relatório sem agendamento” pela agenda ou configurações, informa cliente, serviço e datas/horários de chegada e saída. O atendimento fica em andamento para anexar evidências e coletar assinatura. Após concluir, aparece no histórico e dashboard com os horários informados. Os dados do cliente ficam no atendimento e não criam um cadastro geral. As mesmas regras de autoria, fotos obrigatórias e edição única se aplicam.

A interface não exibe indicadores de bateria, rede ou horário, nem sino ou aba de notificações. As confirmações e mensagens de erro das ações permanecem disponíveis. Cadastros novos aguardam aprovação em uma tela própria e não têm acesso aos dados internos antes da aprovação.

A assinatura do cliente é opcional nos relatórios agendados e sem agendamento, inclusive na edição única. Sem assinatura, a seção não aparece na consulta nem no PDF.
