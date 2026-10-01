import {
  BadgeCheck,
  Banknote,
  BarChart3,
  Blocks,
  CalendarClock,
  CheckCheck,
  ClipboardList,
  Clock3,
  CloudUpload,
  Columns3,
  Eye,
  EyeOff,
  FileDown,
  FileSearch,
  Filter,
  FolderTree,
  GitCompareArrows,
  Gauge,
  History,
  Import,
  KeyRound,
  ListChecks,
  MessageSquareQuote,
  Radio,
  Quote,
  RefreshCw,
  Scale,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Split,
  Target,
  Trash2,
  UserCog,
  Users,
  Webhook
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CallFlowDiagram,
  OrderDiagram,
  ScoreFlowDiagram,
  WorkFlowDiagram
} from "./LandingDiagrams";
import {
  AccessExhibit,
  ActionExhibit,
  AnalysisExhibit,
  AnalyticsExhibit,
  CallQueueExhibit,
  CreditsExhibit,
  ExchangeExhibit,
  PrivacyExhibit,
  ReviewExhibit,
  ScorecardExhibit,
  TranscriptExhibit
} from "./LandingExhibits";

type Tone = "info" | "lead" | "good" | "warn";

type Feature = { icon: ReactNode; title: string; text: string };

type Chapter = {
  id: string;
  /** What the rail calls it: two words at most. */
  mark: string;
  kicker: string;
  title: string;
  lead: string;
  tone: Tone;
  /** The working piece of product that carries the chapter. */
  exhibit: ReactNode;
  features: Feature[];
};

/**
 * Everything the product does, in the order a call travels through it.
 *
 * Written as outcomes, never as mechanics: what a visitor gets, not how it is
 * arrived at. Nothing here is a promise the product does not keep today —
 * anything still being built stays off the page until it ships.
 */
