import { readFile, unlink, writeFile } from "node:fs/promises";
import { getSql, type Sql } from "@/lib/db";
import { canonicalSource } from "@/lib/fanzone/validate";
import {
  cleanName,
  cleanTitle,
  normalizeCode,
  parseCreate,
  parseReaction,
  parseSource,
  parseSyncMode,
  playbackPosition,
  sanitizeMessage,
  validClientId,
} from "@/lib/fanzone/validate";
import type {
  MediaSource,
  MessageKind,
  PublicRoomCard,
  PeekRoom,
  RoomResult,
  RoomSnapshot,
  SourceDraft,
  SyncMode,
  BroadcastView,
} from "@/lib/fanzone/types";
import { hashPassword, hashToken, randomCode, randomToken, tokensMatch, verifyPassword } from "@/server/secrets.server";

type RoomRow = {
  code: string;
  title: string;
  match_title: string;
  host_name: string;
  host_token_hash: string;
  access: "public" | "private";
  password_hash: string | null;
  source_json: string;
  sync_mode: SyncMode;
  playing: boolean;
  position_sec: number | string;
  playback_at: Date | string | number;
  revision: number | string;
  is_live: boolean;
};

const creates: number[] = [];

function fail(error: string): RoomResult {
  return { ok: false, error };
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function epoch(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value < 10_000_000_000 ? value * 1000 : value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function allowCreate(): boolean {
  const now = Date.now();
  while (creates.length > 0 && now - creates[0]! > 60_000) creates.shift();
  if (creates.length >= 20) return false;
  creates.push(now);
  return true;
}

function liveOf(source: MediaSource | null): boolean {
  if (!source) return false;
  if (source.kind === "hls") return source.live;
  return source.kind === "acestream";
}

async function prune(sql: Sql, code: string): Promise<void> {
  await sql`delete from room_messages where room_code = ${code} and created_at < now() - interval '48 hours'`;
  await sql`
    delete from room_messages
    where room_code = ${code}
      and id < (
        select id from room_messages
        where room_code = ${code}
        order by id desc
        offset 199
        limit 1
      )
  `;
  await sql`delete from room_members where room_code = ${code} and last_seen < now() - interval '6 hours'`;
}

async function systemMessage(sql: Sql, code: string, body: string): Promise<void> {
  await sql`
    insert into room_messages (room_code, sender_name, sender_key, body, kind)
    values (${code}, 'FANZONE', 'system', ${body}, 'system')
  `;
}

async function snapshot(sql: Sql, code: string, clientId: string, youAreHost: boolean): Promise<RoomSnapshot | null> {
  const rooms = await sql<RoomRow>`
    select code, title, match_title, host_name, host_token_hash, access, password_hash,
           source_json, sync_mode, playing, position_sec, playback_at, revision, is_live
    from rooms where code = ${code}
  `;
  const room = rooms[0];
  if (!room) return null;
  const source = (() => {
    if (!room.source_json) return null;
    try {
      return canonicalSource(JSON.parse(room.source_json));
    } catch {
      return null;
    }
  })();
  const viewers = await sql<{ client_id: string; display_name: string; is_host: boolean }>`
    select client_id, display_name, is_host
    from room_members
    where room_code = ${code} and last_seen > now() - interval '25 seconds'
    order by is_host desc, display_name asc
  `;
  const messages = await sql<{
    id: number | string;
    sender_name: string;
    sender_key: string;
    body: string;
    kind: MessageKind;
    created_at: Date | string;
  }>`
    select id, sender_name, sender_key, body, kind, created_at
    from (
      select id, sender_name, sender_key, body, kind, created_at
      from room_messages
      where room_code = ${code}
      order by id desc
      limit 80
    ) recent
    order by id asc
  `;
  return {
    code: room.code,
    title: room.title,
    matchTitle: room.match_title,
    hostName: room.host_name,
    access: room.access,
    hasPassword: Boolean(room.password_hash),
    source,
    syncMode: room.sync_mode === "free" ? "free" : "sync",
    playback: {
      playing: Boolean(room.playing),
      positionSec: asNumber(room.position_sec),
      updatedAt: epoch(room.playback_at),
      revision: asNumber(room.revision),
      live: liveOf(source),
    },
    youAreHost,
    viewers: viewers.map((viewer) => ({
      id: viewer.client_id,
      name: viewer.display_name,
      host: Boolean(viewer.is_host),
    })),
    viewerCount: viewers.length,
    messages: messages.map((message) => ({
      id: asNumber(message.id),
      name: message.sender_name,
      body: message.body,
      kind: message.kind,
      at: epoch(message.created_at),
      self: message.sender_key === clientId,
    })),
  };
}

async function requireMember(sql: Sql, code: string, clientId: string, secret: string): Promise<boolean> {
  if (!normalizeCode(code) || !validClientId(clientId) || secret.length < 20 || secret.length > 80) return false;
  const rows = await sql<{ client_id: string }>`
    update room_members
    set last_seen = now()
    where room_code = ${code} and client_id = ${clientId} and secret_hash = ${hashToken(secret)}
    returning client_id
  `;
  return Boolean(rows[0]);
}

async function requireHost(sql: Sql, code: string, clientId: string, adminToken: string | undefined): Promise<boolean> {
  if (!adminToken || adminToken.length < 20) return false;
  const rows = await sql<{ host_token_hash: string }>`select host_token_hash from rooms where code = ${code}`;
  const row = rows[0];
  if (!row || !tokensMatch(adminToken, row.host_token_hash)) return false;
  await sql`
    update room_members set is_host = true
    where room_code = ${code} and client_id = ${clientId}
  `;
  return true;
}

async function roomOrFail(sql: Sql, code: string, clientId: string, youAreHost: boolean): Promise<RoomResult> {
  const room = await snapshot(sql, code, clientId, youAreHost);
  if (!room) return fail("Комната не найдена.");
  return { ok: true, room };
}

export async function listPublic(): Promise<PublicRoomCard[]> {
  const sql = await getSql();
  const rows = await sql<{
    code: string;
    title: string;
    match_title: string;
    host_name: string;
    sync_mode: SyncMode;
    has_password: boolean;
    has_source: boolean;
    viewers: number | string;
  }>`
    select r.code, r.title, r.match_title, r.host_name, r.sync_mode,
           (r.password_hash is not null) as has_password,
           (r.source_json <> '') as has_source,
           (
             select count(*) from room_members m
             where m.room_code = r.code and m.last_seen > now() - interval '25 seconds'
           ) as viewers
    from rooms r
    where r.access = 'public'
    order by r.created_at desc
    limit 12
  `;
  return rows.map((row) => ({
    code: row.code,
    title: row.title,
    matchTitle: row.match_title,
    hostName: row.host_name,
    viewers: asNumber(row.viewers),
    hasSource: Boolean(row.has_source),
    hasPassword: Boolean(row.has_password),
    syncMode: row.sync_mode === "free" ? "free" : "sync",
  }));
}

export async function peek(rawCode: string): Promise<PeekRoom> {
  const code = normalizeCode(rawCode);
  if (!code) return { found: false };
  const sql = await getSql();
  const rows = await sql<{
    access: "public" | "private";
    password_hash: string | null;
    title: string;
    match_title: string;
  }>`select access, password_hash, title, match_title from rooms where code = ${code}`;
  const row = rows[0];
  if (!row) return { found: false };
  return {
    found: true,
    access: row.access,
    needsPassword: Boolean(row.password_hash),
    title: row.title,
    matchTitle: row.match_title,
  };
}

export async function createRoom(input: unknown): Promise<RoomResult> {
  const parsed = parseCreate(input);
  if (!parsed.ok) return parsed;
  if (!allowCreate()) return fail("Слишком много новых комнат. Подождите минуту.");
  const sql = await getSql();
  const { title, matchTitle, hostName, access, password, source } = parsed.value;
  const adminToken = randomToken();
  const secret = randomToken();
  const clientId = typeof (input as { clientId?: unknown }).clientId === "string"
    ? (input as { clientId: string }).clientId
    : "";
  if (!validClientId(clientId)) return fail("Не удалось определить браузер. Обновите страницу.");
  let code = "";
  let inserted = false;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    code = randomCode();
    try {
      await sql`
        insert into rooms (
          code, title, match_title, host_name, host_token_hash, access, password_hash,
          source_json, sync_mode, is_live
        ) values (
          ${code}, ${title}, ${matchTitle}, ${hostName}, ${hashToken(adminToken)}, ${access},
          ${password ? hashPassword(password) : null},
          ${source ? JSON.stringify(source) : ""},
          'sync',
          ${liveOf(source)}
        )
      `;
      inserted = true;
      break;
    } catch (error) {
      const text = String(error).toLowerCase();
      if (text.includes("duplicate") || text.includes("unique")) continue;
      console.error("[fanzone] create failed", error);
      return fail("Не удалось создать комнату.");
    }
  }
  if (!inserted) return fail("Не удалось создать комнату.");
  try {
    await sql`
      insert into room_members (room_code, client_id, secret_hash, display_name, is_host)
      values (${code}, ${clientId}, ${hashToken(secret)}, ${hostName}, true)
    `;
    await systemMessage(sql, code, `${hostName} создал комнату`);
    const loaded = await snapshot(sql, code, clientId, true);
    if (!loaded) return fail("Не удалось создать комнату.");
    return { ok: true, room: loaded, secret, adminToken };
  } catch (error) {
    console.error("[fanzone] create member failed", error);
    return fail("Не удалось создать комнату.");
  }
}

type AuthInput = { code?: unknown; clientId?: unknown; secret?: unknown; adminToken?: unknown };

function authOf(input: AuthInput): { code: string; clientId: string; secret: string; adminToken?: string } | null {
  const code = normalizeCode(String(input.code ?? ""));
  const clientId = String(input.clientId ?? "");
  const secret = String(input.secret ?? "");
  if (!code || !validClientId(clientId)) return null;
  const adminToken = typeof input.adminToken === "string" ? input.adminToken : undefined;
  return { code, clientId, secret, adminToken };
}

export async function joinRoom(input: unknown): Promise<RoomResult> {
  if (!input || typeof input !== "object") return fail("Некорректные данные.");
  const row = input as AuthInput & { name?: unknown; password?: unknown };
  const code = normalizeCode(String(row.code ?? ""));
  const clientId = String(row.clientId ?? "");
  const name = cleanName(String(row.name ?? ""));
  if (!code || !validClientId(clientId)) return fail("Некорректные данные входа.");
  if (!name) return fail("Имя: 2–24 символа, без спецсимволов.");
  const sql = await getSql();
  const rooms = await sql<{ password_hash: string | null; host_token_hash: string }>`
    select password_hash, host_token_hash from rooms where code = ${code}
  `;
  const room = rooms[0];
  if (!room) return fail("Комната не найдена.");
  const password = String(row.password ?? "");
  if (room.password_hash && !verifyPassword(password, room.password_hash)) {
    return fail("Неверный пароль.");
  }
  const adminToken = typeof row.adminToken === "string" ? row.adminToken : undefined;
  const isHost = Boolean(adminToken && tokensMatch(adminToken, room.host_token_hash));
  const secret = randomToken();
  const existing = await sql<{ last_seen: Date | string }>`
    select last_seen from room_members where room_code = ${code} and client_id = ${clientId}
  `;
  const stale = !existing[0] || epoch(existing[0].last_seen) < Date.now() - 120_000;
  if (!existing[0]) {
    await sql`
      insert into room_members (room_code, client_id, secret_hash, display_name, is_host)
      values (${code}, ${clientId}, ${hashToken(secret)}, ${name}, ${isHost})
    `;
  } else {
    await sql`
      update room_members
      set secret_hash = ${hashToken(secret)}, display_name = ${name}, last_seen = now(), is_host = ${isHost}
      where room_code = ${code} and client_id = ${clientId}
    `;
  }
  if (stale) await systemMessage(sql, code, existing[0] ? `${name} снова в комнате` : `${name} вошёл`);
  await prune(sql, code);
  const loaded = await snapshot(sql, code, clientId, isHost);
  if (!loaded) return fail("Комната не найдена.");
  return { ok: true, room: loaded, secret, ...(isHost && adminToken ? { adminToken } : {}) };
}

export async function syncRoom(input: unknown): Promise<RoomResult> {
  if (!input || typeof input !== "object") return fail("Некорректные данные.");
  const auth = authOf(input);
  if (!auth) return fail("Некорректные данные.");
  const sql = await getSql();
  const member = await requireMember(sql, auth.code, auth.clientId, auth.secret);
  if (!member) return fail("Сессия комнаты устарела. Войдите ещё раз.");
  const youAreHost = await requireHost(sql, auth.code, auth.clientId, auth.adminToken);
  return roomOrFail(sql, auth.code, auth.clientId, youAreHost);
}

export async function leaveRoom(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input || typeof input !== "object") return fail("Некорректные данные.");
  const auth = authOf(input);
  if (!auth) return fail("Некорректные данные.");
  const sql = await getSql();
  const rows = await sql<{ display_name: string }>`
    delete from room_members
    where room_code = ${auth.code} and client_id = ${auth.clientId} and secret_hash = ${hashToken(auth.secret)}
    returning display_name
  `;
  const name = rows[0]?.display_name;
  if (name) await systemMessage(sql, auth.code, `${name} вышел`);
  return { ok: true };
}

