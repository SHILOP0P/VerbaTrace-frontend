// Only presentation of generated questions is changed. Send the original option
// value to keep existing requests and artifact-choice mappings compatible.
export function questionText(text: string): string {
  return text
    .replace(/^(?:none|date|employee|outcome|criterion)\s*[—–-]\s*/i, "")
    .replace(/\bhigh-level\b/gi, "без подробностей")
    .replace(/\bdesign\b/gi, "проектирование")
    .replace(/Кодинг в интервью/gi, "Написание кода на собеседовании")
    .replace(/бар-чарт(ы|ов)?/gi, (_, ending: string) => ending === "ов" ? "столбчатых диаграмм" : "столбчатые диаграммы")
    .replace(/Таймлайн/gi, "Хронология")
    .replace(/Нужен краткий устный\/чат-резюме \(короткое сообщение\)/gi, "Нужно короткое итоговое сообщение в чате")
    .replace(/чат-резюме/gi, "итоговое сообщение в чате")
    .replace(/\bNLP-подход/gi, "анализ языка")
    .replace(/\bQA\//g, "проверки качества/")
    .replace(/\bvs\./gi, "или");
}
