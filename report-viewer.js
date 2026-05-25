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
  if(v>=1e9)return toFa((v/1e9).toFixed(1))+'B';
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
var allPubData=null;
var cmpPubs=[];        // [{pubId, name, positions}]
var cmpMode='group';   // 'group' | 'desc'
var cmpDescFilter='';

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

// ── Position Classification ────────────────────────────────────
function classifyPos(posType,desc){
  var t=(posType||'').toLowerCase().trim();
  var d=(desc||'').replace(/ی/g,'ي').replace(/ک/g,'ك');

  if(t==='notification')          return{key:'notification',          name:'نوتیفیکیشن'};
  if(t==='pre_roll')              return{key:'pre_roll',              name:'پری‌رول'};
  if(t==='slider')                return{key:'slider',                name:'اسلایدر'};
  if(t==='banner-sticky') return{key:'sticky_top',  name:'استیکی بالا'};
  if(t==='footer-sticky') return{key:'sticky_bottom',name:'استیکی پایین'};
  if(t==='article-display-sticky')return{key:'native_sticky',        name:'همسان استیکی'};
  if(t==='article-display-card')  return{key:'native_display_mid',   name:'همسان تصویری میان مطلب'};

  if(t==='article-display'){
    if(/سايدبار|سايد.?بار|نوار جانبي|سمت (چپ|راست)/.test(d))
      return{key:'native_display_sidebar',name:'همسان تصویری سایدبار'};
    if(/ميان|بين.?مطلب|بين.?متن|ابتدا|بالاي.?(خبر|مطلب)|زير.?(ليد|عكس)/.test(d))
      return{key:'native_display_mid',    name:'همسان تصویری میان مطلب'};
    return{key:'native_display_end',name:'همسان تصویری انتهای مطلب'};
  }

  if(t==='article-text'){
    if(/سايدبار|سايد.?بار|نوار جانبي|سمت (چپ|راست)/.test(d))
      return{key:'native_text_sidebar',name:'همسان متنی سایدبار'};
    if(/ميان|بين.?مطلب|ابتدا/.test(d))
      return{key:'native_text_mid',    name:'همسان متنی میان مطلب'};
    return{key:'native_text_end',name:'همسان متنی انتهای مطلب'};
  }

  // banner-article: sub-classify by desc
  if(/استيكي/.test(d)){
    if(/بالا|هدر|header|top/.test(d)) return{key:'sticky_top',name:'استیکی بالا'};
    return{key:'sticky_bottom',name:'استیکی پایین'};
  }
  if(/سايدبار|سايد.?بار|نوار جانبي|سمت (چپ|راست)/.test(d))  return{key:'banner_sidebar', name:'بنر سایدبار'};
  if(/هدر|header|ابتدا|بالاي|زير.?(ليد|عكس)/.test(d))        return{key:'banner_top',    name:'بنر بالا'};
  if(/انتها|پايين|زير.?تمامي/.test(d))                        return{key:'banner_end',    name:'بنر پایین'};
  if(/ميان|بين.?مطلب|بين.?متن/.test(d))                      return{key:'banner_mid',    name:'بنر میان مطلب'};
  return{key:'banner_top',name:'بنر بالا'};
}

