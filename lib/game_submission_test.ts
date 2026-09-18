import { assertEquals } from "std/testing/asserts.ts";
import {
  classifyGameSubmission,
  type GameSubmission,
} from "./game_submission.ts";
import type { GameRecord } from "./rating_projection.ts";

const storedGame: GameRecord = {
  id: "game-1",
  player1: "U_A",
  player2: "U_B",
  sets: JSON.stringify([{ p1: 11, p2: 5 }]),
  winner: "U_A",
  recorded_by: "U_RECORDER",
  channel: "C_TABLE",
  message_ts: "123.456",
  created_at: "2026-09-18T10:00:00.000Z",
};

function kind(submission: GameSubmission): GameSubmission["kind"] {
  return submission.kind;
}

Deno.test("classifyGameSubmission accepts a new source message", () => {
  const result = classifyGameSubmission(
    [storedGame],
    "C_TABLE",
    "789.012",
    "U_A",
    "U_B",
    [{ p1: 11, p2: 5 }],
  );

  assertEquals(kind(result), "new");
});

Deno.test("classifyGameSubmission identifies exact redelivery", () => {
  const result = classifyGameSubmission(
    [storedGame],
    "C_TABLE",
    "123.456",
    "U_A",
    "U_B",
    [{ p1: 11, p2: 5 }],
  );

  assertEquals(kind(result), "redelivery");
});

Deno.test("classifyGameSubmission rejects changed scores and players", () => {
  const changedScore = classifyGameSubmission(
    [storedGame],
    "C_TABLE",
    "123.456",
    "U_A",
    "U_B",
    [{ p1: 5, p2: 11 }],
  );
  const changedPlayer = classifyGameSubmission(
    [storedGame],
    "C_TABLE",
    "123.456",
    "U_A",
    "U_C",
    [{ p1: 11, p2: 5 }],
  );

  assertEquals(kind(changedScore), "edit");
  assertEquals(kind(changedPlayer), "edit");
});
