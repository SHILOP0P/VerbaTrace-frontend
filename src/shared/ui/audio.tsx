import { Download, Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { api, getCallMediaBlob, getCallMediaUrl } from "../../api";
import type { CallResponse, MediaSeekTarget, TranscriptionWordResponse } from "../../types";
import { activeTranscriptWordIndex } from "../lib/transcript";
import { formatDuration } from "../lib/formatters";
import { isVideoCall, mediaDownloadName } from "../lib/media";

const playbackRates = [0.75, 1, 1.25, 1.5, 2];
const emptyTranscriptWords: TranscriptionWordResponse[] = [];
const waveformBars = 72;
const fallbackWaveform = Array.from({ length: waveformBars }, (_, index) => {
  const wave = Math.sin(index * 0.68) * 0.22 + Math.sin(index * 1.73) * 0.14;
  return Math.max(0.2, Math.min(0.9, 0.54 + wave));
});

type MediaPlayerProps = {
  call: CallResponse;
  seekTarget?: MediaSeekTarget | null;
  words?: TranscriptionWordResponse[];
  onActiveWordChange?: (index: number) => void;
};

type ResolvedMediaPlayerProps = MediaPlayerProps & {
  mediaVariant: "original" | "redacted";
  accessSession: string;
};

export function CallMediaPlayer(props: MediaPlayerProps) {
  const [accessSession, setAccessSession] = useState("");
  const [variantError, setVariantError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setAccessSession(""); setVariantError("");
    async function prepare() {
      try {
        const session = await api.createMediaAccessSession(props.call.id, "original");
        if (!cancelled) setAccessSession(session.media_access_session_uuid);
      } catch (cause) { if (!cancelled) setVariantError(cause instanceof Error ? cause.message : "Запись недоступна"); }
    }
    void prepare();
    return () => { cancelled = true; };
  }, [props.call.id]);

  const resolved = { ...props, mediaVariant: "original" as const, accessSession };
  return <div className="privacy-media-shell">
    {variantError && <div className="form-error" role="alert">{variantError}</div>}
    {accessSession ? (isVideoCall(props.call) ? <CallVideoPlayer {...resolved} /> : <CallAudioPlayer {...resolved} />) : <div className="media-access-loading">Проверяем доступ к записи…</div>}
  </div>;
}

