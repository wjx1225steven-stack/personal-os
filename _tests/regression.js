"use strict";

// 在真正的同源页面里运行应用，仅替换存储键。每个 iframe 有自己的表单和 JS 状态。
const start = document.querySelector("#start");
const output = document.querySelector("#results");
const frames = [];
let key, html, script;

function check(value, label) {
  if (!value) throw new Error(label);
  output.textContent += "通过 · " + label + "\n";
}

async function until(condition) {
  const end = performance.now() + 4000;
  while (!condition()) {
    if (performance.now() > end) throw new Error("等待页面更新超时：" + condition);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function page() {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const base = doc.createElement("base");
  base.href = new URL("../", location.href);
  doc.head.prepend(base);
  const app = doc.querySelector('script[src="app.js"]');
  app.removeAttribute("src");
  app.textContent = script.replace('"personal-os-tasks-v1"', JSON.stringify(key));
  const setup = doc.createElement("script");
  setup.textContent = `
    window.messages = [];
    window.answer = true;
    window.alert = message => messages.push(message);
    window.confirm = message => { messages.push(message); return answer; };
    const originalWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k,v) {
      if (window.failWrite) throw new DOMException("test", "QuotaExceededError");
      return originalWrite.call(this,k,v);
    };
    HTMLAnchorElement.prototype.click = function() { window.downloadURL = this.href; };
    const Clock = Date;
    window.clock = new Clock(2026, 10, 24, 23, 58).getTime();
    window.Date = class extends Clock {
      constructor(...args) { super(...(args.length ? args : [window.clock])); }
      static now() { return window.clock; }
    };
  `;
  app.before(setup);
  const frame = document.createElement("iframe");
  frame.style.cssText = "width:768px;height:800px;border:0";
  frames.push(frame);
  frame.srcdoc = "<!doctype html>" + doc.documentElement.outerHTML;
  document.body.append(frame);
  const w = frame.contentWindow;
  await until(() => w.document.querySelector("#moduleGrid .module-card"));
  return { w, frame, el: selector => w.document.querySelector(selector) };
}

async function run() {
  const read = () => JSON.parse(localStorage.getItem(key));
  const file = value => new File([JSON.stringify(value)], "sample.json");
  const seed = {
    id: "v1-sample", module: "execution", date: "2026-11-24", priority: "medium",
    title: "旧任务", note: "", completed: false, createdAt: "2026-11-24T00:00:00.000Z"
  };
  const previous = JSON.stringify([seed], null, 2);
  localStorage.setItem(key, previous);
  const { w, el, frame } = await page();
  check(localStorage.getItem(key) === previous && el(".task-title").textContent === seed.title, "V1.0 原始存储按字节保留");
  for (const width of [1440, 768, 390]) {
    frame.style.width = width + "px";
    await until(() => w.innerWidth === width);
    const rect = el(".mini-progress i").getBoundingClientRect();
    check(rect.height === 4 && w.document.documentElement.scrollWidth === width, width + "px 首页无溢出，进度条高 4px");
    if (width === 390) {
      check(w.getComputedStyle(el("#sidebar")).visibility === "hidden", "收起的手机抽屉退出焦点顺序");
      el("#menuButton").click();
      check(w.document.activeElement === el("#sidebarClose"), "打开抽屉时焦点移入导航");
      el("#sidebarClose").click();
      check(w.document.activeElement === el("#menuButton"), "关闭抽屉后焦点返回菜单");
    }
    el("#addTaskButton").click();
    check(el("#taskModal").offsetWidth <= width && el("#taskModal").scrollWidth === el("#taskModal").clientWidth, width + "px 表单无溢出");
    el("#taskModal").close();
  }
  el("#addTaskButton").click();
  el("#taskTitle").value = "明日任务";
  el("#taskDate").value = "2026-11-25";
  w.failWrite = true;
  const submit = () => el("#taskForm").requestSubmit();
  submit();
  await until(() => w.messages.some(m => m.includes("未保存")));
  check(el("#taskModal").open && el("#taskTitle").value === "明日任务" && read().length === 1, "保存失败保留草稿和原记录");
  w.failWrite = false;
  submit();
  await until(() => !el("#taskModal").open);
  check(read().length === 2 && el("#todayCount").textContent === "1", "重试只新增一项，明日任务不计入今天");
  el(".task-check").click();
  await until(() => el("#completionRate").textContent === "100%");
  el(".edit").click();
  el("#taskTitle").value = "修改后";
  submit();
  await until(() => !el("#taskModal").open);
  check(read()[0].title === "修改后" && read()[0].completed, "编辑保留完成状态");
  w.answer = false;
  el(".delete").click();
  check(read().length === 2, "取消删除保留数据");
  w.answer = true;
  const other = await page();
  check(other.el(".task-title").textContent === "修改后", "重新打开后恢复已保存记录");
  other.el(".edit").click();
  other.el("#taskTitle").value = "旧草稿";
  // 两个窗口在同一事件循环内提交，锁内只能有一个旧快照成功。
  await Promise.all([w.toggleTask(seed.id), other.w.toggleTask(seed.id)]);
  check(!read()[0].completed && [...w.messages, ...other.w.messages].some(m => m.includes("其他页面更新")), "并发写入识别旧快照");
  await until(() => other.el("#completionRate").textContent === "0%" && el("#completionRate").textContent === "0%");
  other.el("#taskForm").requestSubmit();
  await until(() => other.w.messages.some(m => m.includes("复制")));
  check(other.el("#taskModal").open && read()[0].title === "修改后", "过期编辑草稿无法覆盖新记录");
  other.frame.remove();
  w.clock += 86400000;
  w.dispatchEvent(new Event("pageshow"));
  check(el(".task-title").textContent === "明日任务" && el("#todayCount").textContent === "1", "次日恢复页面后切换任务与统计");
  // 将虚拟时间拨到午夜前，触发真正的定时器回调。
  w.clock = new Date(2026, 10, 25, 23, 59, 59, 850).getTime();
  w.dispatchEvent(new Event("focus"));
  w.clock += 200;
  await until(() => el("#todayCount").textContent === "0");
  check(el("#completionRate").textContent === "0%", "前台跨午夜自动更新为零任务");
  w.exportData();
  const backup = await (await fetch(w.downloadURL)).json();
  const original = localStorage.getItem(key);
  w.failWrite = true;
  for (const [label, mutate] of [
    ["切换完成", () => w.toggleTask(seed.id)],
    ["删除", () => w.deleteTask(seed.id)],
    ["导入", () => w.importData(file([]))],
    ["清空", () => w.clearData()]
  ]) {
    await mutate();
    check(localStorage.getItem(key) === original && w.messages.at(-1).includes("未保存"), label + "写入失败时保留旧数据");
  }
  w.failWrite = false;
  for (const bad of [
    { ...backup, version: 2 }, { ...backup, app: "未知" }, [seed, seed],
    [seed, {}], [{ ...seed, date: "2026-02-31" }], [{ ...seed, completed: "false" }],
    [{ ...seed, module: "unknown" }], [{ ...seed, title: " " }]
  ]) {
    const count = w.messages.length;
    await w.importData(file(bad));
    check(localStorage.getItem(key) === original && w.messages[count].includes("导入失败"), "拒绝异常备份：" + w.messages[count]);
  }
  await w.importData(new File(["{"], "broken.json"));
  check(localStorage.getItem(key) === original, "JSON 语法错误保留原数据");
  w.answer = false;
  await w.importData(file([]));
  check(localStorage.getItem(key) === original, "取消导入保留原数据");
  w.answer = true;
  await w.clearData();
  await w.importData(file(backup));
  check(localStorage.getItem(key) === original, "导出、清空、导入后任务逐字段一致");
  const literal = '复盘 "A" <em>原文</em> & 笔记';
  const records = Array.from({length: 7}, (_, i) => ({
    ...seed, id: literal + i, title: literal, note: literal, date: "2026-11-26"
  }));
  await w.importData(file(records));
  el("#showAllToday").click();
  check(el(".task-title").textContent === literal && el(".task-meta [title]").title === literal && !el(".task-card em"), "引号与标签按字面显示，ID 不进入模板");
  el(".task-check").click();
  await until(() => el("#completionRate").textContent === "14%");
  check(el("#todayTaskList").children.length === 7, "展开后勾选仍显示七项");
  for (const button of [...w.document.querySelectorAll(".nav-module")]) {
    w.showModule(button.dataset.module);
    check(!el("#moduleView").hidden && el("#pageTitle").textContent === button.textContent, "模块导航：" + button.textContent);
  }
  w.showModule("execution");
  el('[data-filter="completed"]').click();
  check(el("#moduleTaskList").querySelectorAll("article").length === 1, "按完成状态筛选");
  el("#taskSearch").value = "不匹配";
  el("#taskSearch").dispatchEvent(new Event("input"));
  check(!!el("#moduleTaskList .empty-state"), "模块搜索空结果");
  await w.deleteTask(records[0].id);
  check(read().length === 6, "特殊字符 ID 精确删除一项");
  localStorage.setItem(key, "损坏的旧记录");
  const damaged = await page();
  check(!damaged.el("#storageNotice").hidden && damaged.el("#todayCount").textContent === "0", "损坏数据进入保护状态");
  await damaged.w.clearData();
  check(localStorage.getItem(key) === "损坏的旧记录", "普通操作不能覆盖损坏记录");
  damaged.w.exportData();
  check(await (await fetch(damaged.w.downloadURL)).text() === "损坏的旧记录", "恢复导出保留原文");
  damaged.w.failWrite = true;
  await damaged.w.importData(file(backup));
  check(localStorage.getItem(key) === "损坏的旧记录", "无法保存恢复副本时保护原文");
  damaged.w.failWrite = false;
  await damaged.w.importData(file(backup));
  check(localStorage.getItem(key) === original && Object.keys(localStorage).some(k => k.startsWith(key + "-recovery-") && localStorage[k] === "损坏的旧记录"), "明确恢复后保留原始副本");
  frames.forEach(f => f.remove());
  localStorage.removeItem(key);
  const first = await page();
  check(read().length === 6 && read().every(t => t.date === "2026-11-24"), "首次启动即固定六项示例的日期");
  first.w.clock += 86400000;
  first.w.document.dispatchEvent(new Event("visibilitychange"));
  check(first.el("#todayCount").textContent === "0" && read().length === 6, "次日示例不重新生成");
}

start.onclick = async () => {
  start.disabled = true;
  output.textContent = "";
  key = "personal-os-test-" + crypto.randomUUID();
  try {
    [html, script] = await Promise.all(["../index.html", "../app.js"].map(async path => (await fetch(path)).text()));
    await run();
    output.textContent += "全部通过";
  } catch (error) {
    output.textContent += "失败 · " + error.stack;
  } finally {
    frames.splice(0).forEach(f => f.remove());
    Object.keys(localStorage).filter(k => k === key || k.startsWith(key + "-recovery-")).forEach(k => localStorage.removeItem(k));
    start.disabled = false;
  }
};