function computeGroupStats(positions,fromISO,toISO){
  var from=fromISO||jToISO(1404,1,1);
  var to=toISO||'9999-12-31';
  var ORDER=['notification','pre_roll','slider','sticky_top','sticky_bottom','native_sticky','native_display_mid','native_display_end','native_display_sidebar','native_text_mid','native_text_end','native_text_sidebar','banner_top','banner_mid','banner_end','banner_sidebar'];
  var groups={};
  Object.keys(positions).forEach(function(posId){
    var pos=positions[posId];
    var g=classifyPos(pos.type||pos.positionType,pos.desc||pos.description);
    if(!groups[g.key])groups[g.key]={name:g.name,rows:[],cnt:0};
    var filtered=(pos.rows||[]).filter(function(r){return r[0]>=from&&r[0]<=to;});
    groups[g.key].rows=groups[g.key].rows.concat(filtered);
    groups[g.key].cnt++;
  });
  var result=[];
  Object.keys(groups).forEach(function(key){
    var g=groups[key];
    if(!g.rows.length)return;
    var by={};
    g.rows.forEach(function(r){if(!by[r[0]])by[r[0]]={c:0,p:0};by[r[0]].c+=r[1];by[r[0]].p=Math.max(by[r[0]].p,r[2]);});
    var daily=Object.keys(by).sort().filter(function(d){return by[d].p>0;}).map(function(d){return{date:d,rpm:by[d].c/by[d].p};});
    if(daily.length<3)return;
    // monthly series for sparkline
    var mByKey={};
    daily.forEach(function(d){var j=isoToJ(d.date);var k=j.y+'/'+p2(j.m);if(!mByKey[k])mByKey[k]={sum:0,cnt:0};mByKey[k].sum+=d.rpm;mByKey[k].cnt++;});
    var monthly=Object.keys(mByKey).sort().map(function(k){return{key:k,rpm:mByKey[k].sum/mByKey[k].cnt};});
    var rpms=daily.map(function(d){return d.rpm;}).sort(function(a,b){return a-b;});
    var n=rpms.length,p50=rpms[Math.floor(n*.5)];
    var recent=daily.slice(-30);
    var avg=recent.reduce(function(s,v){return s+v.rpm;},0)/recent.length;
    var tw=daily.slice(-60),nt=tw.length,sx=0,sy=0,sxy=0,sxx=0;
    tw.forEach(function(v,i){sx+=i;sy+=v.rpm;sxy+=i*v.rpm;sxx+=i*i;});
    var td2=nt*sxx-sx*sx,slope=td2?(nt*sxy-sx*sy)/td2:0,tavg=sy/nt;
    var trend=tavg>0?Math.round(slope*30/tavg*10)/10:0;
    result.push({key:key,name:g.name,cnt:g.cnt,p50:p50,avg:avg,trend:trend,days:daily.length,monthly:monthly});
  });
  result.sort(function(a,b){
    var ai=ORDER.findIndex(function(o){return a.key.indexOf(o)===0;});
    var bi=ORDER.findIndex(function(o){return b.key.indexOf(o)===0;});
    ai=ai===-1?99:ai;bi=bi===-1?99:bi;
    return ai-bi||a.key.localeCompare(b.key);
  });
  // Site-level total: sum costs, max PV per date across ALL positions
  var siteBy={};
  Object.keys(positions).forEach(function(posId){
    var pos=positions[posId];
    (pos.rows||[]).filter(function(r){return r[0]>=from&&r[0]<=to;}).forEach(function(r){
      if(!siteBy[r[0]])siteBy[r[0]]={c:0,p:0};
      siteBy[r[0]].c+=r[1];
      siteBy[r[0]].p=Math.max(siteBy[r[0]].p,r[2]);
    });
  });
  var siteDailyRpms=Object.keys(siteBy).filter(function(d){return siteBy[d].p>0;}).map(function(d){return siteBy[d].c/siteBy[d].p;}).sort(function(a,b){return a-b;});
  var sn=siteDailyRpms.length;
  var siteP50=sn?siteDailyRpms[Math.floor(sn*.5)]:null;
  var siteAvg=sn?siteDailyRpms.reduce(function(s,v){return s+v;},0)/sn:null;
  var totalCnt=result.reduce(function(s,g){return s+g.cnt;},0);
  return{groups:result,totalP50:siteP50,totalAvg:siteAvg,totalCnt:totalCnt};
}

function computePosStatsByDesc(positions,fromISO,toISO,descFilter){
  var from=fromISO||jToISO(1404,1,1);
  var to=toISO||'9999-12-31';
  var dl=(descFilter||'').toLowerCase();
  var byDesc={};
  Object.values(positions).forEach(function(pos){
    var desc=pos.desc||pos.description||'';
    if(dl&&desc.toLowerCase().indexOf(dl)<0)return;
    var rows=(pos.rows||[]).filter(function(r){return r[0]>=from&&r[0]<=to;});
    if(!rows.length)return;
    var g=classifyPos(pos.type||pos.positionType,desc);
    if(!byDesc[desc])byDesc[desc]={desc:desc,groupName:g.name,rows:[]};
    byDesc[desc].rows=byDesc[desc].rows.concat(rows);
  });
  return Object.values(byDesc).map(function(item){
    var by={};
    item.rows.forEach(function(r){if(!by[r[0]])by[r[0]]={c:0,p:0};by[r[0]].c+=r[1];by[r[0]].p=Math.max(by[r[0]].p,r[2]);});
    var daily=Object.keys(by).sort().filter(function(d){return by[d].p>0;}).map(function(d){return{date:d,rpm:by[d].c/by[d].p};});
    if(!daily.length)return null;
    var rpms=daily.map(function(d){return d.rpm;}).sort(function(a,b){return a-b;});
    var n=rpms.length,p50=rpms[Math.floor(n*.5)];
    var recent=daily.slice(-30);
    var avg=recent.reduce(function(s,v){return s+v.rpm;},0)/recent.length;
    var mByKey={};
    daily.forEach(function(d){var j=isoToJ(d.date);var k=j.y+'/'+p2(j.m);if(!mByKey[k])mByKey[k]={sum:0,cnt:0};mByKey[k].sum+=d.rpm;mByKey[k].cnt++;});
    var monthly=Object.keys(mByKey).sort().map(function(k){return{key:k,rpm:mByKey[k].sum/mByKey[k].cnt};});
    var tw=daily.slice(-60),nt=tw.length,sx=0,sy=0,sxy=0,sxx=0;
    tw.forEach(function(v,i){sx+=i;sy+=v.rpm;sxy+=i*v.rpm;sxx+=i*i;});
    var td2=nt*sxx-sx*sx,slope=td2?(nt*sxy-sx*sy)/td2:0,tavg=sy/nt;
    var trend=tavg>0?Math.round(slope*30/tavg*10)/10:0;
    return{desc:item.desc,groupName:item.groupName,p50:p50,avg:avg,trend:trend,monthly:monthly};
  }).filter(Boolean).sort(function(a,b){return a.desc.localeCompare(b.desc,'fa');});
}

var PUB_COLORS=['#FED049','#60a5fa','#34d399','#f87171'];