const CHAPTERS: Chapter[] = [
  {
    id: "call",
    mark: "Звонок",
    kicker: "Работа со звонком",
    title: "Запись попадает в систему и сразу становится понятной",
    lead: "Загрузите разговор — дальше видно, где он находится, кто его вёл и что в нём было важного.",
    tone: "warn",
    exhibit: <CallQueueExhibit />,
    features: [
      { icon: <CloudUpload size={19} />, title: "Загрузка по одному и пачкой", text: "Аудио и видео, до десяти файлов за раз, со статусом каждого." },
      { icon: <Radio size={19} />, title: "Статус в реальном времени", text: "Принят, в обработке, расшифрован, разобран — без обновления страницы." },
      { icon: <FolderTree size={19} />, title: "Папки и избранное", text: "Свой цвет и описание, область видимости, привязанная инструкция." },
      { icon: <Filter size={19} />, title: "Поиск и фильтры", text: "Период, длительность, сотрудник, отдел, источник, наличие разбора." },
      { icon: <Users size={19} />, title: "Участники разговора", text: "Кто вёл звонок, совместный он или внутренний — это меняет и аналитику." },
      { icon: <Trash2 size={19} />, title: "Корзина на тридцать дней", text: "Удалённое возвращается на место вместе с расшифровкой и разбором." }
    ]
  },
  {
    id: "transcript",
    mark: "Расшифровка",
    kicker: "Текст разговора",
    title: "Расшифровка, которую можно поправить и сравнить",
    lead: "Реплики с таймкодами, правки сохраняются как версии, ничего не переписывается поверх.",
    tone: "info",
    exhibit: <TranscriptExhibit />,
    features: [
      { icon: <ScrollText size={19} />, title: "Реплики и таймкоды", text: "Клик по строке — и запись играет с этой секунды." },
      { icon: <UserCog size={19} />, title: "Роли и имена спикеров", text: "Переименование, добавление участника, привязка к сотруднику." },
      { icon: <History size={19} />, title: "Неизменяемые версии", text: "Каждая правка — новая редакция, старые остаются на месте." },
      { icon: <GitCompareArrows size={19} />, title: "Сравнение редакций", text: "Видно, что и где изменилось, и можно вернуть прежнюю версию." },
      { icon: <FileDown size={19} />, title: "Выгрузка текста", text: "Расшифровку можно забрать отдельно от разбора, на любом тарифе." }
    ]
  },
  {
    id: "analysis",
    mark: "Разбор",
    kicker: "AI-анализ",
    title: "Разбор разговора вместо прослушивания",
    lead: "Короткий итог, оценка по вашим критериям и то, что стоит сделать дальше — по каждому звонку.",
    tone: "lead",
    exhibit: <AnalysisExhibit />,
    features: [
      { icon: <Target size={19} />, title: "Итог и следующий шаг", text: "О чём договорились, что осталось открытым, что делать в первую очередь." },
      { icon: <Gauge size={19} />, title: "Оценка по критериям", text: "Сильные места и провалы по каждому пункту вашего стандарта." },
      { icon: <Quote size={19} />, title: "Каждый вывод с цитатой", text: "Любую оценку можно проверить: рядом стоит фрагмент разговора." },
      { icon: <MessageSquareQuote size={19} />, title: "Обсуждение разбора", text: "Комментарии к разбору целиком и к отдельному критерию." },
      { icon: <RefreshCw size={19} />, title: "Запрос на пересмотр", text: "Сотрудник просит разобрать заново, руководитель решает." }
    ]
  },
  {
    id: "standard",
    mark: "Стандарт",
    kicker: "Инструкции и оценочная карта",
    title: "Ваш стандарт решает, за что ставится оценка",
    lead: "Разбор идёт не по чужому шаблону. Инструкция — ваш документ, и она меняется вместе с работой.",
    tone: "warn",
    exhibit: <ScorecardExhibit />,
    features: [
      { icon: <ClipboardList size={19} />, title: "Инструкция как документ", text: "Редактор на сайте или загрузка готового файла: MD, PDF, DOCX, XLSX." },
      { icon: <ListChecks size={19} />, title: "Оценочная карта", text: "Критерии с весом и отметкой «критичный», включаются по одному." },
      { icon: <Scale size={19} />, title: "История оценок не рвётся", text: "Формулировка критерия меняется, а его линия в аналитике продолжается." },
      { icon: <Split size={19} />, title: "Личная, отдела или компании", text: "Один стандарт на всех или свой для каждой команды." },
      { icon: <FileSearch size={19} />, title: "Видно, что применялось", text: "К каждому разбору приложена та редакция инструкции, по которой его делали." }
    ]
  },
  {
    id: "review",
    mark: "Проверка",
    kicker: "Проверка человеком",
    title: "Последнее слово остаётся за руководителем",
    lead: "Автоматический разбор можно поправить, и правка становится частью истории звонка.",
    tone: "good",
    exhibit: <ReviewExhibit />,
    features: [
      { icon: <BadgeCheck size={19} />, title: "Очередь проверок", text: "Что ждёт руководителя, что уже закрыто, что вернулось на пересмотр." },
      { icon: <CheckCheck size={19} />, title: "Правка и публикация", text: "Черновик правится сколько нужно, опубликованная версия неизменна." },
      { icon: <Scale size={19} />, title: "Спор об оценке", text: "Сотрудник оспаривает разбор, решение приходит с комментарием." },
      { icon: <ShieldCheck size={19} />, title: "Защита от рассинхрона", text: "Если исходный разговор изменился, публикация не пройдёт молча." }
    ]
  },
  {
    id: "actions",
    mark: "Действия",
    kicker: "Решения по итогам",
    title: "От фразы в разговоре до поручения со сроком",
    lead: "Вывод не остаётся текстом: он превращается в задачу, у которой есть ответственный и дата.",
    tone: "warn",
    exhibit: <ActionExhibit />,
    features: [
      { icon: <Quote size={19} />, title: "Основания — цитаты", text: "К действию приложены фрагменты разговора, из которых оно выросло." },
      { icon: <CalendarClock size={19} />, title: "Срок и ответственный", text: "Перенос срока, смена исполнителя и отдела, отмена с причиной." },
      { icon: <ListChecks size={19} />, title: "Отметка «не требуется»", text: "Звонок закрыт осознанно, а не потерян в списке." },
      { icon: <Import size={19} />, title: "Задача уезжает в Bitrix24", text: "С одобрением руководителя и разбором конфликтов, если задача уже есть." }
    ]
  },
  {
    id: "analytics",
    mark: "Аналитика",
    kicker: "Команда целиком",
    title: "Видно не отдельный звонок, а как работает команда",
    lead: "Средний балл, динамика за период и критерии, которые проседают сразу у всех.",
    tone: "info",
    exhibit: <AnalyticsExhibit />,
    features: [
      { icon: <BarChart3 size={19} />, title: "Обзор", text: "Сколько звонков, сколько разобрано, общий балл и куда он движется." },
      { icon: <Columns3 size={19} />, title: "Отделы и матрица", text: "Разрез по командам и таблица «критерии на сотрудников»." },
      { icon: <Target size={19} />, title: "Работа над ошибками", text: "Что открыто, что закрыто, какие зоны роста ведёт руководитель." },
      { icon: <Gauge size={19} />, title: "Личный прогресс", text: "Свой балл и свои критерии у каждого сотрудника." },
      { icon: <Clock3 size={19} />, title: "Доли речи и монологи", text: "Кто говорил больше и где разговор превращался в монолог." }
    ]
  },
  {
    id: "team",
    mark: "Команда",
    kicker: "Компании, отделы, доступы",
    title: "Кто и какие звонки видит",
    lead: "Роль и отдел определяют доступ: сотрудник работает со своими записями, руководитель — с командными.",
    tone: "lead",
    exhibit: <AccessExhibit />,
    features: [
      { icon: <Blocks size={19} />, title: "Компании и отделы", text: "Несколько компаний в одной учётной записи, отделы внутри каждой." },
      { icon: <Users size={19} />, title: "Приглашения и роли", text: "Приглашение по имени пользователя, одобрение владельцем, должность." },
      { icon: <UserCog size={19} />, title: "Заместитель владельца", text: "Полные права по структуре и людям без передачи самой компании." },
      { icon: <SlidersHorizontal size={19} />, title: "Переводы между отделами", text: "Запрос от руководителя и решение по нему, без потери истории." },
      { icon: <KeyRound size={19} />, title: "Передача владения", text: "Компания переходит другому человеку по предложению и согласию." }
    ]
  },
  {
    id: "money",
    mark: "Расход",
    kicker: "Тарифы и кредиты",
    title: "Расход виден заранее и держится в рамках",
    lead: "Обработка тратит кредиты. Остаток, история списаний и лимиты на виду у владельца.",
    tone: "warn",
    exhibit: <CreditsExhibit />,
    features: [
      { icon: <Banknote size={19} />, title: "Персональные и бизнес-тарифы", text: "Свой объём для одного человека и для компании с отделами." },
      { icon: <Gauge size={19} />, title: "Остаток и расход", text: "Сколько осталось, на сколько хватит, куда ушло за период." },
      { icon: <SlidersHorizontal size={19} />, title: "Лимиты по отделам", text: "Компания не тратит больше, чем вы решили, и не в одном отделе." },
      { icon: <Clock3 size={19} />, title: "Очередь вместо отказа", text: "Если кредитов не хватило, звонок ждёт и обрабатывается после пополнения." }
    ]
  },
  {
    id: "privacy",
    mark: "Данные",
    kicker: "Защита данных",
    title: "Персональные данные не уезжают дальше, чем нужно",
    lead: "Телефоны, имена и реквизиты скрываются в тексте и в записи по вашей политике.",
    tone: "good",
    exhibit: <PrivacyExhibit />,
    features: [
      { icon: <EyeOff size={19} />, title: "Маскирование по категориям", text: "Выбираете, что скрывать, и сразу видите результат на своём тексте." },
      { icon: <Eye size={19} />, title: "Оригинал по отдельному доступу", text: "В работе — очищенная версия записи; оригинал открывается осознанно." },
      { icon: <ShieldCheck size={19} />, title: "Область видимости", text: "Личная, отдела или компании — у звонка, папки и инструкции." },
      { icon: <History size={19} />, title: "Журнал и аудит", text: "Версии политики, действия поддержки и временный доступ к данным." }
    ]
  },
  {
    id: "exchange",
    mark: "Обмен",
    kicker: "Интеграции и выгрузка",
    title: "Связывается с тем, что у вас уже работает",
    lead: "Звонки приходят из вашей телефонии, а результат уходит туда, где его читают.",
    tone: "lead",
    exhibit: <ExchangeExhibit />,
    features: [
      { icon: <Import size={19} />, title: "Bitrix24", text: "Импорт истории звонков, сопоставление сотрудников, итог в карточке сделки." },
      { icon: <KeyRound size={19} />, title: "API-ключи со скоупами", text: "Тестовая и рабочая среда, ротация и отзыв ключа." },
      { icon: <Webhook size={19} />, title: "Вебхуки", text: "Подписанные события, тестовая доставка и журнал попыток." },
      { icon: <FileDown size={19} />, title: "Отчёты в четырёх форматах", text: "PDF, DOCX, Markdown и XLSX — по звонку или только расшифровка." }
    ]
  }
];

