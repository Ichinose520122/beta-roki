export const CATEGORIES = Object.freeze([
  {
    id: "lovely-ringo",
    source: "可爱的一ノ瀬林檎",
    name: "可爱的一ノ瀬林檎",
    aliases: ["可爱的主人公"],
  },
  { id: "naughty-unicorn", source: "可恶的小独角兽", name: "可恶的小独角兽" },
  {
    id: "lovely-friends",
    source: "可爱的朋友们",
    name: "可爱的朋友们",
    aliases: ["我的可爱朋友们"],
  },
  { id: "lovely-wild-rocos", source: "可爱的野生洛克们", name: "可爱的野生洛克们" },
  {
    id: "lovely-pets",
    source: "可爱的精灵们",
    name: "可爱的精灵们",
    aliases: ["可爱精灵"],
  },
  { id: "starlight-duel", source: "星光对决", name: "星光对决" },
]);

export function findCategory(source) {
  return (
    CATEGORIES.find(
      (category) => category.source === source || category.aliases?.includes(source),
    ) || null
  );
}

export function normalizeCategorySource(source) {
  return findCategory(source)?.source || null;
}

export function isAllowedCategory(source) {
  return Boolean(findCategory(source));
}