function miniSparkline(monthly,W,H,color){
  if(!monthly||monthly.length<2)return'<span style="color:var(--muted);font-size:10px">—</span>';
  var vals=monthly.map(function(m){return m.rpm;});
  var mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals),rng=mx-mn||0.001;
  var n=vals.length,pad=2;
  var pts=vals.map(function(v,i){
    var x=pad+(n===1?W/2:(i/(n-1))*(W-2*pad));
    var y=pad+(1-(v-mn)/rng)*(H-2*pad);
    return x.toFixed(1)+','+y.toFixed(1);
  }).join(' ');
  var last=vals[vals.length-1],first=vals[0];
  var col=color||(last>first*1.05?'#22c55e':last<first*0.95?'#ef4444':'#FED049');
  return'<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" style="display:block">'+
    '<polyline points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>'+
    '</svg>';
}

// Combined multi-publisher sparkline — one SVG, one line per publisher
function multiSparkline(pubsMonthly,W,H){
  var hasData=pubsMonthly.some(function(m){return m&&m.length>=2;});
  if(!hasData)return'<span style="color:var(--muted);font-size:10px">—</span>';
  var allVals=[];
  pubsMonthly.forEach(function(m){if(m)m.forEach(function(p){allVals.push(p.rpm);});});
  var mn=Math.min.apply(null,allVals),mx=Math.max.apply(null,allVals),rng=mx-mn||0.001;
  var pad=2,lines='';
  pubsMonthly.forEach(function(monthly,pi){
    if(!monthly||monthly.length<2)return;
    var col=PUB_COLORS[pi]||'#aaa';
    var n=monthly.length;
    var pts=monthly.map(function(m,i){
      var x=pad+(n===1?W/2:(i/(n-1))*(W-2*pad));
      var y=pad+(1-(m.rpm-mn)/rng)*(H-2*pad);
      return x.toFixed(1)+','+y.toFixed(1);
    }).join(' ');
    lines+='<polyline points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>';
  });
  return'<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" style="display:block">'+lines+'</svg>';
}

function buildGroupTable(statsResult){
  var groups=Array.isArray(statsResult)?statsResult:(statsResult.groups||[]);
  var siteTotals=Array.isArray(statsResult)?null:statsResult;
  if(!groups.length)return'<div class="chart-empty">داده‌ای موجود نیست</div>';
  // sort by p50 RPM descending
  var sorted=groups.slice().sort(function(a,b){return(b.p50||0)-(a.p50||0);});
  var rows=sorted.map(function(g){
    return'<tr>'+
      '<td class="grp-td">'+esc(g.name)+'</td>'+
      '<td class="val-td-c">'+toFa(g.cnt)+'</td>'+
      '<td class="val-td"><strong>'+fmtRpm(g.p50)+'</strong></td>'+
      '<td class="val-td">'+fmtRpm(g.avg)+'</td>'+
      '<td class="spark-td">'+miniSparkline(g.monthly,88,26)+'</td>'+
    '</tr>';
  }).join('');
  var totalRow='<tr class="grp-total-row">'+
    '<td class="grp-td">RPM کل سایت</td>'+
    '<td class="val-td-c"><strong>'+(siteTotals?toFa(siteTotals.totalCnt):'—')+'</strong></td>'+
    '<td class="val-td"><strong>'+fmtRpm(siteTotals?siteTotals.totalP50:null)+'</strong></td>'+
    '<td class="val-td">'+fmtRpm(siteTotals?siteTotals.totalAvg:null)+'</td>'+
    '<td class="spark-td"></td>'+
  '</tr>';
  return'<table class="grp-tbl"><thead><tr>'+
    '<th>گروه</th><th>تعداد</th><th>p50 RPM</th><th>میانگین</th><th>ترند</th>'+
    '</tr></thead><tbody>'+rows+totalRow+'</tbody></table>';
}

