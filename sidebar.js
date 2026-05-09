(function () {
  "use strict";

  // ── Jalali ↔ Gregorian ───────────────────────────────────────
  // gToJ: converts Gregorian date to Jalali
  function gToJ(gy, gm, gd) {
    gy -= 1600; gm -= 1; gd -= 1;
    var g = 365 * gy
      + Math.floor((gy + 3) / 4)
      - Math.floor((gy + 99) / 100)
      + Math.floor((gy + 399) / 400);
    [31,28,31,30,31,30,31,31,30,31,30,31].forEach(function(v,i){ if(i<gm) g+=v; });
    if (gm > 1 && ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0)) g++;
    g += gd;

    var j = g - 79;
    var jp = Math.floor(j / 12053); j %= 12053;
    var jy = 979 + 33 * jp + 4 * Math.floor(j / 1461); j %= 1461;
    if (j >= 366) { jy += Math.floor((j - 1) / 365); j = (j - 1) % 365; }

    var jm = 0;
    var jDays = [31,31,31,31,31,31,30,30,30,30,30,29];
    while (jm < 11 && j >= jDays[jm]) { j -= jDays[jm]; jm++; }
    return { y: jy, m: jm + 1, d: j + 1 };
  }

  // jToG: converts Jalali date to Gregorian
  function jToG(jy, jm, jd) {
    jy -= 979; jm -= 1; jd -= 1;
    var jDays = [31,31,31,31,31,31,30,30,30,30,30,29];
    var j = 365 * jy + Math.floor(jy / 33) * 8 + Math.floor((jy % 33 + 3) / 4);
    for (var i = 0; i < jm; i++) j += jDays[i];
    j += jd;

    var g = j + 79;
    var gy = 1600 + 400 * Math.floor(g / 146097); g %= 146097;
    var leap = true;
    if (g >= 36525) {
      g--; gy += 100 * Math.floor(g / 36524); g %= 36524;
      if (g >= 365) g++; else leap = false;
    }
    gy += 4 * Math.floor(g / 1461); g %= 1461;
    if (g >= 366) { leap = false; g--; gy += Math.floor(g / 365); g %= 365; }

    var gDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var gm = 0;
    while (g >= gDays[gm]) { g -= gDays[gm]; gm++; }
    return { y: gy, m: gm + 1, d: g + 1 };
  }

  function jToISO(jy, jm, jd) {
    var g = jToG(jy, jm, jd);
    return g.y + "-" + pad(g.m) + "-" + pad(g.d);
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  // ── State ────────────────────────────────────────────────────
  var allData = null;   // indexed JSON: { app_id: { publisher_name, positions: { pos_id: { desc, type, rows: [[date, adv, pv]...] } } } }
  var scanResult = null;
  var analysisResult = null;

  // ── DOM ──────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  var closeBtn      = $("close-btn");
  var analyzeBtn    = $("analyze-btn");
  var moreBtn       = $("more-btn");
  var dataStatus    = $("data-status");
  var pageInfo      = $("page-info");
  var pageHost      = $("page-host");
  var appIdBadge    = $("app-id-badge");
  var resultsSection = $("results-section");
  var positionsList = $("positions-list");
  var totalRpmEl    = $("total-rpm");
  var publisherNameEl = $("publisher-name");
  var loadingEl     = $("loading");
  var loadingText   = $("loading-text");

  // ── Events ───────────────────────────────────────────────────
  closeBtn.addEventListener("click", function () {
    window.parent.postMessage({ type: "CLOSE_SIDEBAR" }, "*");
  });

  analyzeBtn.addEventListener("click", function () {
    if (!allData || !scanResult || !scanResult.appId) return;
    showLoading("در حال آنالیز...");
    setTimeout(function () {
      try { runAnalysis(); } catch(e) { console.error("Analysis error:", e); }
      hideLoading();
    }, 30);
  });

  moreBtn.addEventListener("click", function () {
    if (!analysisResult) return;
    moreBtn.textContent = "⏳ در حال تهیه گزارش...";
    moreBtn.disabled = true;
    window.parent.postMessage({ type: "GENERATE_REPORT", data: analysisResult }, "*");
  });

  window.addEventListener("message", function (e) {
    if (!e.data) return;
    if (e.data.type === "SCAN_RESULT") {
      scanResult = e.data;
      renderPageInfo();
      updateAnalyzeBtn();
    }
    if (e.data.type === "REPORT_DONE") {
      moreBtn.textContent = "✓ گزارش باز شد";
      moreBtn.disabled = false;
    }
  });

  // ── Date pickers ─────────────────────────────────────────────
  var MONTHS = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور",
                "مهر","آبان","آذر","دی","بهمن","اسفند"];

  function initDatePickers() {
    var now = new Date();
    var todayJ = gToJ(now.getFullYear(), now.getMonth() + 1, now.getDate());
    // Default from: start of data (1404/01/01)
    var fromJ = { y: 1404, m: 1, d: 1 };

    ["from", "to"].forEach(function (p) {
      var ysel = $(p + "-year");
      var msel = $(p + "-month");
      var dsel = $(p + "-day");
      var src  = p === "from" ? fromJ : todayJ;

      for (var y = 1402; y <= todayJ.y + 1; y++) {
        var o = document.createElement("option");
        o.value = y; o.textContent = y;
        ysel.appendChild(o);
      }
      MONTHS.forEach(function (name, i) {
        var o = document.createElement("option");
        o.value = i + 1; o.textContent = name;
        msel.appendChild(o);
      });
      for (var d = 1; d <= 31; d++) {
        var o = document.createElement("option");
        o.value = d; o.textContent = d;
        dsel.appendChild(o);
      }

      ysel.value = src.y;
      msel.value = src.m;
      dsel.value = src.d;
    });
  }

  function getDateRange() {
    return {
      from: jToISO(+$("from-year").value, +$("from-month").value, +$("from-day").value),
      to:   jToISO(+$("to-year").value,   +$("to-month").value,   +$("to-day").value),
    };
  }

  // ── Load JSON data ───────────────────────────────────────────
  async function loadData() {
    try {
      var url = chrome.runtime.getURL("data/publisher_data.json");
      var res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      allData = await res.json();
      var count = Object.values(allData).reduce(function(s, pub) {
        return s + Object.values(pub.positions).reduce(function(s2, pos) { return s2 + pos.rows.length; }, 0);
      }, 0);
      dataStatus.textContent = "✓ " + count.toLocaleString("fa") + " ردیف بارگذاری شد";
      dataStatus.className = "data-status ok";
      updateAnalyzeBtn();
    } catch (e) {
      console.error("Data load error:", e);
      dataStatus.textContent = "خطا: " + e.message;
      dataStatus.className = "data-status err";
    }
  }

  // ── Page info ────────────────────────────────────────────────
  function renderPageInfo() {
    if (!scanResult) return;
    try {
      pageHost.textContent = new URL(scanResult.pageUrl).hostname;
    } catch (_) {
      pageHost.textContent = scanResult.pageUrl;
    }
    if (scanResult.appId) {
      appIdBadge.textContent = scanResult.appId;
      appIdBadge.style.background = "";
    } else {
      appIdBadge.textContent = "بدون App ID";
      appIdBadge.style.background = "#e53935";
    }
    pageInfo.classList.remove("hidden");
  }

  function updateAnalyzeBtn() {
    var ready = allData && scanResult && scanResult.appId && scanResult.positionIds && scanResult.positionIds.length > 0;
    analyzeBtn.disabled = !ready;
    if (allData && scanResult && !scanResult.appId) {
      analyzeBtn.textContent = "App ID یافت نشد";
    } else if (allData && scanResult && scanResult.positionIds && scanResult.positionIds.length === 0) {
      analyzeBtn.textContent = "پوزیشنی یافت نشد";
    } else {
      analyzeBtn.textContent = "آنالیز کن";
    }
  }

  // ── Analysis ─────────────────────────────────────────────────
  function runAnalysis() {
    var range = getDateRange();
    var appId = scanResult.appId;
    var positionIds = scanResult.positionIds;

    var pubData = allData[appId];
    if (!pubData) {
      showNoAppIdError(appId);
      return;
    }

    var matched = [], unmatched = [];

    positionIds.forEach(function (posId) {
      var posData = pubData.positions[posId];
      if (!posData) { unmatched.push(posId); return; }

      var rows = posData.rows.filter(function (r) {
        return r[0] >= range.from && r[0] <= range.to;
      });
      if (!rows.length) { unmatched.push(posId); return; }

      var valid = rows.filter(function (r) { return r[2] > 0; });
      var rpm = valid.length
        ? valid.reduce(function (s, r) { return s + r[1] / r[2]; }, 0) / valid.length
        : null;

      matched.push({
        positionId: posId,
        rpm: rpm,
        description: posData.desc || "",
        positionType: posData.type || "",
        publisherName: pubData.publisher_name || "",
        totalAdv: rows.reduce(function (s, r) { return s + r[1]; }, 0),
        totalPv:  rows.reduce(function (s, r) { return s + r[2]; }, 0),
        rowCount: rows.length,
      });
    });

    // Total publisher RPM: sum all-positions adv per date / max pv per date
    var byDate = {};
    Object.values(pubData.positions).forEach(function (posData) {
      posData.rows.forEach(function (r) {
        if (r[0] < range.from || r[0] > range.to) return;
        if (!byDate[r[0]]) byDate[r[0]] = { adv: 0, pv: 0 };
        byDate[r[0]].adv += r[1];
        byDate[r[0]].pv = Math.max(byDate[r[0]].pv, r[2]);
      });
    });
    var dateEntries = Object.values(byDate).filter(function (d) { return d.pv > 0; });
    var totalRpm = dateEntries.length
      ? dateEntries.reduce(function (s, d) { return s + d.adv / d.pv; }, 0) / dateEntries.length
      : null;

    analysisResult = {
      matched: matched,
      unmatched: unmatched,
      totalRpm: totalRpm,
      publisherName: pubData.publisher_name || "",
      from: range.from,
      to: range.to,
      appId: appId,
      positionIds: positionIds,
      pageUrl: scanResult.pageUrl,
      pageTitle: scanResult.pageTitle,
    };

    renderResults(analysisResult);
  }

  function showNoAppIdError(appId) {
    hideLoading();
    resultsSection.classList.add("hidden");
    dataStatus.textContent = 'App ID "' + appId + '" در داده‌ها یافت نشد';
    dataStatus.className = "data-status err";
  }

  function renderResults(res) {
    totalRpmEl.textContent = res.totalRpm !== null ? res.totalRpm.toFixed(4) : "N/A";
    publisherNameEl.textContent = res.publisherName || "";

    positionsList.innerHTML = "";

    res.matched.forEach(function (item) {
      var card = document.createElement("div");
      card.className = "pos-card";
      var rpmStr = item.rpm !== null ? item.rpm.toFixed(4) : "N/A";
      card.innerHTML =
        '<div class="pos-header">' +
          '<span class="pos-id">ynpos-' + item.positionId + '</span>' +
          (item.positionType ? '<span class="pos-type">' + item.positionType + '</span>' : '') +
        '</div>' +
        (item.description ? '<div class="pos-desc">' + item.description + '</div>' : '') +
        '<div class="pos-rpm' + (item.rpm === null ? ' na' : '') + '">' + rpmStr + '</div>' +
        '<div class="pos-meta">' +
          '<span>' + item.rowCount + ' روز</span>' +
          '<span>' + Math.round(item.totalAdv).toLocaleString() + ' ﷼ هزینه</span>' +
          '<span>' + Math.round(item.totalPv / Math.max(item.rowCount, 1)).toLocaleString() + ' PV/روز</span>' +
        '</div>';
      positionsList.appendChild(card);
    });

    if (res.unmatched.length > 0) {
      var sep = document.createElement("p");
      sep.style.cssText = "font-size:11px;color:#90a4ae;padding:6px 2px 3px;";
      sep.textContent = "پوزیشن‌های بدون داده در این بازه:";
      positionsList.appendChild(sep);
      res.unmatched.forEach(function (posId) {
        var card = document.createElement("div");
        card.className = "pos-card no-data";
        card.innerHTML =
          '<div class="pos-header">' +
            '<span class="pos-id">ynpos-' + posId + '</span>' +
            '<span class="pos-type">بدون داده</span>' +
          '</div>';
        positionsList.appendChild(card);
      });
    }

    resultsSection.classList.remove("hidden");
  }

  function showLoading(msg) {
    loadingText.textContent = msg || "در حال پردازش...";
    loadingEl.classList.remove("hidden");
    resultsSection.classList.add("hidden");
  }

  function hideLoading() {
    loadingEl.classList.add("hidden");
  }

  // ── Init ─────────────────────────────────────────────────────
  initDatePickers();
  loadData();
})();
