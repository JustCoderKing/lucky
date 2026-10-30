export const MIX_MS = 2000;
export const EXIT_MS = 620;
export const EXIT_GAP_MS = 80;

export function drawDuration(ballCount) {
  return MIX_MS + ballCount * (EXIT_MS + EXIT_GAP_MS);
}

export function ballCaption(item, game) {
  const name = item.zone === "extra" ? game.extraName : game.mainName;
  const number = String(item.number).padStart(2, "0");
  return `${name} ${number}`;
}

function shuffle(items, randomBelow) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = randomBelow(index + 1);
    const held = copy[index];
    copy[index] = copy[swap];
    copy[swap] = held;
  }
  return copy;
}

function unused(max, taken) {
  const left = [];
  for (let number = 1; number <= max; number += 1) {
    if (!taken.includes(number)) left.push(number);
  }
  return left;
}

export function planDraw(ticket, game, randomBelow) {
  const winners = [
    ...shuffle(ticket.main, randomBelow).map((number) => ({ number, zone: "main" })),
    ...shuffle(ticket.extra, randomBelow).map((number) => ({ number, zone: "extra" })),
  ];
  const fillers = [
    ...unused(game.mainMax, ticket.main).map((number) => ({ number, zone: "main" })),
    ...unused(game.extraMax, ticket.extra).map((number) => ({ number, zone: "extra" })),
  ];
  return { winners, fillers };
}
