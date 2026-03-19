const nodemailer = require('nodemailer');

async function envoyerEmail() {
  // Configure le transporter (adapter cette partie à ton service SMTP)
  let transporter = nodemailer.createTransport({
    service: 'Gmail', // ou autre service
    auth: {
      user: 'zakiaelbaaj@gmail.com', // ton email
      pass: 'tfne qjfk qjgj tulr'     // ton mot de passe
    }
  });

  // Composition du message
  let info = await transporter.sendMail({
    from: '"Nom" <zakiaelbaaj@gmail.com>',
    to: 'destinataire@example.com',
    subject: 'Test avec Nodemailer',
    text: 'Bonjour, ceci est un test!',
  });

  console.log('Message envoyé : %s', info.messageId);
}

// Exécute la fonction d’envoi
envoyerEmail().catch(console.error);
