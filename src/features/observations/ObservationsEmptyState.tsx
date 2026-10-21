import { FileCheck2, History, MessageSquareText, Plus, Radar } from "lucide-react";

export function ObservationsEmptyState({ onCreate }: { onCreate?: () => void }) {
  return (
    <section className="observations-empty-state" aria-labelledby="observations-empty-title">
      <div className="observations-empty-main">
        <span className="observations-empty-mark" aria-hidden="true"><Radar size={28} /></span>
        <h2 id="observations-empty-title">{onCreate ? "Создайте первое наблюдение" : "Здесь появятся наблюдения"}</h2>
        <p>{onCreate
          ? "Выберите, что важно замечать в разговорах. Наблюдения соберут подтверждённые случаи из звонков и покажут, как меняется ситуация."
          : "Когда руководитель создаст наблюдения для вашей области, здесь появятся ситуации и результаты проверок."}</p>
        {onCreate && <button className="primary-button" type="button" onClick={onCreate}>
          <Plus size={18} />Создать наблюдение
        </button>}
      </div>
      <ul className="observations-empty-options" aria-label="Виды наблюдений">
        <li>
          <span className="observations-empty-option-icon is-criterion" aria-hidden="true"><FileCheck2 size={22} /></span>
          <div><h3>По критерию инструкции</h3><p>Следите за выполнением конкретного требования в звонках.</p></div>
        </li>
        <li>
          <span className="observations-empty-option-icon is-situation" aria-hidden="true"><MessageSquareText size={22} /></span>
          <div><h3>По описанию ситуации</h3><p>Находите нужные темы, события и договорённости в разговорах.</p></div>
        </li>
      </ul>
      <div className="observations-empty-note">
        <History size={17} aria-hidden="true" />
        <p>Проверки новых звонков начнутся после включения наблюдения. Историю можно проверить отдельно.</p>
      </div>
    </section>
  );
}
