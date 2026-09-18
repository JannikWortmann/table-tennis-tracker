import { DEFAULT_RATING, updateRatings } from "./elo.ts";

export interface SetScore {
  p1: number;
  p2: number;
}

export interface GameRecord {
  id: string;
  player1: string;
  player2: string;
  sets: string;
  winner: string;
  recorded_by: string;
  channel: string;
  created_at: string;
  message_ts?: string;
}

export interface PlayerRatingProjection {
  id: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  games_played: number;
  nemeses: string[];
  nemesis_losses: number;
}

export interface GameRatingSnapshot extends GameRecord {
  player1_elo_before: number;
  player2_elo_before: number;
  player1_elo_after: number;
  player2_elo_after: number;
}

export function determineMatchWinner(
  player1: string,
  player2: string,
  sets: SetScore[],
): { outcome: "player1" | "player2" | "draw"; winner: string } {
  let p1Wins = 0;
  let p2Wins = 0;
  for (const set of sets) {
    if (set.p1 > set.p2) p1Wins++;
    else p2Wins++;
  }
  if (p1Wins === p2Wins) return { outcome: "draw", winner: "" };
  return p1Wins > p2Wins
    ? { outcome: "player1", winner: player1 }
    : { outcome: "player2", winner: player2 };
}

export function parseStoredSets(sets: string): SetScore[] {
  const parsed = JSON.parse(sets);
  if (!Array.isArray(parsed)) {
    throw new Error("Stored game sets must be an array");
  }
  return parsed.map((set) => {
    if (
      typeof set !== "object" || set === null ||
      typeof set.p1 !== "number" || typeof set.p2 !== "number"
    ) {
      throw new Error("Stored game set has an invalid shape");
    }
    return { p1: set.p1, p2: set.p2 };
  });
}

function emptyRating(id: string): PlayerRatingProjection {
  return {
    id,
    rating: DEFAULT_RATING,
    wins: 0,
    losses: 0,
    draws: 0,
    games_played: 0,
    nemeses: [],
    nemesis_losses: 0,
  };
}

function recordLoss(
  lossesByOpponent: Map<string, Map<string, number>>,
  playerId: string,
  opponentId: string,
): void {
  const playerLosses = lossesByOpponent.get(playerId) ??
    new Map<string, number>();
  playerLosses.set(opponentId, (playerLosses.get(opponentId) ?? 0) + 1);
  lossesByOpponent.set(playerId, playerLosses);
}

function getRating(
  ratings: Map<string, PlayerRatingProjection>,
  playerId: string,
): PlayerRatingProjection {
  const existing = ratings.get(playerId);
  if (existing) return existing;
  const created = emptyRating(playerId);
  ratings.set(playerId, created);
  return created;
}

export function buildRatingProjection(games: GameRecord[]): {
  ratings: PlayerRatingProjection[];
  games: GameRatingSnapshot[];
} {
  const ratings = new Map<string, PlayerRatingProjection>();
  const lossesByOpponent = new Map<string, Map<string, number>>();
  const sortedGames = [...games].sort((a, b) => {
    const timeComparison = a.created_at.localeCompare(b.created_at);
    if (timeComparison !== 0) return timeComparison;
    return a.id.localeCompare(b.id);
  });

  const gamesWithRatings = sortedGames.map((game) => {
    const sets = parseStoredSets(game.sets);
    const { outcome, winner } = determineMatchWinner(
      game.player1,
      game.player2,
      sets,
    );
    const player1Rating = getRating(ratings, game.player1);
    const player2Rating = getRating(ratings, game.player2);
    const player1Before = player1Rating.rating;
    const player2Before = player2Rating.rating;
    const { newRating1, newRating2 } = updateRatings(
      player1Before,
      player2Before,
      outcome,
    );

    player1Rating.rating = newRating1;
    player1Rating.wins += outcome === "player1" ? 1 : 0;
    player1Rating.losses += outcome === "player2" ? 1 : 0;
    player1Rating.draws += outcome === "draw" ? 1 : 0;
    player1Rating.games_played += 1;

    player2Rating.rating = newRating2;
    player2Rating.wins += outcome === "player2" ? 1 : 0;
    player2Rating.losses += outcome === "player1" ? 1 : 0;
    player2Rating.draws += outcome === "draw" ? 1 : 0;
    player2Rating.games_played += 1;

    if (outcome === "player1") {
      recordLoss(lossesByOpponent, game.player2, game.player1);
    } else if (outcome === "player2") {
      recordLoss(lossesByOpponent, game.player1, game.player2);
    }

    return {
      ...game,
      winner,
      player1_elo_before: player1Before,
      player2_elo_before: player2Before,
      player1_elo_after: newRating1,
      player2_elo_after: newRating2,
    };
  });

  for (const rating of ratings.values()) {
    const opponentLosses = lossesByOpponent.get(rating.id);
    if (!opponentLosses) continue;
    rating.nemesis_losses = Math.max(...opponentLosses.values());
    rating.nemeses = [...opponentLosses.entries()]
      .filter(([, losses]) => losses === rating.nemesis_losses)
      .map(([opponentId]) => opponentId)
      .sort();
  }

  return {
    ratings: [...ratings.values()],
    games: gamesWithRatings,
  };
}

export function emptyPlayerRating(id: string): PlayerRatingProjection {
  return emptyRating(id);
}
