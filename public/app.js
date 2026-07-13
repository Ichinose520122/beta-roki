"use strict";

const CONFIG = Object.freeze({
  galleryApi: "/api/gallery",
});

const state = {
  categories: [],
  activeCategoryId: "",
  sortDirection: "desc",
  query: "",
  visibleImages: [],
  lightboxIndex: 0,
};

const elements = {
  tabs: document.querySelector("#category-tabs"),
  grid: document.querySelector("#gallery-grid"),
  empty: document.querySelector("#empty-state"),
  summary: document.querySelector("#result-summary"),
  sortBadge: document.querySelector("#sort-badge"),
  sortSelect: document.querySelector("#sort-select"),
  searchInput: document.querySelector("#search-input"),
  lightbox: document.querySelector("#lightbox"),
  lightboxImage: document.querySelector("#lightbox-image"),
  lightboxPosition: document.querySelector("#lightbox-position"),
  lightboxTitle: document.querySelector("#lightbox-title"),
  lightboxTime: document.querySelector("#lightbox-time"),
  lightboxCategory: document.querySelector("#lightbox-category"),
  lightboxComment: document.querySelector("#lightbox-comment"),
  lightboxClose: document.querySelector("#lightbox-close"),
  lightboxPrev: document.querySelector("#lightbox-prev"),
  lightboxNext: document.querySelector("#lightbox-next"),
  lightboxStage: document.querySelector("#lightbox-stage"),
  openOriginal: document.querySelector("#open-original"),
  downloadOriginal: document.querySelector("#download-original"),
  imageLoader: document.querySelector("#image-loader"),
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindControls();

  try {
    const response = await fetch(CONFIG.galleryApi, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`图库接口加载失败：${response.status}`);

    const data = await response.json();
    state.categories = normalizeGalleryData(data);
    if (!state.categories.length) throw new Error("图库中没有分类");

    state.activeCategoryId = state.categories[0].id;
    renderTabs();
    renderGallery();
  } catch (error) {
    console.error(error);
    showFatalError(error.message);
  }
}

function normalizeGalleryData(data) {
  if (!data || !Array.isArray(data.categories)) return [];

  return data.categories.map((category, categoryIndex) => ({
    id: String(category.id || `category-${categoryIndex + 1}`),
    name: String(category.name || "未命名分类"),
    images: Array.isArray(category.images)
      ? category.images
          .filter((image) => image && image.id)
          .map((image) => ({
            id: String(image.id),
            time: String(image.time || "未知时间"),
            tags: Array.isArray(image.tags) ? image.tags.map(String) : [],
            title: image.title ? String(image.title) : "",
            comment: image.comment ? String(image.comment) : "",
            pinned: Boolean(image.pinned),
            featured: Boolean(image.featured),
            url: String(image.url || `/gallery/${encodeURIComponent(image.id)}`),
            categoryId: String(category.id || `category-${categoryIndex + 1}`),
            categoryName: String(category.name || "未命名分类"),
          }))
      : [],
  }));
}

function parseTime(time) {
  const value = Date.parse(String(time).replace(" ", "T"));
  return Number.isNaN(value) ? 0 : value;
}

