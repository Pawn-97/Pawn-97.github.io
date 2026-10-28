"use strict";

(() => {
  const { trip, groups, tasks, sources } = window.travelChecklist;
  const storageKey = "momiji-2026-checklist-v1";
  const validStates = new Set(["todo", "done", "skipped"]);
  const byId = new Map(tasks.map(task => [task.id, task]));
  const initialState = () => Object.fromEntries(tasks.map(task => [task.id, task.done ? "done" : "todo"]));
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  let state = initialState();
  let filter = "all";
  let query = "";
  let storageAvailable = true;

  function readProgress(data) {
    if (!data || data.version !== 1 || data.trip !== trip || !data.items || typeof data.items !== "object" || Array.isArray(data.items)) {
      throw new Error("请选择本次关西旅行导出的进度 JSON 文件。");
    }
    const next = initialState();
    let known = 0;
    for (const [id, value] of Object.entries(data.items)) {
      if (!byId.has(id)) continue;
      if (!validStates.has(value) || (value === "skipped" && !byId.get(id).optional)) {
        throw new Error("进度文件中的项目状态无效，原有进度未改动。");
      }
      next[id] = value;
      known += 1;
    }
    if (!known) throw new Error("文件里没有本次清单的准备事项，原有进度未改动。");
    return next;
  }

  function notify(message) {
    $("#notice").textContent = message;
  }

  function setStorageNote() {
    $("#save-note").textContent = storageAvailable
      ? "进度保存在当前浏览器；换手机或电脑时，可导出后导入。"
      : "当前浏览器无法保存进度；离开前请导出，避免丢失。";
  }

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) state = readProgress(JSON.parse(saved));
  } catch (error) {
    storageAvailable = false;
    notify("未能读取已存进度，现显示初始清单。可导入之前导出的文件恢复。");
  }

  function payload() {
    return { version: 1, trip, updatedAt: new Date().toISOString(), items: state };
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload()));
      storageAvailable = true;
    } catch (error) {
      storageAvailable = false;
      notify("这次勾选暂存在本页，浏览器未能保存。请导出进度后再离开。");
    }
    setStorageNote();
  }

  function renderTasks() {
    $("#phase-nav").innerHTML = groups.map(group => `<a href="#phase-${group.id}" data-phase="${group.id}">${escape(group.date)} · ${escape(group.title)}</a>`).join("");
    $("#task-groups").innerHTML = groups.map((group, index) => `
      <section class="phase" id="phase-${group.id}" aria-labelledby="heading-${group.id}">
        <div class="phase-head"><span class="phase-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><div><h2 id="heading-${group.id}">${escape(group.title)}</h2><p>${escape(group.date)} · ${escape(group.note)}</p></div><span class="phase-count" data-count="${group.id}"></span></div>
        ${tasks.filter(task => task.group === group.id).map(task => `
          <article class="task" id="task-${task.id}" data-task="${task.id}">
            <label class="task-check"><input type="checkbox" id="check-${task.id}" data-check="${task.id}" aria-label="${escape(task.title)}"><span class="sr-only">${escape(task.title)}</span></label>
            <div class="task-body"><div class="task-meta"><span>${escape(task.when)}</span>${task.optional ? '<span class="optional">可不安排</span>' : ""}<span class="state" data-state="${task.id}"></span></div>
              <h3><label for="check-${task.id}">${escape(task.title)}</label></h3><p>${escape(task.action)}</p><p class="criterion">完成标准：${escape(task.criterion)}</p>
              <div class="task-foot">${(task.sources || []).map(key => `<a href="${escape(sources[key].url)}" target="_blank" rel="noopener noreferrer">${escape(sources[key].label)} ↗</a>`).join("")}${task.optional ? `<button class="skip-button" type="button" data-skip="${task.id}">本次不安排</button>` : ""}</div>
            </div>
          </article>`).join("")}
      </section>`).join("");
  }

  function update() {
    const done = tasks.filter(task => state[task.id] === "done").length;
    const skipped = tasks.filter(task => state[task.id] === "skipped").length;
    const applicable = tasks.length - skipped;
    const pending = applicable - done;
    $("#completed-count").textContent = done;
    $("#total-count").textContent = ` / ${applicable} 项已完成`;
    $("#pending-count").textContent = `还剩 ${pending} 项${skipped ? ` · ${skipped} 项不安排` : ""}`;
    $("#progress").max = applicable || 1;
    $("#progress").value = done;
    $("#progress").setAttribute("aria-valuetext", `${applicable} 项中已完成 ${done} 项，待办 ${pending} 项`);
    let visible = 0;
    for (const task of tasks) {
      const row = document.getElementById(`task-${task.id}`);
      const current = state[task.id];
      row.classList.toggle("done", current === "done");
      row.classList.toggle("skipped", current === "skipped");
      $("#check-" + task.id).checked = current === "done";
      row.querySelector(".state").textContent = current === "done" ? "已完成" : current === "skipped" ? "本次不安排" : "待办";
      const skip = row.querySelector("[data-skip]");
      if (skip) skip.textContent = current === "skipped" ? "改为待办" : "本次不安排";
      const matchesText = `${task.title} ${task.action} ${task.criterion} ${task.when}`.toLocaleLowerCase("zh-CN").includes(query);
      row.hidden = !matchesText || (filter !== "all" && current !== filter);
      if (!row.hidden) visible += 1;
    }
    for (const group of groups) {
      const members = tasks.filter(task => task.group === group.id);
      const section = document.getElementById(`phase-${group.id}`);
      section.hidden = members.every(task => document.getElementById(`task-${task.id}`).hidden);
      $(`[data-phase="${group.id}"]`).hidden = section.hidden;
      const completed = members.filter(task => state[task.id] === "done").length;
      const active = members.filter(task => state[task.id] !== "skipped").length;
      $(`[data-count="${group.id}"]`).textContent = `${completed} / ${active} 完成`;
    }
    $("#empty").hidden = visible > 0;
    $("#filter-result").textContent = `显示 ${visible} 项${query ? ` · 搜索“${$("#search").value.trim()}”` : ""} · 可选事项可标记“不安排”，不计入待办`;
    document.querySelectorAll("[data-filter]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.filter === filter)));
    const next = tasks.filter(task => state[task.id] === "todo").sort((a, b) => (a.due || "").localeCompare(b.due || "")).slice(0, 3);
    $("#next-actions").innerHTML = next.length ? next.map(task => `<a href="#task-${task.id}" class="next-action" data-jump="${task.id}"><span class="when">${escape(task.when)}</span><strong>${escape(task.title)} →</strong><small>${task.optional ? "可选 · 不安排也可继续主线" : "完成后勾选，进度会自动保存"}</small></a>`).join("") : '<p class="intro">准备事项已全部处理。出发前再核对航班与当期公告，祝旅途顺利。</p>';
  }

  function jumpToTask(id) {
    filter = "all";
    query = "";
    $("#search").value = "";
    update();
    const row = document.getElementById(`task-${id}`);
    row.scrollIntoView({ block: "start", behavior: "auto" });
    row.querySelector("input").focus({ preventScroll: true });
  }

  $("#task-groups").addEventListener("change", event => {
    const id = event.target.dataset.check;
    if (!byId.has(id)) return;
    state[id] = event.target.checked ? "done" : "todo";
    save();
    update();
  });
  $("#task-groups").addEventListener("click", event => {
    const button = event.target.closest("[data-skip]");
    if (!button || !byId.get(button.dataset.skip)?.optional) return;
    const id = button.dataset.skip;
    state[id] = state[id] === "skipped" ? "todo" : "skipped";
    save();
    update();
  });
  $(".filters").addEventListener("click", event => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    filter = button.dataset.filter;
    update();
  });
  $("#search").addEventListener("input", event => {
    query = event.target.value.trim().toLocaleLowerCase("zh-CN");
    update();
  });
  $("#next-actions").addEventListener("click", event => {
    const link = event.target.closest("[data-jump]");
    if (!link) return;
    event.preventDefault();
    history.replaceState(null, "", `#task-${link.dataset.jump}`);
    jumpToTask(link.dataset.jump);
  });
  $("#export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(payload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "kansai-2026-checklist-progress.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("已导出准备进度；在另一台设备打开本页，点“导入进度”即可继续。");
  });
  $("#import").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 100000) throw new Error("进度文件过大，请选择本页导出的 JSON 文件。");
      const imported = readProgress(JSON.parse(await file.text()));
      if (!window.confirm("导入将替换当前浏览器的准备进度，是否继续？")) return;
      state = imported;
      filter = "all";
      query = "";
      $("#search").value = "";
      save();
      update();
      notify(storageAvailable ? "进度已导入并保存在当前浏览器。" : "进度已导入本页，但浏览器无法保存。离开前请再导出。");
    } catch (error) {
      notify(error instanceof SyntaxError ? "文件不是有效 JSON，原有进度未改动。" : error.message);
    } finally {
      event.target.value = "";
    }
  });
  $("#print").addEventListener("click", () => window.print());
  let printView = null;
  window.addEventListener("beforeprint", () => {
    printView = { filter, query, search: $("#search").value };
    filter = "all";
    query = "";
    $("#search").value = "";
    update();
  });
  window.addEventListener("afterprint", () => {
    if (!printView) return;
    filter = printView.filter;
    query = printView.query;
    $("#search").value = printView.search;
    printView = null;
    update();
  });
  window.addEventListener("storage", event => {
    if (event.key !== storageKey) return;
    try {
      state = event.newValue ? readProgress(JSON.parse(event.newValue)) : initialState();
      update();
      notify("已同步此浏览器另一标签页的准备进度。");
    } catch (error) {
      notify("另一标签页的进度格式有误，本页进度未改动。");
    }
  });

  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const dateParts = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const today = Date.UTC(Number(dateParts.year), Number(dateParts.month) - 1, Number(dateParts.day));
  const days = Math.round((Date.UTC(2026, 10, 29) - today) / 86400000);
  $("#countdown").textContent = Math.max(0, days);
  if (days < 0) {
    $("#countdown-label").textContent = "出发日已到";
    $("#countdown-unit").textContent = "旅途顺利";
  }
  renderTasks();
  update();
  setStorageNote();
  const linkedTask = location.hash.startsWith("#task-") ? location.hash.slice(6) : "";
  if (byId.has(linkedTask)) requestAnimationFrame(() => jumpToTask(linkedTask));
})();
