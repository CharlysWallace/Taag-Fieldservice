# Deploy pelo GitHub + Render + PostgreSQL

## Arquivos adicionados

- `postgresql.sql`: cria a estrutura PostgreSQL sem alterar o formato usado pelo app.
- `render.yaml`: configuração pronta do Web Service no Render.
- `.github/workflows/validate.yml`: valida a sintaxe Node a cada push/pull request.
- `src/init-db.js`: comando opcional `npm run db:init`.

## Variáveis de ambiente

No Render, configure:

```text
NODE_ENV=production
COOKIE_SECRET=<gere um segredo forte>
DATABASE_URL=<URL do seu PostgreSQL>
PGSSL=require
```

Nunca coloque a senha do banco diretamente no GitHub. O arquivo `.env` já está no `.gitignore`.

## GitHub

Dentro da pasta do projeto:

```bash
git init
git add .
git commit -m "PostgreSQL e deploy Render"
git branch -M main
git remote add origin <URL_DO_REPOSITORIO>
git push -u origin main
```

## Render

1. Crie/conecte um repositório GitHub.
2. Crie um Web Service no Render apontando para esse repositório.
3. Build command: `npm install`
4. Start command: `npm start`
5. Health check: `/api/health`
6. Cadastre as variáveis acima.

Na primeira inicialização com `DATABASE_URL`, o próprio app cria a tabela necessária e executa o seed inicial caso não existam usuários.
