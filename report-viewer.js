(function(){
'use strict';
var MONTHS=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];

function gToJ(gy,gm,gd){gy-=1600;gm-=1;gd-=1;var g=365*gy+Math.floor((gy+3)/4)-Math.floor((gy+99)/100)+Math.floor((gy+399)/400);[31,28,31,30,31,30,31,31,30,31,30,31].forEach(function(v,i){if(i<gm)g+=v;});if(gm>1&&((gy%4===0&&gy%100!==0)||gy%400===0))g++;g+=gd;var j=g-79,jp=Math.floor(j/12053);j%=12053;var jy=979+33*jp+4*Math.floor(j/1461);j%=1461;if(j>=366){jy+=Math.floor((j-1)/365);j=(j-1)%365;}var jm=0,jd=[31,31,31,31,31,31,30,30,30,30,30,29];while(jm<11&&j>=jd[jm]){j-=jd[jm];jm++;}return{y:jy,m:jm+1,d:j+1};}
function jToG(jy,jm,jd){jy-=979;jm-=1;jd-=1;var jd2=[31,31,31,31,31,31,30,30,30,30,30,29];var j=365*jy+Math.floor(jy/33)*8+Math.floor((jy%33+3)/4);for(var i=0;i<jm;i++)j+=jd2[i];j+=jd;var g=j+79,gy=1600+400*Math.floor(g/146097);g%=146097;var leap=true;if(g>=36525){g--;gy+=100*Math.floor(g/36524);g%=36524;if(g>=365)g++;else leap=false;}gy+=4*Math.floor(g/1461);g%=1461;if(g>=366){leap=false;g--;gy+=Math.floor(g/365);g%=365;}var gd2=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31],gm2=0;while(g>=gd2[gm2]){g-=gd2[gm2];gm2++;}return{y:gy,m:gm2+1,d:g+1};}
function jToISO(jy,jm,jd){var g=jToG(jy,jm,jd);return g.y+'-'+p2(g.m)+'-'+p2(g.d);}
function p2(n){return String(n).padStart(2,'0');}
function toFa(s){return String(s).replace(/[0-9]/g,function(d){return '۰۱۲۳۴۵۶۷۸۹'[+d];});}
function fmtRpm(n){return n!=null?toFa((Math.round(n*100)/100).toFixed(2)):'—';}
function fmtNum(n){return n!=null?toFa(Math.round(n).toLocaleString('en')):'—';}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function isoToJ(iso){var p=iso.split('-').map(Number);return gToJ(p[0],p[1],p[2]);}
function isoToJYM(iso){var j=isoToJ(iso);return j.y*100+j.m;}

// ── State ─────────────────────────────────────────────────────
var reportData=null;
var filterFrom=null; // JYM int e.g. 140401
var filterTo=null;
var chartMode='monthly'; // 'monthly'|'daily'

function filteredRows(rows){
  if(!filterFrom&&!filterTo) return rows;
  return (rows||[]).filter(function(r){
    var jym=isoToJYM(r[0]);
    if(filterFrom&&jym<filterFrom) return false;
    if(filterTo&&jym>filterTo) return false;
    return true;
  });
}

