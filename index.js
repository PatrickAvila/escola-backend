require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const app = express();
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const bcrypt = require('bcrypt');

cloudinary.config({
  cloud_name: 'devbhqkyu',
  api_key: '686537133985625',
  api_secret: 'XZlbRnVXE_4sqaVKHjXFaqogeyo'
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'galeria-escola',
    allowed_formats: ['jpg', 'png', 'jpeg']
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 } // Limite de 2MB por arquivo
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Conexão MongoDB Atlas
mongoose.connect('mongodb+srv://admin:patrick123@escola.qxidfn4.mongodb.net/?retryWrites=true&w=majority&appName=escola').then(() => {
  console.log('Conectado ao MongoDB Atlas!');
}).catch((err) => {
  console.error('Erro ao conectar ao MongoDB:', err);
});

// ----------- Modelos -----------
const avisoSchema = new mongoose.Schema({ titulo: String, texto: String });
const Aviso = mongoose.model('Aviso', avisoSchema);

const professorSchema = new mongoose.Schema({ nome: String, disciplina: String, foto: String });
const Professor = mongoose.model('Professor', professorSchema);

const destaqueSchema = new mongoose.Schema({ texto: String });
const Destaque = mongoose.model('Destaque', destaqueSchema);

const quemSomosSchema = new mongoose.Schema({ texto: String });
const QuemSomos = mongoose.model('QuemSomos', quemSomosSchema);

const galeriaSchema = new mongoose.Schema({ nome: String, url: String });
const Galeria = mongoose.model('Galeria', galeriaSchema);

const videoSchema = new mongoose.Schema({ nome: String, url: String, data: { type: Date, default: Date.now } });
const Video = mongoose.model('Video', videoSchema);

// ----------- Autenticação -----------
const SECRET = 'sua-chave-secreta'; // Troque por uma chave forte
app.get('/validar-token', autenticar, (req, res) => {
  res.json({ success: true });
});
function autenticar(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Token ausente.' });
  const token = auth.split(' ')[1];
  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Token inválido.' });
    req.user = decoded;
    next();
  });
}

// ----------- Rota de Login -----------
const adminSchema = new mongoose.Schema({
  usuario: String,
  senha: String
});
const Admin = mongoose.model('Admin', adminSchema);

app.post('/login', async (req, res) => {
  const { usuario, senha } = req.body;
  const admin = await Admin.findOne({ usuario });
  if (admin && await bcrypt.compare(senha, admin.senha)) {
    const token = jwt.sign({ usuario }, SECRET, { expiresIn: '2h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }
});

// ----------- Rota de Alteração de Senha -----------
app.post('/alterar-senha', autenticar, async (req, res) => {
  const { novaSenha } = req.body;
  const usuario = req.user.usuario;
  const admin = await Admin.findOne({ usuario });
  if (!admin) return res.status(404).json({ error: 'Admin não encontrado.' });
  admin.senha = await bcrypt.hash(novaSenha, 10); // hash da senha
  await admin.save();
  res.json({ success: true });
});

// ----------- CRUD Avisos -----------
app.get('/avisos', async (req, res) => {
  const avisos = await Aviso.find();
  res.json(avisos);
});

app.post('/avisos', autenticar, async (req, res) => {
  const { titulo, texto } = req.body;
  if (!titulo || typeof titulo !== 'string' || titulo.trim().length < 3) {
    return res.status(400).json({ error: 'Título inválido.' });
  }
  if (!texto || typeof texto !== 'string' || texto.trim().length < 3) {
    return res.status(400).json({ error: 'Texto inválido.' });
  }
  const novoAviso = await Aviso.create({ titulo: titulo.trim(), texto: texto.trim() });
  res.json(novoAviso);
});

app.put('/avisos/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  const { titulo, texto } = req.body;
  if (!titulo || typeof titulo !== 'string' || titulo.trim().length < 3) {
    return res.status(400).json({ error: 'Título inválido.' });
  }
  if (!texto || typeof texto !== 'string' || texto.trim().length < 3) {
    return res.status(400).json({ error: 'Texto inválido.' });
  }
  const aviso = await Aviso.findById(id);
  if (!aviso) return res.status(404).json({ error: 'Aviso não encontrado.' });
  aviso.titulo = titulo.trim();
  aviso.texto = texto.trim();
  await aviso.save();
  res.json(aviso);
});

app.delete('/avisos/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  const aviso = await Aviso.findByIdAndDelete(id);
  if (!aviso) return res.status(404).json({ error: 'Aviso não encontrado.' });
  res.json({ success: true });
});

// ----------- CRUD Professores -----------
app.get('/professores', async (req, res) => {
  const professores = await Professor.find();
  res.json(professores);
});

app.post('/professores', autenticar, upload.single('foto'), async (req, res) => {
  const { nome, disciplina } = req.body;
  if (!nome || typeof nome !== 'string' || nome.trim().length < 3) {
    return res.status(400).json({ error: 'Nome inválido.' });
  }
  if (!disciplina || typeof disciplina !== 'string' || disciplina.trim().length < 3) {
    return res.status(400).json({ error: 'Disciplina inválida.' });
  }
  let foto = '';
  if (req.file) foto = req.file.path;
  const novoProfessor = await Professor.create({ nome: nome.trim(), disciplina: disciplina.trim(), foto });
  res.json(novoProfessor);
});

app.put('/professores/:id', autenticar, upload.single('foto'), async (req, res) => {
  const { nome, disciplina } = req.body;
  if (!nome || typeof nome !== 'string' || nome.trim().length < 3) {
    return res.status(400).json({ error: 'Nome inválido.' });
  }
  if (!disciplina || typeof disciplina !== 'string' || disciplina.trim().length < 3) {
    return res.status(400).json({ error: 'Disciplina inválida.' });
  }
  let update = { nome: nome.trim(), disciplina: disciplina.trim() };
  if (req.file) {
    update.foto = req.file.path; // Atualiza a foto se houver upload
  }
  const prof = await Professor.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!prof) return res.status(404).json({ error: 'Professor não encontrado.' });
  res.json(prof);
});

