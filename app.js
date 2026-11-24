"use strict";

const STORAGE_KEY = "personal-os-tasks-v1";

const modules = [
  { id: "execution", name: "执行系统", short: "行", description: "目标拆解、日程规划与高效行动", color: "#667b6d", soft: "#e6ece7" },
  { id: "mind", name: "读书与心智成长", short: "读", description: "阅读、思考与认知持续升级", color: "#8c745b", soft: "#f0e9e2" },
  { id: "global", name: "国际化系统", short: "界", description: "语言能力与全球视野拓展", color: "#65758c", soft: "#e6eaf0" },
  { id: "ai", name: "AI能力系统", short: "AI", description: "掌握工具，建立智能工作流", color: "#756d94", soft: "#ece9f3" },
  { id: "fitness", name: "身体训练系统", short: "体", description: "力量、耐力与健康生活方式", color: "#7b8562", soft: "#ebeee4" },
  { id: "brand", name: "个人品牌系统", short: "牌", description: "持续输出，积累长期影响力", color: "#936c68", soft: "#f2e8e7" }
];

const state = {
  tasks: [],
  expandedToday: false,
  currentView: "home",
  currentModule: "execution",
  filter: "all",
  search: ""
};

const $ = (selector) => document.querySelector(selector);
function today() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function defaultTasks() {
  const date = today();
  return [
    createTask("列出今日三件最重要的事", "execution", date, "high", "聚焦真正推动目标的行动"),
    createTask("阅读 30 分钟", "mind", date, "medium", "记录一个启发和一个问题"),
    createTask("完成一次 AI 工具练习", "ai", date, "medium", "用真实任务练习，而不是只看教程"),
    createTask("进行 30 分钟身体训练", "fitness", date, "high", "训练前后注意热身和拉伸"),
    createTask("复习 20 个外语表达", "global", date, "low", "尝试放入真实语境"),
    createTask("整理一条公开输出素材", "brand", date, "medium", "先完成小版本，再持续优化")
  ];
}

function createTask(title, module, date, priority = "medium", note = "") {
  return { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, title, module, date, priority, note, completed: false, createdAt: new Date().toISOString() };
}

// 快照是读入时的原始字符串。持锁后再次比较，保护另一页刚写入的数据。
let snapshot;
let storageProblem = "";
let originalEdit;
let dayShown = today();
let midnightTimer;

function validateTasks(tasks) {
  if (!Array.isArray(tasks)) throw new Error("缺少任务数组");
  const ids = new Set();
  for (const [index, task] of tasks.entries()) {
    const invalid = field => { throw new Error(`第 ${index + 1} 条任务：${field}`); };
    if (!task || typeof task !== "object") invalid("记录格式错误");
    if (typeof task.id !== "string" || !task.id.trim() || ids.has(task.id)) invalid("ID 缺失或重复");
    ids.add(task.id);
    if (typeof task.title !== "string" || !task.title.trim() || task.title.length > 80) invalid("任务名称无效");
    if (!modules.some(m => m.id === task.module)) invalid("所属系统无效");
    if (typeof task.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(task.date)) invalid("计划日期格式错误");
    const day = new Date(task.date + "T00:00:00Z");
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== task.date) invalid("计划日期不存在");
    if (!["high", "medium", "low"].includes(task.priority)) invalid("优先级无效");
    if (typeof task.completed !== "boolean") invalid("完成状态须为布尔值");
    if (typeof task.note !== "string" || task.note.length > 240) invalid("备注无效");
    if (typeof task.createdAt !== "string" || !Number.isFinite(Date.parse(task.createdAt))) invalid("创建时间无效");
  }
  return tasks;
}

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const tasks = raw === null ? [] : validateTasks(JSON.parse(raw));
    snapshot = raw;
    state.tasks = tasks;
    storageProblem = "";
  } catch (error) {
    storageProblem = "任务存储读取失败，已暂停写入。请在数据管理中导出原始数据，或用有效备份恢复。";
  }
  $("#storageNotice").textContent = storageProblem;
  $("#storageNotice").hidden = !storageProblem;
}

