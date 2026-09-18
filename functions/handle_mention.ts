import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { APP_CONFIG } from "../config.ts";
import GamesDatastore from "../datastores/games.ts";
import PlayerRatingsDatastore from "../datastores/player_ratings.ts";
import { DEFAULT_RATING } from "../lib/elo.ts";
import { classifyGameSubmission } from "../lib/game_submission.ts";
import {
  buildRatingProjection,
  determineMatchWinner,
  type GameRatingSnapshot,
  type GameRecord,
  type SetScore,
} from "../lib/rating_projection.ts";

interface PlayerRatingItem {
  id: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  games_played: number;
  nemeses?: string;
  nemesis_losses?: number;
}

interface PlayerRatingsQueryResult {
  ok: boolean;
  error?: string;
  items: PlayerRatingItem[];
  response_metadata?: {
    next_cursor?: string;
  };
}

interface GamesQueryResult {
  ok: boolean;
  error?: string;
  items: GameDatastoreItem[];
  response_metadata?: {
    next_cursor?: string;
  };
}

type GameDatastoreItem = GameRecord;

type FunctionResult = { outputs: Record<string, never> } | { error: string };

export const HandleMentionFunction = DefineFunction({
  callback_id: "handle_mention",
  title: "Handle bot mention",
  source_file: "functions/handle_mention.ts",
  input_parameters: {
    properties: {
      channel_id: { type: Schema.types.string },
      user_id: { type: Schema.types.string },
      message_text: { type: Schema.types.string },
      message_ts: { type: Schema.types.string },
    },
    required: ["channel_id", "user_id", "message_text", "message_ts"],
  },
  output_parameters: {
    properties: {},
    required: [],
  },
});

function parseMessage(text: string): {
  type: "game" | "leaderboard" | "unknown";
  player1?: string;
  player2?: string;
  sets?: SetScore[];
} {
  // Strip all bot mentions (the app's own mention that triggered this)
  const stripped = text.replace(/<@[A-Z0-9]+>/g, "").trim();

  if (/^leaderboard$/i.test(stripped)) {
    return { type: "leaderboard" };
  }

  // Game format: <@U123> <@U456> 11-2 11-9 ...
  const userMentions = [...text.matchAll(/<@([A-Z0-9]+)>/g)].map((m) => m[1]);
  const scoreMatches = [...text.matchAll(/(\d+)-(\d+)/g)];

  // Need exactly 2 distinct user mentions beyond the bot (first mention is bot)
  // The bot mention is included, so we expect 3 total, or the text may not include the bot
  // Filter: take all unique user IDs from mentions, we need at least 2 players
  if (userMentions.length >= 3 && scoreMatches.length >= 1) {
    // First mention is the bot, remaining are players
    const players = userMentions.slice(1);
    if (players.length === 2 && players[0] !== players[1]) {
      const sets: SetScore[] = scoreMatches.map((m) => ({
        p1: parseInt(m[1]),
        p2: parseInt(m[2]),
      }));
      return { type: "game", player1: players[0], player2: players[1], sets };
    }
  }

  return { type: "unknown" };
}

function isValidSet(s: SetScore): boolean {
  const winner = Math.max(s.p1, s.p2);
  const loser = Math.min(s.p1, s.p2);
  if (winner < 11) return false;
  // Standard rules: must win by 2, and if past 10-10 (deuce), winner is exactly loser+2
  if (loser < 10) return winner === 11;
  return winner - loser === 2;
}

export default SlackFunction(
  HandleMentionFunction,
  async ({ inputs, client }) => {
    const { channel_id, message_text } = inputs;
    const parsed = parseMessage(message_text);

    try {
      if (parsed.type === "leaderboard") {
        return await handleLeaderboard(client, channel_id);
      } else if (parsed.type === "game") {
        return await handleGame(
          client,
          channel_id,
          inputs.user_id,
          inputs.message_ts,
          parsed.player1!,
          parsed.player2!,
          parsed.sets!,
        );
      } else {
        await client.chat.postMessage({
          channel: channel_id,
          text:
            `:table_tennis_paddle_and_ball: *${APP_CONFIG.app.name} Tracker — Usage*\n` +
            `• Record a game: \`@${APP_CONFIG.app.name} @Player1 @Player2 11-2 11-9\`\n` +
            `• Show leaderboard: \`@${APP_CONFIG.app.name} leaderboard\``,
        });
        return { outputs: {} };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: `Something went wrong: ${msg}` };
    }
  },
);

