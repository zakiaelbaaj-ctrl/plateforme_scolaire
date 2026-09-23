// services/invoicePdf.js

import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

/**
 * Mentions de l'émetteur.
 * Une chaîne vide masque la ligne correspondante : remplissez
 * formeJuridique, siren et tvaIntra à réception du Kbis.
 */
const EMETTEUR = {
  nom:            "Urgence Scolaire",
  adresse:        "15 Rue Andrée Grunig, 95200 Sarcelles, France",
  email:          "contact@urgencescolaire.com",
  formeJuridique: "",   // ex. : "SASU au capital de 1 000 €"
  siren:          "",   // ex. : "SIREN 123 456 789"
  tvaIntra:       "",   // ex. : "TVA intracommunautaire : FR00123456789"
};

/**
 * Génère une facture PDF avec QR code.
 * @param {Object}  params
 * @param {number}  params.userId
 * @param {string}  params.planType       Description de la prestation
 * @param {number}  params.amount         Montant TTC en centimes (Stripe)
 * @param {string}  params.invoiceNumber  Numéro de facture unique
 * @param {Date}    params.date
 * @param {string}  params.currency
 * @param {string}  [params.clientNom]      Facultatif
 * @param {string}  [params.clientAdresse]  Facultatif
 * @param {string}  [params.clientEmail]    Facultatif
 * @returns {Promise<{ buffer: Buffer, filePath: string, fileName: string }>}
 */
export async function generateInvoicePdf({
  userId,
  planType,
  amount,
  invoiceNumber,
  date = new Date(),
  currency = "eur",
  clientNom = "",
  clientAdresse = "",
  clientEmail = "",
}) {
  if (!userId) throw new Error("userId requis");
  if (!invoiceNumber) throw new Error("invoiceNumber requis");
  if (!amount || amount <= 0) throw new Error("Montant invalide");

  const TVA_RATE = 0.20;

  const amountHT  = Math.round(amount / (1 + TVA_RATE));
  const tvaAmount = amount - amountHT;

  const invoicesDir = path.join(process.cwd(), "invoices");
  if (!fs.existsSync(invoicesDir)) {
    fs.mkdirSync(invoicesDir, { recursive: true });
  }

  const fileName = `invoice_${invoiceNumber}.pdf`;
  const filePath = path.join(invoicesDir, fileName);
  const logoPath = path.join(process.cwd(), "public", "images", "logo.png");

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

      // ---------- LOGO ----------
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 45, { width: 100 });
      }

      // ---------- EN-TETE ----------
      doc.fontSize(22).text("FACTURE", 0, 50, { align: "right" }).moveDown();

      doc
        .fontSize(10)
        .text(`Facture n° : ${invoiceNumber}`, { align: "right" })
        .text(`Date : ${date.toLocaleDateString("fr-FR")}`, { align: "right" });

      // ---------- EMETTEUR ----------
      const lignesEmetteur = [EMETTEUR.nom];
      if (EMETTEUR.adresse)        lignesEmetteur.push(`Adresse : ${EMETTEUR.adresse}`);
      if (EMETTEUR.email)          lignesEmetteur.push(`Email : ${EMETTEUR.email}`);
      if (EMETTEUR.formeJuridique) lignesEmetteur.push(EMETTEUR.formeJuridique);
      if (EMETTEUR.siren)          lignesEmetteur.push(EMETTEUR.siren);
      if (EMETTEUR.tvaIntra)       lignesEmetteur.push(EMETTEUR.tvaIntra);

      doc.fontSize(12).text("Émetteur :", 50, 150, { underline: true }).fontSize(10);
      lignesEmetteur.forEach((ligne) => doc.text(ligne, { width: 350 }));

      // ---------- CLIENT ----------
      const lignesClient = [];
      if (clientNom)     lignesClient.push(clientNom);
      if (clientAdresse) lignesClient.push(clientAdresse);
      if (clientEmail)   lignesClient.push(`Email : ${clientEmail}`);
      lignesClient.push(
        lignesClient.length
          ? `Référence client : ${userId}`
          : `Utilisateur ID : ${userId}`
      );

      doc.fontSize(12).text("Facturé à :", 50, 250, { underline: true }).fontSize(10);
      lignesClient.forEach((ligne) => doc.text(ligne, { width: 350 }));

      // ---------- QR CODE ----------
      doc.fontSize(10).text("Vérification :", 440, 280, { width: 105 });
      doc.image(qrImageBuffer, 440, 295, { width: 100 });

      // ---------- TABLEAU ----------
      const tableTop = 350;

      doc
        .fontSize(11)
        .text("Description", 50, tableTop)
        .text("Montant HT", 50, tableTop + 40)
        .text("TVA (20%)",  50, tableTop + 60)
        .text("Total TTC",  50, tableTop + 80);

      doc.moveTo(50, tableTop + 15).lineTo(400, tableTop + 15).stroke();

      doc
        .fontSize(10)
        .text(`${planType}`, 50, tableTop + 20, { width: 340, height: 15, ellipsis: true })
        .text(`${(amountHT / 100).toFixed(2)} €`,  180, tableTop + 40, { width: 90 })
        .text(`${(tvaAmount / 100).toFixed(2)} €`, 180, tableTop + 60, { width: 90 })
        .text(`${(amount / 100).toFixed(2)} €`,    180, tableTop + 80, { width: 90 });

      doc.moveTo(50, tableTop + 100).lineTo(400, tableTop + 100).stroke();

      // ---------- TOTAL ----------
      doc
        .fontSize(13)
        .text("TOTAL TTC :", 50, tableTop + 115)
        .text(`${(amount / 100).toFixed(2)} €`, 180, tableTop + 115, { width: 90 });

      // ---------- PIED DE PAGE ----------
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
