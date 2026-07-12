# 一ノ瀬林檎的小洛克冒险之旅

Cloudflare Pages + Pages Functions + D1 + R2 图库。

## 项目结构

```text
public/                 公开网页
  admin/                管理后台界面
functions/              Pages Functions 后端
  api/gallery.js        公开图库数据，只返回 gallery ID
  gallery/[id].js       按 ID 输出图片，不暴露 R2 路径
  api/admin/            后台管理接口
migrations/             D1 数据库结构
seed/gallery.json       原有 715 张图片的一次性导入索引，不会公开部署
```

`seed/` 已加入 `.gitignore`，不要把它提交到公开仓库。

后台会维护三部分数据：

- R2：保存图片文件。
- D1：保存分类、截图时间、标题、评论、标签、置顶和加精信息。
- D1 私有快照：每次修改后自动生成完整 `gallery.json`，可在后台下载。

公开网页不会收到桶名、R2 对象键或原始文件名，只会收到 `/gallery/{ID}`。

## 首次配置

### 1. 创建 D1 数据库

```powershell
npx wrangler d1 create ringo-rock-gallery
npx wrangler d1 execute ringo-rock-gallery --remote --file=./migrations/0001_gallery.sql
npx wrangler d1 execute ringo-rock-gallery --remote --file=./migrations/0002_categories.sql
```

已经部署过旧版本时不必手动执行 `0002_categories.sql`：新版 Functions 首次访问会自动创建分组表、写入现有 6 个分组，并把旧中文分组值迁移为稳定 ID。

### 2. 给 Pages 项目添加绑定

进入 Cloudflare Pages 项目 → 设置 → Functions → 绑定，添加：

- D1 绑定名：`DB`
- R2 绑定名：`GALLERY_BUCKET`，选择现有截图桶

再添加环境变量：

- `CF_ACCESS_TEAM_DOMAIN`：例如 `https://example.cloudflareaccess.com`
- `CF_ACCESS_AUD`：Cloudflare Access 应用的 AUD Tag
- `ADMIN_EMAIL`：唯一允许进入后台的邮箱
- `MAX_UPLOAD_BYTES`：可选，默认 `26214400`（25 MiB）

真实桶名和 Access 配置只放在 Cloudflare 后台或本地私密配置中，不会进入 `public/`。

### 3. 保护后台

在 Cloudflare Zero Trust → Access → Applications 中创建 Self-hosted 应用，保护：

- `你的域名/admin*`
- `你的域名/api/admin/*`

策略只允许 `ADMIN_EMAIL` 对应的邮箱。后端还会验证 Access JWT 的签名、签发方、AUD、有效期和邮箱。

## 部署

本项目包含 Pages Functions，不能再使用 Cloudflare 网页中的 ZIP 拖放方式。现有 Direct Upload 项目可以改用 Wrangler：

```powershell
npx wrangler pages deploy public --project-name 你的Pages项目名
```

也可以把整个项目放入 GitHub，然后使用 Pages Git 集成：

- 框架预设：无
- 构建命令：留空
- 构建输出目录：`public`

推荐日常更新使用独立分支：推送分支后先打开 Cloudflare Pages 自动生成的预览部署，确认无误再把 Pull Request 合并到 `main`，生产站点才会更新。

## 导入现有图库

部署完成后打开：

```text
https://你的域名/admin
```

点击“选择旧 gallery.json”，选择 `seed/gallery.json`，再点击“导入旧索引”。导入只登记现有 R2 图片，不会重复上传图片。

## 后台操作同步规则

- 上传：写入 R2 `gallery/{随机ID}.{扩展名}`，新增 D1 记录并刷新私有 gallery 快照。
- 编辑：更新 D1 中的分类、时间、标题、评论、标签、置顶和加精信息，并刷新私有快照。
- 批量编辑：可多选图片后统一移动分组、设为或取消精选、置顶或取消置顶，并刷新私有快照。
- 分组管理：支持新增、改名、公开显示/隐藏及上下排序；有图片的分组必须先迁移图片才能删除。
- 整组迁移：把来源组的全部图片记录改到目标组并刷新私有快照；R2 对象键保持不变。
- 删除：同时删除 R2 图片、D1 记录并刷新私有快照。
- 置顶/加精：每个分类支持多张；结束时间留空表示永久，否则到期后自动停止展示标记和优先排序。