async function handleLeaderboard(
  // deno-lint-ignore no-explicit-any
  client: any,
  channelId: string,
): Promise<FunctionResult> {
  const items: PlayerRatingItem[] = [];
  let cursor: string | undefined = undefined;

  do {
    const result = await client.apps.datastore.query({
      datastore: PlayerRatingsDatastore.name,
      cursor,
    }) as PlayerRatingsQueryResult;
    if (!result.ok) {
      await client.chat.postMessage({
        channel: channelId,
        text: `:x: Failed to fetch leaderboard: ${result.error}`,
      });
      return { outputs: {} };
    }
    cursor = result.response_metadata?.next_cursor;
    items.push(...result.items);
  } while (cursor);

  if (items.length === 0) {
    await client.chat.postMessage({
      channel: channelId,
      text:
        `:table_tennis_paddle_and_ball: No games recorded yet! Record one with \`@PingPong @Player1 @Player2 11-2 11-9\``,
    });
    return { outputs: {} };
  }

  items.sort((a, b) =>
    (b.rating ?? DEFAULT_RATING) - (a.rating ?? DEFAULT_RATING)
  );

  const { medals } = APP_CONFIG.weeklyLeaderboard;
  const lines = items.map((p, i) => {
    const rank = i < 3 ? medals[i] : `\`${i + 1}.\``;
    const rating = p.rating ?? DEFAULT_RATING;
    const w = p.wins ?? 0;
    const l = p.losses ?? 0;
    const d = p.draws ?? 0;
    const nemeses = parseNemeses(p.nemeses);
    const nemesis = nemeses.length > 0
      ? `${nemeses.map((id) => `<@${id}>`).join(", ")} (${
        p.nemesis_losses ?? 0
      }L)`
      : "none yet";
    return `${rank} <@${p.id}> — *${rating}* ELO (${w}W / ${l}L / ${d}D) — Nemesis: ${nemesis}`;
  });

  await client.chat.postMessage({
    channel: channelId,
    text: `:trophy: *Table Tennis Leaderboard*\n\n${lines.join("\n")}`,
  });

  return { outputs: {} };
}

async function handleGame(
  // deno-lint-ignore no-explicit-any
  client: any,
  channelId: string,
  recordedBy: string,
  messageTs: string,
  player1: string,
  player2: string,
  sets: SetScore[],
): Promise<FunctionResult> {
  if (player1 === player2) {
    await client.chat.postMessage({
      channel: channelId,
      text: `:x: Players must be two different people!`,
    });
    return { outputs: {} };
  }

  for (const s of sets) {
    if (!isValidSet(s)) {
      await client.chat.postMessage({
        channel: channelId,
        text:
          `:x: Invalid set score \`${s.p1}-${s.p2}\`. A set must be won with 11+ points and a 2-point lead.`,
      });
      return { outputs: {} };
    }
  }

  const allGames = await queryAllGames(client);
  const submission = classifyGameSubmission(
    allGames,
    channelId,
    messageTs,
    player1,
    player2,
    sets,
  );

  if (submission.kind === "edit") {
    await client.chat.postMessage({
      channel: channelId,
      text:
        ":x: This score was already recorded and old scores cannot be modified. Post a new message to record a separate game.",
    });
    return { outputs: {} };
  }

  if (submission.kind === "redelivery") {
    const rebuilt = await rebuildRatings(client, allGames, submission.game.id);
    if ("error" in rebuilt) return rebuilt;
    return { outputs: {} };
  }

  const now = new Date().toISOString();
  const gameId = crypto.randomUUID();
  const { winner } = determineMatchWinner(player1, player2, sets);
  const gameItem: GameRecord = {
    id: gameId,
    player1,
    player2,
    sets: JSON.stringify(sets),
    winner,
    recorded_by: recordedBy,
    channel: channelId,
    message_ts: messageTs,
    created_at: now,
  };

  const putGame = await client.apps.datastore.put({
    datastore: GamesDatastore.name,
    item: gameItem,
  });

  if (!putGame.ok) {
    return { error: `Failed to save game: ${putGame.error}` };
  }

  const gamesForRebuild = allGames.concat(gameItem);
  const rebuilt = await rebuildRatings(client, gamesForRebuild, gameId);
  if ("error" in rebuilt) return rebuilt;

  const rebuiltGame = rebuilt.game;

  const setsDisplay = sets.map((s) => `\`${s.p1}-${s.p2}\``).join("  ");
  const p1Delta = rebuiltGame.player1_elo_after -
    rebuiltGame.player1_elo_before;
  const p2Delta = rebuiltGame.player2_elo_after -
    rebuiltGame.player2_elo_before;
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const resultLine = winner
    ? `:trophy: Winner: <@${winner}>`
    : `:handshake: Draw!`;
  await client.chat.postMessage({
    channel: channelId,
    text: `:table_tennis_paddle_and_ball: *Game Recorded!*\n\n` +
      `<@${player1}> vs <@${player2}>: ${setsDisplay}\n` +
      `${resultLine}\n\n` +
      `*ELO Updates:*\n` +
      `• <@${player1}>: ${rebuiltGame.player1_elo_before} → ${rebuiltGame.player1_elo_after} (${
        sign(p1Delta)
      })\n` +
      `• <@${player2}>: ${rebuiltGame.player2_elo_before} → ${rebuiltGame.player2_elo_after} (${
        sign(p2Delta)
      })`,
  });

  return { outputs: {} };
}

