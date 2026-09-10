/**
 * ============================================================
 *  HASH DE SENHA (src/auth/hash.js)
 * ------------------------------------------------------------
 *  O QUE ISSO FAZ:
 *  Transforma a senha que a pessoa digita em um hash irreversível
 *  (bcrypt) antes de guardar, e compara hash-contra-hash no login.
 *
 *  POR QUE ISSO IMPORTA PARA O APP COMO UM TODO:
 *  Nas versões anteriores do FieldService App, as senhas das
 *  contas de demonstração ficavam em TEXTO PURO dentro do
 *  app.js do navegador — qualquer pessoa com F12 aberto lia
 *  todas as senhas da equipe. Esse arquivo é a peça que fecha
 *  esse buraco: a partir de agora, nem o servidor guarda a senha
 *  original — só um hash de mão única. Mesmo que o arquivo
 *  data/usuarios.json vaze, ninguém descobre a senha real.
 *
 *  bcryptjs (em vez de bcrypt) foi escolhido de propósito: é uma
 *  implementação 100% JavaScript, sem módulo nativo para compilar.
 *  Isso significa "npm install" funcionando de primeira em
 *  qualquer sistema operacional, sem precisar de Python/Visual
 *  Studio Build Tools instalados na máquina de quem for rodar.
 * ============================================================
 */

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10; // custo do hash — 10 é um equilíbrio seguro/rápido para este porte de app

/** Recebe a senha em texto puro digitada no cadastro e devolve o hash a ser salvo. */
function hashPassword(plainText) {
  return bcrypt.hashSync(plainText, SALT_ROUNDS);
}

/** Compara a senha digitada no login com o hash salvo. Nunca decodifica o hash de volta. */
function comparePassword(plainText, hash) {
  return bcrypt.compareSync(plainText, hash);
}

module.exports = { hashPassword, comparePassword };
