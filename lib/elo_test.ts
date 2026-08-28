import { assertEquals } from "std/testing/asserts.ts";
import { DEFAULT_RATING, updateRatings } from "../lib/elo.ts";

Deno.test("equal-rated players: winner gains, loser loses same amount", () => {
  const { newRating1, newRating2 } = updateRatings(1000, 1000, "player1");
  assertEquals(newRating1, 1016);
  assertEquals(newRating2, 984);
  assertEquals(newRating1 + newRating2, 2000);
});

Deno.test("higher-rated player winning gains fewer points", () => {
  const { newRating1, newRating2 } = updateRatings(1200, 1000, "player1");
  // Expected score for 1200 vs 1000 is ~0.76, so gain is small
  assertEquals(newRating1 > 1200, true);
  assertEquals(newRating2 < 1000, true);
  assertEquals(newRating1 - 1200 < 16, true); // gains less than half K
});

Deno.test("upset: lower-rated player winning gains more points", () => {
  const { newRating1, newRating2 } = updateRatings(1000, 1200, "player1");
  assertEquals(newRating1 > 1016, true); // gains more than equal match
  assertEquals(newRating2 < 1184, true);
});

Deno.test("ratings are symmetric", () => {
  const a = updateRatings(1100, 900, "player1");
  const b = updateRatings(900, 1100, "player2");
  // Both scenarios: the 1100-rated player wins
  assertEquals(a.newRating1, b.newRating2);
  assertEquals(a.newRating2, b.newRating1);
});

Deno.test("draw: equal-rated players stay the same", () => {
  const { newRating1, newRating2 } = updateRatings(1000, 1000, "draw");
  assertEquals(newRating1, 1000);
  assertEquals(newRating2, 1000);
});

Deno.test("draw: higher-rated player loses points, lower gains", () => {
  const { newRating1, newRating2 } = updateRatings(1200, 1000, "draw");
  assertEquals(newRating1 < 1200, true);
  assertEquals(newRating2 > 1000, true);
});

Deno.test("DEFAULT_RATING is 1000", () => {
  assertEquals(DEFAULT_RATING, 1000);
});
