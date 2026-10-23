import { useNavigate } from "@tanstack/react-router";
import { Lock, Radio, Users } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { LiveAdmin } from "@/components/home/live-admin";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { createRoom, listPublicRooms } from "@/lib/fanzone/api";
import { DEMO_MATCHES } from "@/lib/fanzone/demo";
import { loadSession, saveSession } from "@/lib/fanzone/session";
import type { PublicRoomCard, SourceDraft } from "@/lib/fanzone/types";
import { SAMPLE_HLS } from "@/lib/fanzone/types";
import { normalizeCode } from "@/lib/fanzone/validate";

const emptySource = (): SourceDraft => ({ kind: "none", url: "", live: true, gateway: "" });

export function HomePage({ rooms }: { rooms: PublicRoomCard[] }) {
  const navigate = useNavigate();
  const [joinValue, setJoinValue] = useState("");
  const [joinError, setJoinError] = useState("");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [matchTitle, setMatchTitle] = useState("");
  const [hostName, setHostName] = useState("");
  const [access, setAccess] = useState<"public" | "private">("public");
  const [password, setPassword] = useState("");
  const [source, setSource] = useState<SourceDraft>(emptySource);
  const [showSource, setShowSource] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function openCreate(match?: string) {
    if (match) setMatchTitle(match);
    setOpen(true);
    document.getElementById("create-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function enterRoom() {
    const code = normalizeCode(joinValue);
    if (!code) {
      setJoinError("Введите код комнаты или полную ссылку.");
      return;
    }
    setJoinError("");
    void navigate({ to: "/room/$code", params: { code } });
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const session = loadSession();
      const result = await createRoom({
        data: {
          title,
          matchTitle,
          hostName,
          access,
          password,
          source: showSource ? source : { kind: "none", url: "", live: true, gateway: "" },
          clientId: session.clientId,
        },
      });
      if (!result.ok || !result.secret || !result.adminToken) {
        setError(result.ok ? "Комната создана без ключа ведущего. Попробуйте ещё раз." : result.error);
        return;
      }
      session.name = hostName.trim();
      session.rooms[result.room.code] = { secret: result.secret, adminToken: result.adminToken };
      saveSession(session);
      void navigate({ to: "/room/$code", params: { code: result.room.code } });
    } catch {
      setError("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Logo />
          <nav className="ml-auto hidden items-center gap-5 text-sm text-muted sm:flex">
            <a href="#air" className="hover:text-fg">Эфир</a>
            <a href="#rooms" className="hover:text-fg">Комнаты</a>
            <a href="#matches" className="hover:text-fg">Матчи</a>
            <a href="#how" className="hover:text-fg">Как это работает</a>
          </nav>
          <Button className="ml-auto sm:ml-0" onClick={() => openCreate()}>
            Создать комнату
          </Button>
        </div>
        <nav className="flex gap-4 border-t border-line px-4 py-2 text-sm text-muted sm:hidden">
          <a href="#air">Эфир</a>
          <a href="#rooms">Комнаты</a>
          <a href="#matches">Матчи</a>
          <a href="#how">Как это работает</a>
          <a href="#join">Войти</a>
        </nav>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8">
        <LiveAdmin />
        <section className="grid items-end gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
          <div className="flex flex-col gap-4">
            <p className="text-sm font-semibold tracking-[0.18em] text-accent">СОВМЕСТНЫЙ ЭФИР</p>
            <h1 className="font-display text-5xl leading-none tracking-wide sm:text-6xl">
              Смотрите матч в одной комнате
            </h1>
            <p className="max-w-xl text-pretty text-muted">
              Создайте комнату, вставьте источник, который вам разрешено показывать, и отправьте ссылку.
              Друзья попадут в тот же плеер и тот же чат — без отдельной копии на каждого.
            </p>
          </div>
          <form
            id="join"
            className="rounded-3xl border border-line bg-card p-4"
            onSubmit={(event) => {
              event.preventDefault();
              enterRoom();
            }}
          >
            <Field label="Код или ссылка комнаты">
              <TextInput
                value={joinValue}
                onChange={(event) => setJoinValue(event.target.value)}
                placeholder="ab12cd34"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            {joinError ? <p className="mt-2 text-sm text-danger">{joinError}</p> : null}
            <Button type="submit" variant="surface" className="mt-3 w-full">
              Войти в комнату
            </Button>
          </form>
        </section>

        <section id="rooms" className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-3xl tracking-wide">Открытые комнаты</h2>
            <p className="text-sm text-muted">Приватные сюда не попадают</p>
          </div>
          {rooms.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line bg-card px-5 py-8 text-muted">
              Публичных комнат пока нет. Создайте первую — она появится в этом списке.
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {rooms.map((room) => (
                <li key={room.code}>
                  <a
                    href={`/room/${room.code}`}
                    className="flex h-full flex-col gap-3 rounded-3xl border border-line bg-card p-4 no-underline transition hover:border-accent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-display text-2xl tracking-wide text-fg">{room.matchTitle}</p>
                        <p className="text-sm text-muted">{room.title}</p>
                      </div>
                      {room.hasPassword ? <Lock className="size-4 text-muted" aria-label="Нужен пароль" /> : null}
                    </div>
                    <div className="mt-auto flex items-center gap-3 text-sm text-muted">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Users className="size-4" aria-hidden="true" />
                        {room.viewers}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Radio className="size-4" aria-hidden="true" />
                        {room.hasSource ? "Источник есть" : "Ждёт источник"}
                      </span>
                      <span className="ml-auto font-mono text-xs tracking-wider text-fg">{room.code}</span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="matches" className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-3xl tracking-wide">Популярные матчи</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Демонстрационные карточки интерфейса. Это не расписание, не счёт и не текущие трансляции.
              Спортивный API не подключён.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {DEMO_MATCHES.map((match) => (
              <li key={match.id} className="rounded-3xl border border-line bg-card p-4">
                <div className="flex items-center justify-between text-xs tracking-[0.16em] text-muted">
                  <span>{match.competition}</span>
                  <span className="rounded-full border border-line px-2 py-1 text-accent">ДЕМО</span>
                </div>
                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <p className="font-display text-3xl tracking-wide">{match.home}</p>
                  <p className="text-sm text-muted">VS</p>
                  <p className="text-right font-display text-3xl tracking-wide">{match.away}</p>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="font-display text-xl tabular-nums tracking-wide text-muted">{match.kickoff}</p>
                  <Button
                    variant="surface"
                    className="h-11"
                    onClick={() => openCreate(`${match.home} — ${match.away}`)}
                  >
                    Смотреть вместе
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-3xl border border-line bg-card p-4 sm:p-6" id="create-form">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-3xl tracking-wide">Новая комната</h2>
            <Button variant="surface" onClick={() => setOpen((value) => !value)}>
              {open ? "Свернуть" : "Заполнить форму"}
            </Button>
          </div>
          {open ? (
            <form
              className="mt-5 grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Название комнаты">
                  <TextInput value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required />
                </Field>
                <Field label="Название матча">
                  <TextInput
                    value={matchTitle}
                    onChange={(event) => setMatchTitle(event.target.value)}
                    maxLength={120}
                    required
                  />
                </Field>
                <Field label="Ваше имя">
                  <TextInput value={hostName} onChange={(event) => setHostName(event.target.value)} maxLength={24} required />
                </Field>
                <Field label="Пароль, если нужен" hint="Можно оставить пустым">
                  <TextInput
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    maxLength={72}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={access === "public" ? "primary" : "surface"} onClick={() => setAccess("public")}>
                  Публичная
                </Button>
                <Button variant={access === "private" ? "primary" : "surface"} onClick={() => setAccess("private")}>
                  Приватная
                </Button>
              </div>
              <button
                type="button"
                className="text-left text-sm font-semibold text-accent"
                onClick={() => setShowSource((value) => !value)}
              >
                {showSource ? "Убрать источник" : "Добавить источник сейчас"}
              </button>
              {showSource ? <SourceFields source={source} onChange={setSource} /> : null}
              {error ? (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={busy}>
                {busy ? "Создаём…" : "Создать и получить ссылку"}
              </Button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-muted">
              После создания ссылка копируется в шапке комнаты. Права ведущего сохраняются в этом браузере.
            </p>
          )}
        </section>

        <section id="how" className="grid gap-3 md:grid-cols-3">
          {[
            ["01", "Создайте комнату", "Укажите матч и, если он у вас есть, разрешённый источник: HLS, файл, встраиваемый плеер или Ace Stream."],
            ["02", "Отправьте одну ссылку", "Все, кто её откроет, войдут в ту же комнату: общий чат, общий источник, одни и те же зрители."],
            ["03", "Смотрите вместе", "В синхронном режиме ведущий ставит паузу и перематывает запись. В прямом эфире позиция у всех может отличаться."],
          ].map(([index, heading, copy]) => (
            <article key={index} className="rounded-3xl border border-line bg-card p-4">
              <p className="font-display text-2xl text-accent">{index}</p>
              <h2 className="mt-2 font-display text-2xl tracking-wide">{heading}</h2>
              <p className="mt-2 text-sm text-pretty text-muted">{copy}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

export function SourceFields({
  source,
  onChange,
}: {
  source: SourceDraft;
  onChange: (next: SourceDraft) => void;
}) {
  return (
    <div className="grid gap-4 rounded-3xl border border-line bg-surface p-4">
      <Field label="Тип источника">
        <SelectInput
          value={source.kind}
          onChange={(event) => onChange({ ...source, kind: event.target.value as SourceDraft["kind"] })}
        >
          <option value="none">Без трансляции</option>
          <option value="hls">HLS (.m3u8)</option>
          <option value="file">Видеофайл</option>
          <option value="iframe">YouTube, Twitch, Vimeo, Dailymotion</option>
          <option value="acestream">Ace Stream</option>
        </SelectInput>
      </Field>
      {source.kind !== "none" ? (
        <Field
          label={source.kind === "acestream" ? "Идентификатор Ace Stream" : "Ссылка"}
          hint="Сервер не скачивает и не проксирует поток. Его откроет браузер зрителя."
        >
          <TextInput
            value={source.url}
            onChange={(event) => onChange({ ...source, url: event.target.value })}
            placeholder={source.kind === "hls" ? "https://…/index.m3u8" : "https://"}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
      ) : null}
      {source.kind === "hls" ? (
        <label className="flex items-center gap-3 text-sm text-muted">
          <input
            type="checkbox"
            checked={source.live}
            onChange={(event) => onChange({ ...source, live: event.target.checked })}
            className="size-5 accent-accent"
          />
          Это прямой эфир, а не запись
        </label>
      ) : null}
      {source.kind === "acestream" ? (
        <Field label="Общий шлюз" hint="Необязательно. Локальный движок каждый зритель указывает у себя.">
          <TextInput
            value={source.gateway}
            onChange={(event) => onChange({ ...source, gateway: event.target.value })}
            placeholder="https://gateway.example или http://127.0.0.1:6878"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
      ) : null}
      {source.kind === "hls" ? (
        <Button
          variant="quiet"
          className="h-auto justify-start px-0 text-sm"
          onClick={() => onChange({ kind: "hls", url: SAMPLE_HLS.url, live: false, gateway: "" })}
        >
          Вставить тестовый HLS-ролик
        </Button>
      ) : null}
    </div>
  );
}

export const loadHomeRooms = listPublicRooms;
