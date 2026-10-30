import { GAMES, jackpotCount, quietCount } from "./games.js";
import { hasConsecutive, sampleTicket } from "./sample.js";
import { buildTrend } from "./trend.js";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const numberFormat = new Intl.NumberFormat("zh-CN");

const state = {
  game: "ssq",
  tab: "pick",
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

function pad(number) {
  return String(number).padStart(2, "0");
}

function officialIssue(issue) {
  return issue.length === 5 ? `20${issue}` : issue;
}

function formatDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return `${iso} 周${WEEKDAYS[date.getDay()]}`;
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
  const meta = document.createElement("div");
  meta.className = "meta";
  const issue = document.createElement("strong");
  issue.textContent = `最新 ${officialIssue(draw.issue)}`;
  const date = document.createElement("span");
  date.textContent = formatDate(draw.date);
  meta.append(issue, date);
  latestNode.append(meta, ballRow(draw));
}

function renderTickets() {
  const list = state.tickets[state.game];
  ticketsNode.replaceChildren();
  if (list.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "点下面的按钮，生成一注号码。";
    ticketsNode.append(empty);
    return;
  }
  list.forEach((ticket, index) => {
    const card = document.createElement("article");
    card.className = "ticket";
    const label = document.createElement("p");
    label.className = "ticket-index";
    label.textContent = `第 ${index + 1} 注`;
    card.append(label, ballRow(ticket));
    ticketsNode.append(card);
  });
}

function renderOdds() {
  const current = game();
  const jackpot = jackpotCount(current);
  oddsNode.textContent = `一等奖概率 1/${numberFormat.format(jackpot)}`;
  if (state.avoid) {
    const quiet = quietCount(current);
    noteNode.textContent = `避免连号已打开，只在 ${numberFormat.format(quiet)} 种不含相邻号码的组合里均匀抽取。这一注中一等奖的概率是 1/${numberFormat.format(jackpot)}。`;
  } else {
    noteNode.textContent = "每次从全部合法组合中等概率抽取。走势和历史开奖不参与选号。";
  }
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
  issueHead.textContent = "期号";
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
    issue.textContent = officialIssue(row.issue);
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
  historyMeta.textContent = `${game().name} ${numberFormat.format(list.length)} 期，${list[list.length - 1].date} 至 ${list[0].date}。数据来自 500.com 开奖表。`;
  historyList.replaceChildren();
  shown.forEach((draw) => {
    const card = document.createElement("article");
    card.className = "draw";
    const meta = document.createElement("div");
    meta.className = "meta";
    const issue = document.createElement("strong");
    issue.textContent = officialIssue(draw.issue);
    const date = document.createElement("span");
    date.textContent = formatDate(draw.date);
    meta.append(issue, date);
    card.append(meta, ballRow(draw));
    historyList.append(card);
  });
  const remaining = list.length - shown.length;
  historyMore.hidden = remaining <= 0;
  historyMore.textContent = remaining > 0 ? `继续加载（还有 ${remaining} 期）` : "已全部显示";
}

function renderGameChrome() {
  app.dataset.game = state.game;
  document.querySelector("#game-title").textContent = game().name;
  document.querySelector("#avoid-hint").textContent =
    state.game === "ssq" ? "红球不出现相邻号码" : "前区和后区都不出现相邻号码";
  document.querySelectorAll("button[data-game]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.game === state.game));
  });
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
  document.querySelectorAll("[data-tab]").forEach((button) => {
    if (button.dataset.tab === tab) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
}

function generate(count) {
  const next = [];
  for (let index = 0; index < count; index += 1) {
    next.push(sampleTicket(game(), state.avoid));
  }
  state.tickets[state.game] = next;
  renderTickets();
}

function bind() {
  document.querySelectorAll("button[data-game]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.game === state.game) return;
      state.game = button.dataset.game;
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
  document.querySelector("#avoid").addEventListener("change", (event) => {
    state.avoid = event.target.checked;
    state.tickets[state.game] = [];
    renderTickets();
    renderOdds();
  });
  document.querySelector("#gen-one").addEventListener("click", () => generate(1));
  document.querySelector("#gen-five").addEventListener("click", () => generate(5));
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
  window.addEventListener("resize", applyHeader);
}

boot().catch((error) => {
  noteNode.textContent = error.message;
});

export { hasConsecutive };
