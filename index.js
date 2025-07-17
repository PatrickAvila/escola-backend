const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Permite requisições do frontend
app.use(cors());

// Permite interpretar JSON do corpo da requisição
app.use(bodyParser.json());

// Rota para receber o formulário
app.post('/contato', (req, res) => {
  const { nome, email, mensagem } = req.body;

  if (!nome || !email || !mensagem) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }

  // Configuração do transporte SMTP (exemplo com Gmail)
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'avilapatrick20@gmail.com',       // <- coloque seu e-mail aqui
      pass: 'ijwm kzjd vlby dhdf',   // <- senha de app do Gmail
    },
  });

  // Configuração do e-mail a ser enviado
  let mailOptions = {
    from: email,
    to: 'avilapatrick20@gmail.com',          // <- para onde o e-mail será enviado
    subject: `Contato do site - ${nome}`,
    text: mensagem,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log(error);
      return res.status(500).json({ error: 'Erro ao enviar o e-mail.' });
    } else {
      console.log('Email enviado: ' + info.response);
      res.json({ message: 'Mensagem enviada com sucesso!' });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
