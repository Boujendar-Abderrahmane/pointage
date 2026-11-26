/* Pointages: app code. Read the sections in order (1 to 19). Everything shares one global scope, so a function defined in section 3 can be used anywhere below. */

/* ============================================================
   1. SETTINGS AND CLOCK
   Your personal settings (language, date format, time zone, overtime rule) live in the object CF. now() gives the current time, corrected by your settings.
   ============================================================ */
var CF = { lang: "en", df: "dmy", tz: "", off: 0, otMode: "round", otMin: 50 },
  SW = false;
try {
  var _c = JSON.parse(localStorage.getItem("pt-set") || "null");
  if (_c) {
    for (var _k in _c) CF[_k] = _c[_k];
  } else CF.off = +localStorage.getItem("pt-off") || 0;
} catch (e) {}
var LANG = CF.lang;
function saveCF() {
  try {
    localStorage.setItem("pt-set", JSON.stringify(CF));
  } catch (e) {}
}
function now() {
  var t = new Date(Date.now() + CF.off * 60000);
  if (!CF.tz) return t;
  try {
    var p = {};
    new Intl.DateTimeFormat("en-GB", {
      timeZone: CF.tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(t)
      .forEach(function (x) {
        p[x.type] = +x.value;
      });
    return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  } catch (e) {
    return t;
  }
}

/* ============================================================
   2. CONSTANTS AND STORAGE
   Day and month names, the lateness limits (GRACE), and load()/save(), which keep your shifts (the list S) on the phone.
   ============================================================ */
var K = "pointages-v1",
  DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  MON = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
if (LANG == "fr") {
  DAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  MON = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
  ];
}
function fmt(d, full) {
  var D = p2(d.getDate()),
    M = p2(d.getMonth() + 1),
    Y = d.getFullYear();
  return CF.df == "mdy"
    ? M + "/" + D + (full ? "/" + Y : "")
    : CF.df == "iso"
      ? (full ? Y + "-" : "") + M + "-" + D
      : D + "/" + M + (full ? "/" + Y : "");
}
var GRACE = 9 * 60 + 20,
  LATE_FROM = 9 * 60,
  LATE_TO = 12 * 60;
var SEED = [];
var S = load(),
  cur = null,
  editId = null;
function load() {
  try {
    var v = localStorage.getItem(K);
    if (v) return JSON.parse(v);
  } catch (e) {}
  return SEED.map(function (r, i) {
    return { id: i + 1, d: r[0], s: r[1], e: r[2] };
  });
}
function save() {
  try {
    localStorage.setItem(K, JSON.stringify(S));
  } catch (e) {}
}

/* ============================================================
   3. SMALL HELPERS
   Tiny tools used everywhere: turn "09:04" into minutes, minutes into "1:30", work out the daily goal, apply the overtime rule (cnt).
   ============================================================ */
function p2(n) {
  return (n < 10 ? "0" : "") + n;
}
function iso(t) {
  return t.getFullYear() + "-" + p2(t.getMonth() + 1) + "-" + p2(t.getDate());
}
function hm(t) {
  return p2(t.getHours()) + ":" + p2(t.getMinutes());
}
function tm(s) {
  var a = s.split(":");
  return +a[0] * 60 + +a[1];
}
function dur(x) {
  if (!x.e) return null;
  var m = tm(x.e) - tm(x.s);
  return m <= 0 ? m + 1440 : m;
}
function f(m, sign) {
  var a = Math.abs(m),
    s = Math.floor(a / 60) + ":" + p2(a % 60);
  return sign ? (m < 0 ? "−" : "+") + s : s;
}
function cnt(m) {
  if (m <= 0) return 0;
  var X = CF.otMin;
  if (CF.otMode == "all") return m;
  if (CF.otMode == "exact") return m >= X ? m : 0;
  var h = Math.floor(m / 60);
  return (h + (m % 60 >= X ? 1 : 0)) * 60;
}
function dt(d) {
  var a = d.split("-");
  return new Date(+a[0], +a[1] - 1, +a[2]);
}
function goal(d) {
  var w = dt(d).getDay();
  return w == 0 ? 0 : w == 6 ? 240 : 480;
}
function openShift() {
  var o = S.filter(function (x) {
    return !x.e;
  });
  return o.length ? o[o.length - 1] : null;
}

/* ============================================================
   4. TURNING SHIFTS INTO DAYS
   Groups the raw shifts of one month into days and computes worked time, overtime, lateness and paid status for each day.
   ============================================================ */
function days(ym) {
  var g = {};
  S.forEach(function (x) {
    if (x.d.slice(0, 7) != ym) return;
    (g[x.d] = g[x.d] || []).push(x);
  });
  return Object.keys(g)
    .sort()
    .reverse()
    .map(function (d) {
      var it = g[d].sort(function (a, b) {
          return tm(a.s) - tm(b.s);
        }),
        tot = 0,
        done = false,
        live = false;
      it.forEach(function (x) {
        var u = dur(x);
        if (u === null) live = true;
        else {
          tot += u;
          done = true;
        }
      });
      var first = it[0],
        ls = tm(first.s),
        late = ls > GRACE && ls < LATE_TO ? ls - LATE_FROM : 0;
      return {
        d: d,
        it: it,
        tot: tot,
        done: done,
        live: live,
        diff: done ? tot - goal(d) : null,
        cnt: done ? cnt(tot - goal(d)) : null,
        paid: it.every(function (x) {
          return !!x.paid;
        }),
        late: late,
        goal: goal(d),
      };
    });
}

/* ============================================================
   5. DRAWING THE SCREEN
   Redraws everything you see (clock, button label, month totals, day list) from the current data. Called after every change.
   ============================================================ */
function render() {
  var n = now();
  document.getElementById("today").textContent = DAYS[n.getDay()] + " " + fmt(n, true);
  document.getElementById("now").textContent = hm(n);
  try {
    document.getElementById("tz").textContent =
      "Time zone: " +
      (CF.tz || Intl.DateTimeFormat().resolvedOptions().timeZone) +
      (CF.off ? " · correction " + (CF.off > 0 ? "+" : "") + CF.off / 60 + " h" : "");
  } catch (e) {}
  var o = openShift(),
    b = document.getElementById("btn"),
    L = document.getElementById("lbl"),
    st = document.getElementById("status");
  if (o) {
    var el = Math.max(
      0,
      Math.round((n - new Date(dt(o.d).getTime() + tm(o.s) * 60000)) / 60000),
    );
    b.className = "big stop";
    if (!holding) L.textContent = "■  Hold 5 s to END shift";
    st.textContent = "Started " + o.s + " · " + f(el) + " so far";
  } else {
    b.className = "big go";
    if (!holding) L.textContent = "▶  Hold 5 s to START shift";
    st.textContent = "No shift running";
  }
  if (!cur) cur = iso(n).slice(0, 7);
  var y = +cur.slice(0, 4),
    m = +cur.slice(5, 7);
  document.getElementById("mlabel").textContent = MON[m - 1] + " " + y;
  var D = days(cur),
    ot = 0,
    sh = 0,
    lt = 0,
    wk = 0,
    pa = 0;
  D.forEach(function (x) {
    if (x.diff !== null) {
      if (x.diff > 0) {
        if (x.paid) pa += x.cnt;
        else ot += x.cnt;
      } else sh += x.diff;
      wk += x.tot;
    }
    if (x.late) lt++;
  });
  document.getElementById("stats").innerHTML =
    '<div class="st"><small>Overtime to be paid</small><b class="pos">' +
    f(ot, 1) +
    "</b></div>" +
    '<div class="st"><small>Net balance</small><b class="' +
    (ot + sh < 0 ? "neg" : "pos") +
    '">' +
    f(ot + sh, 1) +
    "</b></div>" +
    '<div class="st"><small>Missing hours</small><b class="' +
    (sh < 0 ? "neg" : "") +
    '">' +
    (sh ? f(sh, 1) : "0:00") +
    "</b></div>" +
    '<div class="st"><small>Late arrivals (&gt;20 min)</small><b class="' +
    (lt ? "neg" : "") +
    '">' +
    lt +
    "</b></div>" +
    (pa
      ? '<div class="st" style="grid-column:1/-1"><small>Overtime already paid</small><b>' +
        f(pa, 1) +
        "</b></div>"
      : "") +
    (ot
      ? '<button class="pay" id="payall" style="grid-column:1/-1;margin:0;width:100%;padding:12px;font-size:15px">Mark all ' +
        f(ot) +
        " of this month as paid</button>"
      : "");
  document.getElementById("list").innerHTML = D.length
    ? D.map(function (x) {
        var d = dt(x.d),
          h = "";
        x.it.forEach(function (s) {
          h += s.s + " → " + (s.e || "…") + "  ";
        });
        var tags =
          (x.late ? '<span class="tag late">Late +' + x.late + " min</span>" : "") +
          (x.live ? '<span class="tag live">In progress</span>' : "") +
          (x.goal == 240 ? '<span class="tag sat">4 h day</span>' : "");
        return (
          '<div class="row" data-id="' +
          x.it[0].id +
          '"><div class="dd"><b>' +
          DAYS[d.getDay()] +
          "</b><span>" +
          fmt(d) +
          '</span></div><div class="mid">' +
          h +
          "<small>" +
          (x.done ? "Worked " + f(x.tot) : "") +
          "</small>" +
          tags +
          "</div>" +
          ov(x) +
          "</div>"
        );
      }).join("")
    : '<div class="empty">No shifts this month</div>';
}
function nowHM() {
  return hm(now());
}

/* ============================================================
   6. THE START/END BUTTON
   Hold-for-5-seconds logic: press, progress bar, vibrate, then punch() saves the start or end time.
   ============================================================ */
var HOLD = 5000,
  hs = 0,
  raf = 0,
  holding = false,
  btn = document.getElementById("btn"),
  fill = document.getElementById("fill"),
  lbl = document.getElementById("lbl");
function punch() {
  var o = openShift(),
    n = now();
  if (o) {
    o.e = nowHM();
  } else {
    S.push({ id: Date.now(), d: iso(n), s: nowHM(), e: "" });
    cur = iso(n).slice(0, 7);
  }
  save();
  render();
}
function hstep() {
  var t = Date.now() - hs;
  if (t >= HOLD) {
    hend();
    try {
      navigator.vibrate && navigator.vibrate(250);
    } catch (e) {}
    punch();
    return;
  }
  fill.style.width = (t / HOLD) * 100 + "%";
  lbl.textContent = "Keep holding… " + Math.ceil((HOLD - t) / 1000);
  raf = requestAnimationFrame(hstep);
}
function hbeg(e) {
  e.preventDefault();
  if (holding) return;
  holding = true;
  hs = Date.now();
  raf = requestAnimationFrame(hstep);
}
function hend() {
  if (!holding) return;
  holding = false;
  cancelAnimationFrame(raf);
  fill.style.width = "0";
  render();
}
btn.addEventListener("pointerdown", hbeg);
["pointerup", "pointercancel", "pointerleave"].forEach(function (n) {
  btn.addEventListener(n, hend);
});
btn.addEventListener("contextmenu", function (e) {
  e.preventDefault();
});

/* ============================================================
   7. MONTH ARROWS
   Moves to the previous or next month.
   ============================================================ */
function mv(k) {
  var y = +cur.slice(0, 4),
    m = +cur.slice(5, 7) - 1 + k;
  var t = new Date(y, m, 1);
  cur = t.getFullYear() + "-" + p2(t.getMonth() + 1);
  render();
}
document.getElementById("prev").onclick = function () {
  mv(-1);
};
document.getElementById("next").onclick = function () {
  mv(1);
};

/* ============================================================
   8. ADD / EDIT / DELETE A SHIFT
   The pop-up form to add or correct a shift, and what happens when you tap a row, Save or Delete.
   ============================================================ */
function sheet(x) {
  editId = x ? x.id : null;
  var al = x
    ? S.filter(function (y) {
        return y.d == x.d;
      }).sort(function (a, b) {
        return tm(a.s) - tm(b.s);
      })
    : [];
  document.getElementById("chips").innerHTML =
    al.length > 1
      ? al
          .map(function (y) {
            return (
              '<button data-id="' +
              y.id +
              '" class="' +
              (y.id === x.id ? "on" : "") +
              '">' +
              y.s +
              "</button>"
            );
          })
          .join("")
      : "";
  document.getElementById("stitle").textContent = x ? "Edit shift" : "Add a shift";
  document.getElementById("fd").value = fmt(dt(x ? x.d : iso(now())), true);
  document.getElementById("fd").placeholder = dph();
  document.getElementById("ferr").textContent = "";
  document.getElementById("fs").value = x ? x.s : "09:00";
  document.getElementById("fe").value = x ? x.e : "";
  document.getElementById("fdel").style.display = x ? "" : "none";
  document.getElementById("sheet").className = "sheet on";
}
function close() {
  document.getElementById("sheet").className = "sheet";
}
document.getElementById("add").onclick = function () {
  sheet(null);
};
document.getElementById("fcan").onclick = close;
document.getElementById("list").onclick = function (ev) {
  var pb = ev.target.closest(".pay");
  if (pb) {
    togglePaid(pb.dataset.d);
    return;
  }
  var r = ev.target.closest(".row");
  if (!r) return;
  var d = S.filter(function (x) {
    return String(x.id) === r.dataset.id;
  })[0];
  if (!d) return;
  var all = S.filter(function (x) {
    return x.d == d.d;
  }).sort(function (a, b) {
    return tm(a.s) - tm(b.s);
  });

  sheet(d);
};
document.getElementById("fsave").onclick = function () {
  var d = parseD(document.getElementById("fd").value),
    s = document.getElementById("fs").value,
    e = document.getElementById("fe").value;
  if (!d) {
    E("ferr").textContent = "Date not understood. Use " + dph() + ".";
    return;
  }
  if (!s) {
    E("ferr").textContent = "Please enter a start time.";
    return;
  }
  if (editId) {
    var x = S.filter(function (y) {
      return y.id === editId;
    })[0];
    x.d = d;
    x.s = s;
    x.e = e;
  } else S.push({ id: Date.now(), d: d, s: s, e: e });
  cur = d.slice(0, 7);
  save();
  close();
  render();
};
document.getElementById("fdel").onclick = function () {
  var id = editId;
  close();
  ask("Delete this shift?", "Delete", function () {
    S = S.filter(function (y) {
      return y.id !== id;
    });
    save();
    render();
  });
};

/* ============================================================
   9. COPY BACKUP
   The Copy backup button (puts your shifts on the clipboard as text).
   ============================================================ */
document.getElementById("copy").onclick = function () {
  var t =
      "date;day;start;end;worked;overtime\n" +
      S.slice()
        .sort(function (a, b) {
          return a.d < b.d ? -1 : a.d > b.d ? 1 : tm(a.s) - tm(b.s);
        })
        .map(function (x) {
          var u = dur(x);
          return [
            x.d,
            DAYS[dt(x.d).getDay()],
            x.s,
            x.e,
            u === null ? "" : f(u),
            u === null ? "" : f(u - goal(x.d), 1),
          ].join(";");
        })
        .join("\n"),
    m = document.getElementById("msg");
  try {
    navigator.clipboard.writeText(t).then(
      function () {
        m.textContent = "Backup copied. Paste it in a note or an email.";
      },
      function () {
        m.textContent = "Copy blocked by the browser.";
      },
    );
  } catch (e) {
    m.textContent = "Copy not available here.";
  }
};

/* ============================================================
   10. DISPLAY HELPERS
   How overtime is shown in a row, status messages, saving a file, and month totals (stat).
   ============================================================ */
function ov(x) {
  if (x.diff === null) return '<div class="ot"></div>';
  if (x.diff < 0) return '<div class="ot neg">' + f(x.diff, 1) + "</div>";
  var h =
    x.cnt !== x.diff
      ? '<small style="display:block;font-weight:400;color:var(--mu);font-size:12px">real ' +
        f(x.diff, 1) +
        "</small>"
      : "";
  if (x.cnt && x.paid)
    return (
      '<div class="ot" style="text-align:right"><span class="tag sat">Paid ✓</span><button class="pay" data-d="' +
      x.d +
      '">Undo</button></div>'
    );
  return (
    '<div class="ot ' +
    (x.cnt ? "pos" : "") +
    '" style="text-align:right">' +
    (x.cnt ? f(x.cnt, 1) : "0:00") +
    h +
    (x.cnt ? '<button class="pay" data-d="' + x.d + '">Mark paid</button>' : "") +
    "</div>"
  );
}
function say(t) {
  document.getElementById("msg").textContent = t;
}
function fp(m, s) {
  return f(m, s).replace("−", "-");
}
function wd(d) {
  return DAYS[dt(d).getDay()];
}
function saveFile(n, data) {
  try {
    var b = new Blob([data], {
        type:
          n.slice(-3) == "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = n;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 8000);
    say("Saved " + n + " (see your Downloads folder).");
  } catch (e) {
    say("Could not save the file.");
  }
}
function stat(ym) {
  var D = days(ym),
    ot = 0,
    pa = 0,
    sh = 0,
    lt = 0,
    wk = 0;
  D.forEach(function (x) {
    if (x.diff !== null) {
      wk += x.tot;
      if (x.diff > 0) {
        if (x.paid) pa += x.cnt;
        else ot += x.cnt;
      } else sh += x.diff;
    }
    if (x.late) lt++;
  });
  return { D: D, ot: ot, pa: pa, sh: sh, lt: lt, wk: wk };
}

/* ============================================================
   11. READING TIMES AND DATES FROM EXCEL
   pt() reads a time cell, pd() reads a date cell (including swapped day/month).
   ============================================================ */
function pt(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    var m = Math.round((v % 1) * 1440) % 1440;
    return p2(Math.floor(m / 60)) + ":" + p2(m % 60);
  }
  var a = String(v).match(/(\d{1,2}):(\d{2})/);
  return a ? p2(+a[1]) + ":" + a[2] : "";
}
function pd(v) {
  var r = pd0(v);
  if (SW && r) {
    var a = r.split("-");
    if (+a[2] <= 12) r = a[0] + "-" + a[2] + "-" + a[1];
  }
  return r;
}
function pd0(v) {
  if (v == null) return "";
  if (typeof v === "number") {
    var t = new Date(Math.round((v - 25569) * 86400000));
    return t.getUTCFullYear() + "-" + p2(t.getUTCMonth() + 1) + "-" + p2(t.getUTCDate());
  }
  var s = String(v).trim(),
    a = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (a) return a[1] + "-" + a[2] + "-" + a[3];
  a = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (a) {
    var y = +a[3];
    if (y < 100) y += 2000;
    return CF.df == "mdy"
      ? y + "-" + p2(+a[1]) + "-" + p2(+a[2])
      : y + "-" + p2(+a[2]) + "-" + p2(+a[1]);
  }
  return "";
}


/* ============================================================
   12. DIALOGS AND "MARK PAID"
   The reusable pop-up (choose/ask), plus marking overtime as paid and month helpers.
   ============================================================ */
function choose(t, x, opts) {
  document.getElementById("qt").textContent = t;
  document.getElementById("qx").textContent = x || "";
  var b = document.getElementById("qb");
  b.innerHTML = "";
  opts.forEach(function (o) {
    var e = document.createElement("button");
    e.textContent = o.l;
    if (o.p) e.className = "p";
    e.onclick = function () {
      qclose();
      if (o.fn) o.fn();
    };
    b.appendChild(e);
  });
  var c = document.createElement("button");
  c.textContent = "Cancel";
  c.onclick = qclose;
  b.appendChild(c);
  document.getElementById("qs").className = "sheet on";
}
function qclose() {
  document.getElementById("qs").className = "sheet";
}
function ask(x, yes, fn) {
  choose("Please confirm", x, [{ l: yes, fn: fn, p: 1 }]);
}
function setPaid(list, v) {
  S.forEach(function (x) {
    if (list.indexOf(x.d) >= 0) {
      if (v) x.paid = true;
      else delete x.paid;
    }
  });
  save();
  render();
}
function lab(d) {
  return wd(d) + " " + fmt(dt(d));
}
function togglePaid(d) {
  var g = days(d.slice(0, 7)).filter(function (x) {
    return x.d == d;
  })[0];
  if (!g) return;
  if (g.paid)
    ask("Count the overtime of " + lab(d) + " as pending again?", "Yes, undo", function () {
      setPaid([d], false);
    });
  else
    ask(
      "Confirm that management paid you " +
        f(g.cnt) +
        " of overtime for " +
        lab(d) +
        "? It will stop counting.",
      "Yes, I got it",
      function () {
        setPaid([d], true);
      },
    );
}
document.getElementById("stats").onclick = function (ev) {
  if (!ev.target.closest("#payall")) return;
  var D = days(cur).filter(function (x) {
      return x.cnt > 0 && !x.paid;
    }),
    t = 0;
  D.forEach(function (x) {
    t += x.cnt;
  });
  ask(
    "Confirm that management paid you all " +
      f(t) +
      " of overtime for " +
      MON[+cur.slice(5, 7) - 1] +
      "? It will stop counting.",
    "Yes, I got it",
    function () {
      setPaid(
        D.map(function (x) {
          return x.d;
        }),
        true,
      );
    },
  );
};
document.getElementById("chips").onclick = function (ev) {
  var b = ev.target.closest("button");
  if (!b) return;
  var d = S.filter(function (y) {
    return String(y.id) === b.dataset.id;
  })[0];
  if (d) sheet(d);
};
function months() {
  var m = {};
  S.forEach(function (x) {
    m[x.d.slice(0, 7)] = 1;
  });
  return Object.keys(m).sort();
}
function pick(D, o) {
  return (
    o
      ? D.filter(function (x) {
          return x.cnt > 0;
        })
      : D
  )
    .slice()
    .reverse();
}

/* ============================================================
   13. FRENCH TRANSLATION
   FR is a dictionary of exact texts, PT a list of patterns for texts with numbers. L() translates, tr() translates the whole screen.
   ============================================================ */
var FR = {
  "Works offline ✓": "Fonctionne hors ligne ✓",
  "Offline mode is not supported by this browser.": "Le mode hors ligne n'est pas pris en charge par ce navigateur.",
  "Please enter a start time.": "Entrez une heure de début.",
  "Manager view": "Vue direction",
  Full: "Complet",
  Columns: "Colonnes",
  "Month totals": "Totaux mensuels",
  "Backup sheet (all times, to import later)":
    "Feuille de sauvegarde (tous les horaires, pour réimporter)",
  "All / none": "Tout / rien",
  "Choose at least one month.": "Choisissez au moins un mois.",
  "Choose at least one column.": "Choisissez au moins une colonne.",
  Difference: "Écart",
  Export: "Exporter",
  "All days": "Tous les jours",
  "Overtime rule": "Règle des heures sup",
  "Ignore short overtime, round up to the hour":
    "Ignorer les petites heures sup, arrondir à l'heure",
  "Ignore short overtime, count exact time":
    "Ignorer les petites heures sup, compter le temps exact",
  "Count all overtime exactly": "Tout compter exactement",
  "Minimum overtime that counts (minutes)": "Heures sup minimum comptées (minutes)",
  "Changing the rule recalculates all days.": "Changer la règle recalcule tous les jours.",
  "+ Add a day": "+ Ajouter un jour",
  "Copy backup": "Copier la sauvegarde",
  "⚙ Settings": "⚙ Réglages",
  "⬆ Import": "⬆ Importer",
  "Edit shift": "Modifier le service",
  "Add a shift": "Ajouter un service",
  "Date the shift started": "Date de début du service",
  Start: "Début",
  "End (past midnight is fine)": "Fin (après minuit possible)",
  End: "Fin",
  Delete: "Supprimer",
  Cancel: "Annuler",
  Save: "Enregistrer",
  "No shift running": "Aucun service en cours",
  "■  Hold 5 s to END shift": "■  Maintenir 5 s pour TERMINER",
  "▶  Hold 5 s to START shift": "▶  Maintenir 5 s pour DÉMARRER",
  "Overtime to be paid": "Heures sup à payer",
  "Net balance": "Solde net",
  "Missing hours": "Heures manquantes",
  "Late arrivals (>20 min)": "Retards (>20 min)",
  "Overtime already paid": "Heures sup déjà payées",
  "No shifts this month": "Aucun service ce mois-ci",
  "In progress": "En cours",
  "4 h day": "Journée 4 h",
  "Paid ✓": "Payé ✓",
  Undo: "Annuler",
  "Mark paid": "Marquer payé",
  "Please confirm": "Veuillez confirmer",
  "Yes, undo": "Oui, annuler",
  "Yes, I got it": "Oui, je l'ai reçu",
  "Delete this shift?": "Supprimer ce service ?",
  "What do you want to export?": "Que voulez-vous exporter ?",
  Everything: "Tout",
  "Only days with overtime": "Seulement les jours avec heures sup",
  "Could not save the file.": "Impossible d'enregistrer le fichier.",
  "Could not read this file.": "Impossible de lire ce fichier.",
  "Excel library not loaded.": "Bibliothèque Excel non chargée.",
  "PDF library not loaded.": "Bibliothèque PDF non chargée.",
  "Backup copied. Paste it in a note or an email.":
    "Sauvegarde copiée. Collez-la dans une note ou un e-mail.",
  "Copy blocked by the browser.": "Copie bloquée par le navigateur.",
  "Copy not available here.": "Copie indisponible ici.",
  "Dates in this file": "Dates de ce fichier",
  Normal: "Telles quelles",
  "Swap day and month": "Inverser jour et mois",
  "Pick the second option if Excel flipped day and month (for example 1 Oct shown as 10 Jan).":
    "Choisissez la 2e option si Excel a inversé jour et mois (ex. 1 oct. affiché 10 janv.).",
  Settings: "Réglages",
  Language: "Langue",
  "Date format": "Format de date",
  "Time zone": "Fuseau horaire",
  "Automatic (phone)": "Automatique (téléphone)",
  "Set the app time manually (leave empty to keep)":
    "Régler l'heure de l'app à la main (vide = inchangée)",
  "Reset time": "Heure auto",
  "Day/Month/Year (17/11/2026)": "Jour/Mois/Année (17/11/2026)",
  "Month/Day/Year (11/17/2026)": "Mois/Jour/Année (11/17/2026)",
  "Year-Month-Day (2026-11-17)": "Année-Mois-Jour (2026-11-17)",
  "Shift in progress": "Service en cours",
  Day: "Jour",
  Worked: "Travaillé",
  Paid: "Payé",
  Comment: "Commentaire",
  Goal: "Objectif",
  "Overtime real": "Heures sup réelles",
  "Overtime counted": "Heures sup comptées",
  "Late (min)": "Retard (min)",
  Month: "Mois",
  "Overtime total": "Heures sup totales",
  "Overtime paid": "Heures sup payées",
  "Overtime pending": "Heures sup en attente",
  "Late days": "Jours de retard",
  Shifts: "Services",
  Days: "Jours",
  Months: "Mois",
  Overtime: "Heures sup",
  Late: "Retard",
  yes: "oui",
  "days with overtime": "jours avec heures sup",
  "all days": "tous les jours",
};
var PT = [
  [/^Not ready for offline\. Missing: (.+)\. Upload these files to GitHub, then open the app online twice\.$/, "Pas prêt pour le hors-ligne. Fichiers manquants : $1. Envoyez-les sur GitHub, puis ouvrez l'app en ligne deux fois."],
  [/^Date not understood\. Use (.+)\.$/, "Date non comprise. Utilisez $1."],
  [/^Started (.+) · (.+) so far$/, "Commencé à $1 · $2 jusqu'ici"],
  [/^Keep holding… (\d+)$/, "Continuez… $1"],
  [/^Mark all (.+) of this month as paid$/, "Marquer les $1 de ce mois comme payées"],
  [/^Worked (.+)$/, "Travaillé $1"],
  [/^Late \+(\d+) min$/, "Retard +$1 min"],
  [/^real (.+)$/, "réel $1"],
  [
    /^Count the overtime of (.+) as pending again\?$/,
    "Remettre les heures sup du $1 en attente ?",
  ],
  [
    /^Confirm that management paid you all (.+) of overtime for (.+)\? It will stop counting\.$/,
    "Confirmez que la direction vous a payé la totalité, $1 d'heures sup pour $2 ? Elles ne seront plus comptées.",
  ],
  [
    /^Confirm that management paid you (.+) of overtime for (.+)\? It will stop counting\.$/,
    "Confirmez que la direction vous a payé $1 d'heures sup pour $2 ? Elles ne seront plus comptées.",
  ],
  [/^Export (.+)$/, "Exporter $1"],
  [/^Saved (.+) \(see your Downloads folder\)\.$/, "Enregistré : $1 (voir Téléchargements)."],
  [
    /^Imported (\d+) shifts( \((\d+) already there, skipped\))?\.$/,
    function (m) {
      return (
        m[1] +
        " services importés" +
        (m[3] ? " (" + m[3] + " déjà présents, ignorés)" : "") +
        "."
      );
    },
  ],
  [
    /^Time zone: (.+?)( · correction (\S+) h)?$/,
    function (m) {
      return "Fuseau horaire : " + m[1] + (m[3] ? " · correction " + m[3] + " h" : "");
    },
  ],
  [
    /^Phone time zone: (.*)\. App time now: (\S+)( \(corrected (.+) min\))?$/,
    function (m) {
      return (
        "Fuseau du téléphone : " +
        m[1] +
        ". Heure de l'app : " +
        m[2] +
        (m[4] ? " (corrigée de " + m[4] + " min)" : "")
      );
    },
  ],
  [
    /^Goal 8 h \(Mon–Fri\)[\s\S]*$/,
    "Objectif 8 h (lun–ven), 4 h (sam). Les heures sup sont comptées par jour : moins de 50 min = 0, dès 50 min on arrondit à l'heure suivante. Retard = après 09:20. Les données restent sur ce téléphone : exportez de temps en temps pour sauvegarder. Les exports proposent tout ou seulement les jours avec heures sup. Touchez « Marquer payé » quand la direction vous a payé : ces heures ne comptent plus.",
  ],
  [
    /^Warning: this browser blocks storage[\s\S]*$/,
    "Attention : ce navigateur bloque le stockage, les données ne seront PAS conservées.",
  ],
  [/^Short day: worked (.+) of (.+) \((.+)\)$/, "Journée courte : travaillé $1 sur $2 ($3)"],
  [
    /^Overtime (\S+)( \(real (\S+)\))?( - paid)?$/,
    function (m) {
      return (
        "Heures sup " +
        m[1] +
        (m[3] ? " (réel " + m[3] + ")" : "") +
        (m[4] ? " - payées" : "")
      );
    },
  ],
  [
    /^Extra time under (\d+) min, not counted \(\+(.+)\)$/,
    "Moins de $1 min en plus, non compté (+$2)",
  ],
  [/^paid (.+) \/ pending (.+)$/, "payé $1 / en attente $2"],
  [/^Pending (.+) \/ Paid (.+)$/, "En attente $1 / Payé $2"],
];
function L(s) {
  if (LANG != "fr" || typeof s != "string") return s;
  var k = s.trim();
  if (!k) return s;
  if (FR.hasOwnProperty(k))
    return s.replace(k, function () {
      return FR[k];
    });
  for (var i = 0; i < PT.length; i++) {
    var m = k.match(PT[i][0]);
    if (m) {
      var r = typeof PT[i][1] == "function" ? PT[i][1](m) : k.replace(PT[i][0], PT[i][1]);
      return s.replace(k, function () {
        return r;
      });
    }
  }
  return s;
}
function tr() {
  var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT),
    n,
    a = [];
  while ((n = w.nextNode())) a.push(n);
  a.forEach(function (n) {
    if (/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName)) return;
    var v = L(n.nodeValue);
    if (v !== n.nodeValue) n.nodeValue = v;
  });
}
if (LANG == "fr") {
  document.documentElement.lang = "fr";
  var busy = false;
  new MutationObserver(function () {
    if (busy) return;
    busy = true;
    tr();
    busy = false;
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}

/* ============================================================
   14. EXCEL COMMENTS
   Builds the comment text (overtime, late, short day) for each day.
   ============================================================ */
function cm(x) {
  var a = [];
  if (x.live) a.push("Shift in progress");
  if (x.diff !== null) {
    if (x.diff < 0)
      a.push(
        "Short day: worked " + f(x.tot) + " of " + f(x.goal) + " (" + f(x.diff, 1) + ")",
      );
    else if (x.cnt > 0)
      a.push(
        "Overtime " +
          f(x.cnt) +
          (x.cnt !== x.diff ? " (real " + f(x.diff) + ")" : "") +
          (x.paid ? " - paid" : ""),
      );
    else if (x.diff > 0)
      a.push("Extra time under " + CF.otMin + " min, not counted (+" + f(x.diff) + ")");
  }
  if (x.late) a.push("Late +" + x.late + " min");
  return a.map(L).join("; ");
}

/* ============================================================
   15. SETTINGS SCREEN
   Opens the Settings pop-up, fills it from CF, and saves your choices.
   ============================================================ */
function closeS() {
  document.getElementById("ss").className = "sheet";
}
document.getElementById("clk").onclick = function () {
  var z = document.getElementById("sz");
  if (!z.options.length) {
    var zs = [];
    try {
      zs = Intl.supportedValuesOf("timeZone");
    } catch (e) {}
    if (!zs.length)
      zs = [
        "Africa/Casablanca",
        "Africa/Algiers",
        "Africa/Tunis",
        "Africa/Cairo",
        "Europe/Paris",
        "Europe/London",
        "Europe/Madrid",
        "Asia/Dubai",
        "America/New_York",
        "America/Montreal",
        "UTC",
      ];
    z.innerHTML =
      '<option value="">Automatic (phone)</option>' +
      zs
        .map(function (x) {
          return "<option>" + x + "</option>";
        })
        .join("");
  }
  document.getElementById("sl").value = CF.lang;
  document.getElementById("so").value = CF.otMode;
  document.getElementById("sm").value = CF.otMin;
  document.getElementById("sd").value = CF.df;
  z.value = CF.tz;
  document.getElementById("st").value = "";
  var dz = "";
  try {
    dz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (e) {}
  document.getElementById("sinfo").textContent =
    "Phone time zone: " +
    dz +
    ". App time now: " +
    hm(now()) +
    (CF.off ? " (corrected " + (CF.off > 0 ? "+" : "") + CF.off + " min)" : "");
  document.getElementById("ss").className = "sheet on";
};
document.getElementById("scn").onclick = closeS;
document.getElementById("srs").onclick = function () {
  CF.off = 0;
  saveCF();
  closeS();
  render();
};
document.getElementById("ssv").onclick = function () {
  var nl = document.getElementById("sl").value,
    tv = document.getElementById("st").value;
  CF.df = document.getElementById("sd").value;
  CF.tz = document.getElementById("sz").value;
  CF.otMode = document.getElementById("so").value;
  CF.otMin = Math.max(0, Math.min(59, Math.round(+document.getElementById("sm").value) || 0));
  if (tv) {
    CF.off = 0;
    var b = now(),
      d = tm(tv) - (b.getHours() * 60 + b.getMinutes());
    CF.off = ((((d + 720) % 1440) + 1440) % 1440) - 720;
  }
  var ch = nl != CF.lang;
  CF.lang = nl;
  saveCF();
  closeS();
  if (ch) location.reload();
  else {
    E("msg").textContent = noteText();
    render();
  }
};
if (LANG == "fr") tr();

/* ============================================================
   16. EXPORT TO EXCEL / PDF
   Export pop-up (months, columns), then build() prepares the rows and exportX()/exportP() make the files.
   ============================================================ */
function E(i) {
  return document.getElementById(i);
}
var COLS = [
    ["date", "Date"],
    ["day", "Day"],
    ["start", "Start"],
    ["end", "End"],
    ["worked", "Worked"],
    ["goal", "Goal"],
    ["diff", "Difference"],
    ["ot", "Overtime"],
    ["paid", "Paid"],
    ["late", "Late (min)"],
    ["cm", "Comment"],
  ],
  ALLC = COLS.map(function (c) {
    return c[0];
  }),
  EK = "xl";
if (!CF.ex) CF.ex = { cols: ALLC, oo: false, tot: true, bk: true };
function cl(k) {
  return L(
    COLS.filter(function (c) {
      return c[0] == k;
    })[0][1],
  );
}
function noteText() {
  var X = CF.otMin,
    fr = LANG == "fr",
    r =
      CF.otMode == "all"
        ? fr
          ? "Toutes les heures sup sont comptées exactement."
          : "All overtime is counted exactly."
        : CF.otMode == "exact"
          ? fr
            ? "Heures sup comptées par jour : moins de " +
              X +
              " min = 0, au-delà le temps exact compte."
            : "Overtime is counted per day: under " +
              X +
              " min = 0, above that the exact time counts."
          : fr
            ? "Heures sup comptées par jour : moins de " +
              X +
              " min = 0, dès " +
              X +
              " min on arrondit à l'heure suivante."
            : "Overtime is counted per day: under " +
              X +
              " min = 0, from " +
              X +
              " min it rounds up to the next hour.";
  return fr
    ? "Objectif 8 h (lun–ven), 4 h (sam). " +
        r +
        " Retard = après 09:20. Les données restent sur ce téléphone : exportez de temps en temps pour sauvegarder. Touchez « Marquer payé » quand la direction vous a payé : ces heures ne comptent plus."
    : "Goal 8 h (Mon–Fri), 4 h (Sat). " +
        r +
        ' Late = after 09:20. Data stays on this phone, so export now and then as a backup. Tap "Mark paid" once management has paid you: that overtime stops counting.';
}
function cv(k, x) {
  var r = { s: "", n: null };
  if (k == "date") r.s = fmt(dt(x.d), true);
  else if (k == "day") r.s = wd(x.d);
  else if (k == "start")
    r.s = x.it
      .map(function (i) {
        return i.s;
      })
      .join(" / ");
  else if (k == "end")
    r.s = x.it
      .map(function (i) {
        return i.e || "";
      })
      .join(" / ");
  else if (k == "worked") {
    if (x.done) {
      r.n = x.tot;
      r.s = f(x.tot);
    }
  } else if (k == "goal") {
    r.n = x.goal;
    r.s = f(x.goal);
  } else if (k == "diff") {
    if (x.diff !== null) r.s = f(x.diff, 1);
  } else if (k == "ot") {
    if (x.cnt > 0) {
      r.n = x.cnt;
      r.s = f(x.cnt);
    }
  } else if (k == "paid") r.s = x.paid && x.cnt ? L("yes") : "";
  else if (k == "late") r.s = x.late ? String(x.late) : "";
  else if (k == "cm") r.s = cm(x);
  return r;
}
function tv(k, s, lab) {
  var r = { s: "", n: null };
  if (k == "date") r.s = lab;
  else if (k == "worked") {
    r.n = s.wk;
    r.s = f(s.wk);
  } else if (k == "ot") {
    r.n = s.ot + s.pa;
    r.s = f(s.ot + s.pa);
  } else if (k == "paid") r.s = L("paid " + f(s.pa) + " / pending " + f(s.ot));
  else if (k == "late") r.s = s.lt ? String(s.lt) : "";
  return r;
}
function build(ms, cols, oo, tot) {
  var rows = [];
  ms.forEach(function (ym) {
    var s = stat(ym),
      y = ym.slice(0, 4),
      m = +ym.slice(5, 7);
    rows.push({ t: "m", c: [{ s: MON[m - 1] + " " + y }] });
    pick(s.D, oo).forEach(function (x) {
      rows.push({
        t: "d",
        c: cols.map(function (k) {
          return cv(k, x);
        }),
      });
    });
    if (tot) {
      var lab = "TOTAL " + MON[m - 1] + " " + y,
        c = cols.map(function (k) {
          return tv(k, s, lab);
        });
      if (!c[0].s) c[0] = { s: lab, n: null };
      rows.push({ t: "t", c: c });
    }
  });
  return rows;
}
function exportX(R, cols, ms, oo, bk) {
  if (!window.XLSX) {
    say("Excel library not loaded.");
    return;
  }
  var a = [cols.map(cl)];
  R.forEach(function (r) {
    if (r.t == "m") {
      a.push([r.c[0].s]);
      return;
    }
    a.push(
      r.c.map(function (c) {
        return c.n != null ? { t: "n", v: c.n / 1440, z: "[h]:mm" } : c.s;
      }),
    );
    if (r.t == "t") a.push([]);
  });
  var wb = XLSX.utils.book_new(),
    w = XLSX.utils.aoa_to_sheet(a);
  w["!cols"] = cols.map(function () {
    return { wch: 18 };
  });
  XLSX.utils.book_append_sheet(wb, w, L("Days"));
  if (bk) {
    var sh = [["Date", "Day", "Start", "End", "Worked", "Paid", "Comment"].map(L)];
    ms.forEach(function (ym) {
      pick(days(ym), oo).forEach(function (x) {
        x.it.forEach(function (i, j) {
          var u = dur(i);
          sh.push([
            x.d,
            wd(x.d),
            i.s,
            i.e,
            u === null ? "" : f(u),
            x.paid ? L("yes") : "",
            j == 0 ? cm(x) : "",
          ]);
        });
      });
    });
    var w2 = XLSX.utils.aoa_to_sheet(sh);
    w2["!cols"] = sh[0].map(function () {
      return { wch: 16 };
    });
    XLSX.utils.book_append_sheet(wb, w2, L("Shifts"));
  }
  saveFile(
    "pointages-" + (ms.length == 1 ? ms[0] : "months") + ".xlsx",
    XLSX.write(wb, { bookType: "xlsx", type: "array" }),
  );
}
function exportP(R, cols, ms) {
  var J = window.jspdf;
  if (!J || !J.jsPDF) {
    say("PDF library not loaded.");
    return;
  }
  var doc = new J.jsPDF({ orientation: cols.length > 6 ? "landscape" : "portrait" }),
    li = cols.indexOf("late"),
    B = { fontStyle: "bold", fillColor: [225, 232, 245] };
  var body = R.map(function (r) {
    if (r.t == "m")
      return [
        {
          content: r.c[0].s,
          colSpan: cols.length,
          styles: { fontStyle: "bold", fillColor: [37, 99, 235], textColor: 255 },
        },
      ];
    return r.c.map(function (c) {
      return r.t == "t" ? { content: c.s, styles: B } : c.s;
    });
  });
  doc.setFontSize(16);
  doc.text("Pointages", 14, 16);
  doc.autoTable({
    startY: 22,
    head: [cols.map(cl)],
    body: body,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    didParseCell: function (h) {
      if (
        h.section === "body" &&
        li >= 0 &&
        h.column.index === li &&
        typeof h.cell.raw === "string" &&
        h.cell.raw
      )
        h.cell.styles.textColor = [217, 58, 58];
    },
  });
  saveFile(
    "pointages-" + (ms.length == 1 ? ms[0] : "months") + ".pdf",
    doc.output("arraybuffer"),
  );
}
function setCols(a) {
  [].forEach.call(document.querySelectorAll("#ec input"), function (i) {
    i.checked = a.indexOf(i.value) >= 0;
  });
}
function openExp(k) {
  EK = k;
  var ex = CF.ex,
    ms = months().reverse();
  E("et").textContent = "Export " + (k == "xl" ? "Excel" : "PDF");
  E("em").innerHTML = ms
    .map(function (m) {
      return (
        '<label class="ck"><input type="checkbox" value="' +
        m +
        '"' +
        (m == cur ? " checked" : "") +
        ">" +
        MON[+m.slice(5, 7) - 1] +
        " " +
        m.slice(0, 4) +
        "</label>"
      );
    })
    .join("");
  E("ec").innerHTML = COLS.map(function (c) {
    return (
      '<label class="ck"><input type="checkbox" value="' +
      c[0] +
      '"' +
      (ex.cols.indexOf(c[0]) >= 0 ? " checked" : "") +
      ">" +
      c[1] +
      "</label>"
    );
  }).join("");
  E("eo").value = ex.oo ? "ot" : "all";
  E("etot").checked = ex.tot;
  E("eb").checked = ex.bk;
  E("ebw").style.display = k == "xl" ? "" : "none";
  E("eerr").textContent = "";
  E("es").className = "sheet on";
}
E("xl").onclick = function () {
  openExp("xl");
};
E("pdf").onclick = function () {
  openExp("pdf");
};
E("pm").onclick = function () {
  setCols(["date", "day", "ot"]);
  E("eo").value = "ot";
  E("etot").checked = true;
  E("eb").checked = false;
};
E("pf").onclick = function () {
  setCols(ALLC);
  E("eo").value = "all";
  E("etot").checked = true;
  E("eb").checked = true;
};
E("ema").onclick = function () {
  var b = [].slice.call(document.querySelectorAll("#em input")),
    all = b.every(function (i) {
      return i.checked;
    });
  b.forEach(function (i) {
    i.checked = !all;
  });
};
E("ecn").onclick = function () {
  E("es").className = "sheet";
};
E("eok").onclick = function () {
  var q = function (s) {
      return [].filter
        .call(document.querySelectorAll(s), function (i) {
          return i.checked;
        })
        .map(function (i) {
          return i.value;
        });
    },
    ms = q("#em input").sort(),
    cols = q("#ec input");
  if (!ms.length) {
    E("eerr").textContent = "Choose at least one month.";
    return;
  }
  if (!cols.length) {
    E("eerr").textContent = "Choose at least one column.";
    return;
  }
  var oo = E("eo").value == "ot",
    tot = E("etot").checked;
  CF.ex = { cols: cols, oo: oo, tot: tot, bk: E("eb").checked };
  saveCF();
  E("es").className = "sheet";
  var R = build(ms, cols, oo, tot);
  EK == "xl" ? exportX(R, cols, ms, oo, E("eb").checked) : exportP(R, cols, ms);
};
E("msg").textContent = noteText();

/* ============================================================
   17. IMPORT FROM EXCEL
   Import guide, template download, reading the file (parseImp) and the preview (showImp) before anything is added.
   ============================================================ */
function B(en, fr) {
  return LANG == "fr" ? fr : en;
}
function openImp() {
  choose(
    B("Import from Excel", "Importer depuis Excel"),
    B(
      "One row per shift, first row = column titles, in any order:\n• Date: 17/11/2026 or 2026-11-17\n• Start: 09:04\n• End: 17:20 (empty if still running)\n• Paid: optional, write yes\nOther columns are ignored. Shifts already in the app are skipped. Not sure? Download the template.",
      "Une ligne par service, 1re ligne = titres des colonnes, dans n'importe quel ordre :\n• Date : 17/11/2026 ou 2026-11-17\n• Début : 09:04\n• Fin : 17:20 (vide si en cours)\n• Payé : facultatif, écrire oui\nLes autres colonnes sont ignorées. Les services déjà dans l'app sont ignorés. Pas sûr ? Téléchargez le modèle.",
    ),
    [
      {
        l: B("Choose a file", "Choisir un fichier"),
        p: 1,
        fn: function () {
          E("file").click();
        },
      },
      { l: B("Download template", "Télécharger le modèle"), fn: tpl },
    ],
  );
}
function tpl() {
  if (!window.XLSX) {
    say("Excel library not loaded.");
    return;
  }
  var a = [
      [B("Date", "Date"), B("Start", "Début"), B("End", "Fin"), B("Paid", "Payé")],
      ["2026-11-17", "09:04", "17:20", ""],
      ["2026-11-18", "08:55", "17:10", ""],
    ],
    wb = XLSX.utils.book_new(),
    w = XLSX.utils.aoa_to_sheet(a);
  w["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, w, "Shifts");
  saveFile("pointages-template.xlsx", XLSX.write(wb, { bookType: "xlsx", type: "array" }));
}
function parseImp(rows, sw) {
  SW = sw;
  var hi = -1,
    mp = null,
    re = {
      date: /^\s*date/i,
      start: /^\s*(start|d[ée]but)/i,
      end: /^\s*(end|fin)\b/i,
      paid: /^\s*(paid|pay[ée])/i,
    };
  for (var i = 0; i < Math.min(rows.length, 6) && hi < 0; i++) {
    var m = {};
    (rows[i] || []).forEach(function (v, j) {
      if (typeof v != "string") return;
      for (var k in re) if (m[k] == null && re[k].test(v)) m[k] = j;
    });
    if (m.date != null && m.start != null) {
      hi = i;
      mp = m;
    }
  }
  var legacy = hi < 0;
  if (legacy) mp = { start: 0, end: 1, date: 2 };
  var ok = [],
    bad = [],
    dup = 0;
  rows.forEach(function (w, i) {
    if (i <= hi || !w) return;
    var dv = w[mp.date],
      sv = w[mp.start];
    if ((dv == null || dv === "") && (sv == null || sv === "")) return;
    var d = pd(dv),
      s = pt(sv),
      e = mp.end != null ? pt(w[mp.end]) : "";
    if (!d) {
      bad.push(i + 1 + ": " + B("date not understood", "date non comprise"));
      return;
    }
    if (!s) {
      bad.push(i + 1 + ": " + B("no start time", "pas d'heure de début"));
      return;
    }
    if (
      S.some(function (x) {
        return x.d == d && x.s == s;
      }) ||
      ok.some(function (x) {
        return x.d == d && x.s == s;
      })
    ) {
      dup++;
      return;
    }
    ok.push({
      d: d,
      s: s,
      e: e,
      paid: mp.paid != null && /^(y|o|1|x)/i.test(String(w[mp.paid] || "")),
    });
  });
  SW = false;
  return { ok: ok, bad: bad, dup: dup, mp: mp, legacy: legacy };
}
function showImp(rows, sw) {
  var P = parseImp(rows, sw),
    mp = P.mp;
  var cols = P.legacy
    ? B(
        "No title row found, so I read column A = start, B = end, C = date.",
        "Pas de ligne de titres : colonne A = début, B = fin, C = date.",
      )
    : B("Columns found: ", "Colonnes trouvées : ") +
      [
        ["date", "Date"],
        ["start", B("Start", "Début")],
        ["end", B("End", "Fin")],
        ["paid", B("Paid", "Payé")],
      ]
        .filter(function (c) {
          return mp[c[0]] != null;
        })
        .map(function (c) {
          return c[1] + " = " + XLSX.utils.encode_col(mp[c[0]]);
        })
        .join(", ") +
      ".";
  var ex = P.ok
    .slice(0, 3)
    .map(function (x) {
      var d = dt(x.d);
      return (
        "  " + fmt(d, true) + "  " + DAYS[d.getDay()] + "  " + x.s + " → " + (x.e || "…")
      );
    })
    .join("\n");
  var txt =
      cols +
      "\n" +
      P.ok.length +
      B(" shifts to import", " services à importer") +
      (P.dup ? ", " + P.dup + B(" already in the app", " déjà dans l'app") : "") +
      (P.bad.length
        ? ", " +
          P.bad.length +
          B(" rows skipped", " lignes ignorées") +
          " (" +
          P.bad
            .slice(0, 3)
            .map(function (b) {
              return B("row ", "ligne ") + b;
            })
            .join("; ") +
          (P.bad.length > 3 ? "…" : "") +
          ")"
        : "") +
      "." +
      (ex
        ? "\n" +
          B("Check the dates and days:", "Vérifiez les dates et les jours :") +
          "\n" +
          ex
        : ""),
    opts = [];
  if (P.ok.length)
    opts.push({
      l: B("Import ", "Importer ") + P.ok.length,
      p: 1,
      fn: function () {
        P.ok.forEach(function (x, i) {
          var n = { id: Date.now() + i, d: x.d, s: x.s, e: x.e };
          if (x.paid) n.paid = true;
          S.push(n);
        });
        cur = P.ok
          .map(function (x) {
            return x.d;
          })
          .sort()
          .pop()
          .slice(0, 7);
        save();
        render();
        say("Imported " + P.ok.length + " shifts.");
      },
    });
  opts.push({
    l: sw
      ? B("Undo the swap", "Annuler l'inversion")
      : B("Day and month look wrong? Swap them", "Jour et mois faux ? Les inverser"),
    fn: function () {
      showImp(rows, !sw);
    },
  });
  choose(B("Check the import", "Vérifier l'import"), txt, opts);
}
E("imp").onclick = openImp;
E("file").onchange = function (ev) {
  var fl = ev.target.files[0];
  if (!fl) return;
  if (!window.XLSX) {
    say("Excel library not loaded.");
    return;
  }
  var r = new FileReader();
  r.onload = function () {
    try {
      var wb = XLSX.read(r.result, { type: "array" }),
        nm =
          wb.SheetNames.filter(function (n) {
            return /^(shifts|services)$/i.test(n);
          })[0] || wb.SheetNames[0];
      showImp(XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, raw: true }), false);
    } catch (x) {
      say("Could not read this file.");
    }
  };
  r.readAsArrayBuffer(fl);
  ev.target.value = "";
};

/* ============================================================
   18. TYPING A DATE IN YOUR FORMAT
   Placeholder text and parsing for the date field, following your Date format setting.
   ============================================================ */
function dph() {
  var f = CF.df,
    fr = LANG == "fr";
  return f == "mdy"
    ? fr
      ? "mm/jj/aaaa"
      : "mm/dd/yyyy"
    : f == "iso"
      ? fr
        ? "aaaa-mm-jj"
        : "yyyy-mm-dd"
      : fr
        ? "jj/mm/aaaa"
        : "dd/mm/yyyy";
}
function parseD(v) {
  var a = String(v)
    .trim()
    .match(/^(\d{1,4})[\/\-. ](\d{1,2})[\/\-. ](\d{1,4})$/);
  if (!a) return "";
  var y, m, d;
  if (CF.df == "iso") {
    y = +a[1];
    m = +a[2];
    d = +a[3];
  } else if (CF.df == "mdy") {
    m = +a[1];
    d = +a[2];
    y = +a[3];
  } else {
    d = +a[1];
    m = +a[2];
    y = +a[3];
  }
  if (y < 100) y += 2000;
  var t = new Date(y, m - 1, d);
  if (t.getFullYear() != y || t.getMonth() != m - 1 || t.getDate() != d) return "";
  return iso(t);
}

/* ============================================================
   19. START
   Draw the screen once, then redraw every 30 seconds so the clock stays right.
   ============================================================ */
render();
setInterval(render, 30000);

/* Offline check: asks the browser which files are saved for offline use and shows the result under the clock. */
function offlineCheck() {
  var el = E("off");
  if (!el) return;
  if (!("serviceWorker" in navigator) || !window.caches) {
    el.textContent = "Offline mode is not supported by this browser.";
    return;
  }
  navigator.serviceWorker.ready
    .then(function () { return caches.keys(); })
    .then(function (keys) {
      var k = keys.filter(function (x) { return x.indexOf("pointages-") == 0; })[0];
      return k ? caches.open(k).then(function (c) { return c.keys(); }) : [];
    })
    .then(function (reqs) {
      var urls = reqs.map(function (r) { return r.url; });
      var need = ["app.js", "style.css", "manifest.webmanifest", "lib/xlsx.full.min.js", "lib/jspdf.umd.min.js", "lib/jspdf.plugin.autotable.min.js"];
      var miss = need.filter(function (n) { return !urls.some(function (u) { return u.slice(-n.length) == n; }); });
      if (!urls.some(function (u) { return u.slice(-1) == "/" || u.slice(-10) == "index.html"; })) miss.unshift("index.html");
      el.textContent = miss.length ? "Not ready for offline. Missing: " + miss.join(", ") + ". Upload these files to GitHub, then open the app online twice." : "Works offline ✓";
    })
    .catch(function () {});
}
offlineCheck();
setTimeout(offlineCheck, 4000);

