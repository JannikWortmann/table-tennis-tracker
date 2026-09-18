import { assertEquals } from "std/testing/asserts.ts";
import { buildRatingProjection, type GameRecord } from "./rating_projection.ts";

function game(
  id: string,
  createdAt: string,
  player1: string,
  player2: string,
  sets: Array<{ p1: number; p2: number }>,
): GameRecord {
  return {
    id,
    player1,
    player2,
    sets: JSON.stringify(sets),
    winner: "",
    recorded_by: "U_RECORDER",
    channel: "C_TABLE",
    created_at: createdAt,
  };
}

Deno.test("buildRatingProjection replays games in chronological order", () => {
  const projection = buildRatingProjection([
    game("game-2", "2026-09-18T11:00:00.000Z", "U_B", "U_A", [
      { p1: 11, p2: 8 },
    ]),
    game("game-1", "2026-09-18T10:00:00.000Z", "U_A", "U_B", [
      { p1: 11, p2: 5 },
    ]),
  ]);

  assertEquals(projection.games.map((storedGame) => storedGame.id), [
    "game-1",
    "game-2",
  ]);
  assertEquals(projection.games[0].player1_elo_before, 1000);
  assertEquals(projection.games[0].player1_elo_after, 1016);
  assertEquals(projection.games[1].player1_elo_before, 984);
  assertEquals(projection.games[1].player2_elo_before, 1016);
});

Deno.test("buildRatingProjection derives all tied nemeses", () => {
  const projection = buildRatingProjection([
    game("game-1", "2026-09-18T10:00:00.000Z", "U_A", "U_C", [
      { p1: 5, p2: 11 },
    ]),
    game("game-2", "2026-09-18T11:00:00.000Z", "U_B", "U_A", [
      { p1: 11, p2: 5 },
    ]),
    game("game-3", "2026-09-18T12:00:00.000Z", "U_A", "U_C", [
      { p1: 11, p2: 5 },
    ]),
  ]);

  const playerA = projection.ratings.find((rating) => rating.id === "U_A");
  assertEquals(playerA?.nemeses, ["U_B", "U_C"]);
  assertEquals(playerA?.nemesis_losses, 1);
  assertEquals(
    projection.ratings.find((rating) => rating.id === "U_B")?.nemeses,
    [],
  );
});

Deno.test("buildRatingProjection excludes draws from nemesis counts", () => {
  const projection = buildRatingProjection([
    game("game-1", "2026-09-18T10:00:00.000Z", "U_A", "U_B", [
      { p1: 11, p2: 5 },
      { p1: 5, p2: 11 },
    ]),
  ]);

  for (const rating of projection.ratings) {
    assertEquals(rating.nemeses, []);
    assertEquals(rating.nemesis_losses, 0);
  }
});
