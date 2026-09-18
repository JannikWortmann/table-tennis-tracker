import type { GameRecord, SetScore } from "./rating_projection.ts";

export type GameSubmission =
  | { kind: "new" }
  | { kind: "redelivery"; game: GameRecord }
  | { kind: "edit"; game: GameRecord };

export function classifyGameSubmission(
  games: GameRecord[],
  channel: string,
  messageTs: string,
  player1: string,
  player2: string,
  sets: SetScore[],
): GameSubmission {
  const existingGame = games.find((game) =>
    game.channel === channel && game.message_ts === messageTs
  );
  if (!existingGame) return { kind: "new" };

  const isExactRedelivery = existingGame.player1 === player1 &&
    existingGame.player2 === player2 &&
    existingGame.sets === JSON.stringify(sets);
  return isExactRedelivery
    ? { kind: "redelivery", game: existingGame }
    : { kind: "edit", game: existingGame };
}