function formatTime(time) {
  const date = new Date(String(time).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return time;

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function renderTabs() {
  elements.tabs.replaceChildren();

  state.categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-button";
    button.id = `tab-${category.id}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", "gallery-grid");
    button.setAttribute("aria-selected", String(category.id === state.activeCategoryId));
    button.tabIndex = category.id === state.activeCategoryId ? 0 : -1;

    const label = document.createElement("span");
    label.className = "category-label";
    const name = document.createElement("strong");
    name.textContent = category.name;
    const count = document.createElement("span");
    count.textContent = `${category.images.length} 个瞬间`;
    label.append(name, count);
    button.append(label);

    button.addEventListener("click", () => selectCategory(category.id));
    button.addEventListener("keydown", handleTabKeys);
    elements.tabs.append(button);
  });
}

function selectCategory(categoryId) {
  if (state.activeCategoryId === categoryId) return;
  state.activeCategoryId = categoryId;
  renderTabs();
  renderGallery();
}

function handleTabKeys(event) {
  const vertical = matchMedia("(min-width: 561px)").matches;
  const previousKey = vertical ? "ArrowUp" : "ArrowLeft";
  const nextKey = vertical ? "ArrowDown" : "ArrowRight";
  if (![previousKey, nextKey, "Home", "End"].includes(event.key)) return;
  event.preventDefault();

  const ids = state.categories.map((category) => category.id);
  const currentIndex = ids.indexOf(state.activeCategoryId);
  let nextIndex = currentIndex;

  if (event.key === previousKey) nextIndex = (currentIndex - 1 + ids.length) % ids.length;
  if (event.key === nextKey) nextIndex = (currentIndex + 1) % ids.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = ids.length - 1;

  selectCategory(ids[nextIndex]);
  document.querySelector(`#tab-${CSS.escape(ids[nextIndex])}`)?.focus();
}

function getVisibleImages() {
  const activeCategory = state.categories.find((category) => category.id === state.activeCategoryId);
  if (!activeCategory) return [];

  const normalizedQuery = state.query.trim().toLocaleLowerCase("zh-CN");
  const images = activeCategory.images.filter((image) => {
    if (!normalizedQuery) return true;
    const haystack = [image.time, image.title, image.comment, image.categoryName, ...image.tags]
      .join(" ")
      .toLocaleLowerCase("zh-CN");
    return haystack.includes(normalizedQuery);
  });

  return images.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    const delta = parseTime(a.time) - parseTime(b.time);
    if (delta !== 0) return state.sortDirection === "asc" ? delta : -delta;
    return state.sortDirection === "asc"
      ? a.id.localeCompare(b.id)
      : b.id.localeCompare(a.id);
  });
}

function renderGallery() {
  const activeCategory = state.categories.find((category) => category.id === state.activeCategoryId);
  if (!activeCategory) return;

  elements.grid.setAttribute("aria-busy", "false");
  state.visibleImages = getVisibleImages();
  elements.grid.replaceChildren();
  state.visibleImages.forEach((image, index) => elements.grid.append(createImageCard(image, index)));

  const count = state.visibleImages.length;
  const queryNote = state.query.trim() ? ` · 搜索“${state.query.trim()}”` : "";
  elements.summary.textContent = `${activeCategory.name} · ${count} 张影像${queryNote}`;
  elements.sortBadge.textContent = state.sortDirection === "desc" ? "时间倒序" : "时间正序";
  elements.empty.hidden = count !== 0;
  elements.grid.hidden = count === 0;
}

function createImageCard(image, index) {
  const article = document.createElement("article");
  article.className = "gallery-card";

  const imageButton = document.createElement("button");
  imageButton.type = "button";
  imageButton.className = "image-button";
  imageButton.setAttribute("aria-label", `查看大图：${image.title || formatTime(image.time)}`);
  imageButton.addEventListener("click", () => openLightbox(index));

  const picture = document.createElement("img");
  picture.src = image.url;
  picture.alt = image.title || `${image.categoryName}截图，拍摄于${formatTime(image.time)}`;
  picture.loading = index < 3 ? "eager" : "lazy";
  picture.decoding = "async";
  picture.dataset.loading = "true";
  picture.addEventListener("load", () => delete picture.dataset.loading);
  picture.addEventListener("error", () => {
    delete picture.dataset.loading;
    imageButton.classList.add("has-error");
  });

  const viewMark = document.createElement("span");
  viewMark.className = "view-mark";
  viewMark.setAttribute("aria-hidden", "true");
  viewMark.textContent = "↗";

  const badges = document.createElement("span");
  badges.className = "card-badges";
  if (image.pinned) {
    const pinned = document.createElement("span");
    pinned.textContent = "置顶";
    badges.append(pinned);
  }
  if (image.featured) {
    const featured = document.createElement("span");
    featured.textContent = "精选";
    badges.append(featured);
  }

  const error = document.createElement("span");
  error.className = "image-error";
  error.textContent = "图片暂时无法加载";
  imageButton.append(picture, badges, viewMark, error);

  const body = document.createElement("div");
  body.className = "card-body";
  const category = document.createElement("span");
  category.className = "card-category";
  category.textContent = image.categoryName;
  const time = document.createElement("p");
  time.className = "card-time";
  time.textContent = formatTime(image.time);
  body.append(category, time);

  if (image.title) {
    const title = document.createElement("p");
    title.className = "card-file";
    title.textContent = image.title;
    body.append(title);
  }

  if (image.comment) {
    const comment = document.createElement("p");
    comment.className = "card-comment";
    comment.textContent = image.comment;
    body.append(comment);
  }

  if (image.tags.length) {
    const tags = document.createElement("div");
    tags.className = "tag-list";
    image.tags.forEach((tag) => {
      const item = document.createElement("span");
      item.textContent = `# ${tag}`;
      tags.append(item);
    });
    body.append(tags);
  }

  article.append(imageButton, body);
  return article;
}

