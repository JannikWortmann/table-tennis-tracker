import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { APP_CONFIG } from "../config.ts";
import GamesDatastore from "../datastores/games.ts";
import PlayerRatingsDatastore from "../datastores/player_ratings.ts";
import { DEFAULT_RATING, updateRatings } from "../lib/elo.ts";

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
    },
    required: ["channel_id", "user_id", "message_text"],
  },
  output_parameters: {
    properties: {},
    required: [],
  },
});

interface SetScore {
  p1: number;
  p2: number;
}

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

function determineMatchWinner(
  player1: string,
  player2: string,
  sets: SetScore[],
): { outcome: "player1" | "player2" | "draw"; winner: string | null } {
  let p1Wins = 0;
  let p2Wins = 0;
  for (const s of sets) {
    if (s.p1 > s.p2) p1Wins++;
    else p2Wins++;
  }
  if (p1Wins === p2Wins) return { outcome: "draw", winner: null };
  return p1Wins > p2Wins
    ? { outcome: "player1", winner: player1 }
    : { outcome: "player2", winner: player2 };
}

async function getPlayerRating(
  // deno-lint-ignore no-explicit-any
  client: any,
  userId: string,
): Promise<{
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  games: number;
}> {
  const result = await client.apps.datastore.get({
    datastore: PlayerRatingsDatastore.name,
    id: userId,
  });
  if (result.ok && result.item?.id) {
    return {
      rating: result.item.rating ?? DEFAULT_RATING,
      wins: result.item.wins ?? 0,
      losses: result.item.losses ?? 0,
      draws: result.item.draws ?? 0,
      games: result.item.games_played ?? 0,
    };
  }
  return { rating: DEFAULT_RATING, wins: 0, losses: 0, draws: 0, games: 0 };
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
    }) as DatastoreQueryResult;
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
    return `${rank} <@${p.id}> — *${rating}* ELO (${w}W / ${l}L / ${d}D)`;
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

  const { outcome, winner } = determineMatchWinner(player1, player2, sets);

  const p1Stats = await getPlayerRating(client, player1);
  const p2Stats = await getPlayerRating(client, player2);

  const { newRating1, newRating2 } = updateRatings(
    p1Stats.rating,
    p2Stats.rating,
    outcome,
  );

  const gameId = crypto.randomUUID();
  const now = new Date().toISOString();

  const putGame = await client.apps.datastore.put({
    datastore: GamesDatastore.name,
    item: {
      id: gameId,
      player1,
      player2,
      sets: JSON.stringify(sets),
      winner: winner ?? "",
      player1_elo_before: p1Stats.rating,
      player2_elo_before: p2Stats.rating,
      player1_elo_after: newRating1,
      player2_elo_after: newRating2,
      recorded_by: recordedBy,
      channel: channelId,
      created_at: now,
    },
  });

  if (!putGame.ok) {
    return { error: `Failed to save game: ${putGame.error}` };
  }

  const putP1 = await client.apps.datastore.put({
    datastore: PlayerRatingsDatastore.name,
    item: {
      id: player1,
      rating: newRating1,
      wins: p1Stats.wins + (outcome === "player1" ? 1 : 0),
      losses: p1Stats.losses + (outcome === "player2" ? 1 : 0),
      draws: p1Stats.draws + (outcome === "draw" ? 1 : 0),
      games_played: p1Stats.games + 1,
    },
  });

  if (!putP1.ok) {
    return { error: `Failed to update player 1 rating: ${putP1.error}` };
  }

  const putP2 = await client.apps.datastore.put({
    datastore: PlayerRatingsDatastore.name,
    item: {
      id: player2,
      rating: newRating2,
      wins: p2Stats.wins + (outcome === "player2" ? 1 : 0),
      losses: p2Stats.losses + (outcome === "player1" ? 1 : 0),
      draws: p2Stats.draws + (outcome === "draw" ? 1 : 0),
      games_played: p2Stats.games + 1,
    },
  });

  if (!putP2.ok) {
    return { error: `Failed to update player 2 rating: ${putP2.error}` };
  }

  const setsDisplay = sets.map((s) => `\`${s.p1}-${s.p2}\``).join("  ");
  const p1Delta = newRating1 - p1Stats.rating;
  const p2Delta = newRating2 - p2Stats.rating;
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
      `• <@${player1}>: ${p1Stats.rating} → ${newRating1} (${
        sign(p1Delta)
      })\n` +
      `• <@${player2}>: ${p2Stats.rating} → ${newRating2} (${sign(p2Delta)})`,
  });

  return { outputs: {} };
}