// next 是新列表；写入失败时旧列表、对话框和输入内容仍在。
async function saveTasks(next, expected = snapshot, recovery = false) {
  try {
    if (!navigator.locks) throw new Error("当前环境无法协调多标签保存，请使用新版浏览器，通过 localhost 或 HTTPS 打开。");
    return await navigator.locks.request(STORAGE_KEY, () => {
      if (storageProblem && !recovery) throw new Error(storageProblem);
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== expected) {
        readStorage();
        render();
        throw new Error("数据已在其他页面更新，请核对最新任务后重试。");
      }
      const serialized = JSON.stringify(validateTasks(next));
      if (recovery && raw !== null) {
        // 恢复前留存原文。备份或主记录写入失败都会中止恢复。
        localStorage.setItem(STORAGE_KEY + "-recovery-" + crypto.randomUUID(), raw);
      }
      localStorage.setItem(STORAGE_KEY, serialized);
      snapshot = serialized;
      state.tasks = next;
      storageProblem = "";
      $("#storageNotice").hidden = true;
      return true;
    });
  } catch (error) {
    alert("未保存。" + (error.name === "QuotaExceededError" ? "浏览器存储空间不足，请导出备份并释放空间后重试。" : error.message));
    return false;
  }
}

function getModule(id) {
  return modules.find((module) => module.id === id) || modules[0];
}



function formatDate(dateString) {
  if (dateString === today()) return "今天";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowString = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (dateString === tomorrowString) return "明天";
  const [year, month, day] = dateString.split("-");
  return `${Number(month)}月${Number(day)}日` + (year !== String(new Date().getFullYear()) ? ` · ${year}` : "");
}

function priorityLabel(priority) {
  return { high: "重要", medium: "常规", low: "低优先" }[priority];
}

function renderNavigation() {
  const navList = $("#navList");
  navList.querySelectorAll(".nav-module").forEach((item) => item.remove());
  modules.forEach((module) => {
    const button = document.createElement("button");
    button.className = `nav-item nav-module${state.currentView === "module" && state.currentModule === module.id ? " active" : ""}`;
    button.dataset.module = module.id;
    button.style.setProperty("--module-color", module.color);
    button.innerHTML = `<span class="nav-dot" aria-hidden="true"></span><span>${module.name}</span>`;
    button.addEventListener("click", () => showModule(module.id));
    navList.appendChild(button);
  });
  const homeButton = navList.querySelector('[data-view="home"]');
  homeButton.classList.toggle("active", state.currentView === "home");
  homeButton.onclick = showHome;
}

function renderHome() {
  const todayTasks = state.tasks.filter((task) => task.date === today());
  const completed = todayTasks.filter((task) => task.completed).length;
  const rate = todayTasks.length ? Math.round((completed / todayTasks.length) * 100) : 0;

  $("#todayCount").textContent = todayTasks.length;
  $("#completedCount").textContent = completed;
  $("#completionRate").textContent = `${rate}%`;
  $("#ringValue").textContent = `${rate}%`;
  $("#progressRing").style.setProperty("--progress", rate);
  $("#progressRing").setAttribute("aria-label", `今日完成率 ${rate}%`);
  $("#todayHint").textContent = todayTasks.length ? `还有 ${todayTasks.length - completed} 项待完成` : "等待规划";
  $("#completedHint").textContent = completed ? "做得很好" : "保持节奏";

  const hour = new Date().getHours();
  const greeting = hour < 6 ? "夜深了，也别忘记休息" : hour < 12 ? "早上好，今天想推进什么？" : hour < 18 ? "下午好，保持专注与节奏" : "晚上好，回顾今天的进展";
  $("#greeting").textContent = greeting;

  const sorted = [...todayTasks].sort((a, b) => Number(a.completed) - Number(b.completed) || ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]));
  $("#showAllToday").hidden = sorted.length <= 5;
  $("#showAllToday").textContent = state.expandedToday ? "收起" : "查看全部";
  renderTaskList($("#todayTaskList"), sorted, "今天还没有任务", "为今天设定一个清晰、可完成的小目标。", state.expandedToday ? Infinity : 5);
  renderModuleGrid();
}

