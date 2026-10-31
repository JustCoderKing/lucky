import { ballCaption, planDraw } from "./draw-plan.js";
import { GAMES, jackpotCount, quietCount } from "./games.js";
import { createStage } from "./reveal.js";
import { hasConsecutive, randomBelow, sampleTicket } from "./sample.js";
import {
  isInShortlist,
  loadShortlist,
  ticketKey,
  toggleShortlist,
  updateShortlist,
} from "./shortlist.js";
import { buildTrend } from "./trend.js";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const numberFormat = new Intl.NumberFormat("zh-CN");

const state = {
  game: "ssq",
  tab: "pick",
  shortlistGame: "ssq",
  shortlistEdit: null,
  avoid: true,
  pool: "main",
  windowSize: 30,
  historyShown: 40,
  tickets: { ssq: [], dlt: [] },
  data: null,
};

const app = document.querySelector("#app");
const ticketsNode = document.querySelector("#tickets");
const latestNode = document.querySelector("#latest");
const oddsNode = document.querySelector("#odds");
const noteNode = document.querySelector("#note");
const trendScroll = document.querySelector("#trend-scroll");
const historyList = document.querySelector("#history-list");
const historyMeta = document.querySelector("#history-meta");
const historyMore = document.querySelector("#history-more");
const poolSwitch = document.querySelector("#pool-switch");
const shortlistNode = document.querySelector("#shortlist");
const stageNode = document.querySelector("#stage");
const stageLabel = document.querySelector("#stage-label");
const reveal = createStage(document.querySelector("#stage-canvas"));

function pad(number) {
  return String(number).padStart(2, "0");
}

function periodLabel(issue) {
  return `第${Number(issue.slice(-3))}期`;
}

function dateParts(iso) {
  const [year, month, day] = iso.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return { year, month, day, weekday: WEEKDAYS[date.getDay()] };
}

function formatDate(iso) {
  const { year, month, day, weekday } = dateParts(iso);
  return `${year}年${month}月${day}日 周${weekday}`;
}

function formatMonthDay(iso) {
  const { month, day } = dateParts(iso);
  return `${month}月${day}日`;
}

function game() {
  return GAMES[state.game];
}

function draws() {
  return state.data[state.game];
}

function ball(number, zone) {
  const node = document.createElement("span");
  node.className = `ball ${zone}`;
  node.textContent = pad(number);
  return node;
}

function ballRow(ticket) {
  const row = document.createElement("div");
  row.className = "balls";
  ticket.main.forEach((number) => row.append(ball(number, "main")));
  ticket.extra.forEach((number, index) => {
    const node = ball(number, "extra");
    if (index === 0) node.classList.add("lead");
    row.append(node);
  });
  return row;
}

function renderLatest() {
  const draw = draws()[0];
  latestNode.replaceChildren();
  const title = document.createElement("p");
  title.className = "latest-title";
  title.textContent = "上期中奖号码";
  const meta = document.createElement("div");
  meta.className = "meta";
  const date = document.createElement("strong");
  date.className = "date";
  date.textContent = formatDate(draw.date);
  const issue = document.createElement("span");
  issue.textContent = periodLabel(draw.issue);
  meta.append(date, issue);
  latestNode.append(title, meta, ballRow(draw));
}

function hideMachine() {
  stageNode.classList.remove("drawing");
  stageNode.hidden = true;
  reveal?.stopDraw();
  reveal?.pause();
}

function applyShortlistButton(button, saved) {
  button.setAttribute("aria-pressed", String(saved));
  button.textContent = saved ? "取消备选" : "加入备选";
}

function shortlistToggleButton(gameId, ticket, onChange) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "shortlist-toggle";
  applyShortlistButton(button, isInShortlist(gameId, ticket));
  button.addEventListener("click", () => {
    const saved = toggleShortlist(gameId, ticket);
    applyShortlistButton(button, saved);
    onChange?.(saved);
  });
  return button;
}