async function withHost(
  input: unknown,
  run: (sql: Sql, auth: { code: string; clientId: string }) => Promise<RoomResult>,
): Promise<RoomResult> {
  if (!input || typeof input !== "object") return fail("Некорректные данные.");
  const auth = authOf(input);
  if (!auth) return fail("Некорректные данные.");
  const sql = await getSql();
  const member = await requireMember(sql, auth.code, auth.clientId, auth.secret);
  if (!member) return fail("Сессия комнаты устарела. Войдите ещё раз.");
  const host = await requireHost(sql, auth.code, auth.clientId, auth.adminToken);
  if (!host) return fail("Недостаточно прав. Управлять комнатой может только ведущий.");
  return run(sql, auth);
}

export async function setSource(input: unknown): Promise<RoomResult> {
  return withHost(input, async (sql, auth) => {
    const draft = (input as { source?: SourceDraft }).source;
    if (!draft || draft.kind === "none") {
      await sql`
        update rooms
        set source_json = '', is_live = false, playing = false, position_sec = 0,
            playback_at = now(), revision = revision + 1
        where code = ${auth.code}
      `;
    } else {
      const parsed = parseSource({
        kind: draft.kind,
        url: String(draft.url ?? ""),
        live: draft.live === true,
        gateway: String(draft.gateway ?? ""),
      });
      if (!parsed.ok) return parsed;
      await sql`
        update rooms
        set source_json = ${parsed.source ? JSON.stringify(parsed.source) : ""},
            is_live = ${liveOf(parsed.source)},
            playing = false,
            position_sec = 0,
            playback_at = now(),
            revision = revision + 1
        where code = ${auth.code}
      `;
    }
    await systemMessage(sql, auth.code, "Ведущий обновил источник трансляции");
    return roomOrFail(sql, auth.code, auth.clientId, true);
  });
}

export async function setPlayback(input: unknown): Promise<RoomResult> {
  return withHost(input, async (sql, auth) => {
    const row = input as { playing?: unknown; positionSec?: unknown };
    const position = playbackPosition(row.positionSec);
    if (position === null || typeof row.playing !== "boolean") return fail("Некорректное состояние плеера.");
    await sql`
      update rooms
      set playing = ${row.playing}, position_sec = ${position}, playback_at = now(), revision = revision + 1
      where code = ${auth.code}
    `;
    return roomOrFail(sql, auth.code, auth.clientId, true);
  });
}

export async function setSyncMode(input: unknown): Promise<RoomResult> {
  return withHost(input, async (sql, auth) => {
    const mode = parseSyncMode((input as { mode?: unknown }).mode);
    if (!mode) return fail("Неизвестный режим просмотра.");
    await sql`
      update rooms set sync_mode = ${mode}, revision = revision + 1 where code = ${auth.code}
    `;
    await systemMessage(
      sql,
      auth.code,
      mode === "sync" ? "Включён синхронный просмотр" : "Включён свободный просмотр",
    );
    return roomOrFail(sql, auth.code, auth.clientId, true);
  });
}

export async function setDetails(input: unknown): Promise<RoomResult> {
  return withHost(input, async (sql, auth) => {
    const row = input as { title?: unknown; matchTitle?: unknown };
    const title = cleanTitle(String(row.title ?? ""), 80);
    const matchTitle = cleanTitle(String(row.matchTitle ?? ""), 120);
    if (!title || !matchTitle) return fail("Проверьте название комнаты и матча.");
    await sql`update rooms set title = ${title}, match_title = ${matchTitle} where code = ${auth.code}`;
    return roomOrFail(sql, auth.code, auth.clientId, true);
  });
}

export async function postMessage(input: unknown): Promise<RoomResult> {
  if (!input || typeof input !== "object") return fail("Некорректные данные.");
  const auth = authOf(input);
  if (!auth) return fail("Некорректные данные.");
  const sql = await getSql();
  const memberRows = await sql<{ display_name: string }>`
    update room_members
    set last_seen = now()
    where room_code = ${auth.code} and client_id = ${auth.clientId} and secret_hash = ${hashToken(auth.secret)}
    returning display_name
  `;
  const member = memberRows[0];
  if (!member) return fail("Сессия комнаты устарела. Войдите ещё раз.");
  const requested = (input as { kind?: unknown; body?: unknown }).kind === "reaction" ? "reaction" : "chat";
  const body =
    requested === "reaction"
      ? parseReaction(String((input as { body?: unknown }).body ?? ""))
      : sanitizeMessage(String((input as { body?: unknown }).body ?? ""));
  if (!body) return fail(requested === "reaction" ? "Неизвестная реакция." : "Пустое или слишком длинное сообщение.");
  const recent = await sql<{ n: number | string }>`
    select count(*) as n from room_messages
    where room_code = ${auth.code}
      and sender_key = ${auth.clientId}
      and kind = ${requested}
      and created_at > now() - interval '10 seconds'
  `;
  const limit = requested === "reaction" ? 3 : 4;
  if (asNumber(recent[0]?.n) >= limit) return fail("Слишком часто. Подождите пару секунд.");
  if (requested === "chat") {
    const last = await sql<{ body: string; created_at: Date | string }>`
      select body, created_at from room_messages
      where room_code = ${auth.code} and sender_key = ${auth.clientId} and kind = 'chat'
      order by id desc
      limit 1
    `;
    if (last[0] && last[0].body === body && Date.now() - epoch(last[0].created_at) < 3000) {
      return fail("Такое сообщение уже отправлено.");
    }
  }
  await sql`
    insert into room_messages (room_code, sender_name, sender_key, body, kind)
    values (${auth.code}, ${member.display_name}, ${auth.clientId}, ${body}, ${requested})
  `;
  await prune(sql, auth.code);
  const youAreHost = await requireHost(sql, auth.code, auth.clientId, auth.adminToken);
  return roomOrFail(sql, auth.code, auth.clientId, youAreHost);
}

export async function ready(): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ ok: number }>`select 1 as ok`;
  return rows[0]?.ok === 1;
}

const AIR_CODE = "liveair1";
const STREAM_FILE = "/tmp/fanzone-stream.txt";

const adminTries: number[] = [];

function emptyAir(): BroadcastView {
  return { title: "", source: null, updatedAt: 0, hasAdmin: false, code: AIR_CODE };
}

function allowAdmin(): boolean {
  const now = Date.now();
  while (adminTries.length > 0 && now - adminTries[0]! > 60_000) adminTries.shift();
  if (adminTries.length >= 12) return false;
  adminTries.push(now);
  return true;
}

export async function getBroadcast(): Promise<BroadcastView> {
  const sql = await getSql();
  const rows = await sql<{ password_hash: string | null }>`
    select password_hash from broadcast where id = 1
  `;
  let source: MediaSource | null = null;
  let title = "";
  let updatedAt = 0;
  try {
    const raw = await readFile(STREAM_FILE, "utf8");
    const saved = JSON.parse(raw) as { title?: unknown; url?: unknown; live?: unknown; at?: unknown };
    const parsed = parseSource({
      kind: "hls",
      url: typeof saved.url === "string" ? saved.url : "",
      live: saved.live !== false,
      gateway: "",
    });
    if (parsed.ok && parsed.source) {
      source = parsed.source;
      title = typeof saved.title === "string" ? saved.title : "";
      updatedAt = typeof saved.at === "number" ? saved.at : 0;
    }
  } catch {
    source = null;
  }
  return {
    title,
    source,
    updatedAt,
    hasAdmin: Boolean(rows[0]?.password_hash),
    code: AIR_CODE,
  };
}

export async function setBroadcast(input: unknown): Promise<{ ok: true; broadcast: BroadcastView } | { ok: false; error: string }> {
  if (!allowAdmin()) return { ok: false, error: "Слишком много попыток. Подождите минуту." };
  if (!input || typeof input !== "object") return { ok: false, error: "Некорректный запрос." };
  const body = input as { password?: unknown; title?: unknown; url?: unknown; live?: unknown; clear?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 6 || password.length > 64) {
    return { ok: false, error: "Пароль администратора: от 6 до 64 символов." };
  }
  const sql = await getSql();
  const rows = await sql<{ password_hash: string | null }>`select password_hash from broadcast where id = 1`;
  const stored = rows[0]?.password_hash ?? null;
  if (stored) {
    if (!verifyPassword(password, stored)) return { ok: false, error: "Неверный пароль администратора." };
  }
  const clear = body.clear === true;
  let title = "";
  let sourceJson = "";
  if (!clear) {
    const parsedTitle = cleanTitle(typeof body.title === "string" ? body.title : "Эфир", 80);
    if (!parsedTitle) return { ok: false, error: "Укажите название трансляции." };
    const parsed = parseSource({
      kind: "hls",
      url: typeof body.url === "string" ? body.url : "",
      live: body.live !== false,
      gateway: "",
    });
    if (!parsed.ok || !parsed.source) return { ok: false, error: parsed.ok ? "Укажите ссылку .m3u8." : parsed.error };
    title = parsedTitle;
    sourceJson = JSON.stringify(parsed.source);
  }
  const hash = stored ?? hashPassword(password);
  await sql`
    update broadcast
    set password_hash = ${hash},
        title = '',
        source_json = '',
        updated_at = now()
    where id = 1
  `;
  if (clear || !sourceJson) {
    await unlink(STREAM_FILE).catch(() => undefined);
  } else {
    await writeFile(
      STREAM_FILE,
      JSON.stringify({ title, url: JSON.parse(sourceJson).url, live: body.live !== false, at: Date.now() }),
      "utf8",
    );
  }
  const matchTitle = title || "Общий эфир";
  const hostHash = hashToken(hash);
  await sql`
    insert into rooms (
      code, title, match_title, host_name, host_token_hash, access, password_hash,
      source_json, sync_mode, is_live, playing, revision
    ) values (
      ${AIR_CODE}, ${"Общий эфир"}, ${matchTitle}, ${"Админ"}, ${hostHash}, ${"public"},
      null, ${sourceJson}, ${"free"}, ${sourceJson.length > 0}, false, 1
    )
    on conflict (code) do update set
      match_title = excluded.match_title,
      source_json = excluded.source_json,
      is_live = excluded.is_live,
      playing = false,
      position_sec = 0,
      playback_at = now(),
      revision = rooms.revision + 1
  `;
  if (title) await systemMessage(sql, AIR_CODE, "Админ обновил трансляцию");
  else await systemMessage(sql, AIR_CODE, "Админ снял трансляцию");
  return { ok: true, broadcast: await getBroadcast() };
}

