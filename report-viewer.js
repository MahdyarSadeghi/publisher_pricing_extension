(function(){
'use strict';
var MONTHS=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
function gToJ(gy,gm,gd){gy-=1600;gm-=1;gd-=1;var g=365*gy+Math.floor((gy+3)/4)-Math.floor((gy+99)/100)+Math.floor((gy+399)/400);[31,28,31,30,31,30,31,31,30,31,30,31].forEach(function(v,i){if(i<gm)g+=v;});if(gm>1&&((gy%4===0&&gy%100!==0)||gy%400===0))g++;g+=gd;var j=g-79,jp=Math.floor(j/12053);j%=12053;var jy=979+33*jp+4*Math.floor(j/1461);j%=1461;if(j>=366){jy+=Math.floor((j-1)/365);j=(j-1)%365;}var jm=0,jd=[31,31,31,31,31,31,30,30,30,30,30,29];while(jm<11&&j>=jd[jm]){j-=jd[jm];jm++;}return{y:jy,m:jm+1,d:j+1};}
function jToG(jy,jm,jd){jy-=979;jm-=1;jd-=1;var jd2=[31,31,31,31,31,31,30,30,30,30,30,29];var j=365*jy+Math.floor(jy/33)*8+Math.floor((jy%33+3)/4);for(var i=0;i<jm;i++)j+=jd2[i];j+=jd;var g=j+79,gy=1600+400*Math.floor(g/146097);g%=146097;var leap=true;if(g>=36525){g--;gy+=100*Math.floor(g/36524);g%=36524;if(g>=365)g++;else leap=false;}gy+=4*Math.floor(g/1461);g%=1461;if(g>=366){leap=false;g--;gy+=Math.floor(g/365);g%=365;}var gd2=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31],gm2=0;while(g>=gd2[gm2]){g-=gd2[gm2];gm2++;}return{y:gy,m:gm2+1,d:g+1};}
function jToISO(jy,jm,jd){var g=jToG(jy,jm,jd);return g.y+'-'+p2(g.m)+'-'+p2(g.d);}
function p2(n){return String(n).padStart(2,'0');}
function toFa(s){return String(s).replace(/[0-9]/g,function(d){return'۰۱۲۳۴۵۶۷۸۹'[+d];});}
function fmtRpm(n){return n!=null?toFa((Math.round(n*100)/100).toFixed(2)):'—';}
function fmtNum(n){return n!=null?toFa(Math.round(n).toLocaleString('en')):'—';}
function fmtAxis(v,field){
  if(field==='rpm')return toFa(v.toFixed(1));
  if(v>=1e9)return toFa((v/1e9).toFixed(1))+'G';
  if(v>=1e6)return toFa((v/1e6).toFixed(1))+'M';
  if(v>=1000)return toFa(Math.round(v/1000))+'هز';
  return toFa(Math.round(v)+'');
}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function isoToJ(iso){var p=iso.split('-').map(Number);return gToJ(p[0],p[1],p[2]);}

// ── State ─────────────────────────────────────────────────────
var reportData=null,pubData=null,allMonthKeys=[];
var dataMinISO=null,dataMaxISO=null;
var filterFromISO=null,filterToISO=null;
var chartMode='monthly';
var selectedPosIds=null;
var chartDataStore={};

// ── Data helpers ───────────────────────────────────────────────
function getFullRows(posId){
  if(pubData&&pubData.positions&&pubData.positions[posId])return pubData.positions[posId].rows||[];
  var pos=(reportData.matched||[]).find(function(p){return p.positionId===posId;});
  return pos?(pos.rows||[]):[];
}
function filteredRows(rows){
  if(!filterFromISO&&!filterToISO)return rows||[];
  return(rows||[]).filter(function(r){
    if(filterFromISO&&r[0]<filterFromISO)return false;
    if(filterToISO&&r[0]>filterToISO)return false;
    return true;
  });
}
function matchesPos(pos){
  if(!selectedPosIds)return true;
  return selectedPosIds.has(String(pos.positionId));
}
function filteredPubDaily(){
  var b={};
  (reportData.matched||[]).filter(matchesPos).forEach(function(pos){
    filteredRows(getFullRows(pos.positionId)).forEach(function(r){
      if(!b[r[0]])b[r[0]]={adv:0,pv:0};
      b[r[0]].adv+=r[1];b[r[0]].pv=Math.max(b[r[0]].pv,r[2]);
    });
  });
  return b;
}
function groupByMonth(bd){
  var acc={};
  Object.keys(bd).sort().forEach(function(d){var v=bd[d];if(!v.pv)return;var j=isoToJ(d);var k=j.y+'/'+p2(j.m);if(!acc[k])acc[k]={adv:0,pv:0,days:0,jy:j.y,jm:j.m};acc[k].adv+=v.adv;acc[k].pv+=v.pv;acc[k].days++;});
  return Object.keys(acc).sort().map(function(k){var m=acc[k];return{key:k,label:MONTHS[m.jm-1],rpm:m.pv>0?m.adv/m.pv:0,totalAdv:m.adv,avgPv:Math.round(m.pv/m.days)};});
}
function getDailyArr(bd){
  return Object.keys(bd).sort().filter(function(d){return bd[d].pv>0;}).map(function(d){var j=isoToJ(d);return{key:d,label:toFa(j.m+'/'+j.d),rpm:bd[d].adv/bd[d].pv,totalAdv:bd[d].adv,avgPv:bd[d].pv};});
}
function getPubPts(){var bd=filteredPubDaily();return chartMode==='monthly'?groupByMonth(bd):getDailyArr(bd);}
function computeOutlook(bd){
  var vals=Object.keys(bd).map(function(k){return bd[k];}).filter(function(d){return d.pv>0;});
  if(vals.length<5)return null;
  var rpms=vals.map(function(d){return d.adv/d.pv;}).sort(function(a,b){return a-b;});
  var avgPv=vals.map(function(d){return d.pv;}).reduce(function(s,v){return s+v;},0)/vals.length;
  var n=rpms.length;
  return{pessimistic:{rpm:rpms[Math.floor(n*.2)],monthly:rpms[Math.floor(n*.2)]*avgPv*30},realistic:{rpm:rpms[Math.floor(n*.5)],monthly:rpms[Math.floor(n*.5)]*avgPv*30},optimistic:{rpm:rpms[Math.floor(n*.8)],monthly:rpms[Math.floor(n*.8)]*avgPv*30}};
}
function computePubPercentiles(bd){
  var rpms=Object.keys(bd).filter(function(k){return bd[k].pv>0;}).map(function(k){return bd[k].adv/bd[k].pv;}).sort(function(a,b){return a-b;});
  if(!rpms.length)return{p20:null,p50:null,p80:null};
  var n=rpms.length;
  return{p20:rpms[Math.floor(n*.2)],p50:rpms[Math.floor(n*.5)],p80:rpms[Math.floor(n*.8)]};
}
function computePositionStats(){
  var stats=(reportData.matched||[]).map(function(pos){
    var rows=filteredRows(getFullRows(pos.positionId));
    var valid=rows.filter(function(r){return r[2]>0;});
    var totalAdv=rows.reduce(function(s,r){return s+r[1];},0);
    var rpms=valid.map(function(r){return r[1]/r[2];}).sort(function(a,b){return a-b;});
    var n=rpms.length;
    return{positionId:pos.positionId,description:pos.description,positionType:pos.positionType,rpm:n?rpms[Math.floor(n*.5)]:null,p20:n?rpms[Math.floor(n*.2)]:null,p50:n?rpms[Math.floor(n*.5)]:null,p80:n?rpms[Math.floor(n*.8)]:null,totalAdv:totalAdv,rowCount:n};
  });
  var withData=stats.filter(function(p){return p.rpm!=null;}).sort(function(a,b){return(b.rpm||0)-(a.rpm||0);});
  var noData=stats.filter(function(p){return p.rpm==null;});
  var total=withData.reduce(function(s,p){return s+p.totalAdv;},0);
  var cumul=0;
  withData.forEach(function(p){p.sharePercent=total>0?(p.totalAdv/total*100):0;cumul+=p.sharePercent;p.cumulativeShare=cumul;p.aboveThreshold=(cumul-p.sharePercent)<90;});
  return withData.concat(noData);
}

// ── SVG charts (rebuilt from scratch) ─────────────────────────
function makeLineSvg(pts,W,H,opts,field){
  field=field||'rpm';
  if(!pts||pts.length<2)return'<div class="chart-empty">داده کافی وجود ندارد</div>';
  opts=opts||{};
  var pL=opts.pL||68,pR=opts.pR||20,pT=opts.pT||18,pB=opts.pB||44;
  var cW=W-pL-pR,cH=H-pT-pB;
  var vals=pts.map(function(p){return+(p[field]||0);});
  var mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals),rng=mx-mn||.01;
  // y padding so line never touches top/bottom
  var yPad=rng*.12;
  var yMin=mn-yPad*.5,yMax=mx+yPad,yRng=yMax-yMin;
  var isAdv=field==='totalAdv',isPv=field==='avgPv';
  var color=isAdv?'#60a5fa':isPv?'#34d399':'#FED049';
  var xPad=10;
  var xS=pL+xPad,xE=W-pR-xPad;
  var n=pts.length;
  var coords=pts.map(function(p,i){
    return{x:n===1?(xS+xE)/2:xS+(i/(n-1))*(xE-xS),y:pT+(1-((p[field]||0)-yMin)/yRng)*cH,label:p.label,v:+(p[field]||0)};
  });
  // Smooth Catmull-Rom path
  var linePath;
  if(n<=60){
    linePath='M'+coords[0].x.toFixed(1)+','+coords[0].y.toFixed(1);
    for(var i=1;i<n;i++){
      var p0=coords[Math.max(0,i-2)],p1=coords[i-1],p2=coords[i],p3=coords[Math.min(n-1,i+1)];
      var t=0.2;
      linePath+=' C'+(p1.x+(p2.x-p0.x)*t).toFixed(1)+','+(p1.y+(p2.y-p0.y)*t).toFixed(1)+' '+(p2.x-(p3.x-p1.x)*t).toFixed(1)+','+(p2.y-(p3.y-p1.y)*t).toFixed(1)+' '+p2.x.toFixed(1)+','+p2.y.toFixed(1);
    }
  } else {
    linePath=coords.map(function(c,i){return(i===0?'M':'L')+c.x.toFixed(1)+','+c.y.toFixed(1);}).join(' ');
  }
  var areaPath=linePath+' L'+xE.toFixed(1)+','+(pT+cH)+' L'+xS.toFixed(1)+','+(pT+cH)+' Z';
  // Grid
  var grid='',yLbls='';
  for(var gi=0;gi<=4;gi++){var gt=gi/4,gyy=pT+(1-gt)*cH,gv=yMin+gt*yRng;grid+='<line x1="'+pL+'" y1="'+gyy.toFixed(1)+'" x2="'+(W-pR)+'" y2="'+gyy.toFixed(1)+'" stroke="currentColor" stroke-opacity="0.06" stroke-width="1"/>';yLbls+='<text x="'+(pL-8)+'" y="'+(gyy+4).toFixed(1)+'" text-anchor="end" font-size="10" fill="currentColor" fill-opacity="0.45">'+fmtAxis(gv,field)+'</text>';}
  // X labels
  var xLbls='',step=n<=12?1:n<=30?2:Math.ceil(n/12);
  coords.forEach(function(c,i){if(i%step!==0&&i!==n-1)return;xLbls+='<text x="'+c.x.toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.5">'+c.label+'</text>';});
  // Static dots (small, only for monthly/sparse data)
  var dots='';
  if(n<=24)dots=coords.map(function(c){return'<circle cx="'+c.x.toFixed(1)+'" cy="'+c.y.toFixed(1)+'" r="2.5" fill="'+color+'" stroke="var(--card)" stroke-width="1.5"/>';}).join('');
  // Hit rects for hover
  var colW=n>1?(xE-xS)/(n-1):cW;
  var hits=coords.map(function(c,i){
    var rx=i===0?xS-xPad:c.x-colW/2;
    var rw=i===0?colW/2+xPad:(i===n-1?colW/2+xPad:colW);
    return'<rect class="hr" data-i="'+i+'" x="'+rx.toFixed(1)+'" y="'+pT+'" width="'+rw.toFixed(1)+'" height="'+cH+'" fill="transparent" style="cursor:crosshair"/>';
  }).join('');
  var gid='g'+Math.random().toString(36).slice(2,9);
  var cpId='clip'+gid;
  chartDataStore[gid]={pts:pts,coords:coords,pL:pL,pT:pT,W:W,H:H,field:field,xS:xS,xE:xE,cH:cH};
  return'<div class="chart-wrap" data-gid="'+gid+'" style="position:relative">'+
    '<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">'+
    '<defs>'+
      '<linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="'+color+'" stop-opacity="0.18"/><stop offset="85%" stop-color="'+color+'" stop-opacity="0"/></linearGradient>'+
      '<clipPath id="'+cpId+'"><rect x="'+pL+'" y="'+(pT-4)+'" width="'+cW+'" height="'+(cH+8)+'"/></clipPath>'+
    '</defs>'+
    grid+
    '<path d="'+areaPath+'" fill="url(#'+gid+')" clip-path="url(#'+cpId+')"/>'+
    '<path d="'+linePath+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#'+cpId+')"/>'+
    dots+
    '<line class="c-line" x1="'+xS+'" y1="'+(pT-4)+'" x2="'+xS+'" y2="'+(pT+cH+4)+'" stroke="currentColor" stroke-opacity="0.2" stroke-width="1" stroke-dasharray="3,2" style="display:none"/>'+
    '<circle class="h-dot" cx="'+xS+'" cy="'+pT+'" r="5" fill="'+color+'" stroke="var(--card)" stroke-width="2.5" style="display:none"/>'+
    hits+yLbls+xLbls+
    '</svg>'+
    '<div class="chart-tt" id="tt-'+gid+'"></div>'+
  '</div>';
}

function initTooltips(){
  document.querySelectorAll('.chart-wrap[data-gid]').forEach(function(wrap){
    var gid=wrap.getAttribute('data-gid');
    var cd=chartDataStore[gid];
    if(!cd||!cd.pts||cd.pts.length<2)return;
    var svg=wrap.querySelector('svg');
    var tt=wrap.querySelector('.chart-tt');
    var cLine=wrap.querySelector('.c-line');
    var hDot=wrap.querySelector('.h-dot');
    if(!svg||!tt)return;
    function show(idx){
      var pt=cd.pts[idx],c=cd.coords[idx];if(!pt||!c)return;
      var val=+(pt[cd.field]||0);
      var isAdv=cd.field==='totalAdv',isPv=cd.field==='avgPv';
      var vs=isAdv?fmtNum(val):(isPv?fmtNum(val):fmtRpm(val));
      tt.innerHTML='<span class="tt-label">'+pt.label+'</span><span class="tt-val">'+vs+'</span>';
      tt.style.display='flex';
      var pct=c.x/cd.W*100;
      tt.style.left=pct+'%';
      tt.style.transform=pct<12?'translateX(0)':pct>88?'translateX(-100%)':'translateX(-50%)';
      if(cLine){cLine.setAttribute('x1',c.x.toFixed(1));cLine.setAttribute('x2',c.x.toFixed(1));cLine.style.display='';}
      if(hDot){hDot.setAttribute('cx',c.x.toFixed(1));hDot.setAttribute('cy',c.y.toFixed(1));hDot.style.display='';}
    }
    function hide(){tt.style.display='none';if(cLine)cLine.style.display='none';if(hDot)hDot.style.display='none';}
    svg.querySelectorAll('.hr').forEach(function(r){r.addEventListener('mouseenter',function(){show(+r.getAttribute('data-i'));});});
    wrap.addEventListener('mouseleave',hide);
  });
}

// ── Filter bar ─────────────────────────────────────────────────
function buildDateSelects(pfx,jy,jm,jd,minY,maxY){
  var yO='';for(var y=minY;y<=maxY;y++)yO+='<option value="'+y+'"'+(y===jy?' selected':'')+'>'+toFa(y)+'</option>';
  var mO=MONTHS.map(function(m,i){return'<option value="'+(i+1)+'"'+((i+1)===jm?' selected':'')+'>'+m+'</option>';}).join('');
  var dO='';for(var d=1;d<=31;d++)dO+='<option value="'+d+'"'+(d===jd?' selected':'')+'>'+toFa(d)+'</option>';
  return'<select class="filter-sel fsel" id="'+pfx+'-y">'+yO+'</select>'+
         '<select class="filter-sel fsel" id="'+pfx+'-m">'+mO+'</select>'+
         '<select class="filter-sel fsel" id="'+pfx+'-d">'+dO+'</select>';
}
function buildFilterBar(){
  var fj=filterFromISO?isoToJ(filterFromISO):{y:1400,m:1,d:1};
  var tj=filterToISO?isoToJ(filterToISO):{y:1404,m:12,d:29};
  var minY=dataMinISO?isoToJ(dataMinISO).y:1400;
  var maxY=dataMaxISO?isoToJ(dataMaxISO).y:1404;
  return'<div class="filter-bar" id="filter-bar">'+
    // pos search — rightmost in RTL
    '<div class="pos-sw" id="pos-sw">'+
      '<div class="pos-tags" id="pos-tags"></div>'+
      '<input class="pos-inp" id="pos-inp" type="text" placeholder="فیلتر جایگاه..." autocomplete="off"/>'+
      '<div class="pos-dd" id="pos-dd"></div>'+
    '</div>'+
    '<div class="fbar-div"></div>'+
    '<div class="filter-group"><label class="filter-lbl">از</label>'+buildDateSelects('ff',fj.y,fj.m,fj.d,minY,maxY+1)+'</div>'+
    '<div class="filter-group"><label class="filter-lbl">تا</label>'+buildDateSelects('ft',tj.y,tj.m,tj.d,minY,maxY+1)+'</div>'+
    '<button class="filter-btn" id="flt-apply">اعمال</button>'+
    '<div class="filter-sep"></div>'+
    '<div class="toggle-group">'+
      '<button class="toggle-btn'+(chartMode==='monthly'?' active':'')+'" id="tog-monthly">ماهانه</button>'+
      '<button class="toggle-btn'+(chartMode==='daily'?' active':'')+'" id="tog-daily">روزانه</button>'+
    '</div>'+
  '</div>';
}
function wireFilterBar(){
  var applyBtn=document.getElementById('flt-apply');
  if(applyBtn)applyBtn.addEventListener('click',function(){
    try{filterFromISO=jToISO(+document.getElementById('ff-y').value,+document.getElementById('ff-m').value,+document.getElementById('ff-d').value);}catch(e){}
    try{filterToISO=jToISO(+document.getElementById('ft-y').value,+document.getElementById('ft-m').value,+document.getElementById('ft-d').value);}catch(e){}
    rerenderCharts();
  });
  var togM=document.getElementById('tog-monthly'),togD=document.getElementById('tog-daily');
  if(togM)togM.addEventListener('click',function(){chartMode='monthly';togM.classList.add('active');togD.classList.remove('active');rerenderCharts();});
  if(togD)togD.addEventListener('click',function(){chartMode='daily';togD.classList.add('active');togM.classList.remove('active');rerenderCharts();});
  wirePosSearch();
}
function wirePosSearch(){
  var sw=document.getElementById('pos-sw');
  var inp=document.getElementById('pos-inp');
  var dd=document.getElementById('pos-dd');
  var tagsEl=document.getElementById('pos-tags');
  if(!sw||!inp||!dd||!tagsEl)return;
  var positions=reportData.matched||[];
  var local=selectedPosIds?new Set(selectedPosIds):new Set();
  function applyNow(){selectedPosIds=local.size?new Set(local):null;rerenderCharts();}
  function renderTags(){
    tagsEl.innerHTML=Array.from(local).map(function(id){
      var pos=positions.find(function(p){return String(p.positionId)===id;});
      var lbl=pos?(pos.description||'ynpos-'+id):'ynpos-'+id;
      return'<span class="pos-tag">'+esc(lbl.slice(0,18))+'<button class="pos-tag-x" data-id="'+id+'">×</button></span>';
    }).join('');
    tagsEl.querySelectorAll('.pos-tag-x').forEach(function(btn){
      btn.addEventListener('click',function(e){e.stopPropagation();local.delete(btn.getAttribute('data-id'));renderTags();renderDD(inp.value);applyNow();});
    });
  }
  function renderDD(q){
    var ql=q.toLowerCase();
    var filtered=positions.filter(function(p){
      if(local.has(String(p.positionId)))return false;
      if(!ql)return true;
      return(p.description||'').toLowerCase().indexOf(ql)>=0||String(p.positionId).indexOf(ql)>=0;
    }).slice(0,15);
    dd.innerHTML=filtered.length?filtered.map(function(p){
      return'<div class="pos-dd-item" data-id="'+p.positionId+'">'+
        '<span class="pos-dd-name">'+esc(p.description||('ynpos-'+p.positionId))+'</span>'+
        '<span class="pos-dd-id">'+toFa(p.positionId)+'</span></div>';
    }).join(''):'<div class="pos-dd-empty">نتیجه‌ای یافت نشد</div>';
    dd.querySelectorAll('.pos-dd-item').forEach(function(item){
      item.addEventListener('mousedown',function(e){e.preventDefault();local.add(item.getAttribute('data-id'));inp.value='';renderTags();renderDD('');applyNow();});
    });
    dd.style.display='block';
  }
  inp.addEventListener('focus',function(){renderDD(inp.value);});
  inp.addEventListener('input',function(){renderDD(inp.value);});
  inp.addEventListener('blur',function(){setTimeout(function(){if(dd)dd.style.display='none';},160);});
  renderTags();
}

// ── Content ────────────────────────────────────────────────────
function buildOutlookHTML(outlook){
  if(!outlook)return'';
  return[{key:'pessimistic',icon:'📉',title:'بدبینانه',badge:'پرسنتایل ۲۰ام',data:outlook.pessimistic},{key:'realistic',icon:'📊',title:'واقع‌بینانه',badge:'پرسنتایل ۵۰ام',data:outlook.realistic},{key:'optimistic',icon:'📈',title:'خوش‌بینانه',badge:'پرسنتایل ۸۰ام',data:outlook.optimistic}].map(function(item){
    return'<div class="outlook-card'+(item.key==='realistic'?' realistic':'')+'"><div class="outlook-badge">'+item.badge+'</div><div class="outlook-icon">'+item.icon+'</div><div class="outlook-title">'+item.title+'</div><div class="outlook-rpm">'+fmtRpm(item.data.rpm)+'</div><div class="outlook-rpm-lbl">تومان / هزار نمایش</div><div class="outlook-divider"></div><div class="outlook-revenue">'+fmtNum(item.data.monthly)+'</div><div class="outlook-revenue-lbl">تومان / ماه (تخمینی)</div></div>';
  }).join('');
}
function buildPositionTable(stats,pubPct){
  if(!stats.length)return'<div class="chart-empty">جایگاهی یافت نشد</div>';
  var html='<table class="pos-table"><thead><tr>'+
    '<th>#</th><th>نام جایگاه</th><th>شناسه</th>'+
    '<th class="tnum">P20 RPM</th><th class="tnum">P50 RPM</th><th class="tnum">P80 RPM</th>'+
    '<th class="tnum">سهم درآمد</th><th class="tnum">سهم تجمعی</th>'+
    '</tr></thead><tbody>';
  stats.forEach(function(p,i){
    var cls=p.rpm==null?'ptr-nodata':(p.aboveThreshold!==false?'ptr-above':'ptr-below');
    html+='<tr class="'+cls+'">'+
      '<td class="ptr-rank">'+toFa(i+1)+'</td>'+
      '<td class="ptr-name">'+esc(p.description||('جایگاه '+p.positionId))+'</td>'+
      '<td class="ptr-id">'+toFa(p.positionId)+'</td>'+
      '<td class="tnum ptr-rpm">'+fmtRpm(p.p20)+'</td>'+
      '<td class="tnum ptr-rpm ptr-p50">'+fmtRpm(p.p50)+'</td>'+
      '<td class="tnum ptr-rpm">'+fmtRpm(p.p80)+'</td>'+
      '<td class="tnum ptr-share">'+(p.sharePercent!=null?toFa(p.sharePercent.toFixed(1))+'٪':'—')+'</td>'+
      '<td class="tnum ptr-cumul">'+(p.cumulativeShare!=null?toFa(p.cumulativeShare.toFixed(1))+'٪':'—')+'</td>'+
    '</tr>';
    var shot=reportData.screenshots&&reportData.screenshots[p.positionId];
    if(shot)html+='<tr class="ptr-shot-row"><td colspan="8"><img class="ptr-shot-img" src="'+shot+'" /></td></tr>';
  });
  if(pubPct){
    var withStats=stats.filter(function(p){return p.rpm!=null;});
    var totalAdv=withStats.reduce(function(s,p){return s+p.totalAdv;},0);
    html+='<tr class="ptr-total">'+
      '<td></td><td><strong>کل ناشر</strong></td><td>—</td>'+
      '<td class="tnum ptr-rpm">'+fmtRpm(pubPct.p20)+'</td>'+
      '<td class="tnum ptr-rpm ptr-p50">'+fmtRpm(pubPct.p50)+'</td>'+
      '<td class="tnum ptr-rpm">'+fmtRpm(pubPct.p80)+'</td>'+
      '<td class="tnum">۱۰۰٪</td>'+
      '<td class="tnum">'+fmtNum(totalAdv)+'</td>'+
    '</tr>';
  }
  html+='</tbody></table>';
  return html;
}

// ── Rerender ───────────────────────────────────────────────────
function rerenderCharts(){
  if(!reportData)return;
  chartDataStore={};
  var bd=filteredPubDaily();
  var pts=getPubPts();
  var pvVals=Object.keys(bd).filter(function(k){return bd[k].pv>0;}).map(function(k){return bd[k].pv;});
  var avgPv=pvVals.length?pvVals.reduce(function(s,v){return s+v;},0)/pvVals.length:0;
  var vd=Object.keys(bd).filter(function(k){return bd[k].pv>0;});
  var totalRpm=vd.length?vd.reduce(function(s,k){return s+bd[k].adv/bd[k].pv;},0)/vd.length:null;
  var totalAdv=Object.keys(bd).reduce(function(s,k){return s+bd[k].adv;},0);
  var el;
  el=document.getElementById('stat-rpm');if(el)el.textContent=fmtRpm(totalRpm);
  el=document.getElementById('stat-pv');if(el)el.textContent=fmtNum(avgPv);
  el=document.getElementById('stat-adv');if(el)el.textContent=fmtNum(vd.length?totalAdv/vd.length:0);
  el=document.getElementById('chart-rpm');if(el)el.innerHTML=makeLineSvg(pts,1200,220,{pL:68,pR:20,pT:18,pB:44},'rpm');
  el=document.getElementById('chart-adv');if(el)el.innerHTML=makeLineSvg(pts,600,190,{pL:72,pR:16,pT:16,pB:42},'totalAdv');
  el=document.getElementById('chart-pv');if(el)el.innerHTML=makeLineSvg(pts,600,190,{pL:72,pR:16,pT:16,pB:42},'avgPv');
  el=document.getElementById('outlook-section');if(el)el.innerHTML=buildOutlookHTML(computeOutlook(bd));
  var posStats=computePositionStats(),pubPct=computePubPercentiles(bd);
  el=document.getElementById('pos-table-wrap');if(el)el.innerHTML=buildPositionTable(posStats,pubPct);
  initTooltips();
}
function updateScreenshots(){
  var bd=filteredPubDaily(),pubPct=computePubPercentiles(bd);
  var el=document.getElementById('pos-table-wrap');
  if(el)el.innerHTML=buildPositionTable(computePositionStats(),pubPct);
}

// ── Main render ────────────────────────────────────────────────
function render(d){
  reportData=d;
  chartDataStore={};
  var root=document.getElementById('root');
  var keySet={};
  (d.matched||[]).forEach(function(pos){
    getFullRows(pos.positionId).forEach(function(r){
      var j=isoToJ(r[0]);keySet[j.y+'/'+p2(j.m)]=1;
      if(!dataMinISO||r[0]<dataMinISO)dataMinISO=r[0];
      if(!dataMaxISO||r[0]>dataMaxISO)dataMaxISO=r[0];
    });
  });
  allMonthKeys=Object.keys(keySet).sort();
  if(!filterFromISO)filterFromISO=d.from||dataMinISO;
  if(!filterToISO)filterToISO=d.to||dataMaxISO;
  var bd=filteredPubDaily(),pts=getPubPts(),outlook=computeOutlook(bd);
  var pvVals=Object.keys(bd).filter(function(k){return bd[k].pv>0;}).map(function(k){return bd[k].pv;});
  var avgPv=pvVals.length?pvVals.reduce(function(s,v){return s+v;},0)/pvVals.length:0;
  var vd=Object.keys(bd).filter(function(k){return bd[k].pv>0;});
  var totalRpm=vd.length?vd.reduce(function(s,k){return s+bd[k].adv/bd[k].pv;},0)/vd.length:null;
  var totalAdv=Object.keys(bd).reduce(function(s,k){return s+bd[k].adv;},0);
  var posStats=computePositionStats(),pubPct=computePubPercentiles(bd);
  var html='';
  // Header — no RPM pill
  html+='<div class="hdr"><div class="hdr-brand"><div class="y-logo">Y</div><div><div class="hdr-name">'+esc(d.publisherName||'گزارش ناشر')+'</div><div class="hdr-meta">'+esc(d.appId||'')+'&nbsp;&middot;&nbsp;'+esc(d.pageTitle||'')+'</div></div></div></div>';
  html+=buildFilterBar();
  html+='<div class="main">';
  html+='<div class="stats-row">'+
    '<div class="stat-card"><div class="stat-card-lbl">میانگین RPM</div><div class="stat-card-val" id="stat-rpm">'+fmtRpm(totalRpm)+'</div><div class="stat-card-unit">تومان / هزار نمایش</div></div>'+
    '<div class="stat-card"><div class="stat-card-lbl">میانگین PV روزانه</div><div class="stat-card-val" id="stat-pv">'+fmtNum(avgPv)+'</div><div class="stat-card-unit">بازدید در روز</div></div>'+
    '<div class="stat-card"><div class="stat-card-lbl">میانگین درآمد روزانه</div><div class="stat-card-val" id="stat-adv" style="font-size:18px">'+fmtNum(vd.length?totalAdv/vd.length:0)+'</div><div class="stat-card-unit">تومان در روز</div></div>'+
  '</div>';
  html+='<div class="sec-lbl">ترند RPM</div><div class="chart-section" id="chart-rpm">'+makeLineSvg(pts,1200,220,{pL:68,pR:20,pT:18,pB:44},'rpm')+'</div>';
  html+='<div class="charts-duo">'+
    '<div><div class="sec-lbl">هزینه تبلیغات</div><div class="chart-section" id="chart-adv">'+makeLineSvg(pts,600,190,{pL:72,pR:16,pT:16,pB:42},'totalAdv')+'</div></div>'+
    '<div><div class="sec-lbl">بازدید صفحه (PV)</div><div class="chart-section" id="chart-pv">'+makeLineSvg(pts,600,190,{pL:72,pR:16,pT:16,pB:42},'avgPv')+'</div></div>'+
  '</div>';
  if(outlook)html+='<div class="sec-lbl">چشم‌انداز درآمدی</div><div class="outlook-row" id="outlook-section">'+buildOutlookHTML(outlook)+'</div>';
  else html+='<div id="outlook-section"></div>';
  html+='<div class="sec-lbl">جایگاه‌های تبلیغاتی</div><div id="pos-table-wrap">'+buildPositionTable(posStats,pubPct)+'</div>';
  html+='</div>';
  root.innerHTML=html;
  wireFilterBar();
  initTooltips();
}

// ── Bootstrap ──────────────────────────────────────────────────
chrome.storage.local.get('ynprice_report',function(stored){
  document.getElementById('loading').style.display='none';
  document.getElementById('root').style.display='';
  if(!stored.ynprice_report){document.getElementById('root').innerHTML='<div style="height:80vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px"><div style="font-size:52px">😕</div><div style="font-size:18px;font-weight:600">گزارشی یافت نشد</div><div style="font-size:13px;color:var(--muted)">لطفاً دوباره از اکستنشن گزارش بگیرید</div></div>';return;}
  var report=stored.ynprice_report;
  fetch(chrome.runtime.getURL('data/publisher_data.json')).then(function(r){return r.json();}).catch(function(){return null;}).then(function(all){
    if(all&&report.appId&&all[report.appId])pubData=all[report.appId];
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
