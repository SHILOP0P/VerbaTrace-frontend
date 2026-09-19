// The analysis model works with numbered cards (u1.7), requirements (r3),
// recommendations (rec2) and transcript segments (s4.1). Those numbers are keys
// for the server and must never reach a reader: a list of them in brackets is
// dropped, and a single number used as a word becomes the card's title.
const REF = String.raw`(?:rec\d+|[ur]\d+(?:\.\d+)?|s\d+(?:\.\d+)?)`;
const LABEL = String.raw`(?:см\.?|рекомендаци[яиюей]|карточк[аиуеой]|критери[йияюем]|требовани[еяюйм]|пункт[аыеом]?)`;
const EDGE_BEFORE = String.raw`(?<![\p{L}\p{N}.])`;
const EDGE_AFTER = String.raw`(?![\p{L}\p{N}])`;

// A segment number has no title to stand in for it, so the words that only
// pointed at it go too: «присутствуют в сегменте s3.1» → «присутствуют».
const segmentReference = new RegExp(
  String.raw`(?:\s+(?:в|во|на|из|по|к|о|об))?(?:\s+(?:сегмент|реплик|фрагмент)\p{L}*)?\s+${EDGE_BEFORE}s\d+(?:\.\d+)?${EDGE_AFTER}`,
  "giu"
);

// Field names of the analysis schema the model sometimes writes into prose.
// After a preposition the replacement takes the case the preposition asks
// for, otherwise «в assigned_unit» reads «в пункт».
const schemaTerms: Array<[RegExp, string]> = [
  [/(части|частям|частях|частями|частей|элементы|элементам|элементах|элементов|содержания|содержание|содержанию|требования|требованиям|требованиях|требований|условия|условиям|условий|формулировки|формулировке|формулировкам|текст|текста|тексту|тексте)\s+assigned_units?(?![\w])/giu, "$1 пункта"],
  [/(^|[\s(])(в|во|на|о|об)\s+assigned_units(?![\w@/-])/giu, "$1$2 пунктах"],
  [/(^|[\s(])(в|во|на|о|об)\s+assigned_unit(?![\w@/-])/giu, "$1$2 пункте"],
  [/(^|[\s(])(из|для|до|от|у|без|кроме)\s+assigned_units(?![\w@/-])/giu, "$1$2 пунктов"],
  [/(^|[\s(])(из|для|до|от|у|без|кроме)\s+assigned_unit(?![\w@/-])/giu, "$1$2 пункта"],
  [/(^|[\s(])(по|к|ко)\s+assigned_units(?![\w@/-])/giu, "$1$2 пунктам"],
  [/(^|[\s(])(по|к|ко)\s+assigned_unit(?![\w@/-])/giu, "$1$2 пункту"],
  [/(^|[\s(])(по|к|ко)\s+source_segments(?![\w@/-])/giu, "$1$2 репликам"],
  [/(^|[\s(])(из|для|до|от|у|без|кроме)\s+source_segments(?![\w@/-])/giu, "$1$2 реплик"],
  [/(^|[\s(])(в|во|на|о|об)\s+source_segments(?![\w@/-])/giu, "$1$2 репликах"],
  [/(^|[\s(])(в|во|на|о|об)\s+source_segment(?![\w@/-])/giu, "$1$2 реплике"],
  // The model also transliterates the field: «вопрос юнита» is «вопрос пункта».
  [/(?<!\p{L})юнит(ами|ам|ах|ов|ом|а|у|е|ы)?(?!\p{L})/giu, "пункт$1"],
  [/(?<![\w.@/-])assigned_units(?![\w@/-])/giu, "пункты"],
  [/(?<![\w.@/-])assigned_unit(?![\w@/-])/giu, "пункт"],
  [/(?<![\w.@/-])source_segments?(?![\w@/-])/giu, "реплики"]
];
// Any other snake_case key is a field name, never a word; an e-mail or a path
// keeps its underscores because it touches "@", "/" or a dot.
const snakeCaseKey = /(?<![\w.@/-])[a-z]+(?:_[a-z0-9]+)+(?![\w@/-]|\.[a-z])/g;

const bracketedList = new RegExp(
  String.raw`\s*[(\[]\s*(?:${LABEL}\s*)?${EDGE_BEFORE}${REF}${EDGE_AFTER}(?:\s*(?:,|;|/|и)\s*(?:${LABEL}\s*)?${EDGE_BEFORE}${REF}${EDGE_AFTER})*\s*[)\]]`,
  "giu"
);
const labelledRef = new RegExp(String.raw`(?:(${LABEL})\s+)?${EDGE_BEFORE}(${REF})${EDGE_AFTER}`, "giu");

/**
 * Model text shown outside the call page, where speaker names are not at hand:
 * numbers go, and a speaker marker becomes a plain "Спикер A".
 */
export function readableAnalysisText(value: string | null | undefined): string {
  if (!value) return "";
  return stripAnalysisRefs(value.replace(/\{\{speaker:([^}]+)\}\}/gi, (_match, key: string) => `Спикер ${key.trim()}`));
}

// A speaker marker is resolved to a name later; its key (speaker_0, s1) must
// not be taken for a field name or a segment number meanwhile.
const speakerMarker = /\{\{speaker:[^}]+\}\}/gi;
const markerSlot = /(\d+)/g;

export function stripAnalysisRefs(value: string, titles?: ReadonlyMap<string, string>): string {
  if (!value) return value;
  const markers: string[] = [];
  const guarded = value.replace(speakerMarker, (marker) => `${markers.push(marker) - 1}`);
  const readable = schemaTerms.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), guarded).replace(snakeCaseKey, "");
  const withoutLists = readable.replace(bracketedList, "").replace(segmentReference, "");
  const named = withoutLists.replace(labelledRef, (_match, label: string | undefined, id: string) => {
    const title = titles?.get(id) ?? titles?.get(id.toLowerCase());
    if (!title) return "";
    return label ? `${label} «${title}»` : `«${title}»`;
  });
  return named
    .replace(/[(\[]\s*[,;]?\s*[)\]]/g, "")
    .replace(/([(\[])\s*[,;]\s*/g, "$1")
    .replace(/\s*[,;]\s*([)\]])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/[ \t]+([,.;:!?)\]])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .replace(markerSlot, (_slot, index: string) => markers[Number(index)] ?? "");
}
