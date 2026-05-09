(function(){
'use strict';
var MONTHS=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
function gToJ(gy,gm,gd){gy-=1600;gm-=1;gd-=1;var g=365*gy+Math.floor((gy+3)/4)-Math.floor((gy+99)/100)+Math.floor((gy+399)/400);[31,28,31,30,31,30,31,31,30,31,30,31].forEach(function(v,i){if(i<gm)g+=v;});if(gm>1&&((gy%4===0&&gy%100!==0)||gy%400===0))g++;g+=gd;var j=g-79,jp=Math.floor(j/12053);j%=12053;var jy=979+33*jp+4*Math.floor(j/1461);j%=1461;if(j>=366){jy+=Math.floor((j-1)/365);j=(j-1)%365;}var jm=0,jd=[31,31,31,31,31,31,30,30,30,30,30,29];while(jm<11&&j>=jd[jm]){j-=jd[jm];jm++;}return{y:jy,m:jm+1,d:j+1};}
function p2(n){return String(n).padStart(2,'0');}
function toFa(s){return String(s).replace(/[0-9]/g,function(d){return'۰۱۲۳۴۵۶۷۸۹'[+d];});}
function fmtRpm(n){return n!=null?toFa((Math.round(n*100)/100).toFixed(2)):'—';}
function fmtNum(n){return n!=null?toFa(Math.round(n).toLocaleString('en')):'—';}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function isoToJ(iso){var p=iso.split('-').map(Number);return gToJ(p[0],p[1],p[2]);}
function isoToJYM(iso){var j=isoToJ(iso);return j.y*100+j.m;}
function safeJYM(iso){try{return iso?isoToJYM(iso):null;}catch(e){return null;}}

// ── State ─────────────────────────────────────────────────────
var reportData=null;
var pubData=null;
var allMonthKeys=[];
var filterFrom=null;
var filterTo=null;
var chartMode='monthly';
var posFilterText='';

// ── Data helpers ───────────────────────────────────────────────
function getFullRows(positionId){
  if(pubData&&pubData.positions&&pubData.positions[positionId])
    return pubData.positions[positionId].rows||[];
  var pos=(reportData.matched||[]).find(function(p){return p.positionId===positionId;});
  return pos?(pos.rows||[]):[];
}

function filteredRows(rows){
  if(!filterFrom&&!filterTo)return rows||[];
  return(rows||[]).filter(function(r){
    var jym=isoToJYM(r[0]);
    if(filterFrom&&jym<filterFrom)return false;
    if(filterTo&&jym>filterTo)return false;
    return true;
  });
}

function matchesPos(pos){
  if(!posFilterText)return true;
  var q=posFilterText.toLowerCase();
  return(pos.description||'').toLowerCase().indexOf(q)>=0||String(pos.positionId).indexOf(q)>=0;
}

function filteredPubDaily(){
  var b={};
  (reportData.matched||[]).filter(matchesPos).forEach(function(pos){
    filteredRows(getFullRows(pos.positionId)).forEach(function(r){
      if(!b[r[0]])b[r[0]]={adv:0,pv:0};
      b[r[0]].adv+=r[1];
      b[r[0]].pv=Math.max(b[r[0]].pv,r[2]);
    });
  });
  return b;
}

function groupByMonth(byDate){
  var acc={};
  Object.keys(byDate).sort().forEach(function(date){
    var d=byDate[date];if(!d.pv)return;
    var j=isoToJ(date);var k=j.y+'/'+p2(j.m);
    if(!acc[k])acc[k]={adv:0,pv:0,days:0,jy:j.y,jm:j.m};
    acc[k].adv+=d.adv;acc[k].pv+=d.pv;acc[k].days++;
  });
  return Object.keys(acc).sort().map(function(k){
    var m=acc[k];
    return{key:k,label:MONTHS[m.jm-1],rpm:m.pv>0?m.adv/m.pv:0,totalAdv:m.adv,avgPv:Math.round(m.pv/m.days),days:m.days};
  });
}

function getDailyArr(byDate){
  return Object.keys(byDate).sort().filter(function(d){return byDate[d].pv>0;}).map(function(d){
    var j=isoToJ(d);
    return{key:d,label:toFa(j.m+'/'+j.d),rpm:byDate[d].adv/byDate[d].pv,totalAdv:byDate[d].adv,avgPv:byDate[d].pv};
  });
}

function getPubPts(){
  var bd=filteredPubDaily();
  return chartMode==='monthly'?groupByMonth(bd):getDailyArr(bd);
}

function computeOutlook(byDate){
  var vals=Object.keys(byDate).map(function(k){return byDate[k];}).filter(function(d){return d.pv>0;});
  if(vals.length<5)return null;
  var rpms=vals.map(function(d){return d.adv/d.pv;}).sort(function(a,b){return a-b;});
  var avgPv=vals.map(function(d){return d.pv;}).reduce(function(s,v){return s+v;},0)/vals.length;
  var n=rpms.length;
  return{
    pessimistic:{rpm:rpms[Math.floor(n*.2)],monthly:rpms[Math.floor(n*.2)]*avgPv*30},
    realistic:{rpm:rpms[Math.floor(n*.5)],monthly:rpms[Math.floor(n*.5)]*avgPv*30},
    optimistic:{rpm:rpms[Math.floor(n*.8)],monthly:rpms[Math.floor(n*.8)]*avgPv*30}
  };
}

function computePositionStats(){
  var stats=(reportData.matched||[]).map(function(pos){
    var rows=filteredRows(getFullRows(pos.positionId));
    var valid=rows.filter(function(r){return r[2]>0;});
    var totalAdv=rows.reduce(function(s,r){return s+r[1];},0);
    var rpm=valid.length?valid.reduce(function(s,r){return s+r[1]/r[2];},0)/valid.length:null;
    return{positionId:pos.positionId,description:pos.description,positionType:pos.positionType,rpm:rpm,totalAdv:totalAdv,rowCount:valid.length};
  });
  var withData=stats.filter(function(p){return p.rpm!=null;}).sort(function(a,b){return(b.rpm||0)-(a.rpm||0);});
  var noData=stats.filter(function(p){return p.rpm==null;});
  var total=withData.reduce(function(s,p){return s+p.totalAdv;},0);
  var cumul=0;
  withData.forEach(function(p){
    p.sharePercent=total>0?(p.totalAdv/total*100):0;
    cumul+=p.sharePercent;
    p.cumulativeShare=cumul;
    p.aboveThreshold=(cumul-p.sharePercent)<80;
  });
  return withData.concat(noData);
}

// ── SVG ────────────────────────────────────────────────────────
function makeLineSvg(pts,W,H,opts,field){
  field=field||'rpm';
  if(!pts||pts.length<2)return'<div class="chart-empty">داده کافی وجود ندارد</div>';
  opts=opts||{};
  var pL=opts.pL||56,pR=opts.pR||16,pT=opts.pT||14,pB=opts.pB||42;
  var cW=W-pL-pR,cH=H-pT-pB;
  var vals=pts.map(function(p){return+(p[field]||0);});
  var mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals),rng=mx-mn||.01;
  var isAdv=field==='totalAdv',isPv=field==='avgPv';
  var color=isAdv?'#60a5fa':isPv?'#34d399':'#FED049';
  var coords=pts.map(function(p,i){
    return{x:pL+(i/Math.max(pts.length-1,1))*cW,y:pT+(1-((p[field]||0)-mn)/rng)*cH,label:p.label};
  });
  var line=coords.map(function(c,i){return(i===0?'M':'L')+c.x.toFixed(1)+','+c.y.toFixed(1);}).join(' ');
  var area=line+' L'+coords[coords.length-1].x.toFixed(1)+','+(pT+cH)+' L'+pL+','+(pT+cH)+' Z';
  var grid='',yLbl='';
  for(var ti=0;ti<=4;ti++){
    var t=ti/4,yy=pT+(1-t)*cH,val=mn+t*rng;
    grid+='<line x1="'+pL+'" y1="'+yy.toFixed(1)+'" x2="'+(W-pR)+'" y2="'+yy.toFixed(1)+'" stroke="currentColor" stroke-opacity="0.07" stroke-width="1"/>';
    var lbl=isAdv?toFa(Math.round(val/1000)+'K'):(isPv?fmtNum(val):toFa(val.toFixed(1)));
    yLbl+='<text x="'+(pL-6)+'" y="'+(yy+4).toFixed(1)+'" text-anchor="end" font-size="10" fill="currentColor" fill-opacity="0.55">'+lbl+'</text>';
  }
  var xLbl='',step=pts.length<=12?1:Math.ceil(pts.length/12);
  coords.forEach(function(c,i){
    if(i%step!==0&&i!==pts.length-1)return;
    xLbl+='<text x="'+c.x.toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.6">'+c.label+'</text>';
  });
  var dots=coords.length<=60?coords.map(function(c){
    return'<circle cx="'+c.x.toFixed(1)+'" cy="'+c.y.toFixed(1)+'" r="3" fill="'+color+'" stroke="var(--card)" stroke-width="2"/>';
  }).join(''):'';
  var gid='g'+Math.random().toString(36).slice(2,9);
  return'<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">'+
    '<defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1">'+
    '<stop offset="0%" stop-color="'+color+'" stop-opacity="0.25"/>'+
    '<stop offset="100%" stop-color="'+color+'" stop-opacity="0"/>'+
    '</linearGradient></defs>'+
    grid+
    '<path d="'+area+'" fill="url(#'+gid+')"/>'+
    '<path d="'+line+'" fill="none" stroke="'+color+'" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>'+
    dots+yLbl+xLbl+'</svg>';
}

// ── Filter bar ─────────────────────────────────────────────────
function buildFilterBar(){
  var opts=allMonthKeys.map(function(k){
    var p=k.split('/');return'<option value="'+k+'">'+MONTHS[parseInt(p[1])-1]+' '+toFa(parseInt(p[0]))+'</option>';
  }).join('');
  return'<div class="filter-bar" id="filter-bar">'+
    '<div class="filter-group"><label class="filter-lbl">از ماه</label><select class="filter-sel" id="flt-from">'+opts+'</select></div>'+
    '<div class="filter-group"><label class="filter-lbl">تا ماه</label><select class="filter-sel" id="flt-to">'+opts+'</select></div>'+
    '<button class="filter-btn" id="flt-apply">اعمال</button>'+
    '<div class="filter-sep"></div>'+
    '<div class="filter-group"><label class="filter-lbl">فیلتر جایگاه</label><input class="pos-filter-input" id="pos-filter" placeholder="نام یا شناسه..." /></div>'+
    '<div class="toggle-group">'+
      '<button class="toggle-btn'+(chartMode==='monthly'?' active':'')+'" id="tog-monthly">ماهانه</button>'+
      '<button class="toggle-btn'+(chartMode==='daily'?' active':'')+'" id="tog-daily">روزانه</button>'+
    '</div>'+
  '</div>';
}

function wireFilterBar(){
  var from=document.getElementById('flt-from');
  var to=document.getElementById('flt-to');
  if(!from||!to)return;
  if(filterFrom){var k=Math.floor(filterFrom/100)+'/'+p2(filterFrom%100);if(from.querySelector('option[value="'+k+'"]'))from.value=k;}
  if(filterTo){var k2=Math.floor(filterTo/100)+'/'+p2(filterTo%100);if(to.querySelector('option[value="'+k2+'"]'))to.value=k2;}
  document.getElementById('flt-apply').addEventListener('click',function(){
    var fv=from.value.split('/'),tv=to.value.split('/');
    filterFrom=parseInt(fv[0])*100+parseInt(fv[1]);
    filterTo=parseInt(tv[0])*100+parseInt(tv[1]);
    rerenderCharts();
  });
  document.getElementById('tog-monthly').addEventListener('click',function(){
    chartMode='monthly';
    document.getElementById('tog-monthly').classList.add('active');
    document.getElementById('tog-daily').classList.remove('active');
    rerenderCharts();
  });
  document.getElementById('tog-daily').addEventListener('click',function(){
    chartMode='daily';
    document.getElementById('tog-daily').classList.add('active');
    document.getElementById('tog-monthly').classList.remove('active');
    rerenderCharts();
  });
  var pf=document.getElementById('pos-filter');
  if(pf){
    var debounce=null;
    pf.addEventListener('input',function(){
      clearTimeout(debounce);
      debounce=setTimeout(function(){posFilterText=pf.value;rerenderCharts();},300);
    });
  }
}

// ── Outlook / table ────────────────────────────────────────────
function buildOutlookHTML(outlook){
  if(!outlook)return'';
  return[
    {key:'pessimistic',icon:'📉',title:'بدبینانه',badge:'پرسنتایل ۲۰ام',data:outlook.pessimistic},
    {key:'realistic',icon:'📊',title:'واقع‌بینانه',badge:'پرسنتایل ۵۰ام',data:outlook.realistic},
    {key:'optimistic',icon:'📈',title:'خوش‌بینانه',badge:'پرسنتایل ۸۰ام',data:outlook.optimistic}
  ].map(function(item){
    return'<div class="outlook-card'+(item.key==='realistic'?' realistic':'')+'">'+
      '<div class="outlook-badge">'+item.badge+'</div>'+
      '<div class="outlook-icon">'+item.icon+'</div>'+
      '<div class="outlook-title">'+item.title+'</div>'+
      '<div class="outlook-rpm">'+fmtRpm(item.data.rpm)+'</div>'+
      '<div class="outlook-rpm-lbl">K تومان / ۱K نمایش</div>'+
      '<div class="outlook-divider"></div>'+
      '<div class="outlook-revenue">'+fmtNum(item.data.monthly)+'</div>'+
      '<div class="outlook-revenue-lbl">تومان / ماه (تخمینی)</div>'+
    '</div>';
  }).join('');
}

function buildPositionTable(stats){
  if(!stats.length)return'<div class="chart-empty">جایگاهی یافت نشد</div>';
  var html='<table class="pos-table"><thead><tr>'+
    '<th>#</th><th>نام جایگاه</th><th>شناسه</th>'+
    '<th class="tnum">RPM</th><th class="tnum">سهم درآمد</th><th class="tnum">سهم تجمعی</th><th class="tnum">روزها</th>'+
    '</tr></thead><tbody>';
  stats.forEach(function(p,i){
    var cls=p.rpm==null?'ptr-nodata':(p.aboveThreshold!==false?'ptr-above':'ptr-below');
    html+='<tr class="'+cls+'">'+
      '<td class="ptr-rank">'+toFa(i+1)+'</td>'+
      '<td class="ptr-name">'+esc(p.description||('جایگاه '+p.positionId))+'</td>'+
      '<td class="ptr-id">'+toFa(p.positionId)+'</td>'+
      '<td class="tnum ptr-rpm">'+fmtRpm(p.rpm)+'</td>'+
      '<td class="tnum ptr-share">'+(p.sharePercent!=null?toFa(p.sharePercent.toFixed(1))+'٪':'—')+'</td>'+
      '<td class="tnum ptr-cumul">'+(p.cumulativeShare!=null?toFa(p.cumulativeShare.toFixed(1))+'٪':'—')+'</td>'+
      '<td class="tnum">'+toFa(p.rowCount||0)+'</td>'+
    '</tr>';
    var shot=reportData.screenshots&&reportData.screenshots[p.positionId];
    if(shot)html+='<tr class="ptr-shot-row"><td colspan="7"><img class="ptr-shot-img" src="'+shot+'" /></td></tr>';
  });
  html+='</tbody></table>';
  return html;
}

// ── Rerender (no full DOM rebuild) ─────────────────────────────
function rerenderCharts(){
  if(!reportData)return;
  var pts=getPubPts();
  var bd=filteredPubDaily();
  var totalAdv=Object.keys(bd).reduce(function(s,k){return s+bd[k].adv;},0);
  var pvVals=Object.keys(bd).filter(function(k){return bd[k].pv>0;}).map(function(k){return bd[k].pv;});
  var avgPv=pvVals.length?pvVals.reduce(function(s,v){return s+v;},0)/pvVals.length:0;
  var validDays=Object.keys(bd).filter(function(k){return bd[k].pv>0;});
  var totalRpm=validDays.length?validDays.reduce(function(s,k){return s+bd[k].adv/bd[k].pv;},0)/validDays.length:null;
  var el;
  el=document.getElementById('stat-rpm');if(el)el.textContent=fmtRpm(totalRpm);
  el=document.getElementById('stat-pv');if(el)el.textContent=fmtNum(avgPv);
  el=document.getElementById('stat-adv');if(el)el.textContent=fmtNum(totalAdv);
  el=document.getElementById('hdr-rpm-val');if(el)el.textContent=fmtRpm(totalRpm);
  el=document.getElementById('chart-rpm');if(el)el.innerHTML=makeLineSvg(pts,800,200,{pL:54,pR:16,pT:14,pB:42},'rpm');
  el=document.getElementById('chart-adv');if(el)el.innerHTML=makeLineSvg(pts,500,180,{pL:64,pR:12,pT:12,pB:40},'totalAdv');
  el=document.getElementById('chart-pv');if(el)el.innerHTML=makeLineSvg(pts,500,180,{pL:64,pR:12,pT:12,pB:40},'avgPv');
  el=document.getElementById('outlook-section');if(el)el.innerHTML=buildOutlookHTML(computeOutlook(bd));
  el=document.getElementById('pos-table-wrap');if(el)el.innerHTML=buildPositionTable(computePositionStats());
}

function updateScreenshots(){
  var el=document.getElementById('pos-table-wrap');
  if(el)el.innerHTML=buildPositionTable(computePositionStats());
}

// ── Main render ────────────────────────────────────────────────
function render(d){
  reportData=d;
  var root=document.getElementById('root');

  // build month keys from full (unfiltered) data
  var keySet={};
  (d.matched||[]).forEach(function(pos){
    getFullRows(pos.positionId).forEach(function(r){
      var j=isoToJ(r[0]);keySet[j.y+'/'+p2(j.m)]=1;
    });
  });
  allMonthKeys=Object.keys(keySet).sort();

  // init filter from report's selected date range (sidebar selection)
  if(!filterFrom){filterFrom=safeJYM(d.from);}
  if(!filterTo){filterTo=safeJYM(d.to);}
  if(!filterFrom&&allMonthKeys.length){var fp=allMonthKeys[0].split('/');filterFrom=parseInt(fp[0])*100+parseInt(fp[1]);}
  if(!filterTo&&allMonthKeys.length){var tp=allMonthKeys[allMonthKeys.length-1].split('/');filterTo=parseInt(tp[0])*100+parseInt(tp[1]);}

  var bd=filteredPubDaily();
  var pts=getPubPts();
  var outlook=computeOutlook(bd);
  var totalAdv=Object.keys(bd).reduce(function(s,k){return s+bd[k].adv;},0);
  var pvVals=Object.keys(bd).filter(function(k){return bd[k].pv>0;}).map(function(k){return bd[k].pv;});
  var avgPv=pvVals.length?pvVals.reduce(function(s,v){return s+v;},0)/pvVals.length:0;
  var validDays=Object.keys(bd).filter(function(k){return bd[k].pv>0;});
  var totalRpm=validDays.length?validDays.reduce(function(s,k){return s+bd[k].adv/bd[k].pv;},0)/validDays.length:null;
  var posStats=computePositionStats();

  var html='';
  html+='<div class="hdr">'+
    '<div class="hdr-brand"><div class="y-logo">Y</div>'+
    '<div><div class="hdr-name">'+esc(d.publisherName||'گزارش ناشر')+'</div>'+
    '<div class="hdr-meta">'+esc(d.appId||'')+'&nbsp;&middot;&nbsp;'+esc(d.pageTitle||'')+'</div></div></div>'+
    '<div class="rpm-pill"><span class="rpm-pill-val" id="hdr-rpm-val">'+fmtRpm(totalRpm)+'</span><span class="rpm-pill-lbl">میانگین RPM</span></div>'+
  '</div>';
  html+=buildFilterBar();
  html+='<div class="main">';
  html+='<div class="stats-row">'+
    '<div class="stat-card"><div class="stat-card-lbl">میانگین RPM</div><div class="stat-card-val" id="stat-rpm">'+fmtRpm(totalRpm)+'</div><div class="stat-card-unit">K تومان / ۱K نمایش</div></div>'+
    '<div class="stat-card"><div class="stat-card-lbl">جایگاه‌های فعال</div><div class="stat-card-val">'+toFa(posStats.filter(function(p){return p.rpm!=null;}).length)+'</div><div class="stat-card-unit">جایگاه دارای داده</div></div>'+
    '<div class="stat-card"><div class="stat-card-lbl">میانگین PV روزانه</div><div class="stat-card-val" id="stat-pv">'+fmtNum(avgPv)+'</div><div class="stat-card-unit">بازدید در روز</div></div>'+
    '<div class="stat-card"><div class="stat-card-lbl">مجموع هزینه تبلیغات</div><div class="stat-card-val" id="stat-adv" style="font-size:18px">'+fmtNum(totalAdv)+'</div><div class="stat-card-unit">تومان</div></div>'+
  '</div>';
  html+='<div class="sec-lbl">ترند RPM ناشر</div>';
  html+='<div class="chart-section" id="chart-rpm">'+makeLineSvg(pts,800,200,{pL:54,pR:16,pT:14,pB:42},'rpm')+'</div>';
  html+='<div class="charts-duo">'+
    '<div><div class="sec-lbl">هزینه تبلیغات</div><div class="chart-section" id="chart-adv">'+makeLineSvg(pts,500,180,{pL:64,pR:12,pT:12,pB:40},'totalAdv')+'</div></div>'+
    '<div><div class="sec-lbl">بازدید صفحه (PV)</div><div class="chart-section" id="chart-pv">'+makeLineSvg(pts,500,180,{pL:64,pR:12,pT:12,pB:40},'avgPv')+'</div></div>'+
  '</div>';
  if(outlook){
    html+='<div class="sec-lbl">چشم‌انداز درآمدی</div><div class="outlook-row" id="outlook-section">'+buildOutlookHTML(outlook)+'</div>';
  } else {
    html+='<div id="outlook-section"></div>';
  }
  html+='<div class="sec-lbl">جایگاه‌های تبلیغاتی</div>'+
    '<div id="pos-table-wrap">'+buildPositionTable(posStats)+'</div>';
  html+='</div>';

  root.innerHTML=html;
  wireFilterBar();
}

// ── Bootstrap ──────────────────────────────────────────────────
chrome.storage.local.get('ynprice_report',function(stored){
  document.getElementById('loading').style.display='none';
  document.getElementById('root').style.display='';
  if(!stored.ynprice_report){
    document.getElementById('root').innerHTML='<div style="height:80vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px"><div style="font-size:52px">😕</div><div style="font-size:18px;font-weight:600">گزارشی یافت نشد</div><div style="font-size:13px;color:var(--muted)">لطفاً دوباره از اکستنشن گزارش بگیرید</div></div>';
    return;
  }
  var report=stored.ynprice_report;
  fetch(chrome.runtime.getURL('data/publisher_data.json'))
    .then(function(r){return r.json();})
    .catch(function(){return null;})
    .then(function(allData){
      if(allData&&report.appId&&allData[report.appId])pubData=allData[report.appId];
      render(report);
    });
});

chrome.storage.onChanged.addListener(function(changes,area){
  if(area!=='local'||!changes.ynprice_report)return;
  var nv=changes.ynprice_report.newValue;
  if(!nv||!reportData)return;
  if(nv.screenshots){reportData.screenshots=nv.screenshots;updateScreenshots();}
});
})();
