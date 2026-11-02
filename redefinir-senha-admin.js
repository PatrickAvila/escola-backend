// Redefine a senha do administrador do PAINEL DO SITE (não é o usuário do Atlas).
// Uso: cd backEnd; node redefinir-senha-admin.js
require('dotenv').config({ path: 'variaveisAmbiente.env' });
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pergunta = (texto) => new Promise(resolve => rl.question(texto, resolve));

(async () => {
  try {
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI não definido em variaveisAmbiente.env');
    await mongoose.connect(process.env.MONGO_URI);

    const Admin = mongoose.model('Admin', new mongoose.Schema({ usuario: String, senha: String }));
    const usuario = (await pergunta('Usuário do admin do site: ')).trim();
    const novaSenha = await pergunta('Nova senha (mínimo 6 caracteres): ');

    if (!usuario) throw new Error('Usuário não informado.');
    if (novaSenha.length < 6) throw new Error('Senha muito curta (mínimo 6 caracteres).');

    const admin = await Admin.findOne({ usuario });
    if (!admin) throw new Error(`Admin "${usuario}" não encontrado no banco.`);

    admin.senha = await bcrypt.hash(novaSenha, 10);
    await admin.save();
    console.log('Senha do admin atualizada com sucesso.');
  } catch (err) {
    console.error('Erro:', err.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await mongoose.disconnect();
  }
})();
