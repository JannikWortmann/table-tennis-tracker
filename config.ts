export type Weekday =
  | "Sunday"
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday";

export const APP_CONFIG = {
  app: {
    name: "PingPong",
    description:
      "Track table tennis games and ELO rankings. Mention @PingPong to record games and view the leaderboard.",
    longDescription:
      "PingPong tracks table tennis games and maintains an ELO-based leaderboard.\n\n" +
      "Commands (mention @PingPong in any channel):\n" +
      "• Record a game: @PingPong @Player1 @Player2 11-2 11-9\n" +
      "• Show leaderboard: @PingPong leaderboard\n\n" +
      "Scores follow standard table tennis rules (first to 11, win by 2). " +
      "The player who wins the majority of sets wins the match. " +
      "All players start at 1000 ELO with a K-factor of 32.",
  },
  weeklyLeaderboard: {
    channelId: "REPLACE_WITH_SLACK_CHANNEL_ID",
    timezone: "Europe/Berlin",
    day: "Monday" as Weekday,
    time: "09:00:00",
    medals: [
      ":first_place_medal:",
      ":second_place_medal:",
      ":third_place_medal:",
    ],
    title: "Weekly Table Tennis Leaderboard",
  },
} as const;