function buildCmpTable(pubsData){
  var keyMap={};
  pubsData.forEach(function(p){p.groups.forEach(function(g){if(!keyMap[g.key])keyMap[g.key]=g.name;});});
  // sort keys by max avg p50 across publishers descending
  var keys=Object.keys(keyMap).sort(function(a,b){
    var aV=Math.max.apply(null,pubsData.map(function(p){var g=p.groups.find(function(x){return x.key===a;});return g?(g.p50||0):0;}));
    var bV=Math.max.apply(null,pubsData.map(function(p){var g=p.groups.find(function(x){return x.key===b;});return g?(g.p50||0):0;}));
    return bV-aV;
  });
  var np=pubsData.length;
  var pubLegend='<div class="cmp-legend">'+pubsData.map(function(p,i){
    return'<span class="cmp-legend-dot" style="background:'+PUB_COLORS[i]+'"></span><span class="cmp-legend-lbl">'+esc(p.name.split(' ')[0])+'</span>';
  }).join('')+'</div>';
  var pubSubHdrs=pubsData.map(function(p,i){
    return'<th class="pub-sub-hdr"><span class="cmp-legend-dot" style="background:'+PUB_COLORS[i]+'"></span>'+esc(p.name.split(' ')[0])+'</th>';
  }).join('');
  var hdr1='<th rowspan="2" class="grp-td-hdr">گروه جایگاه</th>'+
    '<th colspan="'+np+'" class="metric-hdr">میانگین RPM</th>'+
    '<th colspan="'+np+'" class="metric-hdr">p50 RPM</th>'+
    '<th rowspan="2" class="metric-hdr" style="min-width:110px">ترند (همه ناشران)</th>';
  var rows=keys.map(function(k){
    var avgCells=pubsData.map(function(pub){
      var g=pub.groups.find(function(x){return x.key===k;});
      return g?'<td class="val-td">'+fmtRpm(g.avg)+'</td>':'<td class="na-td">—</td>';
    }).join('');
    var p50Cells=pubsData.map(function(pub){
      var g=pub.groups.find(function(x){return x.key===k;});
      return g?'<td class="val-td"><strong>'+fmtRpm(g.p50)+'</strong></td>':'<td class="na-td">—</td>';
    }).join('');
    var pubsMonthly=pubsData.map(function(pub){
      var g=pub.groups.find(function(x){return x.key===k;});
      return g?g.monthly:null;
    });
    var trendCell='<td class="spark-td">'+multiSparkline(pubsMonthly,110,28)+'</td>';
    return'<tr><td class="grp-td">'+esc(keyMap[k])+'</td>'+avgCells+p50Cells+trendCell+'</tr>';
  }).join('');
  return pubLegend+'<div style="overflow-x:auto"><table class="cmp-tbl">'+
    '<thead><tr>'+hdr1+'</tr><tr>'+pubSubHdrs+pubSubHdrs+'</tr></thead>'+
    '<tbody>'+rows+'</tbody></table></div>';
}

function buildDescTable(pubsData){
  var fromISO=filterFromISO,toISO=filterToISO,df=cmpDescFilter;
  if(pubsData.length===1){
    var stats=computePosStatsByDesc(pubsData[0].positions,fromISO,toISO,df);
    if(!stats.length)return'<div class="chart-empty">جایگاهی یافت نشد'+(df?' با این فیلتر':'')+'</div>';
    var rows=stats.map(function(s){
      return'<tr>'+
        '<td class="grp-sub-td">'+esc(s.groupName)+'</td>'+
        '<td class="pos-desc-td">'+esc(s.desc)+'</td>'+
        '<td class="val-td"><strong>'+fmtRpm(s.p50)+'</strong></td>'+
        '<td class="val-td">'+fmtRpm(s.avg)+'</td>'+
        '<td class="spark-td">'+miniSparkline(s.monthly,88,28)+'</td>'+
      '</tr>';
    }).join('');
    return'<table class="cmp-tbl"><thead><tr>'+
      '<th>گروه</th><th>نام جایگاه</th><th>p50 RPM</th><th>میانگین</th><th>ترند</th>'+
      '</tr></thead><tbody>'+rows+'</tbody></table>';
  }
  // multi-publisher: collect all unique descs
  var allDescMap={};
  pubsData.forEach(function(pub){
    computePosStatsByDesc(pub.positions,fromISO,toISO,df).forEach(function(s){
      if(!allDescMap[s.desc])allDescMap[s.desc]={desc:s.desc,groupName:s.groupName,pubStats:{}};
      allDescMap[s.desc].pubStats[pub.pubId]={p50:s.p50,avg:s.avg,monthly:s.monthly};
    });
  });
  var descs=Object.values(allDescMap).sort(function(a,b){return a.desc.localeCompare(b.desc,'fa');});
  if(!descs.length)return'<div class="chart-empty">جایگاهی یافت نشد'+(df?' با این فیلتر':'')+'</div>';
  var np=pubsData.length;
  var pubSubHdrs=pubsData.map(function(p){
    return'<th class="pub-sub-hdr">'+esc(p.name.split(' ')[0])+'</th>';
  }).join('');
  var hdr1='<th rowspan="2" class="grp-td-hdr">گروه</th>'+
    '<th rowspan="2" class="grp-td-hdr" style="min-width:160px">نام جایگاه</th>'+
    '<th colspan="'+np+'" class="metric-hdr">p50 RPM</th>'+
    '<th colspan="'+np+'" class="metric-hdr">ترند</th>';
  var rows=descs.map(function(item){
    var p50Cells=pubsData.map(function(pub){
      var s=item.pubStats[pub.pubId];
      return s?'<td class="val-td"><strong>'+fmtRpm(s.p50)+'</strong></td>':'<td class="na-td">—</td>';
    }).join('');
    var trendCells=pubsData.map(function(pub){
      var s=item.pubStats[pub.pubId];
      return s?'<td class="spark-td">'+miniSparkline(s.monthly,88,28)+'</td>':'<td class="na-td">—</td>';
    }).join('');
    return'<tr>'+
      '<td class="grp-sub-td">'+esc(item.groupName)+'</td>'+
      '<td class="pos-desc-td">'+esc(item.desc)+'</td>'+
      p50Cells+trendCells+
    '</tr>';
  }).join('');
  return'<div style="overflow-x:auto"><table class="cmp-tbl">'+
    '<thead><tr>'+hdr1+'</tr><tr>'+pubSubHdrs+pubSubHdrs+'</tr></thead>'+
    '<tbody>'+rows+'</tbody></table></div>';
}

