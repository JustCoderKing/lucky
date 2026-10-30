export function buildTrend(drawsNewestFirst, max, readNumbers, windowSize) {
  const omission = Array(max + 1).fill(0);
  const chronological = [];
  for (let index = drawsNewestFirst.length - 1; index >= 0; index -= 1) {
    const draw = drawsNewestFirst[index];
    const hit = new Set(readNumbers(draw));
    const cells = [];
    for (let number = 1; number <= max; number += 1) {
      if (hit.has(number)) {
        omission[number] = 0;
        cells.push({ number, hit: true, omit: 0 });
      } else {
        omission[number] += 1;
        cells.push({ number, hit: false, omit: omission[number] });
      }
    }
    chronological.push({
      issue: draw.issue,
      date: draw.date,
      cells,
    });
  }
  const visible = chronological.slice(-windowSize).reverse();
  const counts = Array(max).fill(0);
  visible.forEach((row) => {
    row.cells.forEach((cell, index) => {
      if (cell.hit) counts[index] += 1;
    });
  });
  return { visible, counts };
}
