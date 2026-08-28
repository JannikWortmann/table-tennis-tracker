import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

const PlayerRatingsDatastore = DefineDatastore({
  name: "player_ratings",
  primary_key: "id",
  attributes: {
    id: { type: Schema.types.string },
    rating: { type: Schema.types.number },
    wins: { type: Schema.types.number },
    losses: { type: Schema.types.number },
    draws: { type: Schema.types.number },
    games_played: { type: Schema.types.number },
  },
});

export default PlayerRatingsDatastore;
