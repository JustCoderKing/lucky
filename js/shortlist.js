const PREFIX = "lucky:shortlist:";

function storageKey(gameId) {
  return `${PREFIX}${gameId}`;
}

export function ticketKey(ticket) {
  return `${ticket.main.join(",")}|${ticket.extra.join(",")}`;
}

function sortedTicket(ticket) {
  return {
    main: [...ticket.main].map(Number).sort((a, b) => a - b),
    extra: [...ticket.extra].map(Number).sort((a, b) => a - b),
  };
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const main = Array.isArray(raw.main) ? raw.main.map(Number) : null;
  const extra = Array.isArray(raw.extra) ? raw.extra.map(Number) : null;
  if (!main?.length || !extra?.length) return null;
  const savedAt = Number(raw.savedAt) || 0;
  return { main, extra, savedAt };
}

export function loadShortlist(gameId) {
  try {
    const raw = localStorage.getItem(storageKey(gameId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    const list = [];
    parsed.forEach((item) => {
      const entry = normalizeEntry(item);
      if (!entry) return;
      const key = ticketKey(entry);
      if (seen.has(key)) return;
      seen.add(key);
      list.push(entry);
    });
    list.sort((a, b) => b.savedAt - a.savedAt);
    return list;
  } catch {
    return [];
  }
}

function saveShortlist(gameId, list) {
  localStorage.setItem(storageKey(gameId), JSON.stringify(list));
}

export function isInShortlist(gameId, ticket) {
  const key = ticketKey(ticket);
  return loadShortlist(gameId).some((entry) => ticketKey(entry) === key);
}

export function toggleShortlist(gameId, ticket) {
  const key = ticketKey(ticket);
  const list = loadShortlist(gameId);
  const index = list.findIndex((entry) => ticketKey(entry) === key);
  if (index >= 0) {
    list.splice(index, 1);
    saveShortlist(gameId, list);
    return false;
  }
  const next = sortedTicket(ticket);
  list.unshift({
    main: next.main,
    extra: next.extra,
    savedAt: Date.now(),
  });
  saveShortlist(gameId, list);
  return true;
}

export function updateShortlist(gameId, original, nextTicket) {
  const list = loadShortlist(gameId);
  const origKey = ticketKey(original);
  const index = list.findIndex((entry) => ticketKey(entry) === origKey);
  if (index < 0) return { ok: false, reason: "missing" };
  const next = sortedTicket(nextTicket);
  const nextKey = ticketKey(next);
  if (
    nextKey !== origKey
    && list.some((entry) => ticketKey(entry) === nextKey)
  ) {
    return { ok: false, reason: "duplicate" };
  }
  list[index] = {
    main: next.main,
    extra: next.extra,
    savedAt: list[index].savedAt,
  };
  saveShortlist(gameId, list);
  return { ok: true, ticket: list[index] };
}
