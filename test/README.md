Execute os testes em uma cópia local com os dados de demonstração do seed, sem DATABASE_URL e sem credenciais de produção.

1. Instale as dependências.
2. Inicie: `PORT=3100 COOKIE_SECRET=local-test-session-secret node server.js`
3. Em outro terminal: `node --test test/session.test.js`

O teste usa somente localhost:3100. Verifica restauração e renovação de cookies, logout, bateria e mudanças de conexão.
