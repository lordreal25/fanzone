import { useNavigate } from "@tanstack/react-router";
import { Check, Copy, LogOut, Shield, Users, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { ChatPanel } from "@/components/chat/chat-panel";
import { SourceFields } from "@/components/home/home-page";
import { VideoStage } from "@/components/player/video-stage";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import {
  joinRoom,
  leaveRoom,
  peekRoom,
  postMessage,
  setRoomDetails,
  setRoomPlayback,
  setRoomSource,
  setRoomSyncMode,
  syncRoom,
} from "@/lib/fanzone/api";
import { canSyncTimeline } from "@/lib/fanzone/playback";
import { loadSession, saveSession, type LocalSession } from "@/lib/fanzone/session";
import type { PeekRoom, RoomSnapshot, SourceDraft } from "@/lib/fanzone/types";

type Phase = "boot" | "join" | "room" | "missing";

export function RoomScreen({ code }: { code: string }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("boot");
  const [peek, setPeek] = useState<PeekRoom | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [link, setLink] = useState<"online" | "reconnecting">("online");
  const [error, setError] = useState("");
  const [chatError, setChatError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [parentHost, setParentHost] = useState("localhost");
  const [gateway, setGateway] = useState("");
  const sessionRef = useRef<LocalSession | null>(null);
  const kickRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setParentHost(window.location.hostname);
    const session = loadSession();
    sessionRef.current = session;
    setName(session.name);
    setGateway(session.aceGateway);
    let stop = false;
    let timer = 0;
    let failures = 0;

    const creds = () => {
      const current = sessionRef.current;
      const roomCreds = current?.rooms[code];
      if (!current || !roomCreds) return null;
      return {
        code,
        clientId: current.clientId,
        secret: roomCreds.secret,
        adminToken: roomCreds.adminToken,
      };
    };

    async function watch() {
      const auth = creds();
      if (!auth || stop) return;
      try {
        const result = await syncRoom({ data: auth });
        if (stop) return;
        if (!result.ok) {
          setPhase("join");
          setError(result.error);
          return;
        }
        failures = 0;
        setLink("online");
        setRoom(result.room);
        setPhase("room");
        timer = window.setTimeout(() => void watch(), document.hidden ? 4000 : 1200);
      } catch {
        if (stop) return;
        failures += 1;
        setLink("reconnecting");
        timer = window.setTimeout(() => void watch(), Math.min(10_000, 700 * 2 ** Math.min(failures, 4)));
      }
    }

    async function boot() {
      if (creds()) {
        await watch();
        return;
      }
      try {
        const info = await peekRoom({ data: { code } });
        if (stop) return;
        setPeek(info);
        setPhase(info.found ? "join" : "missing");
      } catch {
        if (stop) return;
        setLink("reconnecting");
        timer = window.setTimeout(() => void boot(), 1500);
      }
    }

    kickRef.current = () => {
      window.clearTimeout(timer);
      failures = 0;
      void watch();
    };
    void boot();
    return () => {
      stop = true;
      kickRef.current = null;
      window.clearTimeout(timer);
    };
  }, [code]);

  async function submitJoin() {
    setError("");
    const session = sessionRef.current ?? loadSession();
    try {
      const result = await joinRoom({
        data: {
          code,
          clientId: session.clientId,
          name,
          password,
          adminToken: session.rooms[code]?.adminToken,
        },
      });
      if (!result.ok || !result.secret) {
        setError(result.ok ? "Не удалось войти." : result.error);
        return;
      }
      session.name = name.trim();
      session.rooms[code] = { secret: result.secret, adminToken: result.adminToken ?? session.rooms[code]?.adminToken };
      sessionRef.current = session;
      saveSession(session);
      setRoom(result.room);
      setPhase("room");
      setLink("online");
      kickRef.current?.();
    } catch {
      setLink("reconnecting");
      setError("Нет связи. Повторите вход.");
    }
  }

  async function mutate(run: () => Promise<{ ok: boolean; error?: string; room?: RoomSnapshot }>) {
    try {
      const result = await run();
      if (!result.ok || !result.room) {
        setChatError(result.error ?? "Не удалось выполнить действие.");
        return;
      }
      setChatError("");
      setRoom(result.room);
      setLink("online");
    } catch {
      setLink("reconnecting");
      setChatError("Связь прервалась. Состояние восстановится автоматически.");
    }
  }

  function authData() {
    const session = sessionRef.current;
    const roomCreds = session?.rooms[code];
    if (!session || !roomCreds) return null;
    return { code, clientId: session.clientId, secret: roomCreds.secret, adminToken: roomCreds.adminToken };
  }

  const liveAuth = authData();

  async function copyLink() {
    const url = `${window.location.origin}/room/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Ссылка скопирована");
    } catch {
      setNotice(url);
    }
    window.setTimeout(() => setNotice(""), 2200);
  }

  async function exitRoom() {
    const data = authData();
    if (data) {
      try {
        await leaveRoom({ data });
      } catch {
        /* leaving still clears this browser */
      }
    }
    const session = sessionRef.current ?? loadSession();
    delete session.rooms[code];
    saveSession(session);
    void navigate({ to: "/" });
  }

  function saveGateway(value: string) {
    setGateway(value);
    const session = sessionRef.current ?? loadSession();
    session.aceGateway = value;
    sessionRef.current = session;
    saveSession(session);
  }

  const headerStatus = !room?.source ? "Ожидание" : room.playback.playing ? "В эфире" : "Пауза";

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-3 lg:px-5">
          <Logo compact />
          <div className="min-w-0">
            <p className="truncate font-display text-xl tracking-wide">{room?.matchTitle || peekTitle(peek) || "Комната"}</p>
            <p className="truncate text-xs text-muted">{room?.title || code}</p>
          </div>
          <span className="hidden items-center gap-2 rounded-full border border-line px-3 py-1 text-xs sm:inline-flex">
            <span className={`size-2 rounded-full ${room?.playback.playing ? "live-dot bg-ok" : "bg-muted"}`} />
            {headerStatus}
          </span>
          <span className="inline-flex items-center gap-1 text-sm tabular-nums text-muted">
            <Users className="size-4" aria-hidden="true" />
            {room?.viewerCount ?? 0}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="surface" className="h-11 px-3" onClick={() => void copyLink()}>
              {notice === "Ссылка скопирована" ? <Check className="size-4" /> : <Copy className="size-4" />}
              <span className="hidden sm:inline">Поделиться</span>
            </Button>
            <Button variant="quiet" className="h-11 px-3" onClick={() => void exitRoom()}>
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Выйти</span>
            </Button>
          </div>
        </div>
      </header>
      <p className="sr-only" aria-live="polite">{notice}</p>
      {notice ? <p className="mx-auto max-w-7xl px-4 pt-3 text-sm text-ok">{notice}</p> : null}
      {link === "reconnecting" ? (
        <p className="mx-auto flex max-w-7xl items-center gap-2 px-4 pt-3 text-sm text-danger">
          <WifiOff className="size-4" />
          Связь потеряна. Подключаемся снова.
        </p>
      ) : null}

      {phase === "boot" ? <p className="px-4 py-10 text-muted">Загрузка комнаты…</p> : null}
      {phase === "missing" ? (
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="font-display text-4xl tracking-wide">Комната не найдена</h1>
          <p className="mt-2 text-muted">Проверьте ссылку. Приватные комнаты не видны в общем списке.</p>
          <Button className="mt-6" onClick={() => void navigate({ to: "/" })}>На главную</Button>
        </div>
      ) : null}
      {phase === "join" && peek?.found ? (
        <form
          className="mx-auto mt-8 flex max-w-md flex-col gap-4 rounded-3xl border border-line bg-card p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submitJoin();
          }}
        >
          <h1 className="font-display text-3xl tracking-wide">{peek.matchTitle || "Вход в комнату"}</h1>
          <p className="text-sm text-muted">
            {peek.access === "private" ? "Приватная комната. Ссылка не публикуется." : peek.title}
            {peek.needsPassword ? " Нужен пароль." : ""}
          </p>
          <Field label="Ваше имя">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} maxLength={24} required />
          </Field>
          {peek.needsPassword ? (
            <Field label="Пароль">
              <TextInput type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </Field>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit">Войти</Button>
        </form>
      ) : null}

      {phase === "room" && room ? (
        <div className="mx-auto grid max-w-7xl gap-4 px-3 py-3 lg:h-[calc(100dvh-4.5rem)] lg:grid-cols-[minmax(0,1fr)_22rem] lg:px-5">
          <section className="flex min-w-0 flex-col gap-3">
            <VideoStage
              source={room.source}
              syncMode={room.syncMode}
              youAreHost={room.youAreHost}
              playback={room.playback}
              parentHost={parentHost}
              localGateway={gateway}
              onLocalGateway={saveGateway}
              onPlayback={(next) => {
                const data = authData();
                if (!data || room.syncMode !== "sync") return;
                void mutate(() => setRoomPlayback({ data: { ...data, ...next } }));
              }}
            />
            <p className="text-sm text-muted">{syncCopy(room)}</p>
            {room.youAreHost && liveAuth ? (
              <HostDock room={room} auth={liveAuth} onDone={(next) => setRoom(next)} onError={setChatError} />
            ) : (
              <p className="text-sm text-muted">
                Ведущий: {room.hostName}. Управление эфиром доступно только ему.
              </p>
            )}
          </section>
          <aside className="flex min-h-[32rem] flex-col gap-3 lg:min-h-0">
            <section className="rounded-3xl border border-line bg-card p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl tracking-wide">Зрители</h2>
                <span className="tabular-nums text-sm text-muted">{room.viewerCount}</span>
              </div>
              <ul className="mt-3 flex flex-col gap-2">
                {room.viewers.map((viewer) => (
                  <li key={viewer.id} className="flex items-center gap-2 text-sm">
                    <span className="inline-flex size-8 items-center justify-center rounded-full bg-surface font-semibold">
                      {viewer.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate">{viewer.name}</span>
                    {viewer.host ? (
                      <span className="ml-auto inline-flex items-center gap-1 text-xs text-accent">
                        <Shield className="size-3" /> Админ
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
            <ChatPanel
              messages={room.messages}
              disabled={false}
              error={chatError}
              onSend={async (body) => {
                const data = authData();
                if (!data) return;
                await mutate(() => postMessage({ data: { ...data, body, kind: "chat" } }));
              }}
              onReact={async (body) => {
                const data = authData();
                if (!data) return;
                await mutate(() => postMessage({ data: { ...data, body, kind: "reaction" } }));
              }}
            />
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function peekTitle(peek: PeekRoom | null): string {
  if (!peek?.found) return "";
  return peek.matchTitle;
}

function syncCopy(room: RoomSnapshot): string {
  if (room.syncMode === "free") return "Свободный просмотр: каждый управляет плеером сам. Чат общий.";
  if (!canSyncTimeline(room.source)) {
    return "Синхронный режим. Для прямого эфира и внешнего плеера одинаковую секунду гарантировать нельзя. Ведущий меняет источник и паузу.";
  }
  return "Синхронный просмотр: пауза и перемотка ведущего передаются остальным зрителям.";
}

function HostDock({
  room,
  auth,
  onDone,
  onError,
}: {
  room: RoomSnapshot;
  auth: { code: string; clientId: string; secret: string; adminToken?: string };
  onDone: (room: RoomSnapshot) => void;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState(room.title);
  const [matchTitle, setMatchTitle] = useState(room.matchTitle);
  const [source, setSource] = useState<SourceDraft>({ kind: "hls", url: "", live: true, gateway: "" });
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<{ ok: boolean; error?: string; room?: RoomSnapshot }>) {
    setBusy(true);
    try {
      const result = await task();
      if (!result.ok || !result.room) {
        onError(result.error ?? "Не удалось сохранить.");
        return;
      }
      onError("");
      onDone(result.room);
    } catch {
      onError("Нет связи. Изменение не подтверждено.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl tracking-wide">Управление трансляцией</h2>
        <span className="text-xs text-accent">Вы ведущий</span>
      </div>
      <p className="mt-2 text-sm text-muted">
        Вставляйте только источник, который вам разрешено показывать. Замена не создаёт новую комнату.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Button
          variant={room.syncMode === "sync" ? "primary" : "surface"}
          disabled={busy}
          onClick={() => void run(() => setRoomSyncMode({ data: { ...auth, mode: "sync" } }))}
        >
          Синхронно
        </Button>
        <Button
          variant={room.syncMode === "free" ? "primary" : "surface"}
          disabled={busy}
          onClick={() => void run(() => setRoomSyncMode({ data: { ...auth, mode: "free" } }))}
        >
          Свободно
        </Button>
      </div>
      <div className="mt-4">
        <SourceFields source={source} onChange={setSource} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={() => void run(() => setRoomSource({ data: { ...auth, source } }))}
        >
          {busy ? "Сохраняем…" : "Заменить источник"}
        </Button>
        <Button
          variant="surface"
          disabled={busy}
          onClick={() => void run(() => setRoomSource({ data: { ...auth, source: { kind: "none", url: "", live: false, gateway: "" } } }))}
        >
          Убрать источник
        </Button>
      </div>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => setRoomDetails({ data: { ...auth, title, matchTitle } }));
        }}
      >
        <Field label="Комната">
          <TextInput value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} />
        </Field>
        <Field label="Матч">
          <TextInput value={matchTitle} onChange={(event) => setMatchTitle(event.target.value)} maxLength={120} />
        </Field>
        <Button type="submit" variant="surface" className="self-end" disabled={busy}>
          Сохранить
        </Button>
      </form>
    </section>
  );
}
