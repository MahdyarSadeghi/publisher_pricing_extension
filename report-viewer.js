(function(){
'use strict';
var MONTHS=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
function gToJ(gy,gm,gd){gy-=1600;gm-=1;gd-=1;var g=365*gy+Math.floor((gy+3)/4)-Math.floor((gy+99)/100)+Math.floor((gy+399)/400);[31,28,31,30,31,30,31,31,30,31,30,31].forEach(function(v,i){if(i<gm)g+=v;});if(gm>1&&((gy%4===0&&gy%100!==0)||gy%400===0))g++;g+=gd;var j=g-79,jp=Math.floor(j/12053);j%=12053;var jy=979+33*jp+4*Math.floor(j/1461);j%=1461;if(j>=366){jy+=Math.floor((j-1)/365);j=(j-1)%365;}var jm=0,jd=[31,31,31,31,31,31,30,30,30,30,30,29];while(jm<11&&j>=jd[jm]){j-=jd[jm];jm++;}return{y:jy,m:jm+1,d:j+1};}
function p2(n){return String(n).padStart(2,'0');}
function toFa(s){return String(s).replace(/[0-9]/g,function(d){return '۰۱۲۳۴۵۶۷۸۹'[+d];});}
function fmtRpm(n){return n!=null?toFa((Math.round(n*100)/100).toFixed(2)):'—';}
function fmtNum(n){return n!=null?toFa(Math.round(n).toLocaleString('en')):'—';}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function isoToJ(iso){var p=iso.split('-').map(Number);return gToJ(p[0],p[1],p[2]);}

function computePubDaily(matched){
  var b={};
  matched.forEach(function(pos){(pos.rows||[]).forEach(function(r){if(!b[r[0]])b[r[0]]={adv:0,pv:0};b[r[0]].adv+=r[1];b[r[0]].pv=Math.max(b[r[0]].pv,r[2]);});});
  return b;
}
function groupByMonth(byDate){
  var acc={};
  Object.keys(byDate).sort().forEach(function(date){var d=byDate[date];if(d.pv<=0)return;var j=isoToJ(date);var key=j.y+'/'+p2(j.m);if(!acc[key])acc[key]={adv:0,pv:0,days:0,jy:j.y,jm:j.m};acc[key].adv+=d.adv;acc[key].pv+=d.pv;acc[key].days++;});
  return Object.keys(acc).sort().map(function(key){var m=acc[key];return{key:key,label:MONTHS[m.jm-1],rpm:m.adv/m.pv,avgPv:Math.round(m.pv/m.days),totalAdv:m.adv,days:m.days};});
}
function groupPosRowsByMonth(rows){
  var acc={};
  (rows||[]).forEach(function(r){if(r[2]<=0)return;var j=isoToJ(r[0]);var key=j.y+'/'+p2(j.m);if(!acc[key])acc[key]={adv:0,pv:0,days:0,jy:j.y,jm:j.m};acc[key].adv+=r[1];acc[key].pv+=r[2];acc[key].days++;});
  return Object.keys(acc).sort().map(function(key){var m=acc[key];return{key:key,label:MONTHS[m.jm-1],rpm:m.adv/m.pv,days:m.days};});
}
function computeOutlook(byDate){
  var vals=Object.keys(byDate).map(function(k){return byDate[k];}).filter(function(d){return d.pv>0;});
  if(vals.length<5)return null;
  var rpms=vals.map(function(d){return d.adv/d.pv;}).sort(function(a,b){return a-b;});
  var avgPv=vals.map(function(d){return d.pv;}).reduce(function(s,v){return s+v;},0)/vals.length;
  var n=rpms.length;
  return{pessimistic:{rpm:rpms[Math.floor(n*.2)],monthly:rpms[Math.floor(n*.2)]*avgPv*30},realistic:{rpm:rpms[Math.floor(n*.5)],monthly:rpms[Math.floor(n*.5)]*avgPv*30},optimistic:{rpm:rpms[Math.floor(n*.8)],monthly:rpms[Math.floor(n*.8)]*avgPv*30},avgPv:avgPv};
}

function makeLineSvg(months,W,H,opts){
  if(!months||months.length<2)return '<div class="chart-empty">داده کافی برای نمایش نمودار وجود ندارد</div>';
  opts=opts||{};var pL=opts.pL||52,pR=opts.pR||14,pT=opts.pT||14,pB=opts.pB||42;
  var cW=W-pL-pR,cH=H-pT-pB;
  var rpms=months.map(function(m){return m.rpm;});
  var mn=Math.min.apply(null,rpms),mx=Math.max.apply(null,rpms),rng=mx-mn||.01;
  var coords=months.map(function(m,i){return{x:pL+(i/Math.max(months.length-1,1))*cW,y:pT+(1-(m.rpm-mn)/rng)*cH,label:m.label};});
  var line=coords.map(function(c,i){return(i===0?'M':'L')+c.x.toFixed(1)+','+c.y.toFixed(1);}).join(' ');
  var area=line+' L'+coords[coords.length-1].x.toFixed(1)+','+(pT+cH)+' L'+pL+','+(pT+cH)+' Z';
  var gridLines='',yLabels='';
  for(var ti=0;ti<=4;ti++){var t=ti/4,yy=pT+(1-t)*cH,val=mn+t*rng;gridLines+='<line x1="'+pL+'" y1="'+yy.toFixed(1)+'" x2="'+(W-pR)+'" y2="'+yy.toFixed(1)+'" stroke="currentColor" stroke-opacity="0.07" stroke-width="1"/>';yLabels+='<text x="'+(pL-5)+'" y="'+(yy+4).toFixed(1)+'" text-anchor="end" font-size="10" fill="currentColor" fill-opacity="0.55">'+toFa(val.toFixed(1))+'</text>';}
  var xLabels='',step=months.length<=10?1:Math.ceil(months.length/10);
  coords.forEach(function(c,i){if(i%step!==0&&i!==months.length-1)return;xLabels+='<text x="'+c.x.toFixed(1)+'" y="'+(H-5)+'" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.6">'+c.label+'</text>';});
  var dots=coords.map(function(c){return'<circle cx="'+c.x.toFixed(1)+'" cy="'+c.y.toFixed(1)+'" r="3.5" fill="#FED049" stroke="var(--card)" stroke-width="2"/>';}).join('');
  var gid='g'+Math.random().toString(36).slice(2,9);
  return'<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;display:block;overflow:visible" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FED049" stop-opacity="0.28"/><stop offset="100%" stop-color="#FED049" stop-opacity="0"/></linearGradient></defs>'+gridLines+'<path d="'+area+'" fill="url(#'+gid+')"/><path d="'+line+'" fill="none" stroke="#FED049" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>'+dots+yLabels+xLabels+'</svg>';
}
function makeSparkSvg(months,W,H){
  if(!months||months.length<2)return'';
  var rpms=months.map(function(m){return m.rpm;});
  var mn=Math.min.apply(null,rpms),mx=Math.max.apply(null,rpms),rng=mx-mn||.01;
  var pts=rpms.map(function(v,i){var x=(i/(rpms.length-1))*W,y=H-((v-mn)/rng)*(H-3)-1.5;return(i===0?'M':'L')+x.toFixed(1)+','+y.toFixed(1);}).join(' ');
  return'<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" style="display:block" xmlns="http://www.w3.org/2000/svg"><path d="'+pts+' L'+W+','+H+' L0,'+H+' Z" fill="#FED049" fill-opacity="0.22"/><path d="'+pts+'" fill="none" stroke="#FED049" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}

function render(d){
  var root=document.getElementById('root');
  var pubDaily=computePubDaily(d.matched||[]);
  var pubMonths=groupByMonth(pubDaily);
  var outlook=computeOutlook(pubDaily);
  var totalAdv=Object.keys(pubDaily).reduce(function(s,k){return s+pubDaily[k].adv;},0);
  var pvVals=Object.keys(pubDaily).filter(function(k){return pubDaily[k].pv>0;}).map(function(k){return pubDaily[k].pv;});
  var avgDailyPv=pvVals.length?pvVals.reduce(function(s,v){return s+v;},0)/pvVals.length:0;
  var html='';
  html+='<div class="hdr"><div class="hdr-brand"><div class="y-logo">Y</div><div><div class="hdr-name">'+esc(d.publisherName||'گزارش ناشر')+'</div><div class="hdr-meta">'+esc(d.appId||'')+'&nbsp;&middot;&nbsp;'+toFa((d.from||'').replace(/-/g,'/'))+'&nbsp;&mdash;&nbsp;'+toFa((d.to||'').replace(/-/g,'/'))+'</div></div></div><div class="rpm-pill"><span class="rpm-pill-val">'+fmtRpm(d.totalRpm)+'</span><span class="rpm-pill-lbl">&#x645;&#x6CC;&#x627;&#x646;&#x6AF;&#x6CC;&#x646; RPM</span></div></div>';
  html+='<div class="main">';
  html+='<div class="stats-row"><div class="stat-card"><div class="stat-card-lbl">&#x645;&#x6CC;&#x627;&#x646;&#x6AF;&#x6CC;&#x646; RPM</div><div class="stat-card-val">'+fmtRpm(d.totalRpm)+'</div><div class="stat-card-unit">K &#x62A;&#x648;&#x645;&#x627;&#x646; / &#x6F1;K &#x646;&#x645;&#x627;&#x6CC;&#x634;</div></div><div class="stat-card"><div class="stat-card-lbl">&#x62C;&#x627;&#x6CC;&#x6AF;&#x627;&#x647;&#x200C;&#x647;&#x627;&#x6CC; &#x641;&#x639;&#x627;&#x644;</div><div class="stat-card-val">'+toFa((d.matched||[]).length)+'</div><div class="stat-card-unit">&#x62C;&#x627;&#x6CC;&#x6AF;&#x627;&#x647; &#x62F;&#x627;&#x631;&#x627;&#x6CC; &#x62F;&#x627;&#x62F;&#x647;</div></div><div class="stat-card"><div class="stat-card-lbl">&#x645;&#x6CC;&#x627;&#x646;&#x6AF;&#x6CC;&#x646; PV &#x631;&#x648;&#x632;&#x627;&#x646;&#x647;</div><div class="stat-card-val">'+fmtNum(avgDailyPv)+'</div><div class="stat-card-unit">&#x628;&#x627;&#x632;&#x62F;&#x6CC;&#x62F; &#x62F;&#x631; &#x631;&#x648;&#x632;</div></div><div class="stat-card"><div class="stat-card-lbl">&#x645;&#x62C;&#x645;&#x648;&#x639; &#x647;&#x632;&#x6CC;&#x646;&#x647; &#x62A;&#x628;&#x644;&#x6CC;&#x63A;&#x627;&#x62A;</div><div class="stat-card-val" style="font-size:18px">'+fmtNum(totalAdv)+'</div><div class="stat-card-unit">&#x62A;&#x648;&#x645;&#x627;&#x646; &#x62F;&#x631; &#x628;&#x627;&#x632;&#x647; &#x627;&#x646;&#x62A;&#x62E;&#x627;&#x628;&#x6CC;</div></div></div>';
  html+='<div class="sec-lbl">&#x62A;&#x631;&#x646;&#x62F; &#x645;&#x627;&#x647;&#x627;&#x646;&#x647; RPM &#x646;&#x627;&#x634;&#x631;</div>';
  html+='<div class="chart-section">'+makeLineSvg(pubMonths,960,210,{pL:54,pR:16,pT:14,pB:44})+'</div>';
  if(outlook){
    html+='<div class="sec-lbl">&#x686;&#x634;&#x645;&#x200C;&#x627;&#x646;&#x62F;&#x627;&#x632; &#x62F;&#x631;&#x622;&#x645;&#x62F;&#x6CC;</div><div class="outlook-row">';
    [
      {key:'pessimistic',icon:'📉',title:'بدبینانه',badge:'پرسنتایل ۲۰ام',data:outlook.pessimistic},
      {key:'realistic',icon:'📊',title:'واقع‌بینانه',badge:'پرسنتایل ۵۰ام',data:outlook.realistic},
      {key:'optimistic',icon:'📈',title:'خوش‌بینانه',badge:'پرسنتایل ۸۰ام',data:outlook.optimistic}
    ].forEach(function(item){
      html+='<div class="outlook-card'+(item.key==='realistic'?' realistic':'')+'" ><div class="outlook-badge">'+item.badge+'</div><div class="outlook-icon">'+item.icon+'</div><div class="outlook-title">'+item.title+'</div><div class="outlook-rpm">'+fmtRpm(item.data.rpm)+'</div><div class="outlook-rpm-lbl">K تومان / ۱K نمایش</div><div class="outlook-divider"></div><div class="outlook-revenue">'+fmtNum(item.data.monthly)+'</div><div class="outlook-revenue-lbl">تومان / ماه (تخمینی)</div></div>';
    });
    html+='</div>';
  }
  html+='<div class="sec-lbl">جایگاه‌های تبلیغاتی ('+toFa((d.matched||[]).length)+' جایگاه)</div><div class="pos-grid" id="pos-grid"></div></div>';
  root.innerHTML=html;
  var grid=document.getElementById('pos-grid');
  (d.matched||[]).slice().sort(function(a,b){return(b.rpm||0)-(a.rpm||0);}).forEach(function(item){
    var posMonths=groupPosRowsByMonth(item.rows||[]);
    var det=document.createElement('details');
    det.className='pos-card'+(item.rpm==null?' pos-no-data':'');
    det.innerHTML='<summary class="pos-summary"><div class="pos-icon">'+esc((item.positionType||item.positionId||'').slice(0,4).toUpperCase())+'</div><div class="pos-info"><div class="pos-name">'+esc(item.description||('جایگاه '+item.positionId))+'</div><div class="pos-sub">ynpos-'+toFa(item.positionId)+(item.rowCount?'&nbsp;&middot;&nbsp;'+toFa(item.rowCount)+' روز':'')+'</div></div><div class="pos-spark">'+makeSparkSvg(posMonths,72,26)+'</div><div class="pos-rpm-col">'+(item.rpm!=null?'<div class="pos-rpm-val">'+fmtRpm(item.rpm)+'</div><div class="pos-rpm-unit">K تومان</div>':'<div class="pos-rpm-unit" style="color:var(--muted)">بدون داده</div>')+'</div></summary><div class="pos-expand"><div class="pos-expand-lbl">ترند ماهانه RPM این جایگاه</div>'+makeLineSvg(posMonths,620,160,{pL:48,pR:12,pT:10,pB:36})+'</div>';
    grid.appendChild(det);
  });
  (d.unmatched||[]).forEach(function(pid){
    var det=document.createElement('details');det.className='pos-card pos-no-data';
    det.innerHTML='<summary class="pos-summary"><div class="pos-icon" style="font-size:18px">—</div><div class="pos-info"><div class="pos-name">جایگاه '+toFa(pid)+'</div><div class="pos-sub">ynpos-'+toFa(pid)+'&nbsp;&middot;&nbsp;بدون داده در این بازه</div></div><div class="pos-rpm-col"><div class="pos-rpm-unit" style="color:var(--muted)">—</div></div></summary>';
    grid.appendChild(det);
  });
}

chrome.storage.local.get('ynprice_report',function(result){
  document.getElementById('loading').style.display='none';
  if(!result.ynprice_report){
    document.getElementById('root').style.display='';
    document.getElementById('root').innerHTML='<div style="height:80vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px"><div style="font-size:52px">😕</div><div style="font-size:18px;font-weight:600">گزارشی یافت نشد</div><div style="font-size:13px;color:var(--muted)">لطفاً دوباره از اکستنشن گزارش بگیرید</div></div>';
    return;
  }
  render(result.ynprice_report);
  document.getElementById('root').style.display='';
});
})();
