export type DemoMatch = {
  id: string;
  home: string;
  away: string;
  kickoff: string;
  competition: string;
};

/** Interface samples only. Not a schedule, score, or live broadcast. */
export const DEMO_MATCHES: DemoMatch[] = [
  { id: "north-south", home: "Север", away: "Юг", kickoff: "21:00", competition: "Демо-тур" },
  { id: "east-west", home: "Восток", away: "Запад", kickoff: "19:45", competition: "Демо-тур" },
  { id: "port-steppe", home: "Порт", away: "Степь", kickoff: "18:15", competition: "Демо-тур" },
  { id: "height-river", home: "Высота", away: "Река", kickoff: "16:00", competition: "Демо-тур" },
];