function renderTickets({ animate = true } = {}) {
  hideMachine();
  const list = state.tickets[state.game];
  ticketsNode.replaceChildren();
  list.forEach((ticket, index) => {
    const card = document.createElement("article");
    card.className = animate ? "ticket enter" : "ticket";
    const head = document.createElement("div");
    head.className = "ticket-head";
    const label = document.createElement("p");
    label.className = "ticket-index";
    label.textContent = `第 ${index + 1} 注`;
    head.append(label, shortlistToggleButton(state.game, ticket));
    card.append(head, ballRow(ticket));
    ticketsNode.append(card);
  });
}

function activeGameId() {
  return state.tab === "shortlist" ? state.shortlistGame : state.game;
}

function syncGameSeg() {
  const current = activeGameId();
  app.dataset.game = current;
  document.querySelectorAll("button[data-game]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.game === current));
  });
}

function clearShortlistEdit() {
  state.shortlistEdit = null;
}

function startShortlistEdit(ticket) {
  state.shortlistEdit = {
    original: { main: [...ticket.main], extra: [...ticket.extra] },
    draft: { main: [...ticket.main], extra: [...ticket.extra] },
    selected: null,
    message: null,
  };
  renderShortlist();
}

function shortlistActionButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function editableBallRow(draft, selected, onSelect) {
  const row = document.createElement("div");
  row.className = "balls is-editing";
  draft.main.forEach((number, index) => {
    const node = ball(number, "main");
    node.classList.add("is-editable");
    if (selected?.zone === "main" && selected.index === index) {
      node.classList.add("is-selected");
    }
    node.tabIndex = 0;
    node.setAttribute("role", "button");
    node.addEventListener("click", () => onSelect({ zone: "main", index }));
    row.append(node);
  });
  draft.extra.forEach((number, index) => {
    const node = ball(number, "extra");
    node.classList.add("is-editable");
    if (index === 0) node.classList.add("lead");
    if (selected?.zone === "extra" && selected.index === index) {
      node.classList.add("is-selected");
    }
    node.tabIndex = 0;
    node.setAttribute("role", "button");
    node.addEventListener("click", () => onSelect({ zone: "extra", index }));
    row.append(node);
  });
  return row;
}

function shortlistPicker(gameConfig, draft, selected, onPick) {
  const panel = document.createElement("div");
  panel.className = "shortlist-picker";
  if (!selected) {
    const hint = document.createElement("p");
    hint.className = "shortlist-hint";
    hint.textContent = "先点要改的号码，再在下方选择新数字。";
    panel.append(hint);
    return panel;
  }
  const isMain = selected.zone === "main";
  const max = isMain ? gameConfig.mainMax : gameConfig.extraMax;
  const used = new Set(isMain ? draft.main : draft.extra);
  const current = (isMain ? draft.main : draft.extra)[selected.index];
  const title = document.createElement("p");
  title.className = "shortlist-hint";
  title.textContent = `替换${isMain ? gameConfig.mainName : gameConfig.extraName} ${pad(current)}`;
  const strip = document.createElement("div");
  strip.className = "pick-strip";
  strip.dataset.zone = selected.zone;
  for (let number = 1; number <= max; number += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = pad(number);
    button.className = "pick-num";
    if (number === current) button.classList.add("is-current");
    if (used.has(number) && number !== current) {
      button.disabled = true;
    } else {
      button.addEventListener("click", () => onPick(number));
    }
    strip.append(button);
  }
  panel.append(title, strip);
  return panel;
}

