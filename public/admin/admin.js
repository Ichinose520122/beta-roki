"use strict";

const state = {
  categories: [],
  images: [],
  query: "",
  category: "",
  filterState: "",
  importFile: null,
  selectedIds: new Set(),
};

const elements = {
  summary: document.querySelector("#summary"),
  adminEmail: document.querySelector("#admin-email"),
  list: document.querySelector("#image-list"),
  empty: document.querySelector("#empty"),
  query: document.querySelector("#filter-query"),
  category: document.querySelector("#filter-category"),
  filterState: document.querySelector("#filter-state"),
  selectVisible: document.querySelector("#select-visible"),
  selectedCount: document.querySelector("#selected-count"),
  bulkCategory: document.querySelector("#bulk-category"),
  bulkMove: document.querySelector("#bulk-move"),
  bulkUntil: document.querySelector("#bulk-until"),
  clearSelection: document.querySelector("#clear-selection"),
  bulkButtons: [...document.querySelectorAll("[data-bulk-action]")],
  openUpload: document.querySelector("#open-upload"),
  openCategories: document.querySelector("#open-categories"),
  openMove: document.querySelector("#open-move"),
  categoryDialog: document.querySelector("#category-dialog"),
  categoryCreateForm: document.querySelector("#category-create-form"),
  categoryManagerList: document.querySelector("#category-manager-list"),
  moveDialog: document.querySelector("#move-dialog"),
  moveForm: document.querySelector("#move-form"),
  uploadDialog: document.querySelector("#upload-dialog"),
  uploadForm: document.querySelector("#upload-form"),
  editDialog: document.querySelector("#edit-dialog"),
  editForm: document.querySelector("#edit-form"),
  deleteButton: document.querySelector("#delete-button"),
  importInput: document.querySelector("#import-input"),
  importButton: document.querySelector("#import-button"),
  toast: document.querySelector("#toast"),
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindControls();
  setDefaultUploadTime();
  await loadGallery();
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败：${response.status}`);
  return data;
}

async function loadGallery() {
  elements.list.setAttribute("aria-busy", "true");
  try {
    const data = await request("/api/admin/gallery");
    state.categories = data.categories || [];
    state.images = data.images || [];
    const availableIds = new Set(state.images.map((image) => image.id));
    state.selectedIds = new Set([...state.selectedIds].filter((id) => availableIds.has(id)));
    elements.adminEmail.textContent = data.admin || "";
    populateCategories();
    render();
    if (elements.categoryDialog.open) renderCategoryManager();
  } catch (error) {
    showToast(error.message, true);
    elements.summary.textContent = "后台数据读取失败";
  } finally {
    elements.list.setAttribute("aria-busy", "false");
  }
}

function populateCategories() {
  const selects = [
    elements.category,
    elements.uploadForm.elements.category,
    elements.editForm.elements.category,
    elements.moveForm.elements.fromCategory,
    elements.moveForm.elements.toCategory,
    elements.bulkCategory,
  ];
  selects.forEach((select, index) => {
    const current = select.value;
    if (index === 0) select.replaceChildren(new Option("全部分类", ""));
    else if (select === elements.bulkCategory) select.replaceChildren(new Option("选择目标分组", ""));
    else select.replaceChildren();
    state.categories.forEach((category) => {
      const label = category.visible ? category.name : `${category.name}（已隐藏）`;
      select.add(new Option(label, category.id));
    });
    select.value = current;
  });

  if (state.category && !state.categories.some((category) => category.id === state.category)) {
    state.category = "";
    elements.category.value = "";
  }
}

function filteredImages() {
  const query = state.query.trim().toLocaleLowerCase("zh-CN");
  return state.images.filter((image) => {
    if (state.category && !imageMatchesCategory(image, state.category)) return false;
    if (state.filterState === "pinned" && !image.pinned) return false;
    if (state.filterState === "featured" && !image.featured) return false;
    if (!query) return true;
    return [image.title, image.comment, image.time, image.categoryName, ...(image.tags || [])]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(query);
  });
}

function imageMatchesCategory(image, categoryId) {
  const category = state.categories.find((item) => item.id === categoryId);
  if (!category) return false;
  if (image.categoryId) return image.categoryId === category.id;
  return [category.id, category.name, ...(category.aliases || [])].includes(image.category);
}

function render() {
  const images = filteredImages();
  elements.list.replaceChildren();
  images.forEach((image) => elements.list.append(createRow(image)));
  elements.empty.hidden = images.length !== 0;
  elements.list.hidden = images.length === 0;
  const pinned = state.images.filter((image) => image.pinned).length;
  const featured = state.images.filter((image) => image.featured).length;
  elements.summary.textContent = `${state.images.length} 张图片 · ${pinned} 张置顶 · ${featured} 张精选`;
  renderSelectionState(images);
}

function createRow(image) {
  const row = document.createElement("article");
  row.className = "image-row";
  row.classList.toggle("is-selected", state.selectedIds.has(image.id));

  const selection = document.createElement("label");
  selection.className = "row-select";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.selectedIds.has(image.id);
  checkbox.setAttribute("aria-label", `选择：${image.title || image.categoryName}`);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) state.selectedIds.add(image.id);
    else state.selectedIds.delete(image.id);
    render();
  });
  selection.append(checkbox);

  const picture = document.createElement("img");
  picture.src = image.url;
  picture.alt = image.title || image.categoryName;
  picture.loading = "lazy";

  const main = document.createElement("div");
  main.className = "row-main";
  const title = document.createElement("strong");
  title.textContent = image.title || "未命名瞬间";
  const time = document.createElement("span");
  time.textContent = formatDisplayTime(image.time);
  main.append(title, time);
  if (image.comment) {
    const comment = document.createElement("p");
    comment.textContent = image.comment;
    main.append(comment);
  }
  const badges = document.createElement("div");
  badges.className = "badges";
  if (image.pinnedEnabled) badges.append(makeBadge(image.pinned ? "置顶" : "置顶已到期"));
  if (image.featuredEnabled) badges.append(makeBadge(image.featured ? "精选" : "精选已到期"));
  (image.tags || []).forEach((tag) => badges.append(makeBadge(`# ${tag}`)));
  main.append(badges);

  const meta = document.createElement("div");
  meta.className = "row-meta";
  const category = document.createElement("span");
  category.textContent = image.categoryName;
  const size = document.createElement("span");
  size.textContent = formatBytes(image.size);
  meta.append(category, size);

  const edit = document.createElement("button");
  edit.type = "button";
  edit.textContent = "编辑";
  edit.addEventListener("click", () => openEdit(image));
  row.append(selection, picture, main, meta, edit);
  return row;
}

