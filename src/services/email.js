const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';

/**
 * Envia um código OTP de recuperação de password.
 */
async function enviarOtpRecuperacao(email, nome, otp) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'AcheiDoc — Recuperação de Password',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:8px;">
        <h2 style="color:#2563eb;margin-bottom:8px;">AcheiDoc</h2>
        <p>Olá <strong>${nome}</strong>,</p>
        <p>Recebemos um pedido de recuperação de password. Use o código abaixo:</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center;padding:24px;background:#f0f9ff;border-radius:8px;margin:24px 0;color:#1d4ed8;">
          ${otp}
        </div>
        <p style="color:#6b7280;font-size:13px;">
          Este código expira em ${process.env.OTP_EXPIRES_MIN || 15} minutos.<br>
          Se não pediu a recuperação, ignore este email.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;">AcheiDoc — Plataforma de documentos perdidos</p>
      </div>
    `,
  });
}

/**
 * Envia um código OTP de verificação de email (cadastro).
 */
async function enviarOtpVerificacao(email, nome, otp) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'AcheiDoc — Verificação de Email',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:8px;">
        <h2 style="color:#2563eb;margin-bottom:8px;">AcheiDoc</h2>
        <p>Olá <strong>${nome}</strong>, bem-vindo(a)!</p>
        <p>Confirme o seu email com o código abaixo:</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center;padding:24px;background:#f0fdf4;border-radius:8px;margin:24px 0;color:#16a34a;">
          ${otp}
        </div>
        <p style="color:#6b7280;font-size:13px;">
          Este código expira em ${process.env.OTP_EXPIRES_MIN || 15} minutos.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;">AcheiDoc — Plataforma de documentos perdidos</p>
      </div>
    `,
  });
}

/**
 * Notifica o utilizador que o seu documento foi aprovado/rejeitado.
 */
async function enviarNotificacaoDocumento(email, nome, tipoDoc, novoStatus) {
  const label = { PUBLICADO: 'aprovado', REJEITADO: 'rejeitado', CORRECAO_SOLICITADA: 'devolvido para correcção' };
  const cor = { PUBLICADO: '#16a34a', REJEITADO: '#dc2626', CORRECAO_SOLICITADA: '#d97706' };

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `AcheiDoc — Documento ${label[novoStatus] || novoStatus}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:8px;">
        <h2 style="color:#2563eb;margin-bottom:8px;">AcheiDoc</h2>
        <p>Olá <strong>${nome}</strong>,</p>
        <p>O seu documento <strong>${tipoDoc}</strong> foi
          <span style="color:${cor[novoStatus] || '#374151'};font-weight:bold;">${label[novoStatus] || novoStatus}</span>.
        </p>
        <p>Aceda à plataforma para mais detalhes.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;">AcheiDoc — Plataforma de documentos perdidos</p>
      </div>
    `,
  });
}

/**
 * Notifica o utilizador que o pagamento foi confirmado.
 */
async function enviarNotificacaoPagamento(email, nome, tipoDoc, referencia) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'AcheiDoc — Pagamento confirmado',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:8px;">
        <h2 style="color:#2563eb;margin-bottom:8px;">AcheiDoc</h2>
        <p>Olá <strong>${nome}</strong>,</p>
        <p>O pagamento para levantamento do documento <strong>${tipoDoc}</strong>
           (ref. <strong>${referencia}</strong>) foi confirmado.</p>
        <p>Dirija-se ao ponto de entrega para levantar o seu documento.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;">AcheiDoc — Plataforma de documentos perdidos</p>
      </div>
    `,
  });
}

module.exports = {
  enviarOtpRecuperacao,
  enviarOtpVerificacao,
  enviarNotificacaoDocumento,
  enviarNotificacaoPagamento,
};
