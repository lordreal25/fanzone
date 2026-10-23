import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { REACTIONS, reactionText } from "@/lib/fanzone/types";
import type { ChatMessage } from "@/lib/fanzone/types";

export function ChatPanel({
  messages,
  disabled,
  error,
  onSend,
  onReact,
}: {
  messages: ChatMessage[];
  disabled: boolean;
  error: string;
  onSend: (body: string) => Promise<void>;
  onReact: (body: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const node = scroller.current;
    if (!node || !stick.current) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  async function submit() {
    const body = text.trim();
    if (!body || pending) return;
    setPending(true);
    try {
      await onSend(body);
      setText("");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex min-h-80 flex-1 flex-col overflow-hidden rounded-3xl border border-line bg-card">
      <header className="border-b border-line px-4 py-3">
        <h2 className="font-display text-xl tracking-wide">Чат комнаты</h2>
      </header>
      <div
        ref={scroller}
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
        onScroll={(event) => {
          const node = event.currentTarget;
          stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
        }}
        aria-live="polite"
      >
        {messages.length === 0 ? <p className="text-sm text-muted">Сообщений пока нет.</p> : null}
        {messages.map((message) =>
          message.kind === "system" ? (
            <p key={message.id} className="text-center text-xs text-muted">
              {message.body}
            </p>
          ) : (
            <article key={message.id} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <p className={`text-sm font-semibold ${message.self ? "text-accent" : "text-fg"}`}>{message.name}</p>
                <time className="text-xs tabular-nums text-muted" dateTime={new Date(message.at).toISOString()}>
                  {new Date(message.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                </time>
              </div>
              <p
                className={
                  message.kind === "reaction"
                    ? "w-fit rounded-full bg-surface px-3 py-1 text-sm font-semibold text-ok"
                    : "text-sm text-pretty text-fg"
                }
              >
                {message.body}
              </p>
            </article>
          ),
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto border-t border-line px-3 py-2">
        {REACTIONS.map((reaction) => {
          const text = reactionText(reaction);
          return (
            <button
              key={text}
              type="button"
              disabled={disabled}
              className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-semibold text-fg transition hover:border-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => void onReact(text)}
            >
              <span aria-hidden="true">{reaction.emoji}</span>
              {reaction.label}
            </button>
          );
        })}
      </div>
      <form
        className="flex gap-2 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={400}
          disabled={disabled || pending}
          placeholder="Сообщение комнате"
          className="h-12 min-w-0 flex-1 rounded-2xl border border-line bg-bg px-4 text-base text-fg outline-none placeholder:text-muted focus:border-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || pending || !text.trim()}
          className="inline-flex size-12 items-center justify-center rounded-2xl bg-accent text-bg disabled:opacity-40"
          aria-label="Отправить"
        >
          <Send className="size-5" />
        </button>
      </form>
      {error ? <p className="px-4 pb-3 text-sm text-danger">{error}</p> : null}
    </section>
  );
}