function bindControls() {
  elements.sortSelect.addEventListener("change", (event) => {
    state.sortDirection = event.target.value === "asc" ? "asc" : "desc";
    renderGallery();
  });

  elements.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderGallery();
  });

  elements.lightboxClose.addEventListener("click", closeLightbox);
  elements.lightboxPrev.addEventListener("click", () => moveLightbox(-1));
  elements.lightboxNext.addEventListener("click", () => moveLightbox(1));
  elements.lightbox.addEventListener("click", (event) => {
    if (event.target === elements.lightbox) closeLightbox();
  });
  elements.lightbox.addEventListener("keydown", handleLightboxKeys);
  elements.lightbox.addEventListener("close", () => {
    elements.lightboxImage.src = "";
    document.body.style.overflow = "";
  });

  let touchStartX = 0;
  elements.lightboxStage.addEventListener(
    "touchstart",
    (event) => {
      touchStartX = event.changedTouches[0].clientX;
    },
    { passive: true },
  );
  elements.lightboxStage.addEventListener(
    "touchend",
    (event) => {
      const distance = event.changedTouches[0].clientX - touchStartX;
      if (Math.abs(distance) > 55) moveLightbox(distance > 0 ? -1 : 1);
    },
    { passive: true },
  );
}

function openLightbox(index) {
  state.lightboxIndex = index;
  updateLightbox();
  elements.lightbox.showModal();
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  elements.lightbox.close();
}

function moveLightbox(direction) {
  const nextIndex = state.lightboxIndex + direction;
  if (nextIndex < 0 || nextIndex >= state.visibleImages.length) return;
  state.lightboxIndex = nextIndex;
  updateLightbox();
}

function updateLightbox() {
  const image = state.visibleImages[state.lightboxIndex];
  if (!image) return;

  elements.lightboxPosition.textContent = `${state.lightboxIndex + 1} / ${state.visibleImages.length}`;
  elements.lightboxTitle.textContent = image.title || "冒险瞬间";
  elements.lightboxTime.textContent = formatTime(image.time);
  elements.lightboxCategory.textContent = image.categoryName;
  elements.lightboxComment.textContent = image.comment;
  elements.lightboxComment.hidden = !image.comment;
  elements.openOriginal.href = image.url;
  elements.downloadOriginal.href = `${image.url}?download=1`;
  elements.downloadOriginal.download = `${image.time.replace(/[: ]/g, "-")}-${image.id}`;
  elements.lightboxPrev.disabled = state.lightboxIndex === 0;
  elements.lightboxNext.disabled = state.lightboxIndex === state.visibleImages.length - 1;
  elements.lightboxImage.alt = image.title || `${image.categoryName}大图`;
  elements.lightboxImage.classList.add("is-loading");
  elements.imageLoader.classList.add("is-visible");
  elements.lightboxImage.onload = () => {
    elements.lightboxImage.classList.remove("is-loading");
    elements.imageLoader.classList.remove("is-visible");
  };
  elements.lightboxImage.onerror = () => {
    elements.lightboxImage.classList.remove("is-loading");
    elements.imageLoader.classList.remove("is-visible");
  };
  elements.lightboxImage.src = image.url;
}

function handleLightboxKeys(event) {
  if (event.key === "ArrowLeft") moveLightbox(-1);
  if (event.key === "ArrowRight") moveLightbox(1);
}

function showFatalError(message) {
  elements.grid.hidden = true;
  elements.empty.hidden = false;
  elements.empty.querySelector("h3").textContent = "图库读取失败";
  elements.empty.querySelector("p").textContent = message;
  elements.summary.textContent = "无法连接图库服务";
}