function CallVideoPlayer({ call, seekTarget, words = emptyTranscriptWords, onActiveWordChange, mediaVariant, accessSession }: ResolvedMediaPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
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
    if (video.paused) void video.play();
    else video.pause();
  }

  function seek(value: number) {
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
      const blob = await getCallMediaBlob(call, mediaVariant, accessSession);
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = mediaDownloadName(call);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
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
        src={source}
        aria-label={`Видеозапись звонка ${call.title}`}
        onError={() => setError("Видео недоступно")}
        onClick={togglePlayback}
        onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : call.duration_seconds || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => {
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

export function CallAudioPlayer({ call, seekTarget, words = emptyTranscriptWords, onActiveWordChange, mediaVariant = "original", accessSession = "" }: MediaPlayerProps & Partial<ResolvedMediaPlayerProps>) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const speedControlRef = useRef<HTMLDivElement | null>(null);
  const speedHoldTimerRef = useRef<number | null>(null);
  const speedLongPressRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const activeWordRef = useRef(-1);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioError, setAudioError] = useState("");
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [loadingWaveform, setLoadingWaveform] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(call.duration_seconds || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const source = useMemo(
    () => getCallMediaUrl(call, mediaVariant, accessSession),
    [
      call.id,
      call.audio_url,
      call.audio_download_url,
      call.file_url,
      call.media_url,
      call.recording_url,
      call.download_url,
      mediaVariant,
      accessSession
    ]
  );

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    resetAudioElement(audioRef.current);
    setAudioUrl("");
    setAudioError("");
    setLoadingAudio(true);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(call.duration_seconds || 0);
    setAudioBlob(null);
    setWaveform([]);
    setLoadingWaveform(false);

    getCallMediaBlob(call, mediaVariant, accessSession)
      .then(async (blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(objectUrl);
        setLoadingWaveform(true);
        try {
          const peaks = await buildWaveform(blob, waveformBars);
          if (!cancelled) setWaveform(peaks);
        } catch {
          if (!cancelled) setWaveform([]);
        } finally {
          if (!cancelled) setLoadingWaveform(false);
        }
      })
      .catch((error) => {
        if (!cancelled) setAudioError(error instanceof Error ? error.message : "Аудио недоступно");
      })
      .finally(() => {
        if (!cancelled) setLoadingAudio(false);
      });

    return () => {
      cancelled = true;
      resetAudioElement(audioRef.current);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [call.duration_seconds, source]);

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
      audio.play().catch(() => setAudioError("Не удалось воспроизвести аудио"));
    } else {
      audio.pause();
    }
  }

  function seek(value: string) {
    const audio = audioRef.current;
    const nextTime = Number(value);
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

  function seekFromPointer(clientX: number) {
    const rect = waveformRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    seekByRatio((clientX - rect.left) / rect.width);
  }

  function handleWaveformPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (!audioUrl || loadingAudio || audioError || effectiveDuration <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromPointer(event.clientX);
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

  function downloadAudio() {
    if (!audioBlob) return;
    const downloadUrl = URL.createObjectURL(audioBlob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = mediaDownloadName(call);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
  }

  const effectiveDuration = duration > 0 ? duration : call.duration_seconds;
  const progressPercent = effectiveDuration > 0 ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100)) : 0;
  const waveformReady = waveform.length > 0;
  const showAudioSkeleton = loadingAudio || (loadingWaveform && !waveformReady);
  const currentTimeLabel = formatDuration(Math.round(currentTime));
  const audioDisabled = !audioUrl || loadingAudio || Boolean(audioError);

  return (
    <div
      className={`dashboard-audio-player custom-audio-player ${showAudioSkeleton ? "audio-loading-state" : ""} ${audioError ? "audio-error-state" : ""}`}
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
            onPointerMove={(event) => {
              if (event.buttons === 1) handleWaveformPointer(event);
            }}
          >
            {(waveformReady ? waveform : fallbackWaveform).map((peak, index) => {
              const barProgress = waveform.length > 1 ? index / (waveform.length - 1) : 0;
              const active = barProgress * 100 <= progressPercent;
              return (
                <span
                  className={active ? "active" : ""}
                  style={{ "--bar-height": `${Math.max(8, peak * 100)}%` } as React.CSSProperties}
                  key={`${index}-${peak.toFixed(3)}`}
                />
              );
            })}
          </div>
          <div className="audio-player-meta-row">
            <div className="audio-time-range">
              <span className="audio-time" title={audioError || (loadingWaveform ? "Строю звуковую дорожку" : undefined)}>
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
                disabled={!audioBlob}
                aria-label="Скачать аудиозапись"
                onClick={downloadAudio}
              >
                <Download size={14} />
              </button>
            </div>
          </div>
        </div>
        <audio
          ref={audioRef}
          className="call-audio-element"
          src={audioUrl || undefined}
          preload="metadata"
          onDurationChange={(event) => {
            const nextDuration = event.currentTarget.duration;
            if (Number.isFinite(nextDuration)) setDuration(nextDuration);
          }}
          onEnded={() => { setPlaying(false); stopPositionUpdates(); }}
          onPause={() => { setPlaying(false); stopPositionUpdates(); }}
          onPlay={() => setPlaying(true)}
          onTimeUpdate={(event) => updateCurrentTime(event.currentTarget.currentTime)}
        />
      </div>
    </div>
  );
}

function resetAudioElement(audio: HTMLAudioElement | null) {
  if (!audio) return;
  audio.pause();
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = 0;
  }
  audio.load();
}

async function buildWaveform(blob: Blob, barCount: number) {
  const AudioContextConstructor = window.AudioContext ?? (window as Window & {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;

  if (!AudioContextConstructor) {
    throw new Error("AudioContext is not available");
  }

  const audioContext = new AudioContextConstructor();

  try {
    const buffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
    const channelData = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    const samplesPerBar = Math.max(1, Math.floor(buffer.length / barCount));
    const peaks = Array.from({ length: barCount }, (_, barIndex) => {
      const start = barIndex * samplesPerBar;
      const end = barIndex === barCount - 1 ? buffer.length : Math.min(buffer.length, start + samplesPerBar);
      let peak = 0;

      for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
        let mixed = 0;
        channelData.forEach((channel) => {
          mixed += Math.abs(channel[sampleIndex] ?? 0);
        });
        peak = Math.max(peak, mixed / channelData.length);
      }

      return peak;
    });
    const maxPeak = Math.max(...peaks, 0.01);

    return peaks.map((peak) => Math.max(0.1, Math.min(1, peak / maxPeak)));
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}
