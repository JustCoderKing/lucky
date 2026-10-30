import assert from "node:assert/strict";
import { GAMES } from "../js/games.js";
import { ballCaption, drawDuration, planDraw } from "../js/draw-plan.js";

const zero = () => 0;

const ticket = { main: [1, 2, 3, 4, 5, 6], extra: [9] };
const plan = planDraw(ticket, GAMES.ssq, zero);

assert.deepEqual(
  plan.winners.map((item) => item.number),
  [2, 3, 4, 5, 6, 1, 9],
);
assert.deepEqual(
  plan.winners.map((item) => item.zone),
  ["main", "main", "main", "main", "main", "main", "extra"],
);

function numbersOf(items, zone) {
  return items
    .filter((item) => item.zone === zone)
    .map((item) => item.number)
    .sort((left, right) => left - right);
}

const ssqBalls = [...plan.winners, ...plan.fillers];
assert.equal(plan.fillers.length, 27 + 15);
assert.deepEqual(numbersOf(ssqBalls, "main"), Array.from({ length: 33 }, (_, index) => index + 1));
assert.deepEqual(numbersOf(ssqBalls, "extra"), Array.from({ length: 16 }, (_, index) => index + 1));

const dlt = planDraw({ main: [13, 18, 19, 20, 28], extra: [9, 11] }, GAMES.dlt, zero);
const dltBalls = [...dlt.winners, ...dlt.fillers];
assert.equal(dlt.winners.filter((item) => item.zone === "main").length, 5);
assert.equal(dlt.winners.filter((item) => item.zone === "extra").length, 2);
assert.ok(dlt.winners.findIndex((item) => item.zone === "extra") === 5);
assert.equal(dlt.fillers.length, 30 + 10);
assert.deepEqual(numbersOf(dltBalls, "main"), Array.from({ length: 35 }, (_, index) => index + 1));
assert.deepEqual(numbersOf(dltBalls, "extra"), Array.from({ length: 12 }, (_, index) => index + 1));

assert.equal(drawDuration(7), 6900);
assert.equal(ballCaption({ number: 3, zone: "main" }, GAMES.ssq), "红球 03");
assert.equal(ballCaption({ number: 11, zone: "extra" }, GAMES.dlt), "后区 11");

console.log("draw-plan ok");
