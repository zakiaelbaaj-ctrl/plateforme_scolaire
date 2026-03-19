import smtplib
from email.message import EmailMessage

msg = EmailMessage()
msg['Subject'] = 'Test local'
msg['From'] = 'test@example.com'
msg['To'] = 'destinataire@example.com'
msg.set_content('Test plain text')
msg.add_alternative('<h1>Test HTML</h1><p>reset?token=abc123</p>', subtype='html')

with smtplib.SMTP('127.0.0.1', 1025) as s:
    s.send_message(msg)

print("Envoi tenté")
