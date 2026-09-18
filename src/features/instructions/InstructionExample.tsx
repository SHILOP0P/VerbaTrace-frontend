import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { InstructionDocumentViewer } from "./InstructionDocumentViewerV2";

const exampleMarkdown = `# Контроль следующего шага

## Цель
Проверить, договорились ли участники о конкретном продолжении.

## Критерии
- Названо следующее действие.
- Указан ответственный.
- Указан срок.

## Доказательства
Используй только точные цитаты из разговора.

## Рекомендация
Если договорённость неполная, укажи, чего именно не хватает.`;

// The instruction is broken into criteria once per version; these rules are
// what makes each criterion one checkable requirement.
const writingTips = [
  "Одно требование — один пункт списка. «Поздоровался и представился» — это два пункта.",
  "Пишите то, что слышно в разговоре: слова и действия, а не тон, улыбку или экран.",
  "Говорите, что нужно сделать, а не чего избегать.",
  "Важность называйте прямо: «обязательно», «грубое нарушение». Так пункт получит больший вес или отметку «критичный».",
  "Условие пишите рядом с требованием: «при первом звонке», «если клиент возражает по цене».",
];

export function InstructionExample() {
  const [open, setOpen] = useState(false);
  return <section className={`instruction-template-example${open ? " open" : ""}`}>
    <button className="instruction-template-example-toggle" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <ChevronRight size={18}/><span>Пример эффективной инструкции</span>
    </button>
    <div className="instruction-template-example-collapse" aria-hidden={!open}>
      <div className="instruction-template-example-collapse-inner">
        <div className="instruction-writing-tips"><strong>Как писать, чтобы критерии оценки получились точными</strong><ul>{writingTips.map((tip) => <li key={tip}>{tip}</li>)}</ul></div>
        <div className="instruction-template-example-content"><InstructionDocumentViewer filename="example.md" markdown={exampleMarkdown}/></div>
      </div>
    </div>
  </section>;
}
