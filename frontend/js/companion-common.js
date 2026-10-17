(function (root) {
  "use strict";
  function accountId(a) { return [a.provider || "", a.user || a.name || "", a.plan || ""].join("|"); }
  function selected(accounts, id) {
    if (id) return accounts.find(a => accountId(a) === id) || null;
    return accounts.find(a => a.last) || accounts[0] || null;
  }
  function windows(a) {
    return (a && Array.isArray(a.windows) ? a.windows : []).map(w => ({ ...w,
      remaining: typeof w.remaining === "number" ? Math.max(0, Math.min(100, w.remaining)) :
        typeof w.used === "number" ? Math.max(0, Math.min(100, 100 - w.used)) : null
    }));
  }
  function tightest(a) { return windows(a).filter(w => w.remaining !== null).sort((a,b) => a.remaining-b.remaining)[0]; }
  function stale(a) { return !!(a && a.readAt && Date.now()-Date.parse(a.readAt)>10*60000); }
  function number(n) { return Number(n || 0).toLocaleString("zh-CN"); }
  function reset(at) {
    const ms = Date.parse(at)-Date.now();
    if (!Number.isFinite(ms)) return "重置时间未知";
    if (ms <= 0) return "等待更新";
    const mins=Math.ceil(ms/60000);
    return (mins>=1440 ? Math.floor(mins/1440)+"天 " : "") + Math.floor(mins%1440/60)+"小时 "+mins%60+"分后重置";
  }
  function noticeTitle(n) { return n.source+" · "+(n.interrupted ? "已中断 / 失败" : n.kind==="turn" ? "本轮完成" : "请求完成"); }
  function noticeCost(n) { return typeof n.cost==="number" ? "参考费用 $"+n.cost.toFixed(6) : "未提供本轮费用"; }
  function applyFont(settings, doc) {
    if(!doc?.documentElement)return;
    const family=String(settings.fontFamily||"Microsoft YaHei UI").replace(/[\x00-\x1f]/g,"").slice(0,100);
    doc.documentElement.style.setProperty("--companion-font",JSON.stringify(family)+', "Microsoft YaHei UI", sans-serif');
    doc.documentElement.style.setProperty("--companion-font-scale",String(Math.max(.8,Math.min(1.4,Number(settings.fontScale)||1))));
    if(doc.fonts)doc.fonts.load('700 18px '+JSON.stringify(family)).then(()=>doc.dispatchEvent(new Event("companion-font-ready"))).catch(()=>{});
  }
  root.WhaleCompanion = {applyFont, accountId, selected, windows, tightest, stale, number, reset, noticeTitle, noticeCost};
})(typeof window === "undefined" ? globalThis : window);
