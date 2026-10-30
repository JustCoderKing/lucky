export const GAMES = {
  ssq: {
    id: "ssq",
    name: "双色球",
    mainName: "红球",
    extraName: "蓝球",
    mainPick: 6,
    mainMax: 33,
    extraPick: 1,
    extraMax: 16,
  },
  dlt: {
    id: "dlt",
    name: "大乐透",
    mainName: "前区",
    extraName: "后区",
    mainPick: 5,
    mainMax: 35,
    extraPick: 2,
    extraMax: 12,
  },
};

export function combinations(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i += 1) {
    result = (result * (n - k + i)) / i;
  }
  return Math.round(result);
}

export function jackpotCount(game) {
  return combinations(game.mainMax, game.mainPick) * combinations(game.extraMax, game.extraPick);
}

export function quietCount(game) {
  const main = combinations(game.mainMax - game.mainPick + 1, game.mainPick);
  const extra = combinations(game.extraMax - game.extraPick + 1, game.extraPick);
  return main * extra;
}