// ── SVG charts (rebuilt from scratch) ─────────────────────────
function makeLineSvg(pts,W,H,opts,field){
  field=field||'rpm';
  if(!pts||pts.length<2)return'<div class="chart-empty">داده کافی وجود ندارد</div>';
  opts=opts||{};
  var pL=opts.pL||68,pR=opts.pR||20,pT=opts.pT||18,pB=opts.pB||44;
  var cW=W-pL-pR,cH=H-pT-pB;
  var vals=pts.map(function(p){return+(p[field]||0);});
  var mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals);
  // y axis from 0, 12% padding above max
  var yMin=0,yMax=Math.max(mx*1.12,0.01),yRng=yMax;
  var isAdv=field==='totalAdv',isPv=field==='avgPv';
  var color=isAdv?'#60a5fa':isPv?'#34d399':'#FED049';
  var xPad=20;
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
// ── Jalali day-range picker ──────────────────────────────────
var drpState={};  // id -> {fromISO,toISO,pickStep,viewY,viewM,cb}
function jDaysInMonth(jy,jm){
  if(jm<=6)return 31;if(jm<=11)return 30;
  var g=jToG(jy,12,30),b=gToJ(g.y,g.m,g.d);return(b.m===12&&b.d===30)?30:29;
}
function jFirstDow(jy,jm){
  var g=jToG(jy,jm,1);
  var js=new Date(Date.UTC(g.y,g.m-1,g.d)).getUTCDay();
  return(js+1)%7; // 0=شنبه ... 6=جمعه
}
function drpLabel(fromISO,toISO){
  var f=fromISO?isoToJ(fromISO):null;
  var t=toISO?isoToJ(toISO):null;
  if(f&&t)return toFa(f.y)+'/'+toFa(f.m)+'/'+toFa(f.d)+' — '+toFa(t.y)+'/'+toFa(t.m)+'/'+toFa(t.d);
  if(f)return toFa(f.y)+'/'+toFa(f.m)+'/'+toFa(f.d)+' — انتخاب پایان';
  return 'انتخاب بازه زمانی';
}
function buildDRP(id){
  return'<div class="drp-wrap" id="drp-wrap-'+id+'">'+
    '<button class="drp-btn" id="drp-btn-'+id+'" type="button">'+
      '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="2" y="3" width="12" height="12" rx="2"/><path d="M5 1v3M11 1v3M2 7h12"/></svg>'+
      '<span id="drp-lbl-'+id+'">انتخاب بازه</span>'+
    '</button>'+
    '<div class="drp-cal drp-cal-hidden" id="drp-cal-'+id+'">'+
      '<div class="drp-cal-nav">'+
        '<button class="drp-nav-btn" id="drp-pM-'+id+'">‹</button>'+
        '<span class="drp-year-lbl" id="drp-head-'+id+'"></span>'+
        '<button class="drp-nav-btn" id="drp-nM-'+id+'">›</button>'+
      '</div>'+
      '<div class="drp-dow-hdr"><span>ش</span><span>ی</span><span>د</span><span>س</span><span>چ</span><span>پ</span><span>ج</span></div>'+
      '<div class="drp-grid" id="drp-grid-'+id+'"></div>'+
      '<div class="drp-hint" id="drp-hint-'+id+'"></div>'+
      '<div class="drp-reset-row"><button class="drp-reset-btn" id="drp-reset-'+id+'" type="button">پاک کردن</button></div>'+
    '</div>'+
  '</div>';
}
function drpRenderGrid(id){
  var st=drpState[id];
  if(!st)return;
  var vy=st.viewY,vm=st.viewM;
  document.getElementById('drp-head-'+id).textContent=MONTHS[vm-1]+' '+toFa(vy);
  var days=jDaysInMonth(vy,vm),dow=jFirstDow(vy,vm);
  var fromISO=st.fromISO,toISO=st.toISO;
  var html='';
  for(var i=0;i<dow;i++)html+='<div class="drp-d-empty"></div>';
  for(var d=1;d<=days;d++){
    var iso=jToISO(vy,vm,d);
    var isSel=iso===fromISO||iso===toISO;
    var isRange=fromISO&&toISO&&iso>fromISO&&iso<toISO;
    var isFrom=iso===fromISO,isTo=iso===toISO;
    var cls='drp-d-btn'+(isSel?' selected':'')+(isRange?' in-range':'')+(isFrom?' sel-from':'')+(isTo?' sel-to':'');
    html+='<button class="'+cls+'" data-iso="'+iso+'" type="button">'+toFa(d)+'</button>';
  }
  document.getElementById('drp-grid-'+id).innerHTML=html;
  document.getElementById('drp-hint-'+id).textContent=st.pickStep===1?'روز پایان بازه را انتخاب کنید':'روز شروع بازه را انتخاب کنید';
  document.getElementById('drp-grid-'+id).querySelectorAll('.drp-d-btn').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      var iso=btn.getAttribute('data-iso');
      if(st.pickStep===0){
        st.fromISO=iso;st.toISO=null;st.pickStep=1;
        document.getElementById('drp-lbl-'+id).textContent=drpLabel(iso,null);
        drpRenderGrid(id); // stay open, re-render highlighted
      }else{
        if(iso<st.fromISO){st.toISO=st.fromISO;st.fromISO=iso;}
        else st.toISO=iso;
        st.pickStep=0;
        document.getElementById('drp-lbl-'+id).textContent=drpLabel(st.fromISO,st.toISO);
        drpClose(id);
        if(st.cb)st.cb(st.fromISO,st.toISO);
      }
    });
  });
}
function drpOpen(id){
  var cal=document.getElementById('drp-cal-'+id);
  if(!cal)return;
  cal.classList.remove('drp-cal-hidden');
  document.getElementById('drp-btn-'+id).classList.add('open');
  drpRenderGrid(id);
}
function drpClose(id){
  var cal=document.getElementById('drp-cal-'+id);
  if(cal)cal.classList.add('drp-cal-hidden');
  var btn=document.getElementById('drp-btn-'+id);
  if(btn)btn.classList.remove('open');
}
function wireDRP(id,fromISO,toISO,cb){
  var startJ=fromISO?isoToJ(fromISO):{y:1404,m:1,d:1};
  drpState[id]={fromISO:fromISO||null,toISO:toISO||null,pickStep:0,viewY:startJ.y,viewM:startJ.m,cb:cb};
  var lbl=document.getElementById('drp-lbl-'+id);
  if(lbl)lbl.textContent=drpLabel(fromISO,toISO);
  var btn=document.getElementById('drp-btn-'+id);
  if(btn)btn.addEventListener('click',function(e){e.stopPropagation();
    var cal=document.getElementById('drp-cal-'+id);
    if(cal&&!cal.classList.contains('drp-cal-hidden'))drpClose(id);
    else drpOpen(id);
  });
  function navM(delta){drpState[id].viewM+=delta;while(drpState[id].viewM<1){drpState[id].viewM+=12;drpState[id].viewY--;}while(drpState[id].viewM>12){drpState[id].viewM-=12;drpState[id].viewY++;}drpRenderGrid(id);}
  var el;
  el=document.getElementById('drp-pM-'+id);if(el)el.addEventListener('click',function(e){e.stopPropagation();navM(-1);});
  el=document.getElementById('drp-nM-'+id);if(el)el.addEventListener('click',function(e){e.stopPropagation();navM(1);});
  el=document.getElementById('drp-reset-'+id);
  if(el)el.addEventListener('click',function(e){e.stopPropagation();
    drpState[id].fromISO=null;drpState[id].toISO=null;drpState[id].pickStep=0;
    document.getElementById('drp-lbl-'+id).textContent='انتخاب بازه زمانی';
    drpClose(id);if(cb)cb(null,null);
  });
  document.addEventListener('click',function(e){
    var wrap=document.getElementById('drp-wrap-'+id);
    if(wrap&&!wrap.contains(e.target))drpClose(id);
  });
}
function buildDateSelects(pfx,jy,jm,jd,minY,maxY){
  var yO='';for(var y=minY;y<=maxY;y++)yO+='<option value="'+y+'"'+(y===jy?' selected':'')+'>'+toFa(y)+'</option>';
  var mO=MONTHS.map(function(m,i){return'<option value="'+(i+1)+'"'+((i+1)===jm?' selected':'')+'>'+m+'</option>';}).join('');
  var dO='';for(var d=1;d<=31;d++)dO+='<option value="'+d+'"'+(d===jd?' selected':'')+'>'+toFa(d)+'</option>';
  return'<select class="filter-sel fsel" id="'+pfx+'-y">'+yO+'</select>'+
         '<select class="filter-sel fsel" id="'+pfx+'-m">'+mO+'</select>'+
         '<select class="filter-sel fsel" id="'+pfx+'-d">'+dO+'</select>';
}
function buildFilterBar(){
  return'<div class="filter-bar" id="filter-bar">'+
    '<div class="pos-sw" id="pos-sw">'+
      '<div class="pos-tags" id="pos-tags"></div>'+
      '<input class="pos-inp" id="pos-inp" type="text" placeholder="فیلتر جایگاه..." autocomplete="off"/>'+
      '<div class="pos-dd" id="pos-dd"></div>'+
    '</div>'+
    '<div class="fbar-div"></div>'+
    buildDRP('fbar')+
    '<div class="filter-sep"></div>'+
    '<div class="toggle-group">'+
      '<button class="toggle-btn'+(chartMode==='monthly'?' active':'')+'" id="tog-monthly">ماهانه</button>'+
      '<button class="toggle-btn'+(chartMode==='daily'?' active':'')+'" id="tog-daily">روزانه</button>'+
    '</div>'+
  '</div>';
}
function wireFilterBar(){
  wireDRP('fbar',filterFromISO,filterToISO,function(f,t){
    filterFromISO=f||dataMinISO;filterToISO=t||dataMaxISO;
    rerenderCharts();refreshCmpTab();
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
    return'<div class="outlook-card'+(item.key==='realistic'?' realistic':'')+'"><div class="outlook-badge">'+item.badge+'</div><div class="outlook-icon">'+item.icon+'</div><div class="outlook-title">'+item.title+'</div><div class="outlook-rpm">'+fmtRpm(item.data.rpm)+'</div><div class="outlook-rpm-lbl">تومان / نمایش</div><div class="outlook-divider"></div><div class="outlook-revenue">'+fmtNum(item.data.monthly)+'</div><div class="outlook-revenue-lbl">تومان / ماه (تخمینی)</div></div>';
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
  var pts=getPubPts();
  var el;
  el=document.getElementById('chart-rpm');if(el)el.innerHTML=makeLineSvg(pts,1200,200,{pL:68,pR:20,pT:14,pB:40},'rpm');
  el=document.getElementById('chart-adv');if(el)el.innerHTML=makeLineSvg(pts,600,160,{pL:72,pR:16,pT:12,pB:38},'totalAdv');
  el=document.getElementById('chart-pv');if(el)el.innerHTML=makeLineSvg(pts,600,160,{pL:72,pR:16,pT:12,pB:38},'avgPv');
  initTooltips();
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
  var bd=filteredPubDaily(),pts=getPubPts();
  var html='';
  // Header
  html+='<div class="hdr"><div class="hdr-brand"><div class="y-logo">ن</div><div><div class="hdr-name">'+esc(d.publisherName||'گزارش ناشر')+'</div><div class="hdr-meta">'+esc(d.pageTitle||'')+'</div></div></div></div>';
  html+=buildFilterBar();
  html+='<div class="main">';
  html+='<div class="sec-lbl">ترند RPM</div><div class="chart-section" id="chart-rpm">'+makeLineSvg(pts,1200,200,{pL:68,pR:20,pT:14,pB:40},'rpm')+'</div>';
  html+='<div class="charts-duo">'+
    '<div><div class="sec-lbl">هزینه تبلیغات</div><div class="chart-section" id="chart-adv">'+makeLineSvg(pts,600,160,{pL:72,pR:16,pT:12,pB:38},'totalAdv')+'</div></div>'+
    '<div><div class="sec-lbl">بازدید صفحه (PV)</div><div class="chart-section" id="chart-pv">'+makeLineSvg(pts,600,160,{pL:72,pR:16,pT:12,pB:38},'avgPv')+'</div></div>'+
  '</div>';
  html+='</div>';  // close .main
  // Comparison section (directly after main, no tab wrapper)
  html+='<div id="cmp-section"><div class="cmp-panel">';
  html+='<p class="sec-lbl">مقایسه جایگاه‌ها</p>';
  // Publisher row
  html+='<div class="cmp-pub-row">'+
    '<div class="cmp-pub-chips" id="cmp-chips"></div>'+
    '<div style="position:relative">'+
      '<input class="cmp-inp" id="cmp-inp" type="text" placeholder="افزودن ناشر (نام یا publisher_id)..." autocomplete="off">'+
      '<div class="cmp-dd" id="cmp-dd"></div>'+
    '</div>'+
    '<span class="cmp-hint" id="cmp-hint">یک ناشر دیگر اضافه کنید تا مقایسه شروع شود</span>'+
  '</div>';
  // Controls: mode switcher
  html+='<div class="cmp-controls">'+
    '<div class="cmp-mode-sw">'+
      '<button class="cmp-mode-btn'+(cmpMode==='group'?' active':'')+'" id="cmp-btn-group">گروه‌بندی</button>'+
      '<button class="cmp-mode-btn'+(cmpMode==='desc'?' active':'')+'" id="cmp-btn-desc">جایگاه‌ها</button>'+
    '</div>'+
  '</div>';
  // Desc filter bar (mode 2)
  html+='<div class="cmp-desc-bar" id="cmp-desc-bar" style="display:'+(cmpMode==='desc'?'flex':'none')+'">'+
    '<input class="cmp-desc-inp" id="cmp-desc-inp" type="text" placeholder="فیلتر نام جایگاه..." value="'+esc(cmpDescFilter)+'">'+
  '</div>';
  html+='<div id="cmp-table-wrap"></div>';
  html+='</div></div>';
  root.innerHTML=html;
  wireFilterBar();
  initTooltips();
  wireCmpTab();
  if(!cmpPubs.length&&pubData&&d){
    cmpPubs=[{pubId:d.appId,name:d.publisherName||d.appId,positions:pubData.positions}];
    refreshCmpTab();
  }
}

// ── Comparison tab ──────────────────────────────────────────────
function wireCmpTab(){
  var inp=document.getElementById('cmp-inp');
  var dd=document.getElementById('cmp-dd');
  if(!inp||!dd)return;
  // Publisher search
  function getSugs(q){
    if(!allPubData||!q||q.length<2)return[];
    var ql=q.toLowerCase();var res=[];
    Object.keys(allPubData).forEach(function(pubId){
      if(cmpPubs.find(function(p){return p.pubId===pubId;}))return;
      var pub=allPubData[pubId];
      if((pub.publisher_name||'').toLowerCase().indexOf(ql)>=0||pubId.toLowerCase().indexOf(ql)>=0)
        res.push({pubId:pubId,name:pub.publisher_name||pubId});
    });
    return res.slice(0,8);
  }
  function renderDD(q){
    var items=getSugs(q);
    if(!items.length){dd.style.display='none';return;}
    dd.innerHTML=items.map(function(it){
      return'<div class="cmp-dd-item" data-pubid="'+it.pubId+'" data-name="'+esc(it.name)+'">'+
        '<span class="cmp-dd-name">'+esc(it.name)+'</span></div>';
    }).join('');
    dd.querySelectorAll('.cmp-dd-item').forEach(function(item){
      item.addEventListener('mousedown',function(e){
        e.preventDefault();
        var pubId=item.getAttribute('data-pubid');
        var name=item.getAttribute('data-name');
        var pub=allPubData[pubId];
        if(pub&&cmpPubs.length<4&&!cmpPubs.find(function(p){return p.pubId===pubId;})){
          cmpPubs.push({pubId:pubId,name:name,positions:pub.positions});
        }
        inp.value='';dd.style.display='none';
        refreshCmpTab();
      });
    });
    dd.style.display='block';
  }
  inp.addEventListener('input',function(){renderDD(inp.value);});
  inp.addEventListener('focus',function(){if(inp.value)renderDD(inp.value);});
  inp.addEventListener('blur',function(){setTimeout(function(){if(dd)dd.style.display='none';},160);});
  // Mode switcher
  var btnGrp=document.getElementById('cmp-btn-group');
  var btnDesc=document.getElementById('cmp-btn-desc');
  var descBar=document.getElementById('cmp-desc-bar');
  if(btnGrp)btnGrp.addEventListener('click',function(){
    cmpMode='group';btnGrp.classList.add('active');btnDesc.classList.remove('active');
    if(descBar)descBar.style.display='none';
    refreshCmpTab();
  });
  if(btnDesc)btnDesc.addEventListener('click',function(){
    cmpMode='desc';btnDesc.classList.add('active');btnGrp.classList.remove('active');
    if(descBar)descBar.style.display='flex';
    refreshCmpTab();
  });
  // Desc filter
  var descInp=document.getElementById('cmp-desc-inp');
  if(descInp)descInp.addEventListener('input',function(){cmpDescFilter=descInp.value;refreshCmpTab();});
}

function refreshCmpTab(){
  var chipsEl=document.getElementById('cmp-chips');
  var hintEl=document.getElementById('cmp-hint');
  var tableEl=document.getElementById('cmp-table-wrap');
  if(!chipsEl)return;
  chipsEl.innerHTML=cmpPubs.map(function(p,i){
    return'<div class="cmp-chip'+(i===0?' own':'')+'">'+
      '<span>'+esc(p.name)+'</span>'+
      (i>0?'<button class="cmp-chip-x" data-pubid="'+p.pubId+'">×</button>':'')+
    '</div>';
  }).join('');
  chipsEl.querySelectorAll('.cmp-chip-x').forEach(function(btn){
    btn.addEventListener('click',function(){
      var id=btn.getAttribute('data-pubid');
      cmpPubs=cmpPubs.filter(function(p){return p.pubId!==id;});
      refreshCmpTab();
    });
  });
  if(hintEl)hintEl.textContent=cmpPubs.length>=2?
    toFa(cmpPubs.length)+' ناشر انتخاب شده — حداکثر ۴ ناشر':
    'یک ناشر دیگر اضافه کنید تا مقایسه شروع شود';
  if(!tableEl)return;
  if(!cmpPubs.length){tableEl.innerHTML='';return;}
  if(cmpMode==='group'){
    if(cmpPubs.length>=2){
      var pubsData=cmpPubs.map(function(p){var r=computeGroupStats(p.positions,filterFromISO,filterToISO);return{name:p.name,pubId:p.pubId,groups:r.groups};});
      tableEl.innerHTML=buildCmpTable(pubsData);
    }else{
      var statsResult=computeGroupStats(cmpPubs[0].positions,filterFromISO,filterToISO);
      tableEl.innerHTML='<div class="sec-lbl" style="margin:0 0 16px">'+esc(cmpPubs[0].name)+'</div>'+buildGroupTable(statsResult);
    }
  }else{
    var pubsData=cmpPubs.map(function(p){return{name:p.name,pubId:p.pubId,positions:p.positions};});
    tableEl.innerHTML=buildDescTable(pubsData);
  }
}

// ── Bootstrap ──────────────────────────────────────────────────
chrome.storage.local.get('ynprice_report',function(stored){
  document.getElementById('loading').style.display='none';
  document.getElementById('root').style.display='';
  if(!stored.ynprice_report){document.getElementById('root').innerHTML='<div style="height:80vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px"><div style="font-size:52px">😕</div><div style="font-size:18px;font-weight:600">گزارشی یافت نشد</div><div style="font-size:13px;color:var(--muted)">لطفاً دوباره از اکستنشن گزارش بگیرید</div></div>';return;}
  var report=stored.ynprice_report;
  fetch(chrome.runtime.getURL('data/publisher_data.json')).then(function(r){return r.json();}).catch(function(){return null;}).then(function(all){
    allPubData=all;
    if(all&&report.appId&&all[report.appId])pubData=all[report.appId];
    render(report);
  });
});
chrome.storage.onChanged.addListener(function(changes,area){
  if(area!=='local'||!changes.ynprice_report)return;
  var nv=changes.ynprice_report.newValue;
  if(!nv||!reportData)return;
  if(nv.screenshots){reportData.screenshots=nv.screenshots;}
});
})();
