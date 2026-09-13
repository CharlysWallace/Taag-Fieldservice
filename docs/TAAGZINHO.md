# Ativar a IA do Taagzinho

O chat usa a API OpenAI no servidor. A aplicação não inclui uma chave e nunca deve recebê-la no JavaScript público, em commits ou nesta conversa.

1. Crie uma chave no seu projeto em https://platform.openai.com/api-keys. Configure a cobrança da API nesse projeto, se necessário.
2. No Render, abra o serviço **Taag-Fieldservice**, entre em **Environment** e adicione `OPENAI_API_KEY` com a chave criada.
3. Adicione `OPENAI_MODEL` com `gpt-4.1-mini` (opcional; esse é o padrão).
4. Salve as variáveis e aguarde a atualização do serviço.
5. Entre no app, abra **Ajuda · Taagzinho** e pergunte “Como criar uma OS?”.

A resposta deve explicar os botões disponíveis ao perfil autenticado. Sem chave o app informa que o administrador precisa configurá-la. Falhas de créditos, modelo ou chave produzem uma mensagem genérica; a chave nunca volta ao navegador.

## Conversas e limites

- Histórico somente em memória da aba, apagado ao encerrar, sair ou recarregar.
- Nenhuma conversa gravada no banco, localStorage ou sessionStorage.
- As mensagens são enviadas à OpenAI para gerar a resposta. `store: false` desativa o armazenamento da resposta para recuperação via API; isso não equivale a garantia de retenção zero nos sistemas do provedor.
- Até 30 perguntas por usuário por hora por processo, 4.000 caracteres por mensagem e 20.000 por contexto. O cliente mantém apenas as mensagens recentes dentro desse limite.
- O agente recebe o manual em `src/help/guide.md` e o perfil da sessão. Não recebe dados de clientes, OS, senhas ou acessos automaticamente; não tem ferramentas para executar alterações.
- A chamada ocorre pela Responses API, com tempo limite de 30 segundos e até 700 tokens de saída.

Referências: [Responses API](https://platform.openai.com/docs/api-reference/responses/create), [modelo](https://platform.openai.com/docs/models/gpt-4.1-mini), [controles de dados](https://platform.openai.com/docs/guides/your-data).

## Novos fluxos do app

**Senha:** na tela de login, “Esqueci minha senha / Redefinir senha”. Quem conhece a senha atual pode trocá-la diretamente. Caso contrário, solicita aprovação, confirma identidade e protocolo com administrador por contato conhecido e mantém a aba aberta. Admin revisa em Configurações > Redefinições de senha. O protocolo não substitui a conferência de identidade. Após aprovação, o solicitante consulta o pedido e define a nova senha. O token expira em 24 horas, só funciona uma vez e a troca invalida sessões antigas. Não há envio de e-mail automático.

**Equipes:** selecionar múltiplos técnicos em Nova OS cria um único registro. O primeiro check-in define o autor; outros integrantes acompanham. Somente esse autor conclui e pode salvar uma única revisão, recolhendo assinatura. Admin não altera nem exclui relatórios concluídos. Registros anteriores à mudança usam o técnico original como responsável.

**Dashboard:** aprovar cadastro como “Somente dashboard” concede acesso gerencial. Admin também acessa pelo painel e pelas configurações. Mês é o da agenda; cliente, técnico e status filtram tela, CSV e PDF. Equipe atribuída e responsável são identificados separadamente, e cada OS é contada uma vez.

## Verificação

`node --test test/workflows.test.js` inicia servidor e dados temporários isolados e simula a API de IA, sem consumir créditos. Cobre disputa de check-in, disputa da edição única, permissões, redefinição aprovada de uso único, invalidação de cookies e não persistência de conversa. Para a verificação final da integração real é necessária a chave no ambiente publicado.
