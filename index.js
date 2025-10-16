// ...existing code...
require('dotenv').config({ path: 'variaveisAmbiente.env' });

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const app = express();
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const nodemailer = require('nodemailer');

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

// Storages
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'galeria-escola',
    allowed_formats: ['jpg', 'png', 'jpeg']
  }
});

const storageVideo = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'videos-escola',
    resource_type: 'video',
    allowed_formats: ['mp4', 'webm', 'ogg']
  }
});

// File filters
function imageFileFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Formato de imagem não permitido.'), false);
}
function videoFileFilter(req, file, cb) {
  const allowed = ['video/mp4', 'video/webm', 'video/ogg'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Formato de vídeo não permitido.'), false);
}

// Multer instances with filters and limits
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB imagens
  fileFilter: imageFileFilter
});
const uploadVideo = multer({
  storage: storageVideo,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB vídeos
  fileFilter: videoFileFilter
});

// Global rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Muitas requisições. Tente novamente mais tarde.' }
});
app.use(limiter);

// Security headers and hardening
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "https://www.google.com/recaptcha/", "https://www.gstatic.com/"],
      "frame-src": ["'self'", "https://www.youtube.com", "https://www.google.com/recaptcha/"],
      "img-src": ["'self'", "data:", "https://res.cloudinary.com"],
      "style-src": ["'self'", "'unsafe-inline'"]
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true }
}));

// Body size limits (mitigar DoS por payload grande)
app.use(express.json({ limit: '12kb' }));
app.use(express.urlencoded({ extended: true, limit: '12kb' }));

// Sanitization
app.use(mongoSanitize());
app.use(xss());

// CORS whitelist (inclui localhost e 127.0.0.1 para dev)
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5500',
  'http://127.0.0.1:5500'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // server-to-server or curl
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Ensure preflight responds for allowed origins
app.options('*', cors({
  origin: allowedOrigins,
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use('/uploads', express.static('uploads'));

// Rate limiters for sensitive routes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  message: { error: 'Muitas tentativas de login. Tente novamente mais tarde.' }
});
app.use('/login', loginLimiter);

const contatoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas mensagens. Tente novamente mais tarde.' }
});
app.use('/contato', contatoLimiter);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Conectado ao MongoDB Atlas!'))
  .catch((err) => console.error('Erro ao conectar ao MongoDB:', err));

// ----------- Models -----------
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

const videoSchema = new mongoose.Schema({ nome: String, url: String, descricao: String, data: { type: Date, default: Date.now } });
const Video = mongoose.model('Video', videoSchema);

const adminSchema = new mongoose.Schema({ usuario: String, senha: String });
const Admin = mongoose.model('Admin', adminSchema);

// ----------- Auth helper -----------
const SECRET = process.env.JWT_SECRET || 'mudar-essa-chave';
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

app.get('/validar-token', autenticar, (req, res) => res.json({ success: true }));

// ----------- Login -----------
app.post('/login',
  body('usuario').isString().isLength({ min: 3, max: 50 }).trim().escape(),
  body('senha').isString().isLength({ min: 3, max: 100 }).trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { usuario, senha } = req.body;
    const admin = await Admin.findOne({ usuario });
    if (admin && await bcrypt.compare(senha, admin.senha)) {
      const token = jwt.sign({ usuario }, SECRET, { expiresIn: '2h' });
      res.json({ token });
    } else {
      res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }
  }
);

// ----------- Alterar senha -----------
app.post('/alterar-senha',
  autenticar,
  body('novaSenha').isString().isLength({ min: 6, max: 100 }).trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { novaSenha } = req.body;
    const usuario = req.user.usuario;
    const admin = await Admin.findOne({ usuario });
    if (!admin) return res.status(404).json({ error: 'Admin não encontrado.' });
    admin.senha = await bcrypt.hash(novaSenha, 10);
    await admin.save();
    res.json({ success: true });
  }
);

// ----------- CRUD Avisos -----------
app.get('/avisos', async (req, res, next) => {
  try { const avisos = await Aviso.find(); res.json(avisos); } catch (err) { next(err); }
});

