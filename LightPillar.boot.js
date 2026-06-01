import LightPillar from "./LightPillar.js";

window.HermesLightPillar = LightPillar;
window.dispatchEvent(new CustomEvent("hermes-lightpillar-ready"));
