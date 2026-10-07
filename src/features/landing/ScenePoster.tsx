import { ScenePosterArt } from "./ScenePosterArt";

type Props = { theme: "light" | "dark"; variant: "ribbon" | "layers"; loading?: boolean; hidden?: boolean };

export function ScenePoster({ theme, variant, loading = true, hidden = false }: Props) {
  return <div className="c-scene-poster" aria-hidden={hidden || undefined}>
    <ScenePosterArt theme={theme} variant={variant}/>
    {!hidden && <span role="status">{loading ? "Загрузка интерактивной иллюстрации" : "Иллюстрация разговора"}</span>}
  </div>;
}
