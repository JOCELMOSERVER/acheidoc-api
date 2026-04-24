const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';

async function enviarOtpRecuperacao(email, nome, otp) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'AcheiDoc — Recuperação de Password',
    html: `<p>Olá ${nome || ''},</p><p>Seu código OTP é: <strong>${otp}</strong></p>`,
  });
}

async function enviarOtpVerificacao(email, nome, otp) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'AcheiDoc — Verificação de Email',
    html: `<p>Olá ${nome || ''},</p><p>Seu código OTP de verificação é: <strong>${otp}</strong></p>`,
  });
}

async function enviarNotificacaoDocumento(email, nome, tipoDoc, status) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'AcheiDoc — Atualização de documento',
    html: `<p>Olá ${nome || ''},</p><p>Documento ${tipoDoc} atualizado para: <strong>${status}</strong></p>`,
  });
}

async function enviarNotificacaoPagamento(email, nome, tipoDoc, referencia) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'AcheiDoc — Pagamento confirmado',
    html: `<p>Olá ${nome || ''},</p><p>Pagamento confirmado para ${tipoDoc}. Referência: <strong>${referencia}</strong></p>`,
  });
}

module.exports = {
  enviarOtpRecuperacao,
  enviarOtpVerificacao,
  enviarNotificacaoDocumento,
  enviarNotificacaoPagamento,
};
