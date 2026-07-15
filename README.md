# 一ノ瀬林檎的小洛克冒险之旅

Cloudflare Pages + Pages Functions + D1 + R2 图库。

## 项目结构

```text
public/                 公开网页
  admin/                管理后台界面
functions/              Pages Functions 后端
  api/gallery.js        公开图库数据，只返回 gallery ID
  api/friend/           好友登录与持久会话
  api/comments/         照片留言读取与发表
  gallery/[id].js       按 ID 输出图片，不暴露 R2 路径
  api/admin/            后台管理接口
migrations/             D1 数据库结构
```

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
npx wrangler d1 execute ringo-rock-gallery --remote --file=./migrations/0003_settings.sql
npx wrangler d1 execute ringo-rock-gallery --remote --file=./migrations/0004_friends_comments.sql
```

已经部署过旧版本时不必手动执行 `0002_categories.sql`：新版 Functions 首次访问会自动创建分组表、写入现有 6 个分组，并把旧中文分组值迁移为稳定 ID。
`0003_settings.sql` 同样会由新版 Functions 自动创建，用于保存网页标题图等站点设置。
`0004_friends_comments.sql` 用于好友名单、登录会话和照片留言；已经上线的数据库也会在新版 Functions 首次访问时自动补建，不要求本地运行 `npx`。

### 2. 给 Pages 项目添加绑定

进入 Cloudflare Pages 项目 → 设置 → Functions → 绑定，添加：

- D1 绑定名：`DB`
- R2 绑定名：`GALLERY_BUCKET`，选择现有截图桶

再添加环境变量：

- `CF_ACCESS_TEAM_DOMAIN`：例如 `https://example.cloudflareaccess.com`
- `CF_ACCESS_AUD`：Cloudflare Access 应用的 AUD Tag
- `ADMIN_EMAIL`：唯一允许进入后台的邮箱
- `MAX_UPLOAD_BYTES`：可选，默认 `26214400`（25 MiB）
- `FRIEND_ID_SECRET`：好友学号 HMAC 密钥，至少 16 个字符，推荐使用 32 字节以上的随机值
- `FRIEND_SESSION_DAYS`：可选，好友登录保持天数，默认 `30`，允许范围 `1`～`90`

`FRIEND_ID_SECRET` 必须作为 Cloudflare 的加密 Secret 保存，不能写入 GitHub。若预览环境和生产环境绑定同一个 D1，两边必须配置相同的值，否则同一份好友名单无法在两个环境中匹配。更换这个值会让已添加好友的学号摘要失效，需要在后台为好友重新填写学号。

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

## 后台操作同步规则

- 批量上传：浏览器同时运行最多 4 个上传任务；每张图分别写入 R2 和 D1，整批完成后只刷新一次私有 gallery 快照。
- 编辑：表单中的修改只保存在浏览器中，点击“保存修改”后才发送一次 D1 更新请求；没有变化时不会发送请求。
- 批量编辑：可多选图片后统一移动分组、设为或取消精选、置顶或取消置顶，并刷新私有快照。
- 分组管理：改名、公开显示/隐藏及上下排序先在浏览器中暂存，点击“确定应用”后一次写入 D1、一次刷新快照；有图片的分组必须先迁移图片才能删除。
- 整组迁移：把来源组的全部图片记录改到目标组并刷新私有快照；R2 对象键保持不变。
- 删除：同时删除 R2 图片、D1 记录并刷新私有快照。
- 置顶/加精：每个分类支持多张；结束时间留空表示永久，否则到期后自动停止展示标记和优先排序。
- 图片读取：公开图片和原图下载会写入 Cloudflare 边缘缓存；重复访问优先命中缓存，减少 D1 查询和 R2 读取。
- 网页标题图：后台可将任意一张图库照片设为或取消标题图；D1 仅保存照片 ID，R2 图片不会复制或改名。
- 标题图模式：支持固定照片、从当前有效的精选照片随机选择、从全部公开照片随机选择；前台标题横幅居中裁切填充，并优先于普通图库图片加载。
- 最近更新：公开图库自动生成虚拟分组，按实际上传时间显示最近 30 或 50 张，不复制 R2 文件，也不改变原分组。
- 好友登录：好友使用后台登记的游戏名称和学号登录；D1 只保存学号的 HMAC，浏览器只保存 `HttpOnly` 会话 Cookie，默认有效 30 天。
- 好友留言：留言直接公开并绑定照片；主页卡片显示最近两条摘要，大图界面读取完整留言，后台显示未读数量并支持标为已读或删除。
- 好友管理：后台支持添加好友、修改显示名称、替换学号、停用登录、清除全部会话和删除好友；删除好友会保留其历史留言。
- 基础防刷：登录按来源限制失败次数，单个好友每分钟最多留言 3 条、每天最多 50 条，并拦截一分钟内的重复留言。
