import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { getBroadcast, saveBroadcast } from "@/lib/fanzone/api";
import type { BroadcastView } from "@/lib/fanzone/types";

const empty: BroadcastView = { title: "", source: null, updatedAt: 0, hasAdmin: false, code: "liveair1" };

export function LiveAdmin() {
  const [air, setAir] = useState<BroadcastView>(empty);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [live, setLive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        const next = await getBroadcast();
        if (!stop) setAir(next);
      } catch {
        /* keep last frame */
      }
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 4000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  async function save(clear: boolean) {
    setBusy(true);
    setNote("");
    try {
      const result = await saveBroadcast({ data: { password, title, url, live, clear } });
      if (!result.ok) {
        setNote(result.error);
        return;
      }
      setAir(result.broadcast);
      setNote(clear ? "Эфир снят. В комнате плеер опустеет." : "Готово. Зрители видят это в комнате.");
      if (!clear) setUrl("");
    } catch {
      setNote("Нет связи с сервером.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="air" className="flex flex-col gap-4 rounded-3xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-[0.18em] text-accent">ОБЩАЯ КОМНАТА</p>
          <h2 className="font-display text-3xl tracking-wide">{air.title || "Трансляция не задана"}</h2>
          <p className="mt-1 text-sm text-muted">
            Админ вставляет поток здесь. Остальные заходят в комнату и смотрят тот же плеер.
          </p>
        </div>
        <Link
          to="/room/$code"
          params={{ code: air.code }}
          className="inline-flex h-12 items-center justify-center rounded-2xl bg-accent px-4 font-semibold text-bg"
        >
          Войти в комнату
        </Link>
      </div>
      <button type="button" className="self-start text-sm text-muted hover:text-fg" onClick={() => setOpen((value) => !value)}>
        {open ? "Скрыть админку" : "Админ: добавить трансляцию"}
      </button>
      {open ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save(false);
          }}
        >
          <Field label={air.hasAdmin ? "Пароль администратора" : "Придумайте пароль администратора"}>
            <TextInput
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Field label="Название матча">
            <TextInput value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Команда — команда" />
          </Field>
          <Field label="HLS (.m3u8)">
            <TextInput
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…/index.m3u8"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={live} onChange={(event) => setLive(event.target.checked)} />
            Прямой эфир
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Сохранение…" : "Показать в комнате"}
            </Button>
            <Button type="button" variant="quiet" disabled={busy || !air.hasAdmin} onClick={() => void save(true)}>
              Снять эфир
            </Button>
          </div>
          {note ? <p className="text-sm text-muted">{note}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