app.delete('/professores/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  const professor = await Professor.findByIdAndDelete(id);
  if (!professor) return res.status(404).json({ error: 'Professor não encontrado.' });
  res.json({ success: true });
});

// ----------- CRUD Destaques -----------
app.get('/destaques', async (req, res) => {
  const destaques = await Destaque.find();
  res.json(destaques);
});

app.post('/destaques', autenticar, async (req, res) => {
  const { texto } = req.body;
  if (!texto || typeof texto !== 'string' || texto.trim().length < 3) {
    return res.status(400).json({ error: 'Texto do destaque inválido.' });
  }
  const novoDestaque = await Destaque.create({ texto: texto.trim() });
  res.json(novoDestaque);
});

app.put('/destaques/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  const { texto } = req.body;
  if (!texto || typeof texto !== 'string' || texto.trim().length < 3) {
    return res.status(400).json({ error: 'Texto do destaque inválido.' });
  }
  const destaque = await Destaque.findById(id);
  if (!destaque) return res.status(404).json({ error: 'Destaque não encontrado.' });
  destaque.texto = texto.trim();
  await destaque.save();
  res.json(destaque);
});

app.delete('/destaques/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  const destaque = await Destaque.findByIdAndDelete(id);
  if (!destaque) return res.status(404).json({ error: 'Destaque não encontrado.' });
  res.json({ success: true });
});

// ----------- CRUD Quem Somos -----------
app.get('/quem-somos', async (req, res) => {
  let quem = await QuemSomos.findOne();
  if (!quem) quem = await QuemSomos.create({ texto: '' });
  res.json(quem);
});

app.put('/quem-somos', autenticar, async (req, res) => {
  const { texto } = req.body;
  if (!texto || typeof texto !== 'string' || texto.trim().length < 10) {
    return res.status(400).json({ error: 'Texto muito curto para "Quem Somos".' });
  }
  let quem = await QuemSomos.findOne();
  if (!quem) quem = await QuemSomos.create({ texto: texto.trim() });
  else quem.texto = texto.trim();
  await quem.save();
  res.json(quem);
});

// ----------- CRUD Galeria -----------
app.get('/galeria', async (req, res) => {
  const imagens = await Galeria.find();
  res.json(imagens);
});

app.post('/galeria', autenticar, upload.single('imagem'), async (req, res) => {
  const nome = req.body.nome || (req.file ? req.file.originalname : '');
  if (!nome || typeof nome !== 'string' || nome.trim().length < 3) {
    return res.status(400).json({ error: 'Nome da imagem inválido.' });
  }
  if (!req.file || !req.file.path) {
    return res.status(400).json({ error: 'Imagem não enviada.' });
  }
  const url = req.file.path;
  const novaImagem = await Galeria.create({ nome: nome.trim(), url });
  res.json(novaImagem);
});

app.put('/galeria/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  const { nome } = req.body;
  if (!nome || typeof nome !== 'string' || nome.trim().length < 3) {
    return res.status(400).json({ error: 'Nome da imagem inválido.' });
  }
  const imagem = await Galeria.findById(id);
  if (!imagem) return res.status(404).json({ error: 'Imagem não encontrada.' });
  imagem.nome = nome.trim();
  await imagem.save();
  res.json(imagem);
});

app.delete('/galeria/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  const imagem = await Galeria.findByIdAndDelete(id);
  if (!imagem) return res.status(404).json({ error: 'Imagem não encontrada.' });
  res.json({ success: true });
});

// ----------- CRUD Vídeos -----------

// Listar vídeos
app.get('/videos', async (req, res) => {
  const videos = await Video.find().sort({ data: -1 });
  res.json(videos);
});

// Adicionar vídeo (upload ou YouTube)
app.post('/videos', autenticar, upload.single('video'), async (req, res) => {
  const nome = req.body.nome || (req.file ? req.file.originalname : '');
  let url = '';
  if (req.file && req.file.path) {
    url = req.file.path;
  } else if (req.body.youtube) {
    url = req.body.youtube;
  } else {
    return res.status(400).json({ error: 'Nenhum vídeo enviado.' });
  }
  const novoVideo = await Video.create({ nome, url });
  res.json(novoVideo);
});

// Excluir vídeo
app.delete('/videos/:id', autenticar, async (req, res) => {
  const video = await Video.findByIdAndDelete(req.params.id);
  if (!video) return res.status(404).json({ error: 'Vídeo não encontrado.' });
  res.json({ success: true });
});

// ----------- Inicialização -----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Servidor rodando na porta', PORT);
});


// ----------- Envio Email -----------
const nodemailer = require('nodemailer');

// Configuração do transporte (exemplo usando Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

app.post('/contato', async (req, res) => {
  const { nome, email, mensagem } = req.body;
  if (!nome || !email || !mensagem) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }

  try {
    await transporter.sendMail({
      from: `"${nome}" <${email}>`,
      //email da escola
      to: process.env.EMAIL_TO,
      subject: 'Contato pelo site',
      text: mensagem,
      html: `<p><strong>Nome:</strong> ${nome}</p>
             <p><strong>E-mail:</strong> ${email}</p>
             <p><strong>Mensagem:</strong><br>${mensagem}</p>`
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao enviar e-mail.' });
  }
});
