import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Servir le dossier public
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`✅ Serveur test lancé sur http://localhost:${PORT}`);
});
