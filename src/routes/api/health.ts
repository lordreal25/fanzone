import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { ready } = await import("@/server/fanzone.server");
          const ok = await ready();
          return Response.json({ ok, service: "fanzone" }, { status: ok ? 200 : 503 });
        } catch {
          return Response.json({ ok: false, service: "fanzone" }, { status: 503 });
        }
      },
    },
  },
});
