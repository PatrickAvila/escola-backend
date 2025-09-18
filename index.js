const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const app = express();

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

const professorSchema = new mongoose.Schema({ nome: String, disciplina: String });
const Professor = mongoose.model('Professor', professorSchema);

const destaqueSchema = new mongoose.Schema({ texto: String });
const Destaque = mongoose.model('Destaque', destaqueSchema);

const quemSomosSchema = new mongoose.Schema({ texto: String });
const QuemSomos = mongoose.model('QuemSomos', quemSomosSchema);

const galeriaSchema = new mongoose.Schema({ nome: String, url: String });
const Galeria = mongoose.model('Galeria', galeriaSchema);

// ----------- Autenticação -----------
const SECRET = 'sua-chave-secreta'; // Troque por uma chave forte

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

// ----------- CRUD Avisos -----------
app.get('/avisos', async (req, res) => {
  const avisos = await Aviso.find();
  res.json(avisos);
});

app.post('/avisos', autenticar, async (req, res) => {
  const { titulo, texto } = req.body;
  if (!titulo || !texto) return res.status(400).json({ error: 'Título e texto são obrigatórios.' });
  const novoAviso = await Aviso.create({ titulo, texto });
  res.json(novoAviso);
});

app.put('/avisos/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  const { titulo, texto } = req.body;
  const aviso = await Aviso.findById(id);
  if (!aviso) return res.status(404).json({ error: 'Aviso não encontrado.' });
  aviso.titulo = titulo;
  aviso.texto = texto;
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

app.post('/professores', autenticar, async (req, res) => {
  const { nome, disciplina } = req.body;
  if (!nome || !disciplina) return res.status(400).json({ error: 'Nome e disciplina são obrigatórios.' });
  const novoProfessor = await Professor.create({ nome, disciplina });
  res.json(novoProfessor);
});

app.put('/professores/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  const { nome, disciplina } = req.body;
  const professor = await Professor.findById(id);
  if (!professor) return res.status(404).json({ error: 'Professor não encontrado.' });
  professor.nome = nome;
  professor.disciplina = disciplina;
  await professor.save();
  res.json(professor);
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
  if (!texto) return res.status(400).json({ error: 'Texto é obrigatório.' });
  const novoDestaque = await Destaque.create({ texto });
  res.json(novoDestaque);
});

app.put('/destaques/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  const { texto } = req.body;
  const destaque = await Destaque.findById(id);
  if (!destaque) return res.status(404).json({ error: 'Destaque não encontrado.' });
  destaque.texto = texto;
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
  let quem = await QuemSomos.findOne();
  if (!quem) quem = await QuemSomos.create({ texto });
  else quem.texto = texto;
  await quem.save();
  res.json(quem);
});

// ----------- CRUD Galeria -----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.get('/galeria', async (req, res) => {
  const imagens = await Galeria.find();
  res.json(imagens);
});

app.post('/galeria', autenticar, upload.single('imagem'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Imagem obrigatória.' });
  const nome = req.body.nome || req.file.originalname;
  const url = '/uploads/' + req.file.filename;
  const novaImagem = await Galeria.create({ nome, url });
  res.json(novaImagem);
});

app.put('/galeria/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  const { nome } = req.body;
  const imagem = await Galeria.findById(id);
  if (!imagem) return res.status(404).json({ error: 'Imagem não encontrada.' });
  imagem.nome = nome;
  await imagem.save();
  res.json(imagem);
});

app.delete('/galeria/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  const imagem = await Galeria.findByIdAndDelete(id);
  if (!imagem) return res.status(404).json({ error: 'Imagem não encontrada.' });
  res.json({ success: true });
});

// ----------- Inicialização -----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Servidor rodando na porta', PORT);
});