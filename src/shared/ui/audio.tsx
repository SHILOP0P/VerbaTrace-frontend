import { Download, Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { api, downloadCallMedia, getCallMediaUrl } from "../../api";
import type { CallResponse, MediaSeekTarget, TranscriptionWordResponse } from "../../types";
import { activeTranscriptWordIndex } from "../lib/transcript";
import { formatDuration } from "../lib/formatters";
import { isVideoCall, mediaDownloadName } from "../lib/media";
import { speakerColor } from "../lib/speaker-colors";

const playbackRates = [0.75, 1, 1.25, 1.5, 2];
const emptyTranscriptWords: TranscriptionWordResponse[] = [];
const waveformBars = 240;
const waveformBarPitch = 8;
const fallbackWaveform = Array.from({ length: waveformBars }, (_, index) => {
  const wave = Math.sin(index * 0.68) * 0.22 + Math.sin(index * 1.73) * 0.14;
  return Math.max(0.2, Math.min(0.9, 0.54 + wave));
});

export type PlayerSpeaker = { key: string; name: string; share: number | null };

type MediaPlayerProps = {
  call: CallResponse;
  seekTarget?: MediaSeekTarget | null;
  words?: TranscriptionWordResponse[];
  onActiveWordChange?: (index: number) => void;
  /** Speakers in the order and with the names of the speech block. */
  speakers?: PlayerSpeaker[];
  longestMonologue?: { seconds: number; name: string } | null;
};

type SpeakerRun = { speaker: string; start: number; end: number };

// Consecutive words of one speaker are one turn; a pause over 1.2 s ends it, so
// the lane shows silences as gaps instead of smearing them into speech.
function speakerRuns(words: TranscriptionWordResponse[]): SpeakerRun[] {
  const runs: SpeakerRun[] = [];
  for (const word of words) {
    const speaker = word.speaker?.trim();
    if (!speaker || !Number.isFinite(word.start_seconds) || !Number.isFinite(word.end_seconds)) continue;
    const last = runs[runs.length - 1];
    if (last && last.speaker === speaker && word.start_seconds - last.end <= 1.2) {
      last.end = Math.max(last.end, word.end_seconds);
    } else {
      runs.push({ speaker, start: word.start_seconds, end: Math.max(word.start_seconds, word.end_seconds) });
    }
  }
  return runs;
}

type ResolvedMediaPlayerProps = MediaPlayerProps & {
  mediaVariant: "original" | "redacted";
  accessSession: string;
};

export function CallMediaPlayer(props: MediaPlayerProps) {
  const [access, setAccess] = useState<{callId: string; session: string} | null>(null);
  const [variantError, setVariantError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    setAccess(null); setVariantError("");
    async function prepare() {
      try {
        const session = await api.createMediaAccessSession(props.call.id, "original");
        if (!cancelled) {
          setAccess({callId: props.call.id, session: session.media_access_session_uuid});
          setVariantError("");
          // Refresh before the 15-minute media session expires. The backend
          // rechecks current permissions on every range and download request.
          const expires = Date.parse(session.expires_at);
          timer = window.setTimeout(() => void prepare(), Math.max(30_000, Number.isFinite(expires) ? expires - Date.now() - 60_000 : 14*60_000));
        }
      } catch (cause) { if (!cancelled) setVariantError(cause instanceof Error ? cause.message : "Запись недоступна"); }
    }
    void prepare();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [props.call.id]);

  const accessSession = access?.callId === props.call.id ? access.session : "";
  const resolved = { ...props, mediaVariant: "original" as const, accessSession };
  return <div className="privacy-media-shell">
    {variantError && <div className="form-error" role="alert">{variantError}</div>}
    {accessSession && !variantError ? (isVideoCall(props.call) ? <CallVideoPlayer key={props.call.id} {...resolved} /> : <CallAudioPlayer key={props.call.id} {...resolved} />) : !variantError && <div className="media-access-loading">Проверяем доступ к записи…</div>}
  </div>;
}

function CallVideoPlayer({ call, seekTarget, words = emptyTranscriptWords, onActiveWordChange, mediaVariant, accessSession }: ResolvedMediaPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resumeRef = useRef({time: 0, playing: false});
  const speedControlRef = useRef<HTMLDivElement | null>(null);
  const speedHoldTimerRef = useRef<number | null>(null);
  const speedLongPressRef = useRef(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(call.duration_seconds || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const source = useMemo(() => getCallMediaUrl(call, mediaVariant, accessSession), [call.id, mediaVariant, accessSession]);

  useEffect(() => {
    if (videoRef.current && seekTarget) {
      videoRef.current.currentTime = seekTarget.startSeconds;
      setCurrentTime(seekTarget.startSeconds);
    }
  }, [seekTarget]);

  useEffect(() => {
    if (!speedMenuOpen) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!speedControlRef.current?.contains(event.target as Node)) setSpeedMenuOpen(false);
    }
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [speedMenuOpen]);

  useEffect(() => () => clearVideoSpeedHoldTimer(), []);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    resumeRef.current.playing = video.paused;
    if (video.paused) void video.play().catch(() => { resumeRef.current.playing = false; setError("Не удалось воспроизвести видео"); });
    else video.pause();
  }

  function seek(value: number) {
    resumeRef.current.time = value;
    if (videoRef.current) videoRef.current.currentTime = value;
    setCurrentTime(value);
  }

  function changeRate(value: number) {
    if (videoRef.current) videoRef.current.playbackRate = value;
    setPlaybackRate(value);
  }

  function cycleVideoRate() {
    const currentIndex = playbackRates.indexOf(playbackRate);
    changeRate(playbackRates[(currentIndex + 1) % playbackRates.length] ?? 1);
  }

  function clearVideoSpeedHoldTimer() {
    if (speedHoldTimerRef.current === null) return;
    window.clearTimeout(speedHoldTimerRef.current);
    speedHoldTimerRef.current = null;
  }

  function handleVideoSpeedPointerDown() {
    speedLongPressRef.current = false;
    clearVideoSpeedHoldTimer();
    speedHoldTimerRef.current = window.setTimeout(() => {
      speedLongPressRef.current = true;
      setSpeedMenuOpen(true);
    }, 420);
  }

  function handleVideoSpeedPointerUp() {
    clearVideoSpeedHoldTimer();
    if (speedLongPressRef.current) {
      speedLongPressRef.current = false;
      return;
    }
    cycleVideoRate();
    setSpeedMenuOpen(false);
  }

  function handleVideoSpeedKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      cycleVideoRate();
      setSpeedMenuOpen(false);
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      setSpeedMenuOpen(true);
    } else if (event.key === "Escape") {
      setSpeedMenuOpen(false);
    }
  }

  async function downloadVideo() {
    setDownloading(true);
    try {
      const blob = await downloadCallMedia(call, mediaVariant);
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = mediaDownloadName(call);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Видео недоступно");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className={`call-video-player ${error ? "video-error-state" : ""}`}>
      <video
        ref={videoRef}
        crossOrigin="use-credentials"
        preload="metadata"
        controlsList="nodownload"
        src={source}
        aria-label={`Видеозапись звонка ${call.title}`}
        onError={() => setError("Видео недоступно")}
        onClick={togglePlayback}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setDuration(Number.isFinite(video.duration) ? video.duration : call.duration_seconds || 0);
          if (resumeRef.current.time > 0) video.currentTime = resumeRef.current.time;
          if (resumeRef.current.playing) void video.play().catch(() => setError("Не удалось продолжить видео"));
        }}
        onPlay={() => { resumeRef.current.playing = true; setPlaying(true); }}
        onPause={() => setPlaying(false)}
        onEnded={() => { resumeRef.current.playing = false; setPlaying(false); }}
        onTimeUpdate={(event) => {
          if (event.currentTarget.readyState > 0) resumeRef.current.time = event.currentTarget.currentTime;
          setCurrentTime(event.currentTarget.currentTime);
          onActiveWordChange?.(activeTranscriptWordIndex(words, event.currentTarget.currentTime));
        }}
      />
      {error && <div className="call-video-placeholder" role="status">{error}</div>}
      {!error && <div className="call-video-controls">
        <input className="video-progress" type="range" min={0} max={Math.max(duration, 1)} step="0.1" value={Math.min(currentTime, Math.max(duration, 1))} onChange={(event) => seek(Number(event.target.value))} aria-label="Позиция видео" aria-valuetext={`${formatDuration(currentTime)} из ${formatDuration(duration)}`} style={{ "--media-progress": `${duration > 0 ? currentTime / duration * 100 : 0}%` } as CSSProperties} />
        <div className="video-control-row">
          <div className="video-control-primary">
            <button type="button" className="video-play-button" onClick={togglePlayback} aria-label={playing ? "Пауза" : "Воспроизвести"}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
            <span className="video-time"><strong>{formatDuration(currentTime)}</strong><span>/</span>{formatDuration(duration)}</span>
          </div>
          <div className={`video-speed-control ${speedMenuOpen ? "open" : ""}`} ref={speedControlRef}>
            <button className="video-speed-button" type="button" aria-haspopup="menu" aria-expanded={speedMenuOpen} aria-label="Скорость видео" onKeyDown={handleVideoSpeedKeyDown} onPointerCancel={clearVideoSpeedHoldTimer} onPointerDown={handleVideoSpeedPointerDown} onPointerLeave={clearVideoSpeedHoldTimer} onPointerUp={handleVideoSpeedPointerUp}>{playbackRate}×</button>
            <div className="video-speed-menu" role="menu">{playbackRates.map((rate) => <button className={rate === playbackRate ? "active" : ""} type="button" role="menuitemradio" aria-checked={rate === playbackRate} key={rate} onClick={() => { changeRate(rate); setSpeedMenuOpen(false); }}>{rate}×</button>)}</div>
          </div>
        </div>
      </div>}
      <div className="call-video-meta">
        <span>{call.original_filename}</span>
        <button className="ghost-button small" type="button" disabled={downloading} onClick={downloadVideo}>
          <Download size={15} />
          Скачать видео
        </button>
      </div>
    </div>
  );
}

