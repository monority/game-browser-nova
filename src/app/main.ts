/**
 * NOVA browser entry point.
 * Owns DOM bootstrapping only — simulation and rendering live in their own layers.
 */

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("NOVA: #app root element not found");
}

root.textContent = "NOVA";
