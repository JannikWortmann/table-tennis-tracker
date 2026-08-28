import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { APP_CONFIG } from "../config.ts";
import PlayerRatingsDatastore from "../datastores/player_ratings.ts";
import { DEFAULT_RATING } from "../lib/elo.ts";

interface PlayerRatingItem {
  id: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  games_played: number;
}

interface DatastoreQueryResult {
  ok: boolean;
  error?: string;
  items: PlayerRatingItem[];
  response_metadata?: {
    next_cursor?: string;
  };
}

export const PostWeeklyLeaderboardFunction = DefineFunction({
  callback_id: "post_weekly_leaderboard",
  title: "Post weekly leaderboard",
  source_file: "functions/post_weekly_leaderboard.ts",
  input_parameters: {
    properties: {
      channel_id: { type: Schema.types.string },
    },
    required: ["channel_id"],
  },
  output_parameters: {
    properties: {},
    required: [],
  },
});

export default SlackFunction(
  PostWeeklyLeaderboardFunction,
  async ({ inputs, client }) => {
    const { channel_id } = inputs;

    const items: PlayerRatingItem[] = [];
    let cursor: string | undefined = undefined;

    do {
      const result = await client.apps.datastore.query<
        typeof PlayerRatingsDatastore.definition
      >({
        datastore: PlayerRatingsDatastore.name,
        cursor,
      }) as DatastoreQueryResult;
      if (!result.ok) {
        return { error: `Failed to fetch leaderboard: ${result.error}` };
      }
      cursor = result.response_metadata?.next_cursor;
      items.push(...result.items);
    } while (cursor);

    if (items.length === 0) {
      return { outputs: {} };
    }

    items.sort((a, b) =>
      (b.rating ?? DEFAULT_RATING) - (a.rating ?? DEFAULT_RATING)
    );

    const { medals, title } = APP_CONFIG.weeklyLeaderboard;
    const lines = items.map((p, i) => {
      const rank = i < 3 ? medals[i] : `\`${i + 1}.\``;
      const rating = p.rating ?? DEFAULT_RATING;
      const w = p.wins ?? 0;
      const l = p.losses ?? 0;
      const d = p.draws ?? 0;
      return `${rank} <@${p.id}> — *${rating}* ELO (${w}W / ${l}L / ${d}D)`;
    });

    await client.chat.postMessage({
      channel: channel_id,
      text: `:trophy: *${title}*\n\n${lines.join("\n")}`,
    });

    return { outputs: {} };
  },
);
