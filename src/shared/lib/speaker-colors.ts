// Orange comes last: the first speakers must not share the colour of actions.
const SPEAKER_COLORS = ["#63a7ff", "#ad7cff", "#57b8c8", "#e1b54f", "#ef6cae", "#42bd96", "#9caf52", "#ff7657"];

/**
 * The colour of a speaker among the speakers of a call. It depends on the keys
 * only, so a speaker has the same colour in the editor and on the call page.
 */
export function speakerColor(speaker: string, speakerKeys: string[]) {
  const normalize = (key: string) => key.trim().toLocaleLowerCase("ru") || "unknown";
  const orderedKeys = Array.from(new Set(speakerKeys.map(normalize))).sort((left, right) => left.localeCompare(right, "ru"));
  const index = Math.max(0, orderedKeys.indexOf(normalize(speaker)));
  if (index < SPEAKER_COLORS.length) return SPEAKER_COLORS[index];
  const hue = Math.round((index * 137.508) % 360);
  return `hsl(${hue} 68% 56%)`;
}