function renderShortlist() {
  syncGameSeg();
  const gameId = state.shortlistGame;
  const gameConfig = GAMES[gameId];
  const list = loadShortlist(gameId);
  const edit = state.shortlistEdit;
  if (edit) {
    const stillThere = list.some(
      (entry) => ticketKey(entry) === ticketKey(edit.original),
    );
    if (!stillThere) clearShortlistEdit();
  }
  shortlistNode.replaceChildren();
  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "还没有备选号码。在选号页点「加入备选」即可收藏到这里。";
    shortlistNode.append(empty);
    return;
  }
  list.forEach((ticket, index) => {
    const card = document.createElement("article");
    card.className = "ticket";
    const head = document.createElement("div");
    head.className = "ticket-head";
    const label = document.createElement("p");
    label.className = "ticket-index";
    label.textContent = `备选 ${index + 1}`;
    const actions = document.createElement("div");
    actions.className = "ticket-actions";
    const editing =
      state.shortlistEdit
      && ticketKey(state.shortlistEdit.original) === ticketKey(ticket);

    if (editing) {
      const draft = state.shortlistEdit.draft;
      actions.append(
        shortlistActionButton("完成", "shortlist-edit is-primary", () => {
          const result = updateShortlist(gameId, state.shortlistEdit.original, draft);
          if (!result.ok) {
            state.shortlistEdit.message =
              result.reason === "duplicate" ? "该号码已在备选中" : "保存失败，请重试";
            renderShortlist();
            return;
          }
          clearShortlistEdit();
          renderShortlist();
        }),
        shortlistActionButton("取消", "shortlist-edit", () => {
          clearShortlistEdit();
          renderShortlist();
        }),
      );
      head.append(label, actions);
      card.append(
        head,
        editableBallRow(draft, state.shortlistEdit.selected, (selected) => {
          state.shortlistEdit.selected = selected;
          state.shortlistEdit.message = null;
          renderShortlist();
        }),
      );
      if (state.shortlistEdit.message) {
        const message = document.createElement("p");
        message.className = "shortlist-error";
        message.textContent = state.shortlistEdit.message;
        card.append(message);
      }
      card.append(
        shortlistPicker(gameConfig, draft, state.shortlistEdit.selected, (number) => {
          const zone = state.shortlistEdit.selected.zone;
          const at = state.shortlistEdit.selected.index;
          const next = [...(zone === "main" ? draft.main : draft.extra)];
          next[at] = number;
          next.sort((a, b) => a - b);
          if (zone === "main") draft.main = next;
          else draft.extra = next;
          const newIndex = next.indexOf(number);
          state.shortlistEdit.selected = { zone, index: newIndex };
          state.shortlistEdit.message = null;
          renderShortlist();
        }),
      );
    } else {
      actions.append(
        shortlistActionButton("编辑", "shortlist-edit", () => {
          startShortlistEdit(ticket);
        }),
        shortlistToggleButton(gameId, ticket, (saved) => {
          if (!saved) {
            if (
              state.shortlistEdit
              && ticketKey(state.shortlistEdit.original) === ticketKey(ticket)
            ) {
              clearShortlistEdit();
            }
            renderShortlist();
          }
        }),
      );
      head.append(label, actions);
      card.append(head, ballRow(ticket));
    }
    shortlistNode.append(card);
  });
}

function palette() {
  const style = getComputedStyle(app);
  return {
    main: style.getPropertyValue("--main").trim(),
    extra: style.getPropertyValue("--extra").trim(),
  };
}

function numbered(ticket) {
  return [
    ...ticket.main.map((number) => ({ number, zone: "main" })),
    ...ticket.extra.map((number) => ({ number, zone: "extra" })),
  ];
}

function renderOdds() {
  const current = game();
  const jackpot = jackpotCount(current);
  oddsNode.textContent = `一等奖概率 1/${numberFormat.format(jackpot)}`;
  const quiet = quietCount(current);
  noteNode.textContent = `只在 ${numberFormat.format(quiet)} 种不含相邻号码的组合里均匀抽取。这一注中一等奖的概率是 1/${numberFormat.format(jackpot)}。`;
}