export function CallAudioPlayer({ call, seekTarget, words = emptyTranscriptWords, onActiveWordChange, speakers, longestMonologue, mediaVariant = "original", accessSession = "" }: MediaPlayerProps & Partial<ResolvedMediaPlayerProps>) {
  const runs = useMemo(() => speakerRuns(words), [words]);
  const speakerKeys = useMemo(() => speakers?.length ? speakers.map((speaker) => speaker.key) : Array.from(new Set(runs.map((run) => run.speaker))), [runs, speakers]);
  const hasLane = runs.length > 0;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resumeRef = useRef({time: 0, playing: false});
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const speedControlRef = useRef<HTMLDivElement | null>(null);
  const speedHoldTimerRef = useRef<number | null>(null);
  const speedLongPressRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const activeWordRef = useRef(-1);
  const playerRef = useRef<HTMLDivElement | null>(null);
  // While the pointer drags the playhead, the tracks follow it through one CSS
  // variable, and the recording itself is sought at most once a frame.
  const scrubFrameRef = useRef<number | null>(null);
  const scrubTimeRef = useRef(0);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioError, setAudioError] = useState("");
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [waveform, setWaveform] = useState<number[]>([]);
  const [visibleWaveformBars, setVisibleWaveformBars] = useState(72);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(call.duration_seconds || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const source = useMemo(
    () => getCallMediaUrl(call, mediaVariant, accessSession),
    [
      call.id,
      call.media_url,
      mediaVariant,
      accessSession
    ]
  );

  useEffect(() => {
    setAudioUrl(source);
    setAudioError("");
    setDownloadError("");
    setLoadingAudio(false);
    setDuration(call.duration_seconds || 0);
    return () => {
      const audio = audioRef.current;
      audio?.pause();
    };
  }, [call.duration_seconds, source]);

  // The waveform is the seek track; the speaker lane, when there is one, sits
  // under it and tells whose voice fills each stretch.
  useEffect(() => {
    const controller = new AbortController();
    api.getMediaWaveform(call.id, mediaVariant, accessSession, controller.signal)
      .then(({peaks}) => { if (!controller.signal.aborted) setWaveform(peaks); })
      .catch(() => { if (!controller.signal.aborted) setWaveform([]); });
    return () => controller.abort();
  }, [call.id, mediaVariant, accessSession]);

  useEffect(() => {
    const element = waveformRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const update = () => setVisibleWaveformBars(Math.max(24, Math.min(waveformBars, Math.floor(element.clientWidth / waveformBarPitch))));
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [audioUrl, playbackRate]);

  useEffect(() => {
    if (!speedMenuOpen) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (speedControlRef.current?.contains(event.target as Node)) return;
      setSpeedMenuOpen(false);
    }

    window.addEventListener("pointerdown", closeOnOutsidePointer);

    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [speedMenuOpen]);

  useEffect(() => () => clearSpeedHoldTimer(), []);

  useEffect(() => {
    if (!seekTarget) return;
    seek(String(seekTarget.startSeconds));
  }, [seekTarget]);

  useEffect(() => {
    if (!playing) {
      stopPositionUpdates();
      return;
    }
    const update = () => {
      if (document.visibilityState !== "visible") {
        animationFrameRef.current = null;
        return;
      }
      if (audioRef.current) updateCurrentTime(audioRef.current.currentTime);
      animationFrameRef.current = requestAnimationFrame(update);
    };
    const resumeWhenVisible = () => {
      if (document.visibilityState === "visible" && animationFrameRef.current === null) {
        animationFrameRef.current = requestAnimationFrame(update);
      }
    };
    resumeWhenVisible();
    document.addEventListener("visibilitychange", resumeWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", resumeWhenVisible);
      stopPositionUpdates();
    };
  }, [playing, words, onActiveWordChange]);

  useEffect(() => {
    activeWordRef.current = -1;
    onActiveWordChange?.(-1);
  }, [call.id, words, onActiveWordChange]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !audioUrl || audioError) return;

    if (audio.paused) {
      resumeRef.current.playing = true;
      audio.play().catch(() => { resumeRef.current.playing = false; setAudioError("Не удалось воспроизвести аудио"); });
    } else {
      resumeRef.current.playing = false;
      audio.pause();
    }
  }

  function seek(value: string) {
    const audio = audioRef.current;
    const nextTime = Number(value);
    resumeRef.current.time = nextTime;
    updateCurrentTime(nextTime);
    if (audio && Number.isFinite(nextTime)) {
      audio.currentTime = nextTime;
    }
  }

  function updateCurrentTime(nextTime: number) {
    setCurrentTime((current) => current === nextTime ? current : nextTime);
    const nextActiveWord = activeTranscriptWordIndex(words, nextTime);
    if (nextActiveWord !== activeWordRef.current) {
      activeWordRef.current = nextActiveWord;
      onActiveWordChange?.(nextActiveWord);
    }
  }

  function stopPositionUpdates() {
    if (animationFrameRef.current === null) return;
    cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
  }

  function seekByRatio(ratio: number) {
    const nextTime = Math.min(1, Math.max(0, ratio)) * effectiveDuration;
    seek(String(nextTime));
  }

  function pointerTime(clientX: number) {
    const rect = waveformRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * effectiveDuration;
  }

  // The drag moves the playhead on the page at once; the audio element and
  // the React state catch up once a frame, and the transcript learns the new
  // word only when the pointer is released.
  function scrubTo(clientX: number, final: boolean) {
    const nextTime = pointerTime(clientX);
    if (nextTime === null) return;
    playerRef.current?.style.setProperty("--audio-progress", `${effectiveDuration > 0 ? (nextTime / effectiveDuration) * 100 : 0}%`);
    scrubTimeRef.current = nextTime;
    if (final) {
      if (scrubFrameRef.current !== null) cancelAnimationFrame(scrubFrameRef.current);
      scrubFrameRef.current = null;
      seek(String(nextTime));
      return;
    }
    if (scrubFrameRef.current !== null) return;
    scrubFrameRef.current = requestAnimationFrame(() => {
      scrubFrameRef.current = null;
      const audio = audioRef.current;
      if (audio) audio.currentTime = scrubTimeRef.current;
      setCurrentTime(scrubTimeRef.current);
    });
  }

  function handleWaveformPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (!audioUrl || loadingAudio || audioError || effectiveDuration <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubTo(event.clientX, false);
  }

  function handleWaveformDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.buttons !== 1 || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    scrubTo(event.clientX, false);
  }

  function handleWaveformRelease(event: React.PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    scrubTo(event.clientX, true);
  }

  function handleWaveformKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!audioUrl || loadingAudio || audioError || effectiveDuration <= 0) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (event.key === "Home") {
      seekByRatio(0);
      return;
    }
    if (event.key === "End") {
      seekByRatio(1);
      return;
    }
    const direction = event.key === "ArrowRight" ? 1 : -1;
    seek(String(Math.min(effectiveDuration, Math.max(0, currentTime + direction * 5))));
  }

  function clearSpeedHoldTimer() {
    if (speedHoldTimerRef.current === null) return;
    window.clearTimeout(speedHoldTimerRef.current);
    speedHoldTimerRef.current = null;
  }

  function changePlaybackRate(value: number) {
    const nextRate = Number(value);
    setPlaybackRate(nextRate);
    if (audioRef.current) audioRef.current.playbackRate = nextRate;
  }

  function cyclePlaybackRate() {
    const currentIndex = playbackRates.indexOf(playbackRate);
    const nextRate = playbackRates[(currentIndex + 1) % playbackRates.length] ?? 1;
    changePlaybackRate(nextRate);
    setSpeedMenuOpen(false);
  }

  function handleSpeedPointerDown() {
    if (audioDisabled) return;
    speedLongPressRef.current = false;
    clearSpeedHoldTimer();
    speedHoldTimerRef.current = window.setTimeout(() => {
      speedLongPressRef.current = true;
      setSpeedMenuOpen(true);
    }, 420);
  }

  function handleSpeedPointerUp() {
    if (audioDisabled) return;
    clearSpeedHoldTimer();
    if (speedLongPressRef.current) {
      speedLongPressRef.current = false;
      return;
    }
    cyclePlaybackRate();
  }

  function handleSpeedKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (audioDisabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      cyclePlaybackRate();
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSpeedMenuOpen(true);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setSpeedMenuOpen(false);
    }
  }

  async function downloadAudio() {
    if (downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const blob = await downloadCallMedia(call, mediaVariant);
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = mediaDownloadName(call);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Не удалось скачать запись");
    } finally { setDownloading(false); }
  }

  const effectiveDuration = duration > 0 ? duration : call.duration_seconds;
  const progressPercent = effectiveDuration > 0 ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100)) : 0;
  const waveformReady = waveform.length > 0;
  const displayedWaveform = useMemo(() => resampleWaveform(waveformReady ? waveform : fallbackWaveform, visibleWaveformBars), [waveform, waveformReady, visibleWaveformBars]);
  const showAudioSkeleton = loadingAudio;
  const currentTimeLabel = formatDuration(Math.round(currentTime));
  const audioDisabled = !audioUrl || loadingAudio || Boolean(audioError);
  // The bars and the speaker turns are drawn once per recording, not on every
  // tick of the playhead: what has been played is a second, clipped copy of
  // the bars and a shade over the rest of the lane, both driven by the
  // --audio-progress variable.
  const waveLayers = useMemo(() => {
    const bars = displayedWaveform.map((peak, index) => (
      <span style={{ "--bar-height": `${Math.max(8, peak * 100)}%` } as React.CSSProperties} key={`${index}-${peak.toFixed(3)}`} />
    ));
    return <>
      <div className="audio-wave-layer">{bars}</div>
      <div className="audio-wave-layer is-played" aria-hidden="true">{bars}</div>
    </>;
  }, [displayedWaveform]);
  const laneTrack = useMemo(() => {
    const percent = (seconds: number) => `${effectiveDuration > 0 ? Math.min(100, Math.max(0, (seconds / effectiveDuration) * 100)) : 0}%`;
    return (
      <span className="audio-lane-track">
        {runs.map((run, index) => (
          <span
            key={`${run.speaker}-${run.start}-${index}`}
            className="audio-lane-run"
            style={{ left: percent(run.start), width: percent(run.end - run.start), "--run-color": speakerColor(run.speaker, speakerKeys) } as React.CSSProperties}
          />
        ))}
      </span>
    );
  }, [effectiveDuration, runs, speakerKeys]);
  // A call without speech statistics still has its turns: each speaker's
  // share of the talking comes from their summed turn lengths.
  const turnShare = (key: string) => {
    let total = 0;
    let own = 0;
    for (const run of runs) {
      const length = Math.max(0, run.end - run.start);
      total += length;
      if (run.speaker === key) own += length;
    }
    return total > 0 ? own / total : null;
  };
  const legendSpeakers = (speakers?.length ? speakers : speakerKeys.map((key) => ({ key, name: `Спикер ${key}`, share: null })))
    .map((speaker) => ({ ...speaker, share: speaker.share ?? turnShare(speaker.key) }));

  return (
    <div
      ref={playerRef}
      className={`dashboard-audio-player custom-audio-player${hasLane ? " has-lane" : ""} ${showAudioSkeleton ? "audio-loading-state" : ""} ${audioError ? "audio-error-state" : ""}`}
      style={{ "--audio-progress": `${progressPercent}%` } as React.CSSProperties}
    >
      <button
        className="audio-play"
        type="button"
        disabled={!audioUrl || loadingAudio || Boolean(audioError)}
        aria-label={playing ? "Поставить аудио на паузу" : "Воспроизвести аудио"}
        onClick={togglePlayback}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div className="audio-player-main">
        <div className="audio-player-track-row">
          <div
            ref={waveformRef}
            className={`audio-waveform ${waveformReady ? "ready" : "empty"}`}
            role="slider"
            tabIndex={audioUrl && !audioError ? 0 : -1}
            aria-label="Позиция аудиозаписи"
            aria-valuemin={0}
            aria-valuemax={Math.round(effectiveDuration)}
            aria-valuenow={Math.round(currentTime)}
            aria-valuetext={`${formatDuration(Math.round(currentTime))} из ${formatDuration(Math.round(effectiveDuration))}`}
            onKeyDown={handleWaveformKey}
            onPointerDown={handleWaveformPointer}
            onPointerMove={handleWaveformDrag}
            onPointerUp={handleWaveformRelease}
            onPointerCancel={handleWaveformRelease}
          >
            {waveLayers}
          </div>
          {hasLane && (
            // Same time axis as the waveform above; a press seeks like it does.
            <div
              className="audio-conversation-lane"
              aria-hidden="true"
              onPointerDown={handleWaveformPointer}
              onPointerMove={handleWaveformDrag}
              onPointerUp={handleWaveformRelease}
              onPointerCancel={handleWaveformRelease}
            >
              {laneTrack}
              <span className="audio-lane-playhead" />
            </div>
          )}
          <div className="audio-player-meta-row">
            <div className="audio-time-range">
              <span className="audio-time">
                {currentTimeLabel}
              </span>
              <span className="audio-time-separator" aria-hidden="true">/</span>
              <span className="audio-time total">{formatDuration(Math.round(effectiveDuration))}</span>
            </div>
            <div className="audio-player-actions">
              <div
                className={`audio-speed-control ${speedMenuOpen ? "open" : ""} ${audioDisabled ? "disabled" : ""}`}
                ref={speedControlRef}
              >
                <button
                  className="audio-speed-button"
                  type="button"
                  disabled={audioDisabled}
                  aria-haspopup="menu"
                  aria-expanded={speedMenuOpen}
                  aria-label="Скорость воспроизведения"
                  onKeyDown={handleSpeedKeyDown}
                  onPointerCancel={clearSpeedHoldTimer}
                  onPointerDown={handleSpeedPointerDown}
                  onPointerLeave={clearSpeedHoldTimer}
                  onPointerUp={handleSpeedPointerUp}
                >
                  {playbackRate}x
                </button>
                <div className="audio-speed-menu" role="menu">
                  {playbackRates.map((rate) => (
                    <button
                      className={rate === playbackRate ? "active" : ""}
                      type="button"
                      role="menuitemradio"
                      aria-checked={rate === playbackRate}
                      key={rate}
                      onClick={() => {
                        changePlaybackRate(rate);
                        setSpeedMenuOpen(false);
                      }}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="audio-download-button"
                type="button"
                disabled={downloading || Boolean(audioError)}
                aria-busy={downloading}
                aria-label="Скачать аудиозапись"
                onClick={downloadAudio}
              >
                <Download size={14} />
              </button>
            </div>
          </div>
          {/* Who speaks gets its own line under the time and the controls: in
              one row with them the last speaker was cut off at the edge. */}
          {hasLane && (
            <div className="audio-lane-summary">
              <ul className="audio-lane-legend" aria-label="Кто говорит">
                {legendSpeakers.map((speaker) => (
                  <li key={speaker.key} style={{ "--run-color": speakerColor(speaker.key, speakerKeys) } as React.CSSProperties}>
                    <i />{speaker.name}{speaker.share !== null && <b>{Math.round(speaker.share * 100)}%</b>}
                  </li>
                ))}
              </ul>
              {longestMonologue && <p className="audio-lane-note">Самый длинный монолог — {formatDuration(Math.round(longestMonologue.seconds))}, {longestMonologue.name}</p>}
            </div>
          )}
        </div>
        <audio
          ref={audioRef}
          className="call-audio-element"
          src={audioUrl || undefined}
          preload="metadata"
          crossOrigin="use-credentials"
          controlsList="nodownload"
          onLoadStart={() => setLoadingAudio(true)}
          onError={() => {
            setLoadingAudio(false);
            setAudioError("Аудио недоступно. Проверьте доступ к записи и обновите страницу.");
          }}
          onLoadedMetadata={(event) => {
            setLoadingAudio(false);
            const audio = event.currentTarget;
            if (resumeRef.current.time > 0) audio.currentTime = resumeRef.current.time;
            if (resumeRef.current.playing) void audio.play().catch(() => setAudioError("Не удалось продолжить аудио"));
          }}
          onDurationChange={(event) => {
            const nextDuration = event.currentTarget.duration;
            if (Number.isFinite(nextDuration)) setDuration(nextDuration);
          }}
          onEnded={() => { resumeRef.current.playing = false; setPlaying(false); stopPositionUpdates(); }}
          onPause={() => { setPlaying(false); stopPositionUpdates(); }}
          onPlay={() => { resumeRef.current.playing = true; setPlaying(true); }}
          onTimeUpdate={(event) => {
            if (event.currentTarget.readyState > 0) resumeRef.current.time = event.currentTarget.currentTime;
            updateCurrentTime(event.currentTarget.currentTime);
          }}
        />
      </div>
      {downloadError && <p className="form-error" role="alert">{downloadError}</p>}
    </div>
  );
}

function resampleWaveform(peaks: number[], count: number) {
  if (peaks.length <= count) return peaks;
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * peaks.length / count);
    const end = Math.max(start + 1, Math.floor((index + 1) * peaks.length / count));
    return Math.max(...peaks.slice(start, end));
  });
}
