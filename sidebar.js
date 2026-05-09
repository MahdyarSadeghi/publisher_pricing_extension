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
  function fmtRpm(n){return toFa(Math.round(n));}
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

  $("more-btn").addEventListener("click",function(){
    if(!analysisResult) return;
    var btn=$("more-btn");
    btn.classList.add("reporting");
    btn.querySelector(".cta-btn-main").textContent="⏳ در حال تهیه گزارش...";
    window.parent.postMessage({type:"GENERATE_REPORT",data:analysisResult},"*");
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
      if(!e.data.appId){
        showError();
      }
    }
    if(e.data.type==="REPORT_DONE"){
      var btn=$("more-btn");
      btn.classList.remove("reporting");
      btn.querySelector(".cta-btn-main").textContent="✓ گزارش باز شد";
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
  async function loadData(){
    try{
      var url=chrome.runtime.getURL("data/publisher_data.json");
      var res=await fetch(url);
      if(!res.ok) throw new Error("HTTP "+res.status);
      allData=await res.json();
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
    var ready=allData&&scanResult&&scanResult.appId&&scanResult.positionIds&&scanResult.positionIds.length>0;
    $("analyze-btn").disabled=!ready;
    if(allData&&scanResult&&!scanResult.appId){
      $("analyze-btn").textContent="App ID یافت نشد";
    } else if(allData&&scanResult&&scanResult.positionIds&&!scanResult.positionIds.length){
      $("analyze-btn").textContent="پوزیشنی یافت نشد";
    } else {
      $("analyze-btn").textContent="آنالیز کن";
    }
  }

  // ── Analysis ──────────────────────────────────────────────────
  function runAnalysis(){
    var range=getDateRange();
    var appId=scanResult.appId;
    var positionIds=scanResult.positionIds;

    showLoading(positionIds.length);

    // Defer so loading UI renders first
    setTimeout(function(){
      try{
        var pubData=allData[appId];
        if(!pubData){showNoData(appId);return;}

        var matched=[],unmatched=[];

        positionIds.forEach(function(posId){
          var posData=pubData.positions[posId];
          if(!posData){unmatched.push(posId);return;}

          var rows=posData.rows.filter(function(r){return r[0]>=range.from&&r[0]<=range.to;});
          if(!rows.length){unmatched.push(posId);return;}

          var valid=rows.filter(function(r){return r[2]>0;});
          var rpm=valid.length?valid.reduce(function(s,r){return s+r[1]/r[2];},0)/valid.length:null;

          matched.push({
            positionId:posId, rpm:rpm,
            description:posData.desc||"",
            positionType:posData.type||"",
            publisherName:pubData.publisher_name||"",
            totalAdv:rows.reduce(function(s,r){return s+r[1];},0),
            totalPv: rows.reduce(function(s,r){return s+r[2];},0),
            rowCount:rows.length,
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

        // Daily RPM trend (sorted by date)
        var sortedDates=Object.keys(byDate).sort();
        var dailyRpms=sortedDates.map(function(d){
          return byDate[d].pv>0?byDate[d].adv/byDate[d].pv:null;
        }).filter(function(v){return v!==null;});

        var validDates=sortedDates.filter(function(d){return byDate[d].pv>0;});
        var totalRpm=validDates.length
          ?validDates.reduce(function(s,d){return s+byDate[d].adv/byDate[d].pv;},0)/validDates.length
          :null;

        // Uplift: last 7 days vs prior 7 days
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
          appId:appId,positionIds:positionIds,
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
    $("hero-floor").textContent=rpm!==null?fmtRpm(rpm*0.92):"—";
    $("hero-ceiling").textContent=rpm!==null?fmtRpm(rpm*1.1):"—";

    if(res.uplift!==null){
      $("hero-uplift").textContent=fmtPct(res.uplift);
      $("hero-uplift").style.color=res.uplift>=0?"var(--success)":"var(--danger)";
    } else {
      $("hero-uplift").textContent="";
    }

    // Sparkline
    renderSparkline("hero-spark", res.trend);

    // Positions
    var allPos=res.matched.concat(res.unmatched.map(function(id){
      return {positionId:id,rpm:null,description:"",positionType:"",noData:true};
    }));

    $("pos-count").textContent=
      toFa(res.matched.length)+"/"+toFa(res.positionIds.length);

    var list=$("positions-list");
    list.innerHTML="";
    allPos.forEach(function(item){
      var card=document.createElement("div");
      card.className="pos-card"+(item.noData?" no-data":"");

      var label=item.description||("ynpos-"+item.positionId);
      var typeLabel=item.positionType||item.positionId;
      var iconText=typeLabel.slice(0,3).toUpperCase();
      var rpmStr=item.rpm!==null?fmtRpm(item.rpm)+"<span class='pos-rpm-unit'>K</span>":"—";
      var upliftStr="";

      card.innerHTML=
        '<div class="pos-icon">'+iconText+'</div>'+
        '<div class="pos-body">'+
          '<div class="pos-name">'+label+'</div>'+
          '<div class="pos-meta">'+
            '<span>ynpos-'+toFa(item.positionId)+'</span>'+
            (item.noData?'<span class="no-data-tag">· بدون داده</span>':
              (item.rowCount?'<span>· '+toFa(item.rowCount)+' روز</span>':'')+
              (item.totalPv&&item.rowCount?'<span>· '+toFa(Math.round(item.totalPv/item.rowCount).toLocaleString())+' PV/روز</span>':'')
            )+
          '</div>'+
        '</div>'+
        '<div class="pos-rpm-col">'+
          '<div class="pos-rpm-val">'+rpmStr+'</div>'+
        '</div>';
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
      '<stop offset="0%" stop-color="#1c1917" stop-opacity="0.2"/>'+
      '<stop offset="100%" stop-color="#1c1917" stop-opacity="0"/>'+
      '</linearGradient></defs>'+
      '<path d="'+area+'" fill="url(#'+gid+')"/>'+
      '<path d="'+pts+'" fill="none" stroke="#1c1917" stroke-width="1.5" stroke-linejoin="round"/>'+
      '</svg>';
  }

  // ── Init ──────────────────────────────────────────────────────
  initDatePickers();
  loadData();
})();
