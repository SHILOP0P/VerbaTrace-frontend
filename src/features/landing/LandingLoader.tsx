import { useEffect, useState } from "react";

const captions = {
  room: ["Готовим офис", "Настраиваем пространство", "Включаем свет", "Собираем рабочее место", "Проверяем связь", "Готовим сцену"],
  screens: ["Открываем рабочие места", "Подключаем экраны", "Загружаем примеры", "Расставляем детали", "Готовим первый разговор", "Почти всё готово"]
};

function nextCaption(stage: "room" | "screens", previous?: string) {
  const options = captions[stage].filter((caption) => caption !== previous);
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * The curtain over the landing while the office is being fetched and decoded.
 *
 * Without it the first thing a visitor met was a dark screen with a headline
 * and no room behind it, which reads as a broken page rather than a loading
 * one. It leaves as soon as the scene says it is ready, but never before a
 * moment has passed, so a cached visit does not flash it.
 */
export function LandingLoader({ done, stage }: { done: boolean; stage: "room" | "screens" }) {
  const [gone, setGone] = useState(false);
  const [caption, setCaption] = useState(() => nextCaption(stage));

  useEffect(() => {
    if (done) return;
    setCaption((previous) => nextCaption(stage, previous));
    const timer = window.setInterval(() => setCaption((previous) => nextCaption(stage, previous)), 2200);
    return () => window.clearInterval(timer);
  }, [stage, done]);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setGone(true), 700);
    return () => window.clearTimeout(timer);
  }, [done]);

  if (gone) return null;

  return (
    <div className={`landing-loader${done ? " is-done" : ""}`} role="status" aria-live="polite">
      <div className="landing-loader-wave" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <strong>VerbaTrace</strong>
      <span>{caption}</span>
    </div>
  );
}