function renderSelectionState(visibleImages = filteredImages()) {
  const selectedCount = state.selectedIds.size;
  const visibleIds = visibleImages.map((image) => image.id);
  const visibleSelected = visibleIds.filter((id) => state.selectedIds.has(id)).length;
  elements.selectedCount.textContent = `已选 ${selectedCount} 张`;
  elements.selectVisible.checked = visibleIds.length > 0 && visibleSelected === visibleIds.length;
  elements.selectVisible.indeterminate = visibleSelected > 0 && visibleSelected < visibleIds.length;
  elements.selectVisible.disabled = visibleIds.length === 0;
  elements.bulkMove.disabled = selectedCount === 0 || !elements.bulkCategory.value;
  elements.clearSelection.disabled = selectedCount === 0;
  elements.bulkButtons.forEach((button) => { button.disabled = selectedCount === 0; });
}

function makeBadge(text) {
  const badge = document.createElement("b");
  badge.textContent = text;
  return badge;
}

function bindControls() {
  elements.query.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });
  elements.category.addEventListener("change", (event) => {
    state.category = event.target.value;
    render();
  });
  elements.filterState.addEventListener("change", (event) => {
    state.filterState = event.target.value;
    render();
  });
  elements.selectVisible.addEventListener("change", () => {
    const visibleIds = filteredImages().map((image) => image.id);
    visibleIds.forEach((id) => {
      if (elements.selectVisible.checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
    });
    render();
  });
  elements.bulkCategory.addEventListener("change", () => renderSelectionState());
  elements.bulkMove.addEventListener("click", () => runBulkAction("move"));
  elements.bulkButtons.forEach((button) => {
    button.addEventListener("click", () => runBulkAction(button.dataset.bulkAction));
  });
  elements.clearSelection.addEventListener("click", () => {
    state.selectedIds.clear();
    render();
  });

  elements.openUpload.addEventListener("click", () => elements.uploadDialog.showModal());
  elements.openCategories.addEventListener("click", () => {
    renderCategoryManager();
    elements.categoryDialog.showModal();
  });
  elements.openMove.addEventListener("click", () => {
    syncMoveTargets();
    elements.moveDialog.showModal();
  });
  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector(`#${button.dataset.close}`).close());
  });

  setupScheduleControls(elements.uploadForm);
  setupScheduleControls(elements.editForm);
  elements.uploadForm.elements.file.addEventListener("change", (event) => {
  const files = [...event.target.files];

  if (!files.length) return;

  const parsedTime = parseScreenshotTimeFromFilename(files[0].name);

  if (!parsedTime) {
    showToast(
      `无法从“${files[0].name}”读取时间，将使用手动填写的截图时间`,
      true,
    );
    return;
  }

  /*
   * datetime-local 需要：
   * 2026-07-12T00:27:17
   */
  elements.uploadForm.elements.time.value =
    parsedTime.replace(" ", "T");

  if (files.length === 1) {
    showToast(`已读取截图时间：${parsedTime}`);
  } else {
    showToast(
      `已选择 ${files.length} 张图片，每张图片将分别读取文件名时间`,
    );
  }
});
  elements.uploadForm.addEventListener("submit", submitUpload);
  elements.editForm.addEventListener("submit", submitEdit);
  elements.deleteButton.addEventListener("click", deleteCurrent);

  elements.importInput.addEventListener("change", (event) => {
    state.importFile = event.target.files[0] || null;
    elements.importButton.disabled = !state.importFile;
  });
  elements.importButton.addEventListener("click", importLegacyGallery);
  elements.moveForm.elements.fromCategory.addEventListener("change", syncMoveTargets);
  elements.moveForm.addEventListener("submit", moveCategory);
  elements.categoryCreateForm.addEventListener("submit", createCategory);
}

