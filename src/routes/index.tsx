import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/components/home/home-page";
import { listPublicRooms } from "@/lib/fanzone/api";

export const Route = createFileRoute("/")({
  loader: () => listPublicRooms(),
  component: IndexPage,
});

function IndexPage() {
  const rooms = Route.useLoaderData();
  return <HomePage rooms={rooms} />;
}