function filteredPubDaily(matched){
  var b={};
  (matched||[]).forEach(function(pos){
    filteredRows(pos.rows||[]).forEach(function(r){
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
    var d=byDate[date];if(d.pv<=0)return;
    var j=isoToJ(date);var key=j.y+'/'+p2(j.m);
    if(!acc[key])acc[key]={adv:0,pv:0,days:0,jy:j.y,jm:j.m};
    acc[key].adv+=d.adv;acc[key].pv+=d.pv;acc[key].days++;
  });
  return Object.keys(acc).sort().map(function(key){
    var m=acc[key];
    return{key:key,label:MONTHS[m.jm-1],jy:m.jy,jm:m.jm,rpm:m.pv>0?m.adv/m.pv:0,totalAdv:m.adv,avgPv:Math.round(m.pv/m.days),days:m.days};
  });
}

function getDailyArr(byDate){
  return Object.keys(byDate).sort().filter(function(d){return byDate[d].pv>0;}).map(function(d){
    var j=isoToJ(d);
    return{key:d,label:toFa(j.m+'/'+j.d),rpm:byDate[d].adv/byDate[d].pv,totalAdv:byDate[d].adv,avgPv:byDate[d].pv};
  });
}

function groupPosRowsByMonth(rows){
  var acc={};
  filteredRows(rows||[]).forEach(function(r){
    if(r[2]<=0)return;var j=isoToJ(r[0]);var key=j.y+'/'+p2(j.m);
    if(!acc[key])acc[key]={adv:0,pv:0,days:0,jy:j.y,jm:j.m};
    acc[key].adv+=r[1];acc[key].pv+=r[2];acc[key].days++;
  });
  return Object.keys(acc).sort().map(function(key){
    var m=acc[key];return{key:key,label:MONTHS[m.jm-1],rpm:m.adv/m.pv,totalAdv:m.adv,avgPv:Math.round(m.pv/m.days),days:m.days};
  });
}

function getPosDaily(rows){
  var byDate={};
  filteredRows(rows||[]).forEach(function(r){
    if(r[2]<=0)return;
    byDate[r[0]]={adv:r[1],pv:r[2]};
  });
  return getDailyArr(byDate);
}

function computeOutlook(byDate){
  var vals=Object.keys(byDate).map(function(k){return byDate[k];}).filter(function(d){return d.pv>0;});
  if(vals.length<5)return null;
  var rpms=vals.map(function(d){return d.adv/d.pv;}).sort(function(a,b){return a-b;});
  var avgPv=vals.map(function(d){return d.pv;}).reduce(function(s,v){return s+v;},0)/vals.length;
  var n=rpms.length;
  return{pessimistic:{rpm:rpms[Math.floor(n*.2)],monthly:rpms[Math.floor(n*.2)]*avgPv*30},realistic:{rpm:rpms[Math.floor(n*.5)],monthly:rpms[Math.floor(n*.5)]*avgPv*30},optimistic:{rpm:rpms[Math.floor(n*.8)],monthly:rpms[Math.floor(n*.8)]*avgPv*30},avgPv:avgPv};
}

// ── SVG charts ─────────────────────────────────────────────────
function makeLineSvg(pts,W,H,opts,field){
  field=field||'rpm';
  if(!pts||pts.length<2)return'<div class="chart-empty">داده کافی وجود ندارد</div>';
  opts=opts||{};var pL=opts.pL||52,pR=opts.pR||14,pT=opts.pT||14,pB=opts.pB||42;
  var cW=W-pL-pR,cH=H-pT-pB;
  var vals=pts.map(function(p){return p[field]||0;});
  var mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals),rng=mx-mn||.01;
  var isAdv=field==='totalAdv';
  var color=isAdv?'#60a5fa':'#FED049';
  var coords=pts.map(function(p,i){return{x:pL+(i/Math.max(pts.length-1,1))*cW,y:pT+(1-(p[field]-mn)/rng)*cH,label:p.label,val:p[field]};});
  var line=coords.map(function(c,i){return(i===0?'M':'L')+c.x.toFixed(1)+','+c.y.toFixed(1);}).join(' ');
  var area=line+' L'+coords[coords.length-1].x.toFixed(1)+','+(pT+cH)+' L'+pL+','+(pT+cH)+' Z';
  var gridLines='',yLabels='';
  for(var ti=0;ti<=4;ti++){var t=ti/4,yy=pT+(1-t)*cH,val=mn+t*rng;gridLines+='<line x1="'+pL+'" y1="'+yy.toFixed(1)+'" x2="'+(W-pR)+'" y2="'+yy.toFixed(1)+'" stroke="currentColor" stroke-opacity="0.07" stroke-width="1"/>';var lbl=isAdv?toFa(Math.round(val/1000)+'K'):toFa(val.toFixed(1));yLabels+='<text x="'+(pL-5)+'" y="'+(yy+4).toFixed(1)+'" text-anchor="end" font-size="10" fill="currentColor" fill-opacity="0.55">'+lbl+'</text>';}
  var xLabels='',step=pts.length<=12?1:Math.ceil(pts.length/12);
  coords.forEach(function(c,i){if(i%step!==0&&i!==pts.length-1)return;xLabels+='<text x="'+c.x.toFixed(1)+'" y="'+(H-5)+'" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.6">'+c.label+'</text>';});
  var dots=coords.length<=60?coords.map(function(c){return'<circle cx="'+c.x.toFixed(1)+'" cy="'+c.y.toFixed(1)+'" r="3" fill="'+color+'" stroke="var(--card)" stroke-width="2"/>';}).join(''):'';
  var gid='g'+Math.random().toString(36).slice(2,9);
  return'<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;display:block;overflow:visible" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="'+color+'" stop-opacity="0.28"/><stop offset="100%" stop-color="'+color+'" stop-opacity="0"/></linearGradient></defs>'+gridLines+'<path d="'+area+'" fill="url(#'+gid+')"/><path d="'+line+'" fill="none" stroke="'+color+'" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>'+dots+yLabels+xLabels+'</svg>';
}

function makeSparkSvg(pts,W,H){
  if(!pts||pts.length<2)return'';
  var vals=pts.map(function(p){return p.rpm;});
  var mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals),rng=mx-mn||.01;
  var p=vals.map(function(v,i){var x=(i/(vals.length-1))*W,y=H-((v-mn)/rng)*(H-3)-1.5;return(i===0?'M':'L')+x.toFixed(1)+','+y.toFixed(1);}).join(' ');
  return'<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" style="display:block" xmlns="http://www.w3.org/2000/svg"><path d="'+p+' L'+W+','+H+' L0,'+H+' Z" fill="#FED049" fill-opacity="0.22"/><path d="'+p+'" fill="none" stroke="#FED049" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}

// ── Filter bar ─────────────────────────────────────────────────
function buildFilterBar(allMonthKeys){
  // allMonthKeys: sorted array of 'YYYY/MM' strings
  var minYm=allMonthKeys[0]||'1400/01';
  var maxYm=allMonthKeys[allMonthKeys.length-1]||'1404/12';
  var opts=allMonthKeys.map(function(k){
    var parts=k.split('/');
    var jy=parseInt(parts[0]),jm=parseInt(parts[1]);
    var label=MONTHS[jm-1]+' '+toFa(jy);
    return'<option value="'+k+'">'+label+'</option>';
  }).join('');

  return'<div class="filter-bar" id="filter-bar">'+
    '<div class="filter-group">'+
      '<label class="filter-lbl">از ماه</label>'+
      '<select class="filter-sel" id="flt-from">'+opts+'</select>'+
    '</div>'+
    '<div class="filter-group">'+
      '<label class="filter-lbl">تا ماه</label>'+
      '<select class="filter-sel" id="flt-to">'+opts+'</select>'+
    '</div>'+
    '<button class="filter-btn" id="flt-apply">اعمال فیلتر</button>'+
    '<div class="toggle-group">'+
      '<button class="toggle-btn'+(chartMode==='monthly'?' active':'')+'" id="tog-monthly">ماهانه</button>'+
      '<button class="toggle-btn'+(chartMode==='daily'?' active':'')+'" id="tog-daily">روزانه</button>'+
    '</div>'+
  '</div>';
}

function wireFilterBar(allMonthKeys){
  var fltFrom=document.getElementById('flt-from');
  var fltTo=document.getElementById('flt-to');
  if(!fltFrom||!fltTo) return;

  // Set current selection
  var curFromKey=filterFrom?String(Math.floor(filterFrom/100))+'/'+p2(filterFrom%100):allMonthKeys[0];
  var curToKey=filterTo?String(Math.floor(filterTo/100))+'/'+p2(filterTo%100):allMonthKeys[allMonthKeys.length-1];
  if(fltFrom.querySelector('option[value="'+curFromKey+'"]')) fltFrom.value=curFromKey;
  if(fltTo.querySelector('option[value="'+curToKey+'"]')) fltTo.value=curToKey;

  document.getElementById('flt-apply').addEventListener('click',function(){
    var fv=fltFrom.value.split('/');
    var tv=fltTo.value.split('/');
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
}

// ── Rerender charts without rebuilding whole DOM ───────────────
function rerenderCharts(){
  if(!reportData) return;
  var d=reportData;
  var pubDaily=filteredPubDaily(d.matched||[]);
  var pubPts=chartMode==='monthly'?groupByMonth(pubDaily):getDailyArr(pubDaily);

  var rpmChart=document.getElementById('chart-rpm');
  var advChart=document.getElementById('chart-adv');
  if(rpmChart) rpmChart.innerHTML=makeLineSvg(pubPts,960,210,{pL:54,pR:16,pT:14,pB:44},'rpm');
  if(advChart) advChart.innerHTML=makeLineSvg(pubPts,960,210,{pL:68,pR:16,pT:14,pB:44},'totalAdv');

  // recompute stats
  var totalAdv=Object.keys(pubDaily).reduce(function(s,k){return s+pubDaily[k].adv;},0);
  var pvVals=Object.keys(pubDaily).filter(function(k){return pubDaily[k].pv>0;}).map(function(k){return pubDaily[k].pv;});
  var avgDailyPv=pvVals.length?pvVals.reduce(function(s,v){return s+v;},0)/pvVals.length:0;
  var validDays=Object.keys(pubDaily).filter(function(k){return pubDaily[k].pv>0;});
  var totalRpm=validDays.length?validDays.reduce(function(s,k){return s+pubDaily[k].adv/pubDaily[k].pv;},0)/validDays.length:null;

  var el=document.getElementById('stat-rpm'); if(el) el.textContent=fmtRpm(totalRpm);
  el=document.getElementById('stat-pv'); if(el) el.textContent=fmtNum(avgDailyPv);
  el=document.getElementById('stat-adv'); if(el) el.textContent=fmtNum(totalAdv);

  // update header pill
  el=document.getElementById('hdr-rpm-val'); if(el) el.textContent=fmtRpm(totalRpm);

  // outlook
  var outlook=computeOutlook(pubDaily);
  var outEl=document.getElementById('outlook-section');
  if(outEl) outEl.innerHTML=buildOutlookHTML(outlook);

  // per-position charts
  (d.matched||[]).forEach(function(item){
    var posEl=document.getElementById('poscharts-'+item.positionId);
    if(!posEl) return;
    var posPts=chartMode==='monthly'?groupPosRowsByMonth(item.rows):getPosDaily(item.rows);
    posEl.innerHTML=
      '<div class="pos-expand-lbl">RPM '+( chartMode==='monthly'?'ماهانه':'روزانه' )+'</div>'+
      makeLineSvg(posPts,620,160,{pL:48,pR:12,pT:10,pB:36},'rpm')+
      '<div class="pos-expand-lbl" style="margin-top:14px">هزینه تبلیغات '+( chartMode==='monthly'?'ماهانه':'روزانه' )+'</div>'+
      makeLineSvg(posPts,620,160,{pL:56,pR:12,pT:10,pB:36},'totalAdv');
    // update sparkline
    var spark=document.getElementById('spark-'+item.positionId);
    if(spark) spark.innerHTML=makeSparkSvg(posPts,72,26);
  });
}

function buildOutlookHTML(outlook){
  if(!outlook) return'';
  var html='';
  [{key:'pessimistic',icon:'📉',title:'بدبینانه',badge:'پرسنتایل ۲۰ام',data:outlook.pessimistic},
   {key:'realistic',icon:'📊',title:'واقع‌بینانه',badge:'پرسنتایل ۵۰ام',data:outlook.realistic},
   {key:'optimistic',icon:'📈',title:'خوش‌بینانه',badge:'پرسنتایل ۸۰ام',data:outlook.optimistic}
  ].forEach(function(item){
    html+='<div class="outlook-card'+(item.key==='realistic'?' realistic':'')+'" ><div class="outlook-badge">'+item.badge+'</div><div class="outlook-icon">'+item.icon+'</div><div class="outlook-title">'+item.title+'</div><div class="outlook-rpm">'+fmtRpm(item.data.rpm)+'</div><div class="outlook-rpm-lbl">K تومان / ۱K نمایش</div><div class="outlook-divider"></div><div class="outlook-revenue">'+fmtNum(item.data.monthly)+'</div><div class="outlook-revenue-lbl">تومان / ماه (تخمینی)</div></div>';
  });
  return html;
}

// ── Screenshot update (no full re-render) ─────────────────────
function updateScreenshots(screenshots){
  if(!screenshots) return;
  Object.keys(screenshots).forEach(function(posId){
    var el=document.getElementById('screenshot-'+posId);
    if(!el) return;
    el.innerHTML='<img class="pos-screenshot-img" src="'+screenshots[posId]+'" alt="اسکرین‌شات جایگاه '+toFa(posId)+'" />';
  });
}

// ── Main render ────────────────────────────────────────────────
function render(d){
  reportData=d;
  var root=document.getElementById('root');

  // collect all month keys across all positions for filter selects
  var monthKeySet={};
  (d.matched||[]).forEach(function(pos){
    (pos.rows||[]).forEach(function(r){
      var j=isoToJ(r[0]);var k=j.y+'/'+p2(j.m);monthKeySet[k]=1;
    });
  });
  var allMonthKeys=Object.keys(monthKeySet).sort();

  // init filter to full range if not set
  if(!filterFrom&&allMonthKeys.length){
    var fp=allMonthKeys[0].split('/');
    filterFrom=parseInt(fp[0])*100+parseInt(fp[1]);
  }
  if(!filterTo&&allMonthKeys.length){
    var tp=allMonthKeys[allMonthKeys.length-1].split('/');
    filterTo=parseInt(tp[0])*100+parseInt(tp[1]);
  }

  var pubDaily=filteredPubDaily(d.matched||[]);
  var pubPts=chartMode==='monthly'?groupByMonth(pubDaily):getDailyArr(pubDaily);
  var outlook=computeOutlook(pubDaily);
  var totalAdv=Object.keys(pubDaily).reduce(function(s,k){return s+pubDaily[k].adv;},0);
  var pvVals=Object.keys(pubDaily).filter(function(k){return pubDaily[k].pv>0;}).map(function(k){return pubDaily[k].pv;});
  var avgDailyPv=pvVals.length?pvVals.reduce(function(s,v){return s+v;},0)/pvVals.length:0;
  var validDays=Object.keys(pubDaily).filter(function(k){return pubDaily[k].pv>0;});
  var totalRpm=validDays.length?validDays.reduce(function(s,k){return s+pubDaily[k].adv/pubDaily[k].pv;},0)/validDays.length:null;

  var html='';
  html+='<div class="hdr"><div class="hdr-brand"><div class="y-logo">Y</div><div><div class="hdr-name">'+esc(d.publisherName||'گزارش ناشر')+'</div><div class="hdr-meta">'+esc(d.appId||'')+'&nbsp;&middot;&nbsp;'+esc(d.pageTitle||'')+'</div></div></div><div class="rpm-pill"><span class="rpm-pill-val" id="hdr-rpm-val">'+fmtRpm(totalRpm)+'</span><span class="rpm-pill-lbl">میانگین RPM</span></div></div>';
  html+=buildFilterBar(allMonthKeys);
  html+='<div class="main">';
  html+='<div class="stats-row">'+
    '<div class="stat-card"><div class="stat-card-lbl">میانگین RPM</div><div class="stat-card-val" id="stat-rpm">'+fmtRpm(totalRpm)+'</div><div class="stat-card-unit">K تومان / ۱K نمایش</div></div>'+
    '<div class="stat-card"><div class="stat-card-lbl">جایگاه‌های فعال</div><div class="stat-card-val">'+toFa((d.matched||[]).length)+'</div><div class="stat-card-unit">جایگاه دارای داده</div></div>'+
    '<div class="stat-card"><div class="stat-card-lbl">میانگین PV روزانه</div><div class="stat-card-val" id="stat-pv">'+fmtNum(avgDailyPv)+'</div><div class="stat-card-unit">بازدید در روز</div></div>'+
    '<div class="stat-card"><div class="stat-card-lbl">مجموع هزینه تبلیغات</div><div class="stat-card-val" id="stat-adv" style="font-size:18px">'+fmtNum(totalAdv)+'</div><div class="stat-card-unit">تومان در بازه انتخابی</div></div>'+
  '</div>';

  html+='<div class="sec-lbl">ترند RPM ناشر</div>';
  html+='<div class="chart-section" id="chart-rpm">'+makeLineSvg(pubPts,960,210,{pL:54,pR:16,pT:14,pB:44},'rpm')+'</div>';

  html+='<div class="sec-lbl">ترند هزینه تبلیغات</div>';
  html+='<div class="chart-section" id="chart-adv">'+makeLineSvg(pubPts,960,210,{pL:68,pR:16,pT:14,pB:44},'totalAdv')+'</div>';

  if(outlook){
    html+='<div class="sec-lbl">چشم‌انداز درآمدی</div><div class="outlook-row" id="outlook-section">'+buildOutlookHTML(outlook)+'</div>';
  } else {
    html+='<div id="outlook-section"></div>';
  }

  html+='<div class="sec-lbl">جایگاه‌های تبلیغاتی ('+toFa((d.matched||[]).length)+' جایگاه)</div>';
  html+='<div class="pos-grid" id="pos-grid"></div>';
  html+='</div>';

  root.innerHTML=html;

  // wire filter bar
  wireFilterBar(allMonthKeys);

  // build position cards
  var grid=document.getElementById('pos-grid');
  var sorted=(d.matched||[]).slice().sort(function(a,b){return(b.rpm||0)-(a.rpm||0);});
  sorted.forEach(function(item){
    var posPts=chartMode==='monthly'?groupPosRowsByMonth(item.rows):getPosDaily(item.rows);
    var det=document.createElement('details');
    det.className='pos-card'+(item.rpm==null?' pos-no-data':'');
    det.setAttribute('data-pos-id',item.positionId);

    var hasShot=d.screenshots&&d.screenshots[item.positionId];
    var screenshotHtml='<div id="screenshot-'+item.positionId+'" class="pos-screenshot-wrap">'+(hasShot?'<img class="pos-screenshot-img" src="'+d.screenshots[item.positionId]+'" alt="اسکرین‌شات" />':'<div class="pos-screenshot-pending">در حال دریافت تصویر...</div>')+'</div>';

    det.innerHTML=
      '<summary class="pos-summary">'+
        '<div class="pos-icon">'+esc((item.positionType||item.positionId||'').slice(0,4).toUpperCase())+'</div>'+
        '<div class="pos-info"><div class="pos-name">'+esc(item.description||('جایگاه '+item.positionId))+'</div>'+
        '<div class="pos-sub">ynpos-'+toFa(item.positionId)+(item.rowCount?'&nbsp;&middot;&nbsp;'+toFa(item.rowCount)+' روز':'')+'</div></div>'+
        '<div class="pos-spark" id="spark-'+item.positionId+'">'+makeSparkSvg(posPts,72,26)+'</div>'+
        '<div class="pos-rpm-col">'+(item.rpm!=null?'<div class="pos-rpm-val">'+fmtRpm(item.rpm)+'</div><div class="pos-rpm-unit">K تومان</div>':'<div class="pos-rpm-unit" style="color:var(--muted)">بدون داده</div>')+'</div>'+
      '</summary>'+
      '<div class="pos-expand" id="poscharts-'+item.positionId+'">'+
        '<div class="pos-expand-lbl">RPM '+(chartMode==='monthly'?'ماهانه':'روزانه')+'</div>'+
        makeLineSvg(posPts,620,160,{pL:48,pR:12,pT:10,pB:36},'rpm')+
        '<div class="pos-expand-lbl" style="margin-top:14px">هزینه تبلیغات '+(chartMode==='monthly'?'ماهانه':'روزانه')+'</div>'+
        makeLineSvg(posPts,620,160,{pL:56,pR:12,pT:10,pB:36},'totalAdv')+
        screenshotHtml+
      '</div>';
    grid.appendChild(det);
  });

  (d.unmatched||[]).forEach(function(pid){
    var det=document.createElement('details');det.className='pos-card pos-no-data';
    det.innerHTML='<summary class="pos-summary"><div class="pos-icon" style="font-size:18px">—</div><div class="pos-info"><div class="pos-name">جایگاه '+toFa(pid)+'</div><div class="pos-sub">ynpos-'+toFa(pid)+'&nbsp;&middot;&nbsp;بدون داده در این بازه</div></div><div class="pos-rpm-col"><div class="pos-rpm-unit" style="color:var(--muted)">—</div></div></summary>';
    grid.appendChild(det);
  });
}

// ── Bootstrap ──────────────────────────────────────────────────
chrome.storage.local.get('ynprice_report',function(result){
  document.getElementById('loading').style.display='none';
  document.getElementById('root').style.display='';
  if(!result.ynprice_report){
    document.getElementById('root').innerHTML='<div style="height:80vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px"><div style="font-size:52px">😕</div><div style="font-size:18px;font-weight:600">گزارشی یافت نشد</div><div style="font-size:13px;color:var(--muted)">لطفاً دوباره از اکستنشن گزارش بگیرید</div></div>';
    return;
  }
  render(result.ynprice_report);
});

chrome.storage.onChanged.addListener(function(changes,area){
  if(area!=='local'||!changes.ynprice_report) return;
  var newVal=changes.ynprice_report.newValue;
  if(!newVal) return;
  // if screenshots arrived, patch DOM without full re-render
  if(reportData&&newVal.screenshots){
    reportData.screenshots=newVal.screenshots;
    updateScreenshots(newVal.screenshots);
  }
});
})();
