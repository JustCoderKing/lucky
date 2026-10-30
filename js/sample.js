export function randomBelow(limit) {
  if (limit <= 0) throw new Error("抽样上限必须大于 0");
  const span = 0x100000000;
  const cutoff = span - (span % limit);
  const buffer = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < cutoff) return buffer[0] % limit;
  }
}

export function sampleDistinct(count, max) {
  const pool = Array.from({ length: max }, (_, index) => index + 1);
  for (let i = 0; i < count; i += 1) {
    const swap = i + randomBelow(pool.length - i);
    const held = pool[i];
    pool[i] = pool[swap];
    pool[swap] = held;
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

export function hasConsecutive(numbers) {
  const sorted = [...numbers].sort((left, right) => left - right);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] === sorted[i - 1] + 1) return true;
  }
  return false;
}

export function sampleTicket(game, avoidConsecutive) {
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const main = sampleDistinct(game.mainPick, game.mainMax);
    const extra = sampleDistinct(game.extraPick, game.extraMax);
    const blocked =
      avoidConsecutive && (hasConsecutive(main) || hasConsecutive(extra));
    if (!blocked) return { main, extra };
  }
  throw new Error("没有抽到不含连号的组合");
}
