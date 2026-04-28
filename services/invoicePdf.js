// services/invoicePdf.js

import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

/**
 * Génère une facture PDF professionnelle avec QR code
 * @param {Object} params
 * @param {number} params.userId
 * @param {string} params.planType
 * @param {number} params.amount - Montant TTC en centimes (Stripe)
 * @param {string} params.invoiceNumber - Numéro de facture unique
 * @param {Date} params.date
 * @param {string} params.currency
 * @returns {Promise<{ buffer: Buffer, filePath: string, fileName: string }>}
 */
export async function generateInvoicePdf({
  userId,
  planType,
  amount,
  invoiceNumber,
  date = new Date(),
  currency = "eur",
}) {
  if (!userId) throw new Error("userId requis");
  if (!invoiceNumber) throw new Error("invoiceNumber requis");
  if (!amount || amount <= 0) throw new Error("Montant invalide");

  const TVA_RATE = 0.20;

  // Calculs
  const amountHT = Math.round(amount / (1 + TVA_RATE));
  const tvaAmount = amount - amountHT;

  // Dossier de stockage
  const invoicesDir = path.join(process.cwd(), "invoices");
  if (!fs.existsSync(invoicesDir)) {
    fs.mkdirSync(invoicesDir, { recursive: true });
  }

  const fileName = `invoice_${invoiceNumber}.pdf`;
  const filePath = path.join(invoicesDir, fileName);

  // Logo dynamique
  const logoPath = path.join(process.cwd(), "public", "images", "logo.png");

  // =========================
  // QR CODE (données encodées)
  // =========================
  const qrData = JSON.stringify({
    invoiceNumber,
    userId,
    amount: amount / 100,
    planType,
    date: date.toISOString(),
  });

  const qrImageBuffer = await QRCode.toBuffer(qrData, {
    errorCorrectionLevel: "H",
    type: "png",
    width: 200,
  });

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => {
        const buffer = Buffer.concat(chunks);
        fs.writeFileSync(filePath, buffer);
        resolve({ buffer, filePath, fileName });
      });

      // =========================
      // LOGO
      // =========================
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 45, { width: 100 });
      }

      // =========================
      // HEADER
      // =========================
      doc
        .fontSize(22)
        .text("FACTURE", 0, 50, { align: "right" })
        .moveDown();

      doc
        .fontSize(10)
        .text(`Facture n° : ${invoiceNumber}`, { align: "right" })
        .text(`Date : ${date.toLocaleDateString("fr-FR")}`, {
          align: "right",
        })
        .moveDown(2);

      // =========================
      // ENTREPRISE
      // =========================
      // ✅ APRÈS
doc
  .fontSize(12)
  .text("Émetteur :", 50, 150, { underline: true })
  .fontSize(10)
  .text("Urgence Scolaire")
  .text("Adresse : 15 Rue Andrée Grunig, 95200 Sarcelles, France")
  .text("Email : contact@urgencescolaire.com")
  .moveDown(2);
      // =========================
      // CLIENT
      // =========================
      doc
        .fontSize(12)
        .text("Facturé à :", 50, 220, { underline: true })
        .fontSize(10)
        .text(`Utilisateur ID : ${userId}`)
        .moveDown(2);

      // =========================
      // QR CODE
      // =========================
      doc
        .fontSize(12)
        .text("QR Code (vérification) :", 50, 280);

      doc.image(qrImageBuffer, 50, 300, { width: 120 });

      // =========================
      // TABLEAU
      // =========================
     // ✅ APRÈS — colonnes élargies
const tableTop = 300;

doc
  .fontSize(11)
  .text("Description",  50, tableTop)
  .text("Montant HT",  280, tableTop)
  .text("TVA (20%)",   380, tableTop)
  .text("Total TTC",   480, tableTop);

doc.moveTo(50, tableTop + 15).lineTo(560, tableTop + 15).stroke();

doc
  .fontSize(10)
  .text(`${planType}`,                          50, tableTop + 25, { width: 220 })
  .text(`${(amountHT / 100).toFixed(2)} €`,   280, tableTop + 25, { width: 90 })
  .text(`${(tvaAmount / 100).toFixed(2)} €`,  380, tableTop + 25, { width: 90 })
  .text(`${(amount / 100).toFixed(2)} €`,     480, tableTop + 25, { width: 80 });

doc.moveTo(50, tableTop + 45).lineTo(560, tableTop + 45).stroke();

// =========================
// TOTAL
// =========================
doc
  .fontSize(13)
  .text("TOTAL TTC :", 380, tableTop + 65)
  .text(`${(amount / 100).toFixed(2)} €`, 480, tableTop + 65, { width: 80 });
      // =========================
      // FOOTER
      // =========================
      doc
        .fontSize(9)
        .fillColor("#666")
        .text(
          "Merci pour votre confiance.\nFacture générée automatiquement.",
          50,
          750,
          { align: "center", width: 500 }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
