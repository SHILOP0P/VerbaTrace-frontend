import { Color, MeshStandardMaterial } from "three";

// Stable palettes: shared geometry, shared shader program, no extra textures.
const palettes = [
  ["#e4b18d", "#7898b2", "#313b48", "#3b281d", "#7898b2"],
  ["#af7755", "#c8beaa", "#43454a", "#201b17", "#c8beaa"],
  ["#73503c", "#517d72", "#273847", "#1b1715", "#517d72"],
  ["#e5c3a2", "#a16956", "#3f3430", "#ad773c", "#a16956"],
  ["#c39371", "#354b65", "#30333c", "#67432d", "#d9d0be"],
  ["#976446", "#343b46", "#252e38", "#27201a", "#d4c8b3"],
  ["#ead0b3", "#8b9a86", "#4e5351", "#8a5130", "#8b9a86"],
  ["#bb8867", "#8494ac", "#3d424a", "#98948a", "#8494ac"]
].map(row => row.map(value => new Color(value)));
// Exact linear factors exported by Blender, not rounded sRGB swatches. The
// latter missed the shirt in quantized distant LODs, leaving it light blue.
export const FIGURE_SOURCE_COLOURS = [
  [.7105664611, .4338795245, .2956998050],
  [.3931231201, .5542217493, .7874122858],
  [.0432336368, .0508760884, .0732389539],
  [.0300741047, .0108163832, .0054228688],
  [.8275708556, .7677687407, .6209158897]
];
const source = FIGURE_SOURCE_COLOURS.map(([r, g, b]) => new Color().setRGB(r, g, b));
const names = ["Skin", "Shirt", "Trousers", "Hair", "Collar"];

export function dressFigure(material: MeshStandardMaterial, index: number) {
  const palette = palettes[index % palettes.length];
  material.userData.figureAppearance = index % palettes.length;
  const part = names.findIndex(name => material.name === name);
  if (part >= 0) material.color.copy(palette[part]);
  if (!material.vertexColors) return;
  // Distant LODs contain one vertex-colour primitive instead of eight draws.
  // Recolour in the vertex shader, retaining one program for all appearances.
  material.onBeforeCompile = shader => {
    source.forEach((value, i) => {
      shader.uniforms[`figureSource${i}`] = { value };
      shader.uniforms[`figureColour${i}`] = { value: palette[i] };
    });
    shader.vertexShader = source.map((_, i) => `uniform vec3 figureSource${i}; uniform vec3 figureColour${i};`).join("\n") + "\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <color_vertex>", "#include <color_vertex>\n" +
      source.map((_, i) => `${i ? "else " : ""}if (distance(vColor.rgb, figureSource${i}) < 0.0001) vColor.rgb = figureColour${i};`).join("\n"));
  };
  material.customProgramCacheKey = () => "figure-appearance-v2";
}

export const FIGURE_APPEARANCES = palettes.length;
