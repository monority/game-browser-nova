import { boot } from "./boot.js";

export { boot };

/** Thin browser entry: DOM lookup + composition root only. */
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("NOVA: #app root element not found");
boot(root);
