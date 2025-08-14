const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: './variaveisAmbiente.env' });

const app = express();
const PORT = 3000;
const SECRET = 'sua_chave_secreta'; // Troque por uma chave forte!

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://patrickavila.github.io'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(bodyParser.json());

// Dados em memória (substitua por banco de dados futuramente)
let avisos = [];
let professores = [];
let galeria = [];

// Rota de login (JWT)
app.post('/login', (req, res) => {
  const { usuario, senha } = req.body;
  if (usuario === 'diretor' && senha === '123456') {
    const token = jwt.sign({ usuario }, SECRET, { expiresIn: '2h' });
    return res.json({ token });
  }
  res.status(401).json({ error: 'Credenciais inválidas.' });
});

// Middleware de autenticação
function autenticar(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Token ausente.' });
  try {
    jwt.verify(auth.replace('Bearer ', ''), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido.' });
  }
}

// ----------- CRUD Avisos -----------
app.get('/avisos', (req, res) => {
  res.json(avisos);
});
app.post('/avisos', autenticar, (req, res) => {
  const { titulo, texto } = req.body;
  if (!titulo || !texto) {
    return res.status(400).json({ error: 'Título e texto são obrigatórios.' });
  }
  const novoAviso = { id: Date.now(), titulo, texto };
  avisos.push(novoAviso);
  res.json(novoAviso);
});
app.put('/avisos/:id', autenticar, (req, res) => {
  const { id } = req.params;
  const { titulo, texto } = req.body;
  const aviso = avisos.find(a => a.id == id);
  if (!aviso) return res.status(404).json({ error: 'Aviso não encontrado.' });
  if (!titulo || !texto) return res.status(400).json({ error: 'Título e texto obrigatórios.' });
  aviso.titulo = titulo;
  aviso.texto = texto;
  res.json(aviso);
});
app.delete('/avisos/:id', autenticar, (req, res) => {
  const { id } = req.params;
  const index = avisos.findIndex(a => a.id == id);
  if (index === -1) return res.status(404).json({ error: 'Aviso não encontrado.' });
  avisos.splice(index, 1);
  res.json({ success: true });
});

// ----------- CRUD Professores -----------
app.get('/professores', (req, res) => {
  res.json(professores);
});
app.post('/professores', autenticar, (req, res) => {
  const { nome, disciplina } = req.body;
  if (!nome || !disciplina) {
    return res.status(400).json({ error: 'Nome e disciplina são obrigatórios.' });
  }
  const novoProfessor = { id: Date.now(), nome, disciplina };
  professores.push(novoProfessor);
  res.json(novoProfessor);
});
app.put('/professores/:id', autenticar, (req, res) => {
  const { id } = req.params;
  const { nome, disciplina } = req.body;
  const prof = professores.find(p => p.id == id);
  if (!prof) return res.status(404).json({ error: 'Professor não encontrado.' });
  if (!nome || !disciplina) return res.status(400).json({ error: 'Nome e disciplina obrigatórios.' });
  prof.nome = nome;
  prof.disciplina = disciplina;
  res.json(prof);
});
app.delete('/professores/:id', autenticar, (req, res) => {
  const { id } = req.params;
  const index = professores.findIndex(p => p.id == id);
  if (index === -1) return res.status(404).json({ error: 'Professor não encontrado.' });
  professores.splice(index, 1);
  res.json({ success: true });
});

// ----------- CRUD Galeria -----------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../imagens'));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

app.get('/galeria', (req, res) => {
  res.json(galeria);
});
app.post('/galeria', autenticar, upload.single('imagem'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Imagem obrigatória.' });
  }
  const novaImagem = {
    id: Date.now(),
    url: `/imagens/${req.file.filename}`,
    nome: req.file.originalname
  };
  galeria.push(novaImagem);
  res.json(novaImagem);
});
app.put('/galeria/:id', autenticar, (req, res) => {
  const { id } = req.params;
  const { nome } = req.body;
  const img = galeria.find(i => i.id == id);
  if (!img) return res.status(404).json({ error: 'Imagem não encontrada.' });
  if (!nome) return res.status(400).json({ error: 'Nome obrigatório.' });
  img.nome = nome;
  res.json(img);
});
app.delete('/galeria/:id', autenticar, (req, res) => {
  const { id } = req.params;
  const index = galeria.findIndex(img => img.id == id);
  if (index === -1) return res.status(404).json({ error: 'Imagem não encontrada.' });
  galeria.splice(index, 1);
  res.json({ success: true });
});

// Servir imagens estaticamente
app.use('/imagens', express.static(path.join(__dirname, '../imagens')));

// ----------- Contato (envio de e-mail) -----------
app.post('/contato', async (req, res) => {
  const { nome, email, mensagem } = req.body;
  if (!nome || !email || !mensagem) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: `"${nome}" <${email}>`,
      to: process.env.EMAIL_USER,
      subject: 'Contato pelo site',
      text: mensagem
    });

    res.json({ success: true, message: 'Mensagem enviada com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
});

// ----------- Rota de teste -----------
app.get('/', (req, res) => {
  res.send('API da Escola Antonio Austregésio está rodando!');
});

// ----------- Iniciar servidor -----------
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});