# 一ノ瀬林檎的小洛克冒险之旅

Cloudflare Pages + Pages Functions + D1 + R2 图库系统。

公开图库只返回稳定的图片 ID 和 `/gallery/{id}` 访问地址，不向前端暴露 R2 对象键、桶名或原始文件名。

## 本版本修复

- 多图片上传改为浏览器固定并发上传，提升批量上传速度。
- 批量上传时单张上传不刷新私有快照，全部完成后只调用一次 `/api/admin/snapshot`。
- 编辑表单只在点击保存且内容发生变化时发送 PATCH，减少无效数据库写入。
- 公开原图支持 `?download=1` 附件下载，前台灯箱增加下载入口。
- 后台私有 gallery 导出文件名加入日期，方便多次备份区分。

## 项目结构

```text
public/                 公开网页
  admin/                管理后台界面
functions/              Pages Functions 后端
  api/gallery.js        公开图库数据
  gallery/[id].js       按 ID 输出图片，不暴露 R2 路径
  api/admin/            后台管理接口
migrations/             D1 数据库结构
seed/                   可选本地导入数据，不应提交
```

`seed/` 已加入 `.gitignore`，不要把它提交到公开仓库。

## 首次配置

### 1. 创建 D1 数据库

```powershell
npx wrangler d1 create ringo-rock-gallery
npx wrangler d1 execute ringo-rock-gallery --remote --file=./migrations/0001_gallery.sql
npx wrangler d1 execute ringo-rock-gallery --remote --file=./migrations/0002_categories.sql
```

已部署过旧版本时，Functions 首次访问会自动创建分组表、写入默认分组，并把旧中文分组值迁移为稳定 ID。

### 2. 配置 Pages 绑定

在 Cloudflare Pages 项目设置中添加：

- D1 绑定名：`DB`
- R2 绑定名：`GALLERY_BUCKET`

环境变量：

| 名称 | 说明 |
| --- | --- |
| `CF_ACCESS_TEAM_DOMAIN` | Cloudflare Access 团队域名，例如 `https://example.cloudflareaccess.com`。 |
| `CF_ACCESS_AUD` | Cloudflare Access 应用 AUD Tag。 |
| `ADMIN_EMAIL` | 允许进入后台的邮箱。 |
| `MAX_UPLOAD_BYTES` | 可选，默认 `26214400`。 |

### 3. 保护后台

在 Cloudflare Zero Trust Access 中创建 Self-hosted 应用，保护：

- `你的域名/admin*`
- `你的域名/api/admin/*`

后端会验证 Access JWT 的签名、签发方、AUD、有效期和邮箱。

## 部署

本项目包含 Pages Functions，不能使用 Cloudflare 网页 ZIP 拖放部署。使用 Wrangler：

```powershell
npx wrangler pages deploy public --project-name 你的Pages项目名
```

也可以使用 Pages Git 集成：

- Framework preset：None
- Build command：留空
- Build output directory：`public`

推荐使用独立分支和预览部署验证后再合并到 `main`。

## 后台同步规则

- 上传：图片写入 R2，元数据写入 D1。
- 多图上传：前端并发上传，全部结束后刷新一次私有 `gallery.json` 快照。
- 编辑：只在确认保存且字段有变化时写入 D1。
- 批量编辑：一次请求更新选中图片，并在有变更时刷新私有快照。
- 分组管理：新增、改名、隐藏、排序和删除会刷新私有快照。
- 整组迁移：只更新 D1 分类字段，R2 对象键保持不变。
- 删除：同时删除 R2 图片、D1 记录并刷新私有快照。
- 导出：后台导出 `gallery.private.{date}.json`，用于备份或迁移。

## 备份建议

- 定期导出私有 gallery 快照。
- 使用 R2 生命周期或外部同步工具备份对象。
- 使用 Wrangler 或 Cloudflare 控制台备份 D1。
