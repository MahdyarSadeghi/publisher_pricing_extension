(function () {
  "use strict";

  // ── Jalali ↔ Gregorian ───────────────────────────────────────
  function jToG(jy, jm, jd) {
    var y = jy - 979, m = jm - 1, d = jd - 1;
    var n = 365 * y + Math.floor(y / 33) * 8 + Math.floor((y % 33 + 3) / 4);
    [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29].forEach(function (v, i) { if (i < m) n += v; });
    n += d;
    var gd = n + 79;
    var gy = 1600 + 400 * Math.floor(gd / 146097); gd %= 146097;
    var leap = true;
    if (gd >= 36525) { gd--; gy += 100 * Math.floor(gd / 36524); gd %= 36524; if (gd >= 365) gd++; else leap = false; }
    gy += 4 * Math.floor(gd / 1461); gd %= 1461;
    if (gd >= 366) { leap = false; gd--; gy += Math.floor(gd / 365); gd %= 365; }
    var md = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], gm = 0;
    while (gd >= md[gm]) { gd -= md[gm]; gm++; }
    return { y: gy, m: gm + 1, d: gd + 1 };
  }

  function gToJ(gy, gm, gd) {
    var g = gy - (gm <= 2 ? 1 : 0);
    var n = 365 * gy + Math.floor((g + 3) / 4) - Math.floor((g + 99) / 100) + Math.floor((g + 399) / 400);
    [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31].forEach(function (v, i) { if (i < gm - 1) n += v; });
    if (gm > 2 && gy % 4 === 0 && (gy % 100 !== 0 || gy % 400 === 0)) n++;
    n += gd;
    var jn = n - 79;
    var jp = Math.floor(jn / 12053); jn %= 12053;
    var jy = 979 + 33 * jp + 4 * Math.floor(jn / 1461); jn %= 1461;
    if (jn >= 366) { jy += Math.floor((jn - 1) / 365); jn = (jn - 1) % 365; }
    var jmd = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29], jm = 0;
    while (jm < 12 && jn >= jmd[jm]) { jn -= jmd[jm]; jm++; }
    return { y: jy, m: jm + 1, d: jn + 1 };
  }

  function jToISO(jy, jm, jd) {
    var g = jToG(jy, jm, jd);
    return g.y + "-" + pad(g.m) + "-" + pad(g.d);
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  // ── State ────────────────────────────────────────────────────
  var workbookData = null;
  var scanResult = null;
  var analysisResult = null;

  // ── DOM refs ─────────────────────────────────────────────────
  var $ = function (id) { return document.getElementById(id); };
  var closeBtn     = $("close-btn");
  var analyzeBtn   = $("analyze-btn");
  var moreBtn      = $("more-btn");
  var dataStatus   = $("data-status");
  var pageInfo     = $("page-info");
  var pageHost     = $("page-host");
  var appIdBadge   = $("app-id-badge");
  var resultsSection = $("results-section");
  var positionsList  = $("positions-list");
  var totalRpmEl   = $("total-rpm");
  var publisherNameEl = $("publisher-name");
  var loadingEl    = $("loading");
  var loadingText  = $("loading-text");

  // ── Events ───────────────────────────────────────────────────
  closeBtn.addEventListener("click", function () {
    window.parent.postMessage({ type: "CLOSE_SIDEBAR" }, "*");
  });

  analyzeBtn.addEventListener("click", function () {
    if (!workbookData || !scanResult || !scanResult.appId) return;
    showLoading("در حال آنالیز...");
    setTimeout(function () { runAnalysis(); hideLoading(); }, 30);
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
    var fromJ = { y: todayJ.y, m: todayJ.m - 3, d: 1 };
    if (fromJ.m <= 0) { fromJ.m += 12; fromJ.y--; }

    ["from", "to"].forEach(function (p) {
      var ysel = $(p + "-year"), msel = $(p + "-month"), dsel = $(p + "-day");
      var src = p === "from" ? fromJ : todayJ;

      for (var y = todayJ.y - 3; y <= todayJ.y; y++) {
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

  // ── Load bundled data ────────────────────────────────────────
  async function loadBundledData() {
    try {
      var url = chrome.runtime.getURL("data/publisher_data.xlsx");
      var res = await fetch(url);
      if (!res.ok) throw new Error("file not found");
      var buf = await res.arrayBuffer();
      var wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      var ws = wb.Sheets[wb.SheetNames[0]];
      workbookData = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
      dataStatus.textContent = "✓ " + workbookData.length.toLocaleString("fa") + " ردیف بارگذاری شد";
      dataStatus.className = "data-status ok";
      updateAnalyzeBtn();
    } catch (e) {
      dataStatus.textContent = "خطا در بارگذاری داده";
      dataStatus.className = "data-status err";
    }
  }

  // ── Page info ────────────────────────────────────────────────
  function renderPageInfo() {
    if (!scanResult) return;
    try { pageHost.textContent = new URL(scanResult.pageUrl).hostname; } catch (_) { pageHost.textContent = scanResult.pageUrl; }
    if (scanResult.appId) {
      appIdBadge.textContent = scanResult.appId;
    } else {
      appIdBadge.textContent = "بدون App ID";
      appIdBadge.style.background = "#e53935";
    }
    pageInfo.classList.remove("hidden");
  }

  function updateAnalyzeBtn() {
    analyzeBtn.disabled = !(workbookData && scanResult && scanResult.appId && scanResult.positionIds.length > 0);
  }

  // ── Analysis ─────────────────────────────────────────────────
  function parseDateToISO(str) {
    str = String(str || "").trim();
    var parts = str.split(/[\/\-\.]/);
    if (parts.length === 3) {
      var y = parseInt(parts[0]), m = parseInt(parts[1]), d = parseInt(parts[2]);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        if (y > 1300) {
          var g = jToG(y, m, d);
          return g.y + "-" + pad(g.m) + "-" + pad(g.d);
        }
        return y + "-" + pad(m) + "-" + pad(d);
      }
    }
    return null;
  }

  function toNum(v) {
    var n = parseFloat(String(v || "").replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  }

  function runAnalysis() {
    var range = getDateRange();
    var appId = scanResult.appId;
    var positionIds = scanResult.positionIds;

    // Find publisher IDs matching this App ID
    var pubIds = new Set();
    workbookData.forEach(function (r) {
      var aid = String(r["app_id"] || r["yektanet_id"] || r["appid"] || "").trim();
      if (aid === appId) {
        var pid = String(r["publisher_id"] || "").trim();
        if (pid) pubIds.add(pid);
      }
    });
    var pubIdArr = Array.from(pubIds);

    // Filter by publisher + date range
    var filtered = workbookData.filter(function (r) {
      if (pubIdArr.length > 0 && !pubIdArr.includes(String(r["publisher_id"] || "").trim())) return false;
      var iso = parseDateToISO(r["date"]);
      return iso && iso >= range.from && iso <= range.to;
    });

    // Per-position RPM
    var matched = [], unmatched = [];
    positionIds.forEach(function (posId) {
      var rows = filtered.filter(function (r) {
        return String(r["position_id"] || "").trim() === String(posId);
      });
      if (!rows.length) { unmatched.push(posId); return; }

      var valid = rows.filter(function (r) { return toNum(r["page_views"]) > 0; });
      var rpm = valid.length
        ? valid.reduce(function (s, r) { return s + toNum(r["total_adv_cost"]) / toNum(r["page_views"]); }, 0) / valid.length
        : null;

      matched.push({
        positionId: posId,
        rpm: rpm,
        description: rows[0]["description"] || rows[0]["position_class"] || "",
        positionType: rows[0]["position_type"] || "",
        publisherName: rows[0]["publisher_name"] || "",
        totalAdv: rows.reduce(function (s, r) { return s + toNum(r["total_adv_cost"]); }, 0),
        totalPv: rows.reduce(function (s, r) { return s + toNum(r["page_views"]); }, 0),
        rowCount: rows.length,
      });
    });

    // Total publisher RPM: group by date, avoid double-counting page views
    var byDate = {};
    filtered.forEach(function (r) {
      var iso = parseDateToISO(r["date"]);
      if (!iso) return;
      if (!byDate[iso]) byDate[iso] = { adv: 0, pv: 0 };
      byDate[iso].adv += toNum(r["total_adv_cost"]);
      byDate[iso].pv = Math.max(byDate[iso].pv, toNum(r["page_views"]));
    });
    var dateEntries = Object.values(byDate).filter(function (d) { return d.pv > 0; });
    var totalRpm = dateEntries.length
      ? dateEntries.reduce(function (s, d) { return s + d.adv / d.pv; }, 0) / dateEntries.length
      : null;

    var pubName = matched.length ? matched[0].publisherName : "";

    analysisResult = {
      matched: matched, unmatched: unmatched,
      totalRpm: totalRpm, publisherName: pubName,
      from: range.from, to: range.to,
      appId: appId, positionIds: positionIds,
      pageUrl: scanResult.pageUrl, pageTitle: scanResult.pageTitle,
    };

    renderResults(analysisResult);
  }

  function renderResults(res) {
    totalRpmEl.textContent = res.totalRpm !== null ? res.totalRpm.toFixed(4) : "N/A";
    publisherNameEl.textContent = res.publisherName || "";

    positionsList.innerHTML = "";

    res.matched.forEach(function (item) {
      var card = document.createElement("div");
      card.className = "pos-card";
      var rpmStr = item.rpm !== null ? item.rpm.toFixed(4) : "N/A";
      var rpmClass = item.rpm !== null ? "pos-rpm" : "pos-rpm na";
      card.innerHTML =
        '<div class="pos-header">' +
          '<span class="pos-id">ynpos-' + item.positionId + '</span>' +
          (item.positionType ? '<span class="pos-type">' + item.positionType + '</span>' : '') +
        '</div>' +
        (item.description ? '<div class="pos-desc">' + item.description + '</div>' : '') +
        '<div class="' + rpmClass + '">' + rpmStr + '</div>' +
        '<div class="pos-meta">' +
          '<span>' + item.rowCount + ' روز</span>' +
          '<span>هزینه: ' + Math.round(item.totalAdv).toLocaleString() + '</span>' +
          '<span>PV: ' + Math.round(item.totalPv / item.rowCount).toLocaleString() + '</span>' +
        '</div>';
      positionsList.appendChild(card);
    });

    if (res.unmatched.length > 0) {
      var sep = document.createElement("p");
      sep.style.cssText = "font-size:11px;color:#90a4ae;padding:4px 2px 2px;";
      sep.textContent = "موقعیت‌های بدون داده:";
      positionsList.appendChild(sep);
      res.unmatched.forEach(function (posId) {
        var card = document.createElement("div");
        card.className = "pos-card no-data";
        card.innerHTML = '<div class="pos-header"><span class="pos-id">ynpos-' + posId + '</span><span class="pos-type">بدون داده</span></div>';
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
  loadBundledData();
})();
