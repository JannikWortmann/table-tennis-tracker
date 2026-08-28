import { Manifest } from "deno-slack-sdk/mod.ts";
import { APP_CONFIG } from "./config.ts";
import GamesDatastore from "./datastores/games.ts";
import PlayerRatingsDatastore from "./datastores/player_ratings.ts";
import HandleMentionWorkflow from "./workflows/handle_mention_workflow.ts";
import WeeklyLeaderboardWorkflow from "./workflows/weekly_leaderboard_workflow.ts";

export default Manifest({
  name: APP_CONFIG.app.name,
  description: APP_CONFIG.app.description,
  longDescription: APP_CONFIG.app.longDescription,
  icon: "assets/default_new_app_icon.png",
  workflows: [HandleMentionWorkflow, WeeklyLeaderboardWorkflow],
  datastores: [GamesDatastore, PlayerRatingsDatastore],
  outgoingDomains: [],
  botScopes: [
    "commands",
    "chat:write",
    "chat:write.public",
    "app_mentions:read",
    "datastore:read",
    "datastore:write",
  ],
});