async function queryAllGames(
  // deno-lint-ignore no-explicit-any
  client: any,
): Promise<GameDatastoreItem[]> {
  const items: GameDatastoreItem[] = [];
  let cursor: string | undefined = undefined;

  do {
    const result = await client.apps.datastore.query({
      datastore: GamesDatastore.name,
      cursor,
    }) as GamesQueryResult;
    if (!result.ok) {
      throw new Error(`Failed to fetch games: ${result.error}`);
    }
    cursor = result.response_metadata?.next_cursor;
    items.push(...result.items);
  } while (cursor);

  return items;
}

async function queryAllPlayerRatings(
  // deno-lint-ignore no-explicit-any
  client: any,
): Promise<PlayerRatingItem[]> {
  const items: PlayerRatingItem[] = [];
  let cursor: string | undefined = undefined;

  do {
    const result = await client.apps.datastore.query({
      datastore: PlayerRatingsDatastore.name,
      cursor,
    }) as PlayerRatingsQueryResult;
    if (!result.ok) {
      throw new Error(`Failed to fetch player ratings: ${result.error}`);
    }
    cursor = result.response_metadata?.next_cursor;
    items.push(...result.items);
  } while (cursor);

  return items;
}

async function rebuildRatings(
  // deno-lint-ignore no-explicit-any
  client: any,
  games: GameRecord[],
  gameId: string,
): Promise<{ game: GameRatingSnapshot } | { error: string }> {
  const projection = buildRatingProjection(games);
  const existingRatings = await queryAllPlayerRatings(client);
  const projectedRatings = new Map(
    projection.ratings.map((rating) => [rating.id, rating]),
  );

  for (const existingRating of existingRatings) {
    if (!projectedRatings.has(existingRating.id)) {
      const deleteRating = await client.apps.datastore.delete({
        datastore: PlayerRatingsDatastore.name,
        id: existingRating.id,
      });
      if (!deleteRating.ok) {
        return {
          error:
            `Failed to remove stale rating for ${existingRating.id}: ${deleteRating.error}`,
        };
      }
    }
  }

  for (const rating of projectedRatings.values()) {
    const putRating = await client.apps.datastore.put({
      datastore: PlayerRatingsDatastore.name,
      item: {
        ...rating,
        nemeses: JSON.stringify(rating.nemeses),
      },
    });
    if (!putRating.ok) {
      return {
        error: `Failed to rebuild rating for ${rating.id}: ${putRating.error}`,
      };
    }
  }

  const updatedGame = projection.games.find((game) => game.id === gameId);

  if (!updatedGame) {
    return { error: "Failed to rebuild the saved game" };
  }

  return { game: updatedGame };
}

function parseNemeses(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}