function renderCategoryManager() {
  elements.categoryManagerList.replaceChildren();
  state.categories.forEach((category, index) => {
    const row = document.createElement("article");
    row.className = "category-manager-row";

    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 60;
    name.value = category.name;
    name.setAttribute("aria-label", `${category.name}的分组名称`);

    const visibleLabel = document.createElement("label");
    visibleLabel.className = "category-visible";
    const visible = document.createElement("input");
    visible.type = "checkbox";
    visible.checked = category.visible;
    visibleLabel.append(visible, document.createTextNode("公开显示"));

    const count = document.createElement("span");
    count.className = "category-count";
    count.textContent = `${category.imageCount || 0} 张`;

    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "↑";
    up.title = "向上移动";
    up.disabled = index === 0;
    up.addEventListener("click", () => reorderCategory(index, index - 1));

    const down = document.createElement("button");
    down.type = "button";
    down.textContent = "↓";
    down.title = "向下移动";
    down.disabled = index === state.categories.length - 1;
    down.addEventListener("click", () => reorderCategory(index, index + 1));

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "保存";
    save.addEventListener("click", () => saveCategory(category, name.value, visible.checked, save));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "删除";
    remove.disabled = Number(category.imageCount || 0) > 0;
    remove.title = remove.disabled ? "请先迁移这个分组中的图片" : "删除空分组";
    remove.addEventListener("click", () => deleteCategory(category, remove));

    row.append(name, visibleLabel, count, up, down, save, remove);
    elements.categoryManagerList.append(row);
  });
}

