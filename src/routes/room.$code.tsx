import { createFileRoute } from "@tanstack/react-router";
import { RoomScreen } from "@/components/room/room-screen";

export const Route = createFileRoute("/room/$code")({
  component: RoomRoute,
});

function RoomRoute() {
  const { code } = Route.useParams();
  return <RoomScreen code={code} />;
}
