import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

const GamesDatastore = DefineDatastore({
  name: "games",
  primary_key: "id",
  attributes: {
    id: { type: Schema.types.string },
    player1: { type: Schema.types.string },
    player2: { type: Schema.types.string },
    sets: { type: Schema.types.string },
    winner: { type: Schema.types.string },
    player1_elo_before: { type: Schema.types.number },
    player2_elo_before: { type: Schema.types.number },
    player1_elo_after: { type: Schema.types.number },
    player2_elo_after: { type: Schema.types.number },
    recorded_by: { type: Schema.types.string },
    channel: { type: Schema.types.string },
    created_at: { type: Schema.types.string },
  },
});

export default GamesDatastore;