app.post('/avisos',
  autenticar,
  body('titulo').isString().isLength({ min: 3, max: 100 }).trim().escape(),
  body('texto').isString().isLength({ min: 3, max: 1000 }).trim().escape(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { titulo, texto } = req.body;
      const novo = await Aviso.create({ titulo, texto });
      res.json(novo);
    } catch (err) { next(err); }
  }
);

app.put('/avisos/:id',
  autenticar,
  body('titulo').isString().isLength({ min: 3, max: 100 }).trim().escape(),
  body('texto').isString().isLength({ min: 3, max: 1000 }).trim().escape(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { id } = req.params;
      const { titulo, texto } = req.body;
      const aviso = await Aviso.findById(id);
      if (!aviso) return res.status(404).json({ error: 'Aviso não encontrado.' });
      aviso.titulo = titulo.trim();
      aviso.texto = texto.trim();
      await aviso.save();
      res.json(aviso);
    } catch (err) { next(err); }
  }
);

app.delete('/avisos/:id', autenticar, async (req, res, next) => {
  try {
    const { id } = req.params;
    const aviso = await Aviso.findByIdAndDelete(id);
    if (!aviso) return res.status(404).json({ error: 'Aviso não encontrado.' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ----------- CRUD Professores -----------
app.get('/professores', async (req, res, next) => {
  try { const professores = await Professor.find(); res.json(professores); } catch (err) { next(err); }
});

app.post('/professores',
  autenticar,
  upload.single('foto'),
  body('nome').isString().isLength({ min: 3, max: 100 }).trim().escape(),
  body('disciplina').isString().isLength({ min: 3, max: 100 }).trim().escape(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { nome, disciplina } = req.body;
      let foto = '';
      if (req.file) foto = req.file.path;
      const novo = await Professor.create({ nome, disciplina, foto });
      res.json(novo);
    } catch (err) { next(err); }
  }
);

app.put('/professores/:id',
  autenticar,
  upload.single('foto'),
  body('nome').isString().isLength({ min: 3, max: 100 }).trim().escape(),
  body('disciplina').isString().isLength({ min: 3, max: 100 }).trim().escape(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { nome, disciplina } = req.body;
      let update = { nome: nome.trim(), disciplina: disciplina.trim() };
      if (req.file) update.foto = req.file.path;
      const prof = await Professor.findByIdAndUpdate(req.params.id, update, { new: true });
      if (!prof) return res.status(404).json({ error: 'Professor não encontrado.' });
      res.json(prof);
    } catch (err) { next(err); }
  }
);

app.delete('/professores/:id', autenticar, async (req, res, next) => {
  try {
    const { id } = req.params;
    const professor = await Professor.findByIdAndDelete(id);
    if (!professor) return res.status(404).json({ error: 'Professor não encontrado.' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ----------- CRUD Destaques -----------
app.get('/destaques', async (req, res, next) => {
  try { const destaques = await Destaque.find(); res.json(destaques); } catch (err) { next(err); }
});

app.post('/destaques',
  autenticar,
  body('texto').isString().isLength({ min: 3, max: 300 }).trim().escape(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { texto } = req.body;
      const novo = await Destaque.create({ texto });
      res.json(novo);
    } catch (err) { next(err); }
  }
);

app.put('/destaques/:id',
  autenticar,
  body('texto').isString().isLength({ min: 3, max: 300 }).trim().escape(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { id } = req.params;
      const { texto } = req.body;
      const destaque = await Destaque.findById(id);
      if (!destaque) return res.status(404).json({ error: 'Destaque não encontrado.' });
      destaque.texto = texto.trim();
      await destaque.save();
      res.json(destaque);
    } catch (err) { next(err); }
  }
);

app.delete('/destaques/:id', autenticar, async (req, res, next) => {
  try {
    const { id } = req.params;
    const destaque = await Destaque.findByIdAndDelete(id);
    if (!destaque) return res.status(404).json({ error: 'Destaque não encontrado.' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ----------- CRUD Quem Somos -----------
app.get('/quem-somos', async (req, res, next) => {
  try {
    let quem = await QuemSomos.findOne();
    if (!quem) quem = await QuemSomos.create({ texto: '' });
    res.json(quem);
  } catch (err) { next(err); }
});

app.put('/quem-somos',
  autenticar,
  body('texto').isString().isLength({ min: 10, max: 2000 }).trim().escape(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { texto } = req.body;
      let quem = await QuemSomos.findOne();
      if (!quem) quem = await QuemSomos.create({ texto: texto.trim() });
      else quem.texto = texto.trim();
      await quem.save();
      res.json(quem);
    } catch (err) { next(err); }
  }
);

// ----------- CRUD Galeria -----------
app.get('/galeria', async (req, res, next) => {
  try { const imagens = await Galeria.find(); res.json(imagens); } catch (err) { next(err); }
});

app.post('/galeria',
  autenticar,
  upload.single('imagem'),
  body('nome').isString().isLength({ min: 3, max: 100 }).trim().escape(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const nome = req.body.nome || (req.file ? req.file.originalname : '');
      if (!req.file || !req.file.path) return res.status(400).json({ error: 'Imagem não enviada.' });
      const url = req.file.path;
      const novaImagem = await Galeria.create({ nome: nome.trim(), url });
      res.json(novaImagem);
    } catch (err) { next(err); }
  }
);

app.put('/galeria/:id',
  autenticar,
  body('nome').isString().isLength({ min: 3, max: 100 }).trim().escape(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { id } = req.params;
      const { nome } = req.body;
      const imagem = await Galeria.findById(id);
      if (!imagem) return res.status(404).json({ error: 'Imagem não encontrada.' });
      imagem.nome = nome.trim();
      await imagem.save();
      res.json(imagem);
    } catch (err) { next(err); }
  }
);

app.delete('/galeria/:id', autenticar, async (req, res, next) => {
  try {
    const { id } = req.params;
    const imagem = await Galeria.findByIdAndDelete(id);
    if (!imagem) return res.status(404).json({ error: 'Imagem não encontrada.' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ----------- CRUD Vídeos -----------
// Listar vídeos
app.get('/videos', async (req, res, next) => {
  try { const videos = await Video.find().sort({ data: -1 }); res.json(videos); } catch (err) { next(err); }
});

// Adicionar vídeo (upload ou YouTube)
app.post('/videos',
  autenticar,
  uploadVideo.single('video'),
  body('nome').isString().isLength({ min: 3, max: 100 }).trim().escape(),
  body('descricao').optional().isString().isLength({ max: 500 }).trim().escape(),
  body('youtube').optional().isURL().trim(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const nome = req.body.nome || (req.file ? req.file.originalname : '');
      let url = '';
      if (req.file && req.file.path) url = req.file.path;
      else if (req.body.youtube) url = req.body.youtube;
      else return res.status(400).json({ error: 'Nenhum vídeo enviado.' });
      const descricao = req.body.descricao || '';
      const novoVideo = await Video.create({ nome, url, descricao });
      res.json(novoVideo);
    } catch (err) { next(err); }
  }
);

app.delete('/videos/:id', autenticar, async (req, res, next) => {
  try {
    const video = await Video.findByIdAndDelete(req.params.id);
    if (!video) return res.status(404).json({ error: 'Vídeo não encontrado.' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ----------- Envio Email (Contato) -----------
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

app.post('/contato', async (req, res, next) => {
  try {
    const { nome, email, mensagem, recaptchaToken } = req.body;
    if (!nome || !email || !mensagem || !recaptchaToken) {
      return res.status(400).json({ error: 'Preencha todos os campos e marque o reCAPTCHA.' });
    }

    const secret = process.env.RECAPTCHA_SECRET;
    const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secret}&response=${recaptchaToken}`;
    const resposta = await fetch(verifyUrl, { method: 'POST' });
    const resultado = await resposta.json();
    if (!resultado.success) return res.status(400).json({ error: 'Falha na validação do reCAPTCHA.' });

    await transporter.sendMail({
      from: `"${nome}" <${email}>`,
      to: process.env.EMAIL_TO,
      subject: 'Contato pelo site',
      text: mensagem,
      html: `<p><strong>Nome:</strong> ${nome}</p>
             <p><strong>E-mail:</strong> ${email}</p>
             <p><strong>Mensagem:</strong><br>${mensagem}</p>`
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ----------- Global error handler -----------
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.message ? err.message : err);
  if (err && err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: 'Origin não permitido.' });
  }
  if (err && err.message && (err.message.includes('Formato') || err.message.includes('allowed'))) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Erro interno.' });
});

// ----------- Inicialização -----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Servidor rodando na porta', PORT);
});