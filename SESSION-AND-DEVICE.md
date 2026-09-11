# Login e informações do aparelho

A logo Taag30.png ocupa uma tela de carregamento branca em toda a janela, preservando a proporção da imagem.

A sessão utiliza um cookie HttpOnly persistente de 400 dias, renovado nas requisições autenticadas. O botão Sair encerra a sessão neste navegador sem excluir dados. Falhas de rede não apagam a sessão. Limpeza de cookies, navegação privada, regras do navegador, 400 dias sem acesso ou mudança de COOKIE_SECRET podem exigir novo login. Mantenha COOKIE_SECRET estável no Render.

O horário segue o relógio e fuso do aparelho. Bateria e carregamento são atualizados quando getBattery está disponível; caso contrário aparece Bateria —. A conexão indica Online/Offline ou Wi-Fi/rede móvel quando o navegador expõe o tipo. A web não fornece intensidade real do sinal celular; Online não garante acesso ao servidor. Esses dados ficam no navegador.

Referências: https://developer.mozilla.org/en-US/docs/Web/API/Battery_Status_API e https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation
