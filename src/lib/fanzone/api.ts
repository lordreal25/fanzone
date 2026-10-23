import { createServerFn } from "@tanstack/react-start";
import type { BroadcastView, PeekRoom, PublicRoomCard, RoomResult } from "@/lib/fanzone/types";

async function svc() {
  return import("@/server/fanzone.server");
}

export const listPublicRooms = createServerFn({ method: "GET" }).handler(async (): Promise<PublicRoomCard[]> => {
  const { listPublic } = await svc();
  return listPublic();
});

export const peekRoom = createServerFn({ method: "POST" })
  .validator((data: { code: string }) => data)
  .handler(async ({ data }): Promise<PeekRoom> => {
    const { peek } = await svc();
    return peek(data.code);
  });

export const createRoom = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<RoomResult> => {
    const { createRoom: create } = await svc();
    return create(data);
  });

export const joinRoom = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<RoomResult> => {
    const { joinRoom: join } = await svc();
    return join(data);
  });

export const syncRoom = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<RoomResult> => {
    const { syncRoom: sync } = await svc();
    return sync(data);
  });

export const leaveRoom = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }) => {
    const { leaveRoom: leave } = await svc();
    return leave(data);
  });

export const postMessage = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<RoomResult> => {
    const { postMessage: post } = await svc();
    return post(data);
  });

export const setRoomSource = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<RoomResult> => {
    const { setSource } = await svc();
    return setSource(data);
  });

export const setRoomPlayback = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<RoomResult> => {
    const { setPlayback } = await svc();
    return setPlayback(data);
  });

export const setRoomSyncMode = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<RoomResult> => {
    const { setSyncMode } = await svc();
    return setSyncMode(data);
  });

export const setRoomDetails = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<RoomResult> => {
    const { setDetails } = await svc();
    return setDetails(data);
  });

export const getBroadcast = createServerFn({ method: "GET" }).handler(async (): Promise<BroadcastView> => {
  const { getBroadcast: read } = await svc();
  return read();
});

export const saveBroadcast = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }) => {
    const { setBroadcast } = await svc();
    return setBroadcast(data);
  });

