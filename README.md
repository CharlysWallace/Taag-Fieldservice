# FieldService App — TAAG

Aplicativo de gestão de equipes de campo com frontend e backend Node.js/Express.

## PostgreSQL + GitHub + Render

Esta versão mantém o frontend e aceita PostgreSQL por `DATABASE_URL`. Quando `DATABASE_URL` não existe, o app continua usando os dados JSON locais para facilitar os testes.

### Execução local

```bash
npm install
cp .env.example .env
npm start
```

Abra `http://localhost:3000`.

### Produção

Configure no provedor:

```text
NODE_ENV=production
COOKIE_SECRET=<segredo forte>
DATABASE_URL=<URL PostgreSQL>
PGSSL=require
```

O arquivo `postgresql.sql` contém a estrutura PostgreSQL e `render.yaml` contém a configuração de deploy no Render.