/**
 * The acts. Chapters that answer the same question stand together, and each act
 * closes with one diagram of the route through it — the thing a list of
 * features can never show.
 */
type Act = {
  id: string;
  number: string;
  title: string;
  lead: string;
  chapters: string[];
  diagram: ReactNode;
  diagramTitle: string;
};

const ACTS: Act[] = [
  {
    id: "record",
    number: "I",
    title: "Разговор становится текстом",
    lead: "Запись попадает в систему, обрабатывается на глазах и превращается в текст, с которым можно работать.",
    chapters: ["call", "transcript"],
    diagramTitle: "Путь записи",
    diagram: <CallFlowDiagram />
  },
  {
    id: "meaning",
    number: "II",
    title: "Текст становится оценкой",
    lead: "Разбор идёт по вашему стандарту, каждый вывод подкреплён цитатой, последнее слово остаётся за руководителем.",
    chapters: ["analysis", "standard", "review"],
    diagramTitle: "Откуда берётся балл",
    diagram: <ScoreFlowDiagram />
  },
  {
    id: "work",
    number: "III",
    title: "Оценка становится работой",
    lead: "Из разговора вырастают поручения, из поручений и оценок — картина по команде, а роли решают, кто что видит.",
    chapters: ["actions", "analytics", "team"],
    diagramTitle: "Из разговора в работу",
    diagram: <WorkFlowDiagram />
  },
  {
    id: "frame",
    number: "IV",
    title: "И всё это в понятных границах",
    lead: "Расход виден заранее, персональные данные скрыты, результат уходит туда, где его читают.",
    chapters: ["money", "privacy", "exchange"],
    diagramTitle: "Границы",
    diagram: <OrderDiagram />
  }
];

