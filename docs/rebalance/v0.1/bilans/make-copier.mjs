// Fabrique « copier.html » : une page locale, sans réseau, avec un bouton
// qui copie le bilan entier d'un seul clic.
//
// Usage : node docs/rebalance/v0.1/bilans/make-copier.mjs
//
// Le texte des bilans est embarqué tel quel dans la page : elle fonctionne
// ouverte directement depuis le disque (file://), sans serveur et sans
// autorisation particulière.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ici = dirname(fileURLToPath(import.meta.url));

const fichiers = (await readdir(ici))
  .filter((f) => f.endsWith(".md"))
  .sort()
  .reverse();

if (fichiers.length === 0) {
  console.error("Aucun bilan (.md) dans " + ici);
  process.exit(1);
}

const bilans = [];
for (const nom of fichiers) {
  bilans.push({ nom, texte: await readFile(join(ici, nom), "utf8") });
}

// Échappe « </ » pour ne jamais refermer la balise script par accident.
const donnees = JSON.stringify(bilans).replace(/<\//g, "<\\/");

const page = `<!doctype html>
<html lang="fr">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Copier un bilan — NOVA</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; padding: 24px;
    font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    max-width: 62rem; margin-inline: auto;
  }
  h1 { font-size: 1.25rem; margin: 0 0 4px; }
  .aide { margin: 0 0 20px; opacity: .7; font-size: .9rem; }
  .barre {
    display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
    position: sticky; top: 0; padding: 12px 0;
    background: Canvas; border-bottom: 1px solid color-mix(in srgb, CanvasText 15%, Canvas);
  }
  select, button { font: inherit; padding: 9px 14px; border-radius: 8px; }
  select { border: 1px solid color-mix(in srgb, CanvasText 25%, Canvas); background: Canvas; color: CanvasText; }
  #copier {
    border: 0; cursor: pointer; font-weight: 600;
    background: #1f6feb; color: #fff;
  }
  #copier:hover { background: #1a5fd0; }
  #copier:active { transform: translateY(1px); }
  #etat { font-size: .9rem; min-height: 1.4em; }
  #etat.ok { color: #1a7f37; font-weight: 600; }
  #etat.ko { color: #b35900; font-weight: 600; }
  pre {
    margin: 16px 0 40px; padding: 16px; border-radius: 10px;
    background: color-mix(in srgb, CanvasText 6%, Canvas);
    border: 1px solid color-mix(in srgb, CanvasText 12%, Canvas);
    white-space: pre-wrap; word-break: break-word;
    font: 13px/1.5 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    max-height: 60vh; overflow: auto;
  }
</style>
<body>
<h1>Copier un bilan</h1>
<p class="aide">Choisis le bilan, clique sur « Copier le bilan », puis colle-le où tu veux (Ctrl+V / Cmd+V).</p>

<div class="barre">
  <select id="fichier" aria-label="Bilan à copier"></select>
  <button id="copier" type="button">Copier le bilan</button>
  <span id="etat" role="status" aria-live="polite"></span>
</div>

<pre id="texte"></pre>

<script>
const BILANS = ${donnees};
const choix = document.getElementById("fichier");
const zone = document.getElementById("texte");
const bouton = document.getElementById("copier");
const etat = document.getElementById("etat");
let courant = BILANS[0];

for (const b of BILANS) {
  const o = document.createElement("option");
  o.value = b.nom;
  o.textContent = b.nom;
  choix.append(o);
}

function afficher() {
  zone.textContent = courant.texte;
  etat.textContent = "";
  etat.className = "";
}

choix.addEventListener("change", () => {
  courant = BILANS.find((b) => b.nom === choix.value) || BILANS[0];
  afficher();
});

bouton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(courant.texte);
    etat.textContent = "Copié ✓ (" + courant.texte.length + " caractères) — colle avec Ctrl+V";
    etat.className = "ok";
    return;
  } catch {
    // Repli : sélectionne tout, l'utilisateur n'a plus qu'à faire Ctrl+C.
    const plage = document.createRange();
    plage.selectNodeContents(zone);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(plage);
    let fait = false;
    try { fait = document.execCommand("copy"); } catch { fait = false; }
    if (fait) {
      etat.textContent = "Copié ✓ (" + courant.texte.length + " caractères)";
      etat.className = "ok";
    } else {
      etat.textContent = "Texte sélectionné — appuie sur Ctrl+C (Cmd+C sur Mac)";
      etat.className = "ko";
    }
  }
});

afficher();
</script>
</body>
</html>
`;

await writeFile(join(ici, "copier.html"), page, "utf8");
console.log("copier.html écrit — " + bilans.length + " bilan(s) embarqué(s) :");
for (const b of bilans) console.log("  " + b.nom + "  (" + b.texte.length + " caractères)");