async function createCategory(event) {
  event.preventDefault();
  const submit = event.submitter;
  const name = elements.categoryCreateForm.elements.name.value.trim();
  if (!name) return;
  submit.disabled = true;
  try {
    await request("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    elements.categoryCreateForm.reset();
    await loadGallery();
    showToast(`已新增分组“${name}”`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    submit.disabled = false;
  }
}

async function saveCategory(category, nameValue, visible, button) {
  const name = nameValue.trim();
  if (!name) {
    showToast("分组名称不能为空", true);
    return;
  }
  button.disabled = true;
  try {
    await request(`/api/admin/categories/${encodeURIComponent(category.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, visible }),
    });
    await loadGallery();
    showToast("分组设置已保存");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function reorderCategory(fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= state.categories.length) return;
  const ids = state.categories.map((category) => category.id);
  const [moved] = ids.splice(fromIndex, 1);
  ids.splice(toIndex, 0, moved);
  try {
    await request("/api/admin/category-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    await loadGallery();
    showToast("分组顺序已更新");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function deleteCategory(category, button) {
  if (!confirm(`确定删除空分组“${category.name}”吗？`)) return;
  button.disabled = true;
  try {
    await request(`/api/admin/categories/${encodeURIComponent(category.id)}`, {
      method: "DELETE",
    });
    await loadGallery();
    showToast(`已删除分组“${category.name}”`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

const BULK_LABELS = Object.freeze({
  move: "移动分组",
  "feature-on": "设为精选",
  "feature-off": "取消精选",
  "pin-on": "置顶",
  "pin-off": "取消置顶",
});

async function runBulkAction(action) {
  const ids = [...state.selectedIds];
  if (!ids.length) return;
  const category = elements.bulkCategory.value;
  if (action === "move" && !category) {
    showToast("请先选择目标分组", true);
    return;
  }

  const categoryName = state.categories.find((item) => item.id === category)?.name || category;
  const description = action === "move"
    ? `把选中的 ${ids.length} 张图片移动到“${categoryName}”`
    : `对选中的 ${ids.length} 张图片执行“${BULK_LABELS[action]}”`;
  if (!confirm(`${description}吗？`)) return;

  const controls = [elements.bulkMove, ...elements.bulkButtons, elements.clearSelection];
  controls.forEach((control) => { control.disabled = true; });
  try {
    const result = await request("/api/admin/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids,
        action,
        ...(action === "move" ? { category } : {}),
        ...(["feature-on", "pin-on"].includes(action)
          ? { until: fromLocalInput(elements.bulkUntil.value) }
          : {}),
      }),
    });
    state.selectedIds.clear();
    await loadGallery();
    showToast(`批量操作完成，共更新 ${result.changed} 张图片`);
  } catch (error) {
    showToast(error.message, true);
    renderSelectionState();
  }
}

function syncMoveTargets() {
  const from = elements.moveForm.elements.fromCategory.value;
  const target = elements.moveForm.elements.toCategory;
  [...target.options].forEach((option) => {
    option.disabled = option.value === from;
  });
  if (!target.value || target.value === from) {
    target.value = [...target.options].find((option) => !option.disabled)?.value || "";
  }
}

async function moveCategory(event) {
  event.preventDefault();
  const submit = event.submitter;
  const fromCategory = elements.moveForm.elements.fromCategory.value;
  const toCategory = elements.moveForm.elements.toCategory.value;
  const fromName = state.categories.find((item) => item.id === fromCategory)?.name || fromCategory;
  const toName = state.categories.find((item) => item.id === toCategory)?.name || toCategory;
  const count = state.images.filter((image) => image.category === fromCategory).length;

  if (!count) {
    showToast("来源组中没有图片", true);
    return;
  }
  if (!confirm(`确定把“${fromName}”中的 ${count} 张图片全部移到“${toName}”吗？`)) return;

  submit.disabled = true;
  try {
    const result = await request("/api/admin/move-category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromCategory, toCategory }),
    });
    elements.moveDialog.close();
    await loadGallery();
    showToast(`已迁移 ${result.moved} 张图片到“${toName}”`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    submit.disabled = false;
  }
}

function setupScheduleControls(form) {
  ["pinned", "featured"].forEach((name) => {
    const enabled = form.elements[`${name}Enabled`];
    const until = form.elements[`${name}Until`];
    const sync = () => {
      until.disabled = !enabled.checked;
      if (!enabled.checked) until.value = "";
    };
    enabled.addEventListener("change", sync);
    sync();
  });
}

function parseScreenshotTimeFromFilename(filename) {
  const match = String(filename).match(
    /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:[_.-]|$)/,
  );

  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;

  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );

  if (
    date.getFullYear() !== Number(year)
    || date.getMonth() !== Number(month) - 1
    || date.getDate() !== Number(day)
    || date.getHours() !== Number(hour)
    || date.getMinutes() !== Number(minute)
    || date.getSeconds() !== Number(second)
  ) {
    return null;
  }

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

async function submitUpload(event) {
  event.preventDefault();

  const submit = event.submitter;
  const fileInput = elements.uploadForm.elements.file;
  const files = [...fileInput.files];

  if (!files.length) {
    showToast("请选择至少一张图片", true);
    return;
  }

  submit.disabled = true;

  const originalText = submit.textContent;
  let uploaded = 0;
  const failures = [];
  const fallbackTime = fromLocalInput(
    elements.uploadForm.elements.time.value,
  );

  try {
    /*
     * 获取所有图片共用的字段。
     * file 和 time 会在循环中为每张图片单独设置。
     */
    const baseForm = new FormData(elements.uploadForm);

    baseForm.delete("file");
    baseForm.delete("time");

    normalizeFormDates(baseForm);

    baseForm.set(
      "pinnedEnabled",
      String(elements.uploadForm.elements.pinnedEnabled.checked),
    );

    baseForm.set(
      "featuredEnabled",
      String(elements.uploadForm.elements.featuredEnabled.checked),
    );

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];

      submit.textContent = `正在上传 ${index + 1}/${files.length}`;

      const screenshotTime =
        parseScreenshotTimeFromFilename(file.name)
        || fallbackTime;

      if (!screenshotTime) {
        failures.push({
          name: file.name,
          message: "无法从文件名读取时间，且未填写备用截图时间",
        });
        continue;
      }

      const form = new FormData();

      for (const [name, value] of baseForm.entries()) {
        form.append(name, value);
      }

      form.set("file", file, file.name);
      form.set("time", screenshotTime);

      try {
        await request("/api/admin/upload", {
          method: "POST",
          body: form,
        });

        uploaded += 1;
      } catch (error) {
        failures.push({
          name: file.name,
          message: error.message,
        });
      }
    }

    await loadGallery();

    if (!failures.length) {
      elements.uploadDialog.close();
      elements.uploadForm.reset();
      setupFormAfterReset(elements.uploadForm);
      setDefaultUploadTime();

      showToast(
        `已上传 ${uploaded} 张图片，截图时间已从文件名读取`,
      );

      return;
    }

    const failureDetails = failures
      .slice(0, 3)
      .map((failure) => `${failure.name}：${failure.message}`)
      .join("；");

    const remaining =
      failures.length > 3
        ? `；另有 ${failures.length - 3} 张失败`
        : "";

    showToast(
      `成功 ${uploaded} 张，失败 ${failures.length} 张。${failureDetails}${remaining}`,
      true,
    );
  } catch (error) {
    showToast(error.message, true);
  } finally {
    submit.disabled = false;
    submit.textContent = originalText;
  }
}

function openEdit(image) {
  const form = elements.editForm.elements;
  form.id.value = image.id;
  form.category.value = image.category;
  form.time.value = toLocalInput(image.time);
  form.title.value = image.title || "";
  form.comment.value = image.comment || "";
  form.tags.value = (image.tags || []).join(", ");
  form.pinnedEnabled.checked = image.pinnedEnabled;
  form.pinnedUntil.value = toLocalInput(image.pinnedUntil);
  form.featuredEnabled.checked = image.featuredEnabled;
  form.featuredUntil.value = toLocalInput(image.featuredUntil);
  form.pinnedUntil.disabled = !form.pinnedEnabled.checked;
  form.featuredUntil.disabled = !form.featuredEnabled.checked;
  elements.editDialog.showModal();
}

async function submitEdit(event) {
  event.preventDefault();
  const submit = event.submitter;
  submit.disabled = true;
  const form = elements.editForm.elements;
  try {
    await request(`/api/admin/gallery/${encodeURIComponent(form.id.value)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: form.category.value,
        time: fromLocalInput(form.time.value),
        title: form.title.value,
        comment: form.comment.value,
        tags: form.tags.value,
        pinnedEnabled: form.pinnedEnabled.checked,
        pinnedUntil: fromLocalInput(form.pinnedUntil.value),
        featuredEnabled: form.featuredEnabled.checked,
        featuredUntil: fromLocalInput(form.featuredUntil.value),
      }),
    });
    elements.editDialog.close();
    await loadGallery();
    showToast("修改已同步到图库索引");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    submit.disabled = false;
  }
}

