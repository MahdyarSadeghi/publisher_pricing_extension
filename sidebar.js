(function () {
  "use strict";

  // ── Jalali conversions ────────────────────────────────────────
  function gToJ(gy, gm, gd) {
    gy -= 1600; gm -= 1; gd -= 1;
    var g = 365*gy + Math.floor((gy+3)/4) - Math.floor((gy+99)/100) + Math.floor((gy+399)/400);
    [31,28,31,30,31,30,31,31,30,31,30,31].forEach(function(v,i){ if(i<gm) g+=v; });
    if (gm>1 && ((gy%4===0&&gy%100!==0)||gy%400===0)) g++;
    g += gd;
    var j=g-79, jp=Math.floor(j/12053); j%=12053;
    var jy=979+33*jp+4*Math.floor(j/1461); j%=1461;
    if(j>=366){jy+=Math.floor((j-1)/365);j=(j-1)%365;}
    var jm=0, jd=[31,31,31,31,31,31,30,30,30,30,30,29];
    while(jm<11&&j>=jd[jm]){j-=jd[jm];jm++;}
    return {y:jy,m:jm+1,d:j+1};
  }

  function jToG(jy, jm, jd) {
    jy-=979;jm-=1;jd-=1;
    var jd2=[31,31,31,31,31,31,30,30,30,30,30,29];
    var j=365*jy+Math.floor(jy/33)*8+Math.floor((jy%33+3)/4);
    for(var i=0;i<jm;i++) j+=jd2[i];
    j+=jd;
    var g=j+79,gy=1600+400*Math.floor(g/146097); g%=146097;
    var leap=true;
    if(g>=36525){g--;gy+=100*Math.floor(g/36524);g%=36524;if(g>=365)g++;else leap=false;}
    gy+=4*Math.floor(g/1461);g%=1461;
    if(g>=366){leap=false;g--;gy+=Math.floor(g/365);g%=365;}
    var gd2=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31],gm2=0;
    while(g>=gd2[gm2]){g-=gd2[gm2];gm2++;}
    return {y:gy,m:gm2+1,d:g+1};
  }

  function jToISO(jy,jm,jd){var g=jToG(jy,jm,jd);return g.y+"-"+p2(g.m)+"-"+p2(g.d);}
  function p2(n){return String(n).padStart(2,"0");}
  function toFa(s){return String(s).replace(/[0-9]/g,function(d){return "۰۱۲۳۴۵۶۷۸۹"[d];});}
  function fmtRpm(n){return toFa((Math.round(n*100)/100).toFixed(2));}
  function fmtPct(n){return (n>=0?"↑ ":"↓ ")+toFa(Math.abs(n).toFixed(1))+"٪";}

  // ── State ─────────────────────────────────────────────────────
  var allData    = null;
  var scanResult = null;
  var analysisResult = null;

  // ── DOM ───────────────────────────────────────────────────────
  function $(id){return document.getElementById(id);}

  // ── Events ────────────────────────────────────────────────────
  $("close-btn").addEventListener("click",function(){
    window.parent.postMessage({type:"CLOSE_SIDEBAR"},"*");
  });

  $("refresh-btn").addEventListener("click",function(){
    if(analysisResult){
      showDateSection();
      analysisResult=null;
    }
  });

  $("analyze-btn").addEventListener("click",function(){
    if(!allData||!scanResult||!scanResult.appId) return;
    runAnalysis();
  });

  $("more-btn").addEventListener("click",async function(){
    if(!analysisResult) return;
    var btn=$("more-btn");
    btn.classList.add("reporting");
    btn.querySelector(".cta-btn-main").textContent="⏳ در حال تهیه گزارش...";
    try{
      var report={
        matched:analysisResult.matched,
        unmatched:analysisResult.unmatched,
        totalRpm:analysisResult.totalRpm,
        publisherName:analysisResult.publisherName,
        from:analysisResult.from,to:analysisResult.to,
        appId:analysisResult.appId,
        allPositionCount:analysisResult.allPositionCount,
        pageTitle:scanResult.pageTitle,pageUrl:scanResult.pageUrl,
        generatedAt:new Date().toISOString(),
      };
      await new Promise(function(resolve,reject){
        chrome.storage.local.set({ynprice_report:report},function(){
          if(chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      });
      chrome.runtime.sendMessage({type:"OPEN_REPORT_VIEWER"},function(){
        if(chrome.runtime.lastError){ console.warn("OPEN_REPORT_VIEWER:",chrome.runtime.lastError.message); }
      });
      // fire-and-forget screenshots from the host page
      (function(){
        var posIds=(analysisResult.matched||[]).filter(function(p){return p.foundOnPage;}).map(function(p){return p.positionId;});
        if(!posIds.length) return;
        chrome.tabs.query({active:true,currentWindow:false},function(tabs){
          var hostTab=tabs&&tabs.find(function(t){return t.url===scanResult.pageUrl;});
          if(!hostTab) return;
          chrome.tabs.sendMessage(hostTab.id,{type:"TAKE_SCREENSHOTS",positionIds:posIds},function(){
            if(chrome.runtime.lastError){ /* tab may not be ready */ }
          });
        });
      })();
      btn.classList.remove("reporting");
      btn.querySelector(".cta-btn-main").textContent="✓ گزارش باز شد";
    }catch(e){
      console.error("Report error:",e);
      btn.classList.remove("reporting");
      btn.querySelector(".cta-btn-main").textContent="خطا: "+e.message;
    }
  });

  $("retry-btn").addEventListener("click",function(){
    hideAll();
    $("date-section").classList.remove("hidden");
    updateAnalyzeBtn();
  });

  window.addEventListener("message",function(e){
    if(!e.data) return;
    if(e.data.type==="SCAN_RESULT"){
      scanResult=e.data;
      renderSiteStrip();
      updateAnalyzeBtn();
      if(!e.data.appId){ showError(); }
    }
    if(e.data.type==="HIGHLIGHT_NOT_FOUND"){
      var card=document.querySelector('[data-posid="'+e.data.positionId+'"]');
      if(card){card.classList.add("pos-card-notfound");setTimeout(function(){card.classList.remove("pos-card-notfound");},700);}
    }
  });

  // ── Date pickers ──────────────────────────────────────────────
  var MONTHS=["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];

  function initDatePickers(){
    var now=new Date();
    var tj=gToJ(now.getFullYear(),now.getMonth()+1,now.getDate());
    var fromJ={y:1404,m:1,d:1};

    ["from","to"].forEach(function(p){
      var ysel=$(p+"-year"),msel=$(p+"-month"),dsel=$(p+"-day");
      var src=p==="from"?fromJ:tj;

      for(var y=1402;y<=tj.y+1;y++){
        var o=document.createElement("option");
        o.value=y;o.textContent=toFa(y);ysel.appendChild(o);
      }
      MONTHS.forEach(function(name,i){
        var o=document.createElement("option");
        o.value=i+1;o.textContent=name;msel.appendChild(o);
      });
      for(var d=1;d<=31;d++){
        var o=document.createElement("option");
        o.value=d;o.textContent=toFa(d);dsel.appendChild(o);
      }
      ysel.value=src.y;msel.value=src.m;dsel.value=src.d;
    });
  }

  function getDateRange(){
    return {
      from:jToISO(+$("from-year").value,+$("from-month").value,+$("from-day").value),
      to:  jToISO(+$("to-year").value,  +$("to-month").value,  +$("to-day").value),
    };
  }

  // ── Data loading ──────────────────────────────────────────────
  // DATA_SOURCE: to switch to an API, replace fetchPublisherData() below.
  // The returned object must be: { [appId]: { publisher_name, positions: { [posId]: { desc, type, rows: [[date, cost, pv, device]] } } } }
  async function fetchPublisherData() {
    // Current source: local JSON built from daily_position_details.xlsx via build-data.js
    var url = chrome.runtime.getURL("data/publisher_data.json");
    // Future (API): var url = "https://api.example.com/publisher-data";
    var res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  async function loadData(){
    try{
      allData=await fetchPublisherData();
      var count=Object.values(allData).reduce(function(s,pub){
        return s+Object.values(pub.positions).reduce(function(s2,pos){return s2+pos.rows.length;},0);
      },0);
      var ds=$("data-status");
      ds.textContent="✓ "+toFa(count.toLocaleString())+" ردیف بارگذاری شد";
      ds.className="data-status ok";
      updateAnalyzeBtn();
    }catch(e){
      var ds=$("data-status");
      ds.textContent="خطا: "+e.message;
      ds.className="data-status err";
    }
  }

  // ── Site strip ────────────────────────────────────────────────
  function renderSiteStrip(){
    if(!scanResult) return;
    var strip=$("site-strip");
    var domain="";
    try{domain=new URL(scanResult.pageUrl).hostname;}catch(_){domain=scanResult.pageUrl;}

    $("site-domain").textContent=domain;
    var fav=$("site-favicon");
    fav.textContent=(domain[0]||"?").toUpperCase();
    // color the favicon based on first char
    var colors=["#10b981","#3b82f6","#8b5cf6","#f59e0b","#ef4444","#06b6d4","#ec4899"];
    fav.style.background=colors[(domain.charCodeAt(0)||0)%colors.length];
    fav.style.color="#fff";

    var dot=$("status-dot"),txt=$("status-text");
    if(scanResult.appId){
      dot.className="status-dot";
      txt.textContent="اسکریپت یکتانت شناسایی شد · "+scanResult.appId;
    } else {
      dot.className="status-dot error";
      txt.textContent="اسکریپت یکتانت یافت نشد";
    }
    strip.classList.remove("hidden");
  }

  function updateAnalyzeBtn(){
    var hasData=allData&&scanResult&&scanResult.appId&&allData[scanResult.appId];
    $("analyze-btn").disabled=!hasData;
    if(allData&&scanResult&&!scanResult.appId){
      $("analyze-btn").textContent="App ID یافت نشد";
    } else if(allData&&scanResult&&scanResult.appId&&!allData[scanResult.appId]){
      $("analyze-btn").textContent="دیتا یافت نشد";
    } else {
      $("analyze-btn").textContent="آنالیز کن";
    }
  }

  // ── Analysis ──────────────────────────────────────────────────
  function runAnalysis(){
    var range=getDateRange();
    var appId=scanResult.appId;
    var pubData=allData[appId];
    if(!pubData){showNoData(appId);return;}

    var foundOnPage=new Set(scanResult.positionIds||[]);
    var allPositionIds=Object.keys(pubData.positions);

    showLoading(allPositionIds.length);

    setTimeout(function(){
      try{
        var matched=[],unmatched=[];

        allPositionIds.forEach(function(posId){
          var posData=pubData.positions[posId];
          if(!posData){unmatched.push(posId);return;}

          var rows=posData.rows.filter(function(r){return r[0]>=range.from&&r[0]<=range.to;});
          if(!rows.length){unmatched.push(posId);return;}

          var valid=rows.filter(function(r){return r[2]>0;});
          var rpm=valid.length?valid.reduce(function(s,r){return s+r[1]/r[2];},0)/valid.length:null;

          var device=null;
          for(var ri=0;ri<rows.length;ri++){if(rows[ri][3]){device=rows[ri][3];break;}}

          matched.push({
            positionId:posId, rpm:rpm,
            description:posData.desc||"",
            positionType:posData.type||"",
            publisherName:pubData.publisher_name||"",
            totalAdv:rows.reduce(function(s,r){return s+r[1];},0),
            totalPv: rows.reduce(function(s,r){return s+r[2];},0),
            rowCount:rows.length,
            rows:rows,
            foundOnPage:foundOnPage.has(posId),
            device:device,
          });
        });

        // Total publisher RPM (group by date, sum adv, max pv)
        var byDate={};
        Object.values(pubData.positions).forEach(function(posData){
          posData.rows.forEach(function(r){
            if(r[0]<range.from||r[0]>range.to) return;
            if(!byDate[r[0]]) byDate[r[0]]={adv:0,pv:0};
            byDate[r[0]].adv+=r[1];
            byDate[r[0]].pv=Math.max(byDate[r[0]].pv,r[2]);
          });
        });

        var sortedDates=Object.keys(byDate).sort();
        var dailyRpms=sortedDates.map(function(d){
          return byDate[d].pv>0?byDate[d].adv/byDate[d].pv:null;
        }).filter(function(v){return v!==null;});

        var validDates=sortedDates.filter(function(d){return byDate[d].pv>0;});
        var totalRpm=validDates.length
          ?validDates.reduce(function(s,d){return s+byDate[d].adv/byDate[d].pv;},0)/validDates.length
          :null;

        var uplift=null;
        if(dailyRpms.length>=8){
          var last7=dailyRpms.slice(-7).reduce(function(s,v){return s+v;},0)/7;
          var prev7=dailyRpms.slice(-14,-7).reduce(function(s,v){return s+v;},0)/Math.max(dailyRpms.slice(-14,-7).length,1);
          if(prev7>0) uplift=((last7-prev7)/prev7)*100;
        }

        analysisResult={
          matched:matched,unmatched:unmatched,
          totalRpm:totalRpm,publisherName:pubData.publisher_name||"",
          from:range.from,to:range.to,
          appId:appId,allPositionCount:allPositionIds.length,
          pageUrl:scanResult.pageUrl,pageTitle:scanResult.pageTitle,
          trend:dailyRpms,uplift:uplift,
        };

        renderResults(analysisResult);
      }catch(e){
        console.error("Analysis error:",e);
        showNoData(appId);
      }
    },80);
  }

  // ── Render helpers ────────────────────────────────────────────
  function hideAll(){
    ["date-section","loading-section","results-section",
     "error-state","nodata-state","cta-footer"].forEach(function(id){
      $(id).classList.add("hidden");
    });
  }

  function showDateSection(){
    hideAll();
    $("date-section").classList.remove("hidden");
    updateAnalyzeBtn();
  }

  function showError(){
    hideAll();
    $("date-section").classList.remove("hidden"); // keep date section visible but show error below
    $("error-state").classList.remove("hidden");
    $("analyze-btn").disabled=true;
    $("analyze-btn").textContent="App ID یافت نشد";
  }

  function showNoData(appId){
    hideAll();
    $("date-section").classList.remove("hidden");
    $("nodata-state").classList.remove("hidden");
    $("nodata-body").textContent='App ID "'+appId+'" در داده‌های تاریخی موجود نیست.';
  }

  function showLoading(posCount){
    hideAll();
    $("loading-section").classList.remove("hidden");
    // Update step values
    $("step-val-0").textContent=toFa(Math.round((new Date(getDateRange().to)-new Date(getDateRange().from))/(86400000)))+" روز";
    $("step-val-1").textContent=toFa(posCount)+" جایگاه";
  }

  function renderResults(res){
    hideAll();
    $("date-section").classList.remove("hidden");
    $("results-section").classList.remove("hidden");
    $("cta-footer").classList.remove("hidden");

    // Hero
    var rpm=res.totalRpm;
    $("hero-rpm").textContent=rpm!==null?fmtRpm(rpm):"—";

    if(res.uplift!==null){
      $("hero-uplift").textContent=fmtPct(res.uplift);
      $("hero-uplift").style.color=res.uplift>=0?"var(--success)":"var(--danger)";
    } else {
      $("hero-uplift").textContent="";
    }

    // Sparkline
    renderSparkline("hero-spark", res.trend);

    // Positions — sort by RPM desc, add 90% revenue separator
    var withRpm=res.matched.filter(function(p){return p.rpm!==null;})
      .sort(function(a,b){return(b.rpm||0)-(a.rpm||0);});
    var noData=res.unmatched.map(function(id){
      return{positionId:id,rpm:null,description:"",positionType:"",noData:true};
    });

    $("pos-count").textContent=
      toFa(res.matched.length)+"/"+toFa(res.allPositionCount||res.matched.length);

    var list=$("positions-list");
    list.innerHTML="";

    var totalAdv=withRpm.reduce(function(s,p){return s+(p.totalAdv||0);},0);
    var cumul=0,splitIdx=withRpm.length-1;
    for(var si=0;si<withRpm.length;si++){cumul+=(withRpm[si].totalAdv||0);if(totalAdv>0&&cumul/totalAdv>=0.9){splitIdx=si;break;}}
    var top90=withRpm.slice(0,splitIdx+1);
    var bottom=withRpm.slice(splitIdx+1);
    var topAdv=top90.reduce(function(s,p){return s+(p.totalAdv||0);},0);
    var topPct=totalAdv>0?Math.round(topAdv/totalAdv*100):90;
    var botPct=100-topPct;

    function makeCard(item){
      var card=document.createElement("div");
      card.className="pos-card pos-card-found";
      card.setAttribute("data-posid",item.positionId);
      var label=item.description||("ynpos-"+item.positionId);
      var found=item.foundOnPage;
      var dev=item.device||null;
      var devLbl=dev==="mobile"||dev==="mob"?"فقط موبایل":dev==="desktop"||dev==="desk"?"فقط دسکتاپ":null;
      var devHtml=devLbl?'<span class="pos-device-badge pos-device-'+dev+'">'+devLbl+'</span>':'';
      var dotCls=found?"pos-found-on":"pos-found-off";
      var dotTitle=found?"روی این صفحه موجوده":"در این صفحه یافت نشد";
      card.innerHTML=
        '<div class="pos-icon">'+(item.positionType||item.positionId||'').slice(0,3).toUpperCase()+'</div>'+
        '<div class="pos-body">'+
          '<div class="pos-name">'+label+'</div>'+
          '<div class="pos-meta">'+
            '<span class="pos-found-dot '+dotCls+'" title="'+dotTitle+'"></span>'+
            '<span>ynpos-'+toFa(item.positionId)+'</span>'+devHtml+
          '</div>'+
        '</div>'+
        '<div class="pos-rpm-col"><div class="pos-rpm-val">'+fmtRpm(item.rpm)+'</div></div>';
      card.title="کلیک کن تا روی صفحه پیدا بشه"+(found?"":" (ممکنه در این صفحه نباشه)");
      card.addEventListener("click",function(){
        window.parent.postMessage({type:"HIGHLIGHT_POSITION",positionId:item.positionId},"*");
      });
      return card;
    }

    if(top90.length){
      var block90=document.createElement("div");
      block90.className="pos-block-top90";
      var hdr=document.createElement("div");
      hdr.className="pos-block-header";
      hdr.textContent="این "+toFa(top90.length)+" جایگاه "+toFa(topPct)+"٪ درآمد را می‌سازند";
      block90.appendChild(hdr);
      top90.forEach(function(item){block90.appendChild(makeCard(item));});
      list.appendChild(block90);
    }
    if(bottom.length){
      var lblBot=document.createElement("div");
      lblBot.className="pos-block-bottom-label";
      lblBot.textContent="الباقی "+toFa(botPct)+"٪";
      list.appendChild(lblBot);
      bottom.forEach(function(item){list.appendChild(makeCard(item));});
    }
    noData.forEach(function(item){
      var card=document.createElement("div");
      card.className="pos-card no-data pos-card-found";
      card.setAttribute("data-posid",item.positionId);
      var label=item.description||("ynpos-"+item.positionId);
      var dev=item.device||null;
      var devLbl=dev==="mobile"||dev==="mob"?"فقط موبایل":dev==="desktop"||dev==="desk"?"فقط دسکتاپ":null;
      var devHtml=devLbl?'<span class="pos-device-badge pos-device-'+dev+'">'+devLbl+'</span>':'';
      card.innerHTML=
        '<div class="pos-icon">—</div>'+
        '<div class="pos-body">'+
          '<div class="pos-name">'+label+'</div>'+
          '<div class="pos-meta"><span class="pos-found-dot pos-found-off" title="در این صفحه یافت نشد"></span><span>ynpos-'+toFa(item.positionId)+'</span>'+devHtml+'<span class="no-data-tag">· بدون داده</span></div>'+
        '</div>'+
        '<div class="pos-rpm-col"><div class="pos-rpm-val">—</div></div>';
      card.title="کلیک کن تا روی صفحه پیدا بشه (ممکنه در این صفحه نباشه)";
      card.addEventListener("click",function(){
        window.parent.postMessage({type:"HIGHLIGHT_POSITION",positionId:item.positionId},"*");
      });
      list.appendChild(card);
    });
  }

  // ── Sparkline (inline SVG) ─────────────────────────────────────
  function renderSparkline(containerId, data){
    var el=$(containerId);
    if(!data||data.length<2){el.innerHTML="";return;}
    var W=el.offsetWidth||220, H=26;
    var min=Math.min.apply(null,data), max=Math.max.apply(null,data);
    var range=max-min||1;
    var pts=data.map(function(v,i){
      var x=(i/(data.length-1))*W;
      var y=H-((v-min)/range)*H;
      return (i===0?"M":"L")+x.toFixed(1)+","+y.toFixed(1);
    }).join(" ");
    var area=pts+" L"+W+","+H+" L0,"+H+" Z";
    var gid="sg"+Math.random().toString(36).slice(2,7);
    el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:'+H+'px" preserveAspectRatio="none">'+
      '<defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1">'+
      '<stop offset="0%" stop-color="#FED049" stop-opacity="0.35"/>'+
      '<stop offset="100%" stop-color="#FED049" stop-opacity="0"/>'+
      '</linearGradient></defs>'+
      '<path d="'+area+'" fill="url(#'+gid+')"/>'+
      '<path d="'+pts+'" fill="none" stroke="#FED049" stroke-width="1.5" stroke-linejoin="round"/>'+
      '</svg>';
  }

  // ── Init ──────────────────────────────────────────────────────
  initDatePickers();
  loadData();
})();
