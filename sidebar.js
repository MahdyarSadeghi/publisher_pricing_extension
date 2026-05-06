(function () {
  "use strict";

  // State
  let workbookData = null; // Array of row objects from Excel
  let scanResult = null;   // { appId, positionIds, pageUrl, pageTitle }

  // DOM refs
  const closeBtn = document.getElementById("close-btn");
  const excelFileInput = document.getElementById("excel-file");
  const fileStatus = document.getElementById("file-status");
  const uploadText = document.getElementById("upload-text");
  const statusMsg = document.getElementById("status-msg");
  const statusSection = document.getElementById("status-section");
  const pageInfoSection = document.getElementById("page-info");
  const pageUrlEl = document.getElementById("page-url");
  const appIdEl = document.getElementById("app-id");
  const positionCountEl = document.getElementById("position-count");
  const resultsSection = document.getElementById("results-section");
  const resultsList = document.getElementById("results-list");
  const publisherInfo = document.getElementById("publisher-info");
  const publisherNameEl = document.getElementById("publisher-name");
  const noDataSection = document.getElementById("no-data-section");
  const debugInfo = document.getElementById("debug-info");

  // Close button
  closeBtn.addEventListener("click", () => {
    window.parent.postMessage({ type: "CLOSE_SIDEBAR" }, "*");
  });

  // Receive scan result from content script
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SCAN_RESULT") {
      scanResult = event.data;
      renderPageInfo();
      maybeRunAnalysis();
    }
  });

  // Excel file upload
  excelFileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    uploadText.textContent = file.name;
    fileStatus.textContent = "در حال پردازش...";
    fileStatus.className = "file-status";

    try {
      workbookData = await parseExcel(file);
      fileStatus.textContent = `✓ ${workbookData.length} ردیف بارگذاری شد`;
      fileStatus.className = "file-status success";
      maybeRunAnalysis();
    } catch (err) {
      fileStatus.textContent = `خطا: ${err.message}`;
      fileStatus.className = "file-status error";
      workbookData = null;
    }
  });

  function renderPageInfo() {
    if (!scanResult) return;

    pageUrlEl.textContent = scanResult.pageUrl;
    pageUrlEl.title = scanResult.pageUrl;

    if (scanResult.appId) {
      appIdEl.textContent = scanResult.appId;
    } else {
      appIdEl.textContent = "یافت نشد";
      appIdEl.style.color = "#dc3545";
    }

    positionCountEl.textContent = scanResult.positionIds.length;
    pageInfoSection.classList.remove("hidden");

    if (!scanResult.appId) {
      setStatus(
        "این صفحه اسکریپت یکتانت ندارد یا App ID شناسایی نشد.",
        "warning"
      );
    } else if (scanResult.positionIds.length === 0) {
      setStatus(
        "App ID یافت شد اما هیچ موقعیت تبلیغاتی (ynpos-XXXX) در صفحه پیدا نشد.",
        "warning"
      );
    } else {
      setStatus(
        workbookData
          ? "در حال تحلیل داده‌ها..."
          : "فایل Excel را بارگذاری کنید تا RPM محاسبه شود.",
        "info"
      );
    }
  }

  function maybeRunAnalysis() {
    if (!workbookData || !scanResult) return;
    if (!scanResult.appId) return;
    if (scanResult.positionIds.length === 0) return;

    runAnalysis();
  }

  function runAnalysis() {
    const { appId, positionIds } = scanResult;

    // Find publisher_id(s) matching this appId via app_id / yektanet_id column
    const publisherIds = findPublisherIdsByAppId(appId);

    // Compute RPM per position
    const matched = [];
    const unmatched = [];

    positionIds.forEach((posId) => {
      const rows = workbookData.filter((row) => {
        const rowPosId = String(row["position_id"] || "").trim();
        if (rowPosId !== String(posId).trim()) return false;
        if (publisherIds.length > 0) {
          return publisherIds.includes(String(row["publisher_id"] || "").trim());
        }
        return true;
      });

      if (rows.length === 0) {
        unmatched.push(posId);
        return;
      }

      const rpm = calculateAverageRpm(rows);
      const sample = rows[0];

      matched.push({
        positionId: posId,
        rpm,
        description: sample["description"] || sample["position_class"] || "",
        positionType: sample["position_type"] || "",
        publisherName: sample["publisher_name"] || "",
        totalRows: rows.length,
        totalAdv: rows.reduce((s, r) => s + toNum(r["total_adv_cost"]), 0),
        totalPv: rows.reduce((s, r) => s + toNum(r["page_views"]), 0),
      });
    });

    renderResults(matched, unmatched, publisherIds);
  }

  function findPublisherIdsByAppId(appId) {
    const ids = new Set();
    workbookData.forEach((row) => {
      const rowAppId =
        String(row["app_id"] || row["yektanet_id"] || row["appid"] || "").trim();
      if (rowAppId && rowAppId === appId) {
        const pubId = String(row["publisher_id"] || "").trim();
        if (pubId) ids.add(pubId);
      }
    });
    return [...ids];
  }

  function calculateAverageRpm(rows) {
    // RPM = total_adv_cost / page_views, averaged across rows
    const valid = rows.filter(
      (r) => toNum(r["page_views"]) > 0
    );
    if (valid.length === 0) return null;

    const totalRpm = valid.reduce(
      (sum, r) => sum + toNum(r["total_adv_cost"]) / toNum(r["page_views"]),
      0
    );
    return totalRpm / valid.length;
  }

  function renderResults(matched, unmatched, publisherIds) {
    resultsList.innerHTML = "";
    noDataSection.classList.add("hidden");
    resultsSection.classList.add("hidden");

    if (matched.length === 0 && unmatched.length === 0) {
      setStatus("تحلیل کامل شد اما نتیجه‌ای یافت نشد.", "warning");
      return;
    }

    // Show publisher name if available
    if (matched.length > 0 && matched[0].publisherName) {
      publisherNameEl.textContent = matched[0].publisherName;
      publisherInfo.classList.remove("hidden");
    }

    // Matched positions with RPM
    matched.forEach((item) => {
      const card = document.createElement("div");
      card.className = "result-card";
      card.innerHTML = `
        <div class="result-header">
          <span class="position-id">ynpos-${item.positionId}</span>
          ${item.positionType ? `<span class="position-type">${item.positionType}</span>` : ""}
        </div>
        ${item.description ? `<div class="result-description">${item.description}</div>` : ""}
        <div class="rpm-value">${item.rpm !== null ? item.rpm.toFixed(4) : "N/A"}</div>
        <div class="rpm-label">میانگین RPM (هزینه تبلیغات / بازدید صفحه)</div>
        <div class="result-stats">
          <div class="stat-item">
            <span class="stat-label">تعداد ردیف‌های داده</span>
            <span class="stat-value">${item.totalRows}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">مجموع هزینه تبلیغات</span>
            <span class="stat-value">${item.totalAdv.toLocaleString()}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">مجموع بازدید صفحه</span>
            <span class="stat-value">${item.totalPv.toLocaleString()}</span>
          </div>
        </div>
      `;
      resultsList.appendChild(card);
    });

    // Unmatched positions
    if (unmatched.length > 0) {
      const unmatchedHeader = document.createElement("p");
      unmatchedHeader.style.cssText =
        "font-size:11px;color:#adb5bd;margin:12px 0 6px;";
      unmatchedHeader.textContent = "موقعیت‌های بدون داده در فایل Excel:";
      resultsList.appendChild(unmatchedHeader);

      unmatched.forEach((posId) => {
        const card = document.createElement("div");
        card.className = "no-match-card";
        card.innerHTML = `
          <span class="no-match-label">ynpos-${posId}</span>
          <span class="no-match-badge">بدون داده</span>
        `;
        resultsList.appendChild(card);
      });
    }

    resultsSection.classList.remove("hidden");

    if (matched.length > 0) {
      setStatus(
        `تحلیل کامل شد: ${matched.length} موقعیت با داده، ${unmatched.length} بدون داده`,
        "success"
      );
    } else {
      noDataSection.classList.remove("hidden");
      debugInfo.innerHTML =
        `App ID روی صفحه: <strong>${scanResult.appId}</strong><br>` +
        `Publisher IDs یافت‌شده از Excel: <strong>${publisherIds.length > 0 ? publisherIds.join(", ") : "هیچ"}</strong><br>` +
        `موقعیت‌های روی صفحه: <strong>${scanResult.positionIds.join(", ")}</strong><br>` +
        `<br>مطمئن شوید ستون <code>app_id</code> یا <code>yektanet_id</code> در Excel موجود است و مقدار <strong>${scanResult.appId}</strong> را دارد.`;
      setStatus(
        "App ID در Excel پیدا نشد. راهنمایی را در پایین ببینید.",
        "warning"
      );
    }
  }

  function setStatus(msg, type) {
    statusMsg.textContent = msg;
    statusMsg.className = `status-msg ${type}`;
    statusSection.classList.remove("hidden");
  }

  async function parseExcel(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, {
            defval: "",
            raw: false,
          });
          resolve(rows);
        } catch (err) {
          reject(new Error("خطا در خواندن فایل Excel: " + err.message));
        }
      };
      reader.onerror = () => reject(new Error("خطا در بارگذاری فایل"));
      reader.readAsArrayBuffer(file);
    });
  }

  function toNum(val) {
    const n = parseFloat(String(val || "0").replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  }
})();