function renderPoolSwitch() {
  const current = game();
  poolSwitch.replaceChildren();
  [
    ["main", current.mainName],
    ["extra", current.extraName],
  ].forEach(([pool, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-pressed", String(state.pool === pool));
    button.addEventListener("click", () => {
      state.pool = pool;
      renderPoolSwitch();
      renderTrend();
    });
    poolSwitch.append(button);
  });
}

function renderTrend() {
  const current = game();
  const isMain = state.pool === "main";
  const max = isMain ? current.mainMax : current.extraMax;
  const read = isMain ? (draw) => draw.main : (draw) => draw.extra;
  const { visible, counts } = buildTrend(draws(), max, read, state.windowSize);
  const table = document.createElement("table");
  const caption = document.createElement("caption");
  caption.className = "visually-hidden";
  caption.textContent = `${current.name}${isMain ? current.mainName : current.extraName}近 ${state.windowSize} 期走势`;
  table.append(caption);

  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  const issueHead = document.createElement("th");
  issueHead.className = "issue";
  issueHead.textContent = "日期";
  headRow.append(issueHead);
  for (let number = 1; number <= max; number += 1) {
    const cell = document.createElement("th");
    cell.textContent = pad(number);
    headRow.append(cell);
  }
  head.append(headRow);

  const body = document.createElement("tbody");
  visible.forEach((row) => {
    const tr = document.createElement("tr");
    const issue = document.createElement("th");
    issue.className = "issue";
    issue.scope = "row";
    issue.textContent = formatMonthDay(row.date);
    issue.title = `${formatDate(row.date)} ${periodLabel(row.issue)}`;
    tr.append(issue);
    row.cells.forEach((cell) => {
      const td = document.createElement("td");
      if (cell.hit) {
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.textContent = pad(cell.number);
        td.append(dot);
      } else {
        td.textContent = String(cell.omit);
      }
      tr.append(td);
    });
    body.append(tr);
  });

  const countRow = document.createElement("tr");
  countRow.className = "count-row";
  const countLabel = document.createElement("th");
  countLabel.className = "issue";
  countLabel.textContent = "出现";
  countRow.append(countLabel);
  counts.forEach((count) => {
    const td = document.createElement("td");
    td.textContent = String(count);
    countRow.append(td);
  });
  body.append(countRow);
  table.append(head, body);
  trendScroll.dataset.pool = state.pool;
  trendScroll.replaceChildren(table);
  trendScroll.scrollTop = 0;
  trendScroll.scrollLeft = 0;
}

function renderHistory() {
  const list = draws();
  const shown = list.slice(0, state.historyShown);
  const oldest = formatDate(list[list.length - 1].date).replace(/ 周.$/, "");
  const newest = formatDate(list[0].date).replace(/ 周.$/, "");
  historyMeta.textContent = `${game().name} ${numberFormat.format(list.length)} 期，${oldest}至${newest}。数据来自 500.com 开奖表。`;
  historyList.replaceChildren();
  shown.forEach((draw) => {
    const card = document.createElement("article");
    card.className = "draw";
    const meta = document.createElement("div");
    meta.className = "meta";
    const date = document.createElement("strong");
    date.className = "date";
    date.textContent = formatDate(draw.date);
    const issue = document.createElement("span");
    issue.textContent = periodLabel(draw.issue);
    meta.append(date, issue);
    card.append(meta, ballRow(draw));
    historyList.append(card);
  });
  const remaining = list.length - shown.length;
  historyMore.hidden = remaining <= 0;
  historyMore.textContent = remaining > 0 ? `继续加载（还有 ${remaining} 期）` : "已全部显示";
}

function renderGameChrome() {
  syncGameSeg();
  renderPoolSwitch();
  renderLatest();
  renderTickets();
  renderOdds();
  renderTrend();
  renderHistory();
}

function showTab(tab) {
  state.tab = tab;
  document.querySelector("#panel-pick").hidden = tab !== "pick";
  document.querySelector("#panel-trend").hidden = tab !== "trend";
  document.querySelector("#panel-history").hidden = tab !== "history";
  document.querySelector("#panel-shortlist").hidden = tab !== "shortlist";
  document.querySelectorAll("[data-tab]").forEach((button) => {
    if (button.dataset.tab === tab) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
  if (tab !== "shortlist") clearShortlistEdit();
  if (tab === "shortlist") renderShortlist();
  else syncGameSeg();
  if (tab === "pick") {
    const list = state.tickets[state.game];
    if (!stageNode.hidden && list[0]) renderDrawResult(list[0], { animate: false });
    else if (stageNode.hidden && list.length) renderTickets({ animate: false });
  }
  if (tab !== "pick") reveal?.pause();
  else if (!stageNode.hidden) reveal?.resume();
}

function actionButtons() {
  return document.querySelectorAll("#gen-five, #gen-draw");
}

let actionToken = 0;

function remember(ticket) {
  const summary = document.createElement("p");
  summary.className = "visually-hidden";
  summary.textContent = numbered(ticket).map((item) => pad(item.number)).join(" ");
  ticketsNode.replaceChildren(summary);
}

function renderDrawResult(ticket, { animate = true } = {}) {
  const card = document.createElement("article");
  card.className = animate ? "ticket enter" : "ticket";
  const head = document.createElement("div");
  head.className = "ticket-head";
  const label = document.createElement("p");
  label.className = "ticket-index";
  label.textContent = "第 1 注";
  head.append(label, shortlistToggleButton(state.game, ticket));
  card.append(head, ballRow(ticket));
  ticketsNode.replaceChildren(card);
}

function setActionBusy(activeButton) {
  actionButtons().forEach((button) => {
    button.disabled = true;
    button.classList.toggle("is-pressed", button === activeButton);
  });
}

function clearActionBusy() {
  actionButtons().forEach((button) => {
    button.disabled = false;
    button.classList.remove("is-pressed");
  });
}

async function generate(count) {
  const token = ++actionToken;
  setActionBusy(document.querySelector("#gen-five"));
  try {
    const next = [];
    for (let index = 0; index < count; index += 1) {
      next.push(sampleTicket(game(), state.avoid));
    }
    state.tickets[state.game] = next;
    renderTickets();
  } finally {
    if (token === actionToken) clearActionBusy();
  }
}

async function generateDraw() {
  const token = ++actionToken;
  setActionBusy(document.querySelector("#gen-draw"));
  try {
    const ticket = sampleTicket(game(), state.avoid);
    state.tickets[state.game] = [ticket];
    if (!reveal) {
      renderTickets();
      return;
    }
    remember(ticket);
    stageNode.hidden = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      stageNode.classList.remove("drawing");
      stageLabel.textContent = "第 1 注";
      await reveal.show(numbered(ticket), palette());
      if (token === actionToken) renderDrawResult(ticket);
      return;
    }
    const current = game();
    const plan = planDraw(ticket, current, randomBelow);
    const mark = (item) => ({ ...item, caption: ballCaption(item, current) });
    stageNode.classList.add("drawing");
    stageLabel.textContent = "搅球";
    reveal.resize();
    const status = await reveal.draw(
      { winners: plan.winners.map(mark), fillers: plan.fillers.map(mark) },
      palette(),
      { onLabel: (text) => { stageLabel.textContent = text; } },
    );
    if (token !== actionToken || status !== "done") return;
    renderDrawResult(ticket);
  } finally {
    if (token === actionToken) clearActionBusy();
  }
}

function bind() {
  document.querySelectorAll("button[data-game]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.game;
      if (state.tab === "shortlist") {
        if (next === state.shortlistGame) return;
        state.shortlistGame = next;
        clearShortlistEdit();
        renderShortlist();
        return;
      }
      if (next === state.game) return;
      state.game = next;
      state.pool = "main";
      state.historyShown = 40;
      renderGameChrome();
      showTab(state.tab);
    });
  });
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => showTab(button.dataset.tab));
  });
  document.querySelectorAll("[data-window]").forEach((button) => {
    button.addEventListener("click", () => {
      state.windowSize = Number(button.dataset.window);
      document.querySelectorAll("[data-window]").forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });
      renderTrend();
    });
  });
  document.querySelector("#gen-five").addEventListener("click", () => generate(5));
  document.querySelector("#gen-draw").addEventListener("click", () => generateDraw());
  historyMore.addEventListener("click", () => {
    state.historyShown += 40;
    renderHistory();
  });
}

async function boot() {
  const response = await fetch("./data/draws.json");
  if (!response.ok) throw new Error("开奖数据读取失败");
  state.data = await response.json();
  bind();
  renderGameChrome();
  showTab("pick");
  const header = document.querySelector(".top");
  const applyHeader = () => {
    app.style.setProperty("--header-h", `${header.offsetHeight}px`);
  };
  applyHeader();
  window.addEventListener("resize", () => {
    applyHeader();
    reveal?.resize();
  });
}

boot().catch((error) => {
  noteNode.textContent = error.message;
});

export { hasConsecutive };
