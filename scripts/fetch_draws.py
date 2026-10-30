# -*- coding: utf-8 -*-
"""Download 10 years of 双色球 and 大乐透 draws into data/draws.json."""
import json
import re
import urllib.request
from datetime import datetime
from pathlib import Path

START = datetime(2016, 10, 30)
END = datetime(2026, 10, 30)
OUT = Path(__file__).resolve().parents[1] / "data" / "draws.json"


def fetch(url, referer):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0", "Referer": referer},
    )
    with urllib.request.urlopen(req, timeout=90) as response:
        return response.read().decode("utf-8", "replace")


def table_rows(html):
    return re.findall(r'<tr class="t_tr1">(.*?)</tr>', html, flags=re.S)


def in_window(date_text):
    day = datetime.strptime(date_text, "%Y-%m-%d")
    return START <= day <= END


def parse_ssq(html):
    draws = []
    skipped = 0
    for row in table_rows(html):
        issue = re.search(r"<td>(\d{5})</td>", row)
        reds = re.findall(r't_cfont2">(\d+)', row)
        blues = re.findall(r't_cfont4">(\d+)', row)
        date = re.search(r"(\d{4}-\d{2}-\d{2})", row)
        if not (issue and date and len(reds) == 6 and len(blues) >= 1):
            skipped += 1
            continue
        if not in_window(date.group(1)):
            continue
        main = [int(n) for n in reds]
        extra = [int(blues[0])]
        if len(set(main)) != 6 or any(n < 1 or n > 33 for n in main):
            skipped += 1
            continue
        if extra[0] < 1 or extra[0] > 16:
            skipped += 1
            continue
        draws.append(
            {
                "issue": issue.group(1),
                "date": date.group(1),
                "main": main,
                "extra": extra,
            }
        )
    return draws, skipped


def parse_dlt(html):
    draws = []
    skipped = 0
    for row in table_rows(html):
        issue = re.search(r'<td class="t_tr1">(\d{5})</td>', row)
        front = re.findall(r'cfont2">(\d+)', row)
        back = re.findall(r'cfont4">(\d+)', row)
        date = re.search(r"(\d{4}-\d{2}-\d{2})", row)
        if not (issue and date and len(front) == 5 and len(back) == 2):
            skipped += 1
            continue
        if not in_window(date.group(1)):
            continue
        main = [int(n) for n in front]
        extra = [int(n) for n in back]
        if len(set(main)) != 5 or any(n < 1 or n > 35 for n in main):
            skipped += 1
            continue
        if len(set(extra)) != 2 or any(n < 1 or n > 12 for n in extra):
            skipped += 1
            continue
        draws.append(
            {
                "issue": issue.group(1),
                "date": date.group(1),
                "main": main,
                "extra": extra,
            }
        )
    return draws, skipped


def newest_first(draws):
    return sorted(draws, key=lambda item: (item["date"], item["issue"]), reverse=True)


def main():
    ssq_html = fetch(
        "https://datachart.500.com/ssq/history/newinc/history.php?start=16001&end=26150",
        "https://datachart.500.com/ssq/",
    )
    dlt_html = fetch(
        "https://datachart.500.com/dlt/history/newinc/history.php?start=16001&end=26150",
        "https://datachart.500.com/dlt/",
    )
    ssq, ssq_skip = parse_ssq(ssq_html)
    dlt, dlt_skip = parse_dlt(dlt_html)
    ssq = newest_first(ssq)
    dlt = newest_first(dlt)
    if len(ssq) < 1400 or len(dlt) < 1400:
        raise SystemExit(f"too few draws ssq={len(ssq)} dlt={len(dlt)}")
    payload = {
        "source": "500.com datachart",
        "from": "2016-10-30",
        "to": END.strftime("%Y-%m-%d"),
        "ssq": ssq,
        "dlt": dlt,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("ssq", len(ssq), "skipped", ssq_skip, ssq[0], "oldest", ssq[-1]["date"])
    print("dlt", len(dlt), "skipped", dlt_skip, dlt[0], "oldest", dlt[-1]["date"])
    print("wrote", OUT)


if __name__ == "__main__":
    main()
