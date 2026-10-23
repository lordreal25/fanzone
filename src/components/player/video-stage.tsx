import { LoaderCircle, Maximize, Minimize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { canSyncTimeline, expectedPosition, shouldSeek } from "@/lib/fanzone/playback";
import { playbackTarget, sourceLabel } from "@/lib/fanzone/media";
import type { MediaSource, Playback, SyncMode } from "@/lib/fanzone/types";

type Anchor = { revision: number; playing: boolean; positionSec: number; localAt: number };

export function VideoStage({
  source,
  syncMode,
  youAreHost,
  playback,
  parentHost,
  localGateway,
  onLocalGateway,
  onPlayback,
}: {
  source: MediaSource | null;
  syncMode: SyncMode;
  youAreHost: boolean;
  playback: Playback;
  parentHost: string;
  localGateway: string;
  onLocalGateway: (value: string) => void;
  onPlayback: (next: { playing: boolean; positionSec: number }) => void;
}) {
  const target = playbackTarget(source, { parentHost, localGateway });
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<Anchor | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [localTime, setLocalTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const canControl = syncMode === "free" || youAreHost;
  const timeline = canSyncTimeline(source) && target.type === "video";
  const mediaUrl = target.type === "video" ? target.url : "";
  const mediaHls = target.type === "video" && target.hls;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !mediaUrl) return;
    const media: HTMLVideoElement = video;
    let destroyed = false;
    let hls: { destroy: () => void } | null = null;
    setPhase("loading");
    setMessage("");
    setNeedsGesture(false);

    const onMediaError = () => {
      setPhase("error");
      setMessage("Источник недоступен или формат не поддерживается.");
    };
    media.addEventListener("error", onMediaError);
    const onReady = () => setPhase("ready");
    media.addEventListener("loadeddata", onReady);

    async function attach() {
      const nativeHls = media.canPlayType("application/vnd.apple.mpegurl");
      if (!mediaHls || nativeHls) {
        media.src = mediaUrl;
        return;
      }
      const { default: Hls } = await import("hls.js");
      if (destroyed) return;
      if (!Hls.isSupported()) {
        setPhase("error");
        setMessage("Этот браузер не воспроизводит HLS.");
        return;
      }
      const instance = new Hls({ enableWorker: false });
      hls = instance;
      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        setPhase("error");
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setMessage("Источник недоступен. Проверьте ссылку, сеть и CORS — сервер поток не проксирует.");
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          setMessage("Поток повреждён или этот формат не воспроизводится.");
          instance.recoverMediaError();
        } else {
          setMessage("Не удалось подключиться к источнику.");
        }
      });
      instance.on(Hls.Events.MANIFEST_PARSED, () => setPhase("ready"));
      instance.loadSource(mediaUrl);
      instance.attachMedia(media);
    }

    void attach();
    return () => {
      destroyed = true;
      media.removeEventListener("error", onMediaError);
      media.removeEventListener("loadeddata", onReady);
      hls?.destroy();
      media.removeAttribute("src");
      media.load();
    };
  }, [mediaUrl, mediaHls, reloadKey]);

  useEffect(() => {
    if (!anchorRef.current || anchorRef.current.revision !== playback.revision) {
      anchorRef.current = {
        revision: playback.revision,
        playing: playback.playing,
        positionSec: playback.positionSec,
        localAt: Date.now(),
      };
    }
  }, [playback.revision, playback.playing, playback.positionSec]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || target.type !== "video" || canControl || syncMode !== "sync") return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const apply = () => {
      if (timeline) {
        const expected = expectedPosition(anchor, Date.now());
        if (shouldSeek(video.currentTime || 0, expected)) video.currentTime = expected;
      }
      if (anchor.playing && video.paused) {
        void video.play().catch(() => setNeedsGesture(true));
      }
      if (!anchor.playing && !video.paused) video.pause();
    };
    apply();
  }, [playback.revision, playback.playing, syncMode, canControl, timeline, target.type]);

  useEffect(() => {
    function onChange() {
      setFullscreen(document.fullscreenElement === stageRef.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const emitRef = useRef(onPlayback);
  emitRef.current = onPlayback;

  useEffect(() => {
    if (!canControl || syncMode !== "sync" || !timeline) return;
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused) return;
      emitRef.current({ playing: true, positionSec: video.currentTime });
    }, 8000);
    return () => window.clearInterval(timer);
  }, [canControl, syncMode, timeline, mediaUrl]);

  function emit(playing: boolean) {
    const video = videoRef.current;
    onPlayback({ playing, positionSec: video?.currentTime ?? playback.positionSec });
  }

  async function togglePlay() {
    const video = videoRef.current;
    if (!video || !canControl) return;
    if (video.paused) {
      try {
        await video.play();
        setNeedsGesture(false);
        emit(true);
      } catch {
        setMuted(true);
        video.muted = true;
        try {
          await video.play();
          setNeedsGesture(false);
          emit(true);
        } catch {
          setNeedsGesture(true);
        }
      }
    } else {
      video.pause();
      emit(false);
    }
  }

  async function unlock() {
    const video = videoRef.current;
    if (!video) return;
    try {
      await video.play();
      setNeedsGesture(false);
    } catch {
      setMessage("Браузер не запустил воспроизведение.");
    }
  }

  async function toggleFullscreen() {
    const node = stageRef.current;
    if (!node) return;
    if (document.fullscreenElement === node) await document.exitFullscreen();
    else await node.requestFullscreen();
  }

  const status =
    target.type === "empty"
      ? "Трансляция пока не добавлена"
      : target.type === "ace-unconfigured"
        ? "Ace Stream не подключён"
        : phase === "error"
          ? "Ошибка источника"
          : phase === "loading"
            ? "Подключение к источнику"
            : "Источник подключён";

  return (
    <div ref={stageRef} className="overflow-hidden rounded-3xl border border-line bg-card">
      <div className="relative aspect-video bg-bg">
        {target.type === "video" ? (
          <video
            ref={videoRef}
            className="h-full w-full bg-bg"
            playsInline
            preload="metadata"
            onTimeUpdate={(event) => setLocalTime(event.currentTarget.currentTime)}
            onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
            onPlay={() => setLocalPlaying(true)}
            onPause={() => setLocalPlaying(false)}
          />
        ) : null}
        {target.type === "iframe" ? (
          <iframe
            key={target.url}
            src={target.url}
            title="Внешний плеер"
            className="h-full w-full border-0 bg-bg"
            allow="autoplay; fullscreen; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-fullscreen"
            referrerPolicy="no-referrer"
          />
        ) : null}
        {target.type === "empty" ? <EmptyCopy text="Трансляция пока не добавлена" /> : null}
        {target.type === "ace-unconfigured" ? (
          <AceHelp contentId={target.contentId} gateway={localGateway} onGateway={onLocalGateway} />
        ) : null}
        {phase === "loading" && target.type === "video" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-bg/70">
            <LoaderCircle className="size-8 animate-spin text-accent" aria-label="Загрузка" />
          </div>
        ) : null}
        {phase === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/85 px-6 text-center">
            <p className="max-w-md text-sm text-fg">{message}</p>
            <button
              type="button"
              className="h-11 rounded-2xl bg-accent px-4 font-semibold text-bg"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              Повторить
            </button>
          </div>
        ) : null}
        {needsGesture ? (
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center bg-bg/70 text-base font-semibold"
            onClick={() => void unlock()}
          >
            Включить воспроизведение
          </button>
        ) : null}
        <p className="absolute left-3 top-3 rounded-full border border-line bg-card/90 px-3 py-1 text-xs text-muted">
          {status}
          {source ? ` · ${sourceLabel(source)}` : ""}
        </p>
      </div>
      {target.type === "video" ? (
        <div className="flex flex-wrap items-center gap-3 px-3 py-3">
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-2xl bg-surface text-fg disabled:opacity-40"
            onClick={() => void togglePlay()}
            disabled={!canControl}
            aria-label={playback.playing ? "Пауза" : "Воспроизведение"}
          >
            {localPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
          </button>
          {timeline ? (
            <input
              aria-label="Позиция"
              className="h-2 min-w-32 flex-1 accent-accent disabled:opacity-40"
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(localTime, duration || localTime)}
              disabled={!canControl || !duration}
              onChange={(event) => {
                const video = videoRef.current;
                if (!video) return;
                video.currentTime = Number(event.target.value);
                setLocalTime(video.currentTime);
              }}
              onPointerUp={() => {
                if (canControl && syncMode === "sync") emit(!videoRef.current?.paused);
              }}
              onKeyUp={() => {
                if (canControl && syncMode === "sync") emit(!videoRef.current?.paused);
              }}
            />
          ) : (
            <p className="min-w-0 flex-1 text-sm text-muted">
              {playback.live || source?.kind === "acestream"
                ? "Прямой эфир: общая секунда не гарантируется."
                : "Позиция этого источника не синхронизируется."}
            </p>
          )}
          <span className="tabular-nums text-xs text-muted">{formatTime(localTime)}</span>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-2xl text-fg"
            onClick={() => setMuted((value) => !value)}
            aria-label={muted ? "Включить звук" : "Выключить звук"}
          >
            {muted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
          <input
            aria-label="Громкость"
            className="h-2 w-20 accent-accent"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(event) => {
              const next = Number(event.target.value);
              setVolume(next);
              setMuted(next === 0);
            }}
          />
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-2xl text-fg"
            onClick={() => void toggleFullscreen()}
            aria-label="Полный экран"
          >
            {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </button>
        </div>
      ) : target.type === "iframe" ? (
        <div className="flex items-center justify-between gap-3 px-3 py-3 text-sm text-muted">
          <p>Внешний плеер: позиция не синхронизируется, чат общий.</p>
          <button type="button" className="inline-flex size-11 items-center justify-center" onClick={() => void toggleFullscreen()} aria-label="Полный экран">
            {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EmptyCopy({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="font-display text-3xl tracking-wide">{text}</p>
      <p className="max-w-sm text-sm text-muted">Ведущий может добавить HLS, видеофайл или разрешённый внешний плеер.</p>
    </div>
  );
}

function AceHelp({
  contentId,
  gateway,
  onGateway,
}: {
  contentId: string;
  gateway: string;
  onGateway: (value: string) => void;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-3 overflow-auto px-5 py-4">
      <p className="font-display text-3xl tracking-wide">Ace Stream не подключён</p>
      <p className="max-w-xl text-sm text-muted">
        Идентификатор сохранён в комнате, но поток не имитируется. FANZONE не запускает движок и не проксирует чужой эфир.
        Укажите свой Ace Stream Engine или HTTPS-шлюз, который отдаёт HLS.
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Установите и запустите Ace Stream Engine на этом компьютере.</li>
        <li>Впишите адрес, например http://127.0.0.1:6878. Он хранится только в вашем браузере.</li>
        <li>Плеер запросит /ace/manifest.m3u8. Если движок отдаёт лишь MPEG-TS, браузер его не откроет.</li>
      </ol>
      <p className="font-mono text-xs text-fg">{contentId}</p>
      <label className="flex flex-col gap-2 text-sm text-muted">
        Локальный шлюз
        <input
          value={gateway}
          onChange={(event) => onGateway(event.target.value)}
          placeholder="http://127.0.0.1:6878"
          className="h-12 rounded-2xl border border-line bg-card px-4 text-base text-fg outline-none focus:border-accent"
          autoCapitalize="none"
          spellCheck={false}
        />
      </label>
    </div>
  );
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "00:00";
  const total = Math.floor(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