const CHAPTER_BY_ID = new Map(CHAPTERS.map((chapter) => [chapter.id, chapter]));

/**
 * The rail's waveform: one bar per slot, the same shape on every visit, and as
 * many slots as the height of the window allows.
 */
function barWidths(count: number) {
  const widths: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / count;
    const swell = Math.sin(t * Math.PI * 3.1) * 0.5 + Math.sin(t * Math.PI * 7.7 + 1.2) * 0.28;
    const grain = Math.sin(i * 12.9898) * 43758.5453;
    const noise = grain - Math.floor(grain);
    widths.push(Math.round(20 + Math.abs(swell) * 34 + noise * 12));
  }
  return widths;
}

/** How tall one bar's slot is, so the fill can stop exactly between two bars. */
const BAR_SLOT = 9;

/** How tall the rail may be, in the window it lives in. */
function barsForHeight(height: number) {
  return Math.max(16, Math.floor((height - 190) / BAR_SLOT));
}

type FeaturePosition = { x: number; y: number; width: number; visible: boolean };

/** One list changes its arrangement around an exhibit; no floating panel. */
function StoryChapter({ chapter, mirrored }: { chapter: Chapter; mirrored: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const positions = useRef<FeaturePosition[]>([]);
  const previousExpanded = useRef(expanded);
  const stageMotion = useRef<Animation | null>(null);
  const listId = `features-${chapter.id}`;

  useLayoutEffect(() => {
    const owner = root.current;
    if (!owner) return;
    const heading = owner.querySelector<HTMLElement>(".story-chapter-head")!;
    const stage = owner.querySelector<HTMLElement>(".story-stage")!;
    const toggle = owner.querySelector<HTMLButtonElement>(".story-feature-more-toggle")!;
    const items = [...owner.querySelectorAll<HTMLElement>(".story-feature-list > li")];
    const rearranging = previousExpanded.current !== expanded;
    previousExpanded.current = expanded;
    let disposed = false;
    let frame = 0;

    const layout = (animate: boolean) => {
      const width = owner.clientWidth;
      const stacked = window.innerWidth <= 1100;
      const gap = width > 1000 ? 56 : 28;
      const textWidth = stacked ? width : Math.min(400, width * 0.36);
      const stageWidth = stacked ? width : width - textWidth - gap;
      const textX = !stacked && mirrored ? stageWidth + gap : 0;
      const stageX = !stacked && !mirrored ? textWidth + gap : 0;
      heading.style.width = `${textWidth}px`;
      heading.style.marginLeft = `${textX}px`;
      stage.style.width = `${stageWidth}px`;
      toggle.style.width = `${textWidth}px`;
      const listTop = heading.offsetHeight + 26;
      const toggleHeight = toggle.offsetHeight;
      const extraCount = items.length - 3;

      // Measure hidden copies: a running width animation must not change the
      // geometry used for the next layout or a quick second click.
      const probes = items.map((item) => {
        const probe = item.cloneNode(true) as HTMLElement;
        probe.style.cssText = `width:${textWidth}px;visibility:hidden;transform:none;opacity:0`;
        probe.setAttribute("aria-hidden", "true");
        item.parentElement!.appendChild(probe);
        return probe;
      });
      const sideHeights = probes.map((item) => item.offsetHeight);
      const sum = (values: number[]) => values.reduce((total, value) => total + value + 2, -2);
      const collapsedHeight = sum(sideHeights.slice(0, 3));
      const extraWidth = extraCount === 1
        ? Math.min(textWidth, stageWidth)
        : (stageWidth - (extraCount - 1) * 24) / extraCount;
      probes.slice(3).forEach((item) => { item.style.width = `${extraWidth}px`; });
      const extraHeight = Math.max(...probes.slice(3).map((item) => item.offsetHeight));
      probes.forEach((item) => item.remove());
      const stageHeight = stage.offsetHeight;
      const toggleY = listTop + collapsedHeight + 4;
      const textBottom = toggleY + (stacked ? 0 : toggleHeight);
      const centeredStageY = Math.max(0, (textBottom - stageHeight) / 2);
      const stageY = stacked
        ? toggleY + 24
        : Math.max(0, centeredStageY - (expanded ? 48 : 0));
      const stageBottom = stageY + stageHeight;
      const extraX = stageX + (stageWidth - (extraWidth * extraCount + 24 * (extraCount - 1))) / 2;
      const next: FeaturePosition[] = [];
      let sideY = listTop;
      let belowY = stageBottom + 24;

      items.forEach((item, index) => {
        let position: FeaturePosition;
        if (!stacked && index >= 3) {
          position = { x: extraX + (index - 3) * (extraWidth + 24), y: belowY, width: extraWidth, visible: expanded };
          item.dataset.rowStart = "true";
        } else if (stacked && index >= 3) {
          position = { x: 0, y: belowY, width: textWidth, visible: true };
          belowY += sideHeights[index] + 2;
          item.dataset.rowStart = String(index === 3);
        } else {
          position = { x: textX, y: sideY, width: textWidth, visible: true };
          sideY += sideHeights[index] + 2;
          item.dataset.rowStart = String(index === 0);
        }
        next.push(position);
      });

      const height = stacked
        ? belowY - 2
        : Math.max(textBottom, stageBottom + (expanded ? 24 + extraHeight : 0));
      owner.style.height = `${height}px`;
      owner.dataset.layout = stacked ? "stacked" : "spread";
      stage.style.left = `${stageX}px`;
      const oldStageY = stage.getBoundingClientRect().top - owner.getBoundingClientRect().top;
      if (animate) stageMotion.current?.cancel();
      stage.style.top = `${stageY}px`;
      toggle.style.left = `${textX}px`;
      toggle.style.top = `${toggleY}px`;

      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (animate && !reduce && !stacked && stage.classList.contains("is-shown") && Math.abs(oldStageY - stageY) > 1) {
        stageMotion.current = stage.animate([
          { transform: `translateY(${oldStageY - stageY}px)` },
          { transform: "translateY(0)" }
        ], { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      }
      items.forEach((item, index) => {
        const to = next[index];
        const from = positions.current[index];
        const transform = `translate(${to.x}px, ${to.y}px)`;
        const rendered = animate && from ? item.getBoundingClientRect() : null;
        const ownerRect = rendered ? owner.getBoundingClientRect() : null;
        const renderedX = rendered && ownerRect ? rendered.x - ownerRect.x : to.x;
        const renderedY = rendered && ownerRect ? rendered.y - ownerRect.y : to.y;
        const renderedOpacity = animate && from ? Number.parseFloat(getComputedStyle(item).opacity) : 0;
        if (animate) item.getAnimations().forEach((animation) => animation.cancel());
        item.style.width = `${to.width}px`;
        item.style.transform = transform;
        item.style.opacity = to.visible ? "1" : "0";
        item.style.visibility = to.visible ? "visible" : "hidden";
        item.setAttribute("aria-hidden", String(!to.visible));
        if (!animate || reduce || !from) return;
        if (to.visible === from.visible && Math.abs(renderedX - to.x) < 1 && Math.abs(renderedY - to.y) < 1) return;
        const oldTransform = `translate(${renderedX}px, ${renderedY}px)`;
        if (!to.visible) {
          if (renderedOpacity > 0) item.animate([
            { transform: oldTransform, opacity: renderedOpacity, visibility: "visible" },
            { transform, opacity: 0, visibility: "visible" }
          ], { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
          return;
        }
        const frames: Keyframe[] = [
          { transform: oldTransform, opacity: renderedOpacity },
          { transform, opacity: 1 }
        ];
        item.animate(frames, { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      });
      positions.current = next;
    };

    layout(rearranging);
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = 0; if (!disposed) layout(false); });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(heading);
    observer.observe(stage);
    window.addEventListener("resize", schedule);
    void document.fonts.ready.then(() => { if (!disposed) schedule(); });
    return () => {
      disposed = true;
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
    };
  }, [chapter, expanded, mirrored]);

  return (
    <div ref={root} id={`chapter-${chapter.id}`} data-chapter={chapter.id}
      className={`story-chapter tone-${chapter.tone}${mirrored ? " is-mirrored" : ""}${expanded ? " is-expanded" : ""}`}>
      <div className="story-chapter-head">
        <span className="story-kicker">{chapter.kicker}</span>
        <h3>{chapter.title}</h3>
        <p>{chapter.lead}</p>
      </div>
      <ul id={listId} className="story-feature-list">
        {chapter.features.map((feature) => (
          <li key={feature.title}>
            <span className="story-feature-mark" aria-hidden="true">{feature.icon}</span>
            <span><strong>{feature.title}</strong><span className="story-feature-text">{feature.text}</span></span>
          </li>
        ))}
      </ul>
      <button type="button" className="story-feature-more-toggle" aria-expanded={expanded} aria-controls={listId}
        onClick={() => setExpanded((value) => !value)}>
        {expanded ? "Свернуть возможности" : "Ещё возможности"}<span aria-hidden="true">{chapter.features.length - 3}</span>
      </button>
      <div className="story-stage" data-stage>
        <div className="story-stage-glow" aria-hidden="true" />
        {chapter.exhibit}
      </div>
    </div>
  );
}

export function LandingStory() {
  const story = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [actNumber, setActNumber] = useState("I");
  const [visible, setVisible] = useState(false);
  const [barCount, setBarCount] = useState(() => barsForHeight(window.innerHeight || 900));
  const widths = useMemo(() => barWidths(barCount), [barCount]);

  // One read and one write per frame. A continuous progress value drives both
  // the marker and the fill, including the partly illuminated bar at its edge.
  useEffect(() => {
    const block = story.current;
    if (!block) return;
    const landing = block.closest(".landing");
    const end = landing?.querySelector(".landing-footer");
    let frame = 0;
    let shownAt = -1;
    let slots = barsForHeight(window.innerHeight || 900);


    const measure = () => {
      frame = 0;
      const rect = block.getBoundingClientRect();
      const endBottom = end?.getBoundingClientRect().bottom ?? rect.bottom;
      const height = window.innerHeight || document.documentElement.clientHeight;
      const travelled = height * 0.5 - rect.top;
      const progress = Math.min(1, Math.max(0, travelled / Math.max(1, endBottom - rect.top - height * 0.5)));
      rail.current?.style.setProperty("--rail-progress", progress.toFixed(5));
      const inView = rect.top < height * 0.16 && endBottom > 0;
      if (inView !== (shownAt === 1)) {
        shownAt = inView ? 1 : 0;
        setVisible(inView);
      }

      const wanted = barsForHeight(height);
      if (wanted !== slots) {
        slots = wanted;
        setBarCount(wanted);
      }

      // Which act the middle of the screen is on.
      let current = "I";
      landing?.querySelectorAll<HTMLElement>("[data-rail-step]").forEach((section) => {
        if (section.getBoundingClientRect().top <= height * 0.45) current = section.dataset.railStep ?? "I";
      });
      setActNumber((was) => (was === current ? was : current));

      // The exhibits and the diagrams come in here, off the same measurement,
      // and not off an intersection observer: that one quietly skipped three of
      // the eleven, and a chapter with an empty half is worse than one that
      // never moved.
      block.querySelectorAll<HTMLElement>("[data-stage]").forEach((stage) => {
        if (stage.classList.contains("is-shown")) return;
        const box = stage.getBoundingClientRect();
        if (box.top < height * 0.92 && box.bottom > 0) stage.classList.add("is-shown");
      });
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    const onResize = schedule;
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  let spread = 0;

  return (
    <div className="landing-story" ref={story}>
      {/* The track of the whole story: one bar per slot, from under the header
          to the foot of the window, lit up to where the visitor has read. No
          stops on it — the act it is passing through is written beside the
          point it has reached. */}
      <div className={`story-rail${visible ? " is-visible" : ""}`} ref={rail} aria-hidden="true">
        <div className="story-rail-wave">
          <div className="story-rail-bars">
            {widths.map((width, index) => (
              <i key={index} style={{ width }} />
            ))}
          </div>
          <div className="story-rail-bars is-fill">
            {widths.map((width, index) => (
              <i key={index} style={{ width }} />
            ))}
          </div>
          <span className="story-rail-head">
            <em>{actNumber}</em>
          </span>
        </div>
      </div>

      {ACTS.map((item) => (
        <section className="story-act" key={item.id} id={`act-${item.id}`} data-act={item.id} data-rail-step={item.number}>
          <header className="story-act-head" data-stage>
            <span className="story-act-number">{item.number}</span>
            <h2>{item.title}</h2>
            <p>{item.lead}</p>
          </header>

          {item.chapters.map((id) => {
            const chapter = CHAPTER_BY_ID.get(id);
            if (!chapter) return null;
            const mirrored = spread++ % 2 === 1;
            return <StoryChapter key={chapter.id} chapter={chapter} mirrored={mirrored} />;
          })}

          <figure className="story-diagram" data-stage>
            <figcaption>{item.diagramTitle}</figcaption>
            {item.diagram}
          </figure>
        </section>
      ))}
    </div>
  );
}
