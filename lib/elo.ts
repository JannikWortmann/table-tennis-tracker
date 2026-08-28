const K_FACTOR = 32;
const DEFAULT_RATING = 1000;

function expectedScore(playerRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

function newRating(
  currentRating: number,
  expected: number,
  actual: number,
): number {
  return Math.round(currentRating + K_FACTOR * (actual - expected));
}

export function updateRatings(
  rating1: number,
  rating2: number,
  outcome: "player1" | "player2" | "draw",
): { newRating1: number; newRating2: number } {
  const e1 = expectedScore(rating1, rating2);
  const e2 = expectedScore(rating2, rating1);
  const s1 = outcome === "player1" ? 1 : outcome === "draw" ? 0.5 : 0;
  const s2 = outcome === "player2" ? 1 : outcome === "draw" ? 0.5 : 0;
  return {
    newRating1: newRating(rating1, e1, s1),
    newRating2: newRating(rating2, e2, s2),
  };
}

export { DEFAULT_RATING };
