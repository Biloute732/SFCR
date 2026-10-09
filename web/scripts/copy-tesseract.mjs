// Copie le moteur de reconnaissance de texte (tesseract.js) dans public/tesseract :
// l'application le charge depuis son propre serveur plutôt que depuis un CDN extérieur.
// Lancé automatiquement avant `npm run dev` et `npm run build`.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "tesseract");
mkdirSync(out, { recursive: true });

copyFileSync(join(root, "node_modules/tesseract.js/dist/worker.min.js"), join(out, "worker.min.js"));
const core = join(root, "node_modules/tesseract.js-core");
for (const f of readdirSync(core).filter((f) => f.endsWith(".wasm.js"))) copyFileSync(join(core, f), join(out, f));