async function deleteCurrent() {
  const id = elements.editForm.elements.id.value;
  if (!confirm("确定删除这张图片吗？R2 中的图片也会被删除，此操作无法撤销。")) return;
  elements.deleteButton.disabled = true;
  try {
    await request(`/api/admin/gallery/${encodeURIComponent(id)}`, { method: "DELETE" });
    elements.editDialog.close();
    await loadGallery();
    showToast("图片已从 R2 和图库索引删除");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    elements.deleteButton.disabled = false;
  }
}

async function importLegacyGallery() {
  if (!state.importFile) return;
  if (!confirm("导入会把旧索引登记到后台，但不会重复上传 R2 图片。继续吗？")) return;
  elements.importButton.disabled = true;
  try {
    const raw = await state.importFile.text();
    JSON.parse(raw);
    const result = await request("/api/admin/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw,
    });
    await loadGallery();
    showToast(`导入完成：新增 ${result.imported} 条，识别 ${result.accepted} 条`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    elements.importButton.disabled = false;
  }
}

function normalizeFormDates(form) {
  ["time", "pinnedUntil", "featuredUntil"].forEach((name) => {
    if (form.has(name)) form.set(name, fromLocalInput(form.get(name)));
  });
}

function setupFormAfterReset(form) {
  ["pinned", "featured"].forEach((name) => {
    form.elements[`${name}Until`].disabled = true;
  });
}

function setDefaultUploadTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  elements.uploadForm.elements.time.value = now.toISOString().slice(0, 19);
}

function fromLocalInput(value) {
  if (!value) return "";
  const text = String(value).replace("T", " ").slice(0, 19);
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text) ? `${text}:00` : text;
}

function toLocalInput(value) {
  return value ? String(value).replace(" ", "T").slice(0, 19) : "";
}

function formatDisplayTime(value) {
  const date = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function formatBytes(bytes) {
  if (!bytes) return "未知大小";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

let toastTimer;
function showToast(message, error = false) {
  clearTimeout(toastTimer);
  elements.toast.hidden = false;
  elements.toast.textContent = message;
  elements.toast.style.borderColor = error ? "rgba(255,133,143,.7)" : "#465064";
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 4200);
}
