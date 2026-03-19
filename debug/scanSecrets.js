// debug/scanSecrets.js
// 🔍 Script de scan pour détecter les fuites potentielles de secrets dans le code source.
// ✔️ Ne lit pas le .env
// ✔️ Analyse uniquement les fichiers .js
// ✔️ Détecte les patterns dangereux

import fs from "fs";
import path from "path";

const ROOT_DIR = process.cwd();

const suspiciousPatterns = [
  { regex: /process\.env/gi, message: "Utilisation de process.env détectée" },
  { regex: /console\.log\(process\.env/gi, message: "⚠️ Fuite totale : logger.info(process.env)" },
  { regex: /DB_PASS/gi, message: "Variable sensible DB_PASS détectée" },
  { regex: /JWT_SECRET/gi, message: "Variable sensible JWT_SECRET détectée" },
  { regex: /STRIPE_SECRET_KEY/gi, message: "Variable sensible STRIPE_SECRET_KEY détectée" },
  { regex: /DATABASE_URL/gi, message: "Variable sensible DATABASE_URL détectée" },
  { regex: /EMAIL_PASS/gi, message: "Variable sensible EMAIL_PASS détectée" },
  { regex: /console\.log/gi, message: "logger.info trouvé (à vérifier)" }
];

// Récupère tous les fichiers .js du projet
function getAllJsFiles(dir) {
  let results = [];

  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);

    if (fs.statSync(fullPath).isDirectory()) {
      if (!["node_modules", "debug"].includes(file)) {
        results = results.concat(getAllJsFiles(fullPath));
      }
    } else if (file.endsWith(".js")) {
      results.push(fullPath);
    }
  }

  return results;
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const findings = [];

  suspiciousPatterns.forEach(pattern => {
    if (pattern.regex.test(content)) {
      findings.push(pattern.message);
    }
  });

  return findings;
}

logger.info("==============================================");
logger.info("🔍 SCAN DES FUITES POTENTIELLES DE SECRETS");
logger.info("==============================================\n");

const jsFiles = getAllJsFiles(ROOT_DIR);
let totalFindings = 0;

jsFiles.forEach(file => {
  const findings = scanFile(file);

  if (findings.length > 0) {
    logger.info(`📄 ${file}`);
    findings.forEach(f => logger.info(`   → ${f}`));
    logger.info("");
    totalFindings += findings.length;
  }
});

logger.info("==============================================");
logger.info(`✔️ Scan terminé — ${totalFindings} élément(s) suspect(s) trouvé(s)`);
logger.info("==============================================");