function renderModuleGrid() {
  $("#moduleGrid").innerHTML = modules.map((module) => {
    const tasks = state.tasks.filter((task) => task.module === module.id);
    const completed = tasks.filter((task) => task.completed).length;
    const rate = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
    return `<button class="module-card" data-module-card="${module.id}" style="--module-color:${module.color};--module-soft:${module.soft}">
      <span class="module-card-top"><span class="module-symbol">${module.short}</span><span class="module-count">${completed}/${tasks.length} 已完成</span></span>
      <h3>${module.name}</h3><p>${module.description}</p>
      <span class="mini-progress"><i style="width:${rate}%"></i></span>
    </button>`;
  }).join("");
  document.querySelectorAll("[data-module-card]").forEach((button) => button.addEventListener("click", () => showModule(button.dataset.moduleCard)));
}

function renderModule() {
  const module = getModule(state.currentModule);
  const tasks = state.tasks.filter((task) => task.module === module.id);
  const completed = tasks.filter((task) => task.completed).length;
  const rate = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  $("#moduleSummary").style.setProperty("--module-color", module.color);
  $("#moduleSummary").style.setProperty("--module-soft", module.soft);
  $("#moduleSummary").innerHTML = `<div class="module-symbol">${module.short}</div>
    <div class="module-summary-copy"><h2>${module.name}</h2><p>${module.description}</p></div>
    <div class="module-progress"><div class="module-progress-row"><span>系统进度</span><strong>${completed}/${tasks.length} · ${rate}%</strong></div><div class="module-progress-track"><i style="width:${rate}%"></i></div></div>`;

  let filtered = tasks.filter((task) => state.filter === "all" || (state.filter === "completed" ? task.completed : !task.completed));
  if (state.search) filtered = filtered.filter((task) => `${task.title} ${task.note}`.toLowerCase().includes(state.search.toLowerCase()));
  filtered.sort((a, b) => a.date.localeCompare(b.date) || Number(a.completed) - Number(b.completed));
  renderTaskList($("#moduleTaskList"), filtered, "这里还没有任务", "创建第一个任务，让这个成长系统开始运转。", Infinity);
}

function renderTaskList(container, tasks, emptyTitle, emptyText, limit) {
  if (!tasks.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">✓</div><strong>${emptyTitle}</strong><p>${emptyText}</p><button class="button button-primary empty-add">新建任务</button></div>`;
    container.querySelector(".empty-add").addEventListener("click", () => openTaskModal());
    return;
  }
  container.replaceChildren(...tasks.slice(0, limit).map(taskCard));
}

function taskCard(task) {
  const module = getModule(task.module);
  const card = document.createElement("article");
  card.className = task.completed ? "task-card completed" : "task-card";
  // 模板只有固定标记。任务内容通过 DOM 属性赋值，ID 仅用于内存查找。
  card.innerHTML = `<button class="task-check"></button>
    <div class="task-main"><h3 class="task-title"></h3><div class="task-meta">
      <span class="module-tag"><i></i></span><span class="task-date"></span><span class="priority-tag"></span>
    </div></div>
    <div class="task-actions"><button class="task-action edit" aria-label="编辑任务" title="编辑">✎</button>
    <button class="task-action delete" aria-label="删除任务" title="删除">×</button></div>`;
  const check = card.querySelector(".task-check");
  check.textContent = task.completed ? "✓" : "";
  check.setAttribute("aria-pressed", task.completed);
  check.setAttribute("aria-label", task.completed ? "标记为未完成" : "标记为已完成");
  check.onclick = () => toggleTask(task.id);
  card.querySelector(".edit").onclick = () => openTaskModal(task.id);
  card.querySelector(".delete").onclick = () => deleteTask(task.id);
  card.querySelector(".task-title").textContent = task.title;
  const tag = card.querySelector(".module-tag");
  tag.style.setProperty("--module-color", module.color);
  tag.append(module.name);
  card.querySelector(".task-date").textContent = formatDate(task.date);
  const priority = card.querySelector(".priority-tag");
  priority.classList.add(task.priority);
  priority.textContent = priorityLabel(task.priority);
  if (task.note) {
    const note = document.createElement("span");
    note.title = note.textContent = task.note;
    card.querySelector(".task-meta").append(note);
  }
  return card;
}

function render() {
  renderNavigation();
  if (state.currentView === "home") renderHome(); else renderModule();
}

function showHome() {
  state.currentView = "home";
  $("#homeView").hidden = false;
  $("#moduleView").hidden = true;
  $("#pageEyebrow").textContent = "今天，继续向前";
  $("#pageTitle").textContent = "今日概览";
  closeSidebar();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showModule(moduleId) {
  state.currentView = "module";
  state.currentModule = moduleId;
  state.filter = "all";
  state.search = "";
  $("#taskSearch").value = "";
  document.querySelectorAll(".filter-button").forEach((button) => button.classList.toggle("active", button.dataset.filter === "all"));
  $("#homeView").hidden = true;
  $("#moduleView").hidden = false;
  $("#pageEyebrow").textContent = "成长系统";
  $("#pageTitle").textContent = getModule(moduleId).name;
  closeSidebar();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openTaskModal(taskId = null) {
  const task = taskId ? state.tasks.find((item) => item.id === taskId) : null;
  originalEdit = task;
  $("#taskModalTitle").textContent = task ? "编辑任务" : "新建任务";
  $("#taskId").value = task?.id || "";
  $("#taskTitle").value = task?.title || "";
  $("#taskModule").value = task?.module || (state.currentView === "module" ? state.currentModule : "execution");
  $("#taskDate").value = task?.date || today();
  $("#taskPriority").value = task?.priority || "medium";
  $("#taskNote").value = task?.note || "";
  $("#taskModal").showModal();
  setTimeout(() => $("#taskTitle").focus(), 50);
}

function closeModal(id) {
  $("#" + id).close();
}

async function handleTaskSubmit(event) {
  event.preventDefault();
  const id = $("#taskId").value;
  const payload = {
    title: $("#taskTitle").value.trim(), module: $("#taskModule").value, date: $("#taskDate").value,
    priority: $("#taskPriority").value, note: $("#taskNote").value.trim()
  };
  if (!payload.title) { alert("请输入任务名称。"); return; }
  const current = state.tasks.find(task => task.id === id);
  if (id && (!current || JSON.stringify(current) !== JSON.stringify(originalEdit))) {
    alert("此任务已被其他页面修改或删除。请先复制要保留的输入，再关闭并重新打开任务。");
    return;
  }
  const next = id ? state.tasks.map(task => task.id === id ? { ...task, ...payload } : task)
    : [...state.tasks, createTask(payload.title, payload.module, payload.date, payload.priority, payload.note)];
  if (!await saveTasks(next)) return;
  closeModal("taskModal");
  render();
  showToast(id ? "任务已更新" : "任务已创建");
}

async function toggleTask(id) {
  const task = state.tasks.find(item => item.id === id);
  if (!task) return;
  const next = state.tasks.map(item => item === task ? { ...item, completed: !item.completed } : item);
  if (!await saveTasks(next)) return;
  render();
  showToast(task.completed ? "任务已恢复为进行中" : "完成一项，继续保持");
}

async function deleteTask(id) {
  const task = state.tasks.find(item => item.id === id);
  if (!task || !confirm(`确定删除“${task.title}”吗？`)) return;
  if (!await saveTasks(state.tasks.filter(item => item !== task))) return;
  render();
  showToast("任务已删除");
}

function exportData() {
  let content;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (storageProblem && raw === null) throw new Error("当前没有可导出的原始记录");
    content = storageProblem ? raw : JSON.stringify({
      app: "PERSONAL OS", version: 1, exportedAt: new Date().toISOString(),
      tasks: raw === null ? [] : validateTasks(JSON.parse(raw))
    }, null, 2);
  } catch (error) {
    alert("导出失败，请检查浏览器存储权限。" + error.message);
    return;
  }
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `personal-os-${storageProblem ? "recovery" : "backup"}-${today()}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("数据备份已导出");
}

async function importData(file) {
  if (!file) return;
  try {
    const recovery = Boolean(storageProblem);
    const expected = recovery ? localStorage.getItem(STORAGE_KEY) : snapshot;
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data) && (data?.app !== "PERSONAL OS" || data.version !== 1)) {
      throw new Error("备份来源或版本不受支持");
    }
    const tasks = validateTasks(Array.isArray(data) ? data : data.tasks);
    const previous = recovery ? "损坏的原始记录（将另存副本）" : `当前 ${state.tasks.length} 项任务`;
    if (!confirm(`用备份中的 ${tasks.length} 项任务替换${previous}？如需先导出，请取消。`)) return;
    if (!await saveTasks(tasks, expected, recovery)) return;
    closeModal("dataModal");
    showHome();
    showToast("数据已成功导入");
  } catch (error) {
    alert("导入失败：" + error.message);
  } finally {
    $("#importFile").value = "";
  }
}

async function clearData() {
  if (!confirm("确定清空全部任务吗？此操作不可撤销。")) return;
  if (!await saveTasks([])) return;
  closeModal("dataModal");
  showHome();
  showToast("全部任务已清空");
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 2200);
}

function openSidebar() {
  $("#sidebar").classList.add("open");
  $("#menuButton").setAttribute("aria-expanded", "true");
  $("#sidebarClose").focus();
  $("#sidebarBackdrop").classList.add("show");
}

function closeSidebar() {
  if ($("#sidebar").classList.contains("open")) $("#menuButton").focus();
  $("#menuButton").setAttribute("aria-expanded", "false");
  $("#sidebar").classList.remove("open");
  $("#sidebarBackdrop").classList.remove("show");
}

function refreshDate() {
  clearTimeout(midnightTimer);
  const day = today();
  if (day !== dayShown) {
    dayShown = day;
    render();
  }
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  midnightTimer = setTimeout(refreshDate, Math.max(1, midnight.getTime() - Date.now()));
}

async function init() {
  readStorage();
  if (!storageProblem && snapshot === null) await saveTasks(defaultTasks());
  window.addEventListener("storage", event => {
    if (event.storageArea !== localStorage || (event.key !== STORAGE_KEY && event.key !== null)) return;
    readStorage();
    render();
  });
  window.addEventListener("pageshow", refreshDate);
  window.addEventListener("focus", refreshDate);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshDate(); });
  refreshDate();
  $("#taskModule").innerHTML = modules.map((module) => `<option value="${module.id}">${module.name}</option>`).join("");
  $("#addTaskButton").addEventListener("click", () => openTaskModal());
  $("#taskForm").addEventListener("submit", handleTaskSubmit);
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => closeModal(button.dataset.closeModal)));
  [$("#taskModal"), $("#dataModal")].forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
  [$("#openDataPanel"), $("#topDataButton")].forEach((button) => button.addEventListener("click", () => $("#dataModal").showModal()));
  $("#exportButton").addEventListener("click", exportData);
  $("#importButton").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", (event) => importData(event.target.files[0]));
  $("#clearDataButton").addEventListener("click", clearData);
  $("#showAllToday").addEventListener("click", () => {
    state.expandedToday = !state.expandedToday;
    renderHome();
  });
  $("#filterGroup").addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    state.filter = button.dataset.filter;
    document.querySelectorAll(".filter-button").forEach((item) => item.classList.toggle("active", item === button));
    renderModule();
  });
  $("#taskSearch").addEventListener("input", (event) => { state.search = event.target.value.trim(); renderModule(); });
  $("#menuButton").addEventListener("click", openSidebar);
  $("#sidebarClose").addEventListener("click", closeSidebar);
  $("#sidebarBackdrop").addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (event) => { if (event.key.toLowerCase() === "n" && !event.metaKey && !event.ctrlKey && !event.target.matches("input, textarea, select")) openTaskModal(); });
  render();
}

init();
