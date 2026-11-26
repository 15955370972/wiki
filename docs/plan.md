# 博客网站整体规划

> 定位：个人笔记库，总结展示学习笔记、前端项目与代码片段。
> 技术栈：React 18 + Vite + Ant Design 5 + React Router 6，纯前端实现，支持亮/暗色模式。

## 一、核心决策

| 决策点 | 结论 |
|--------|------|
| 数据来源 | 纯前端：md 文件放仓库，构建时用 Vite 的 `import.meta.glob` 读取，元信息用 frontmatter（在 md 头部写 title/tags/date） |
| 暗色模式 | 需要，AntD 5 的 `theme.darkAlgorithm` 实现，支持跟随系统 + 手动切换，localStorage 记忆 |
| 项目定义 | 可运行的完整前端项目代码，展示重点是"**看效果 + 看代码 + 能下载**" |
| 后台管理 | 不做在线编辑，后期如需再引入 |

## 二、内容类型与展示方式

| 类型 | 内容特点 | 展示方式 |
|------|---------|---------|
| 项目 | 可运行的完整前端项目：有截图、技术栈、在线演示、源码 | 卡片列表 → 详情页（演示 + 预览 + 源码三位一体） |
| MD 文档 | 笔记主体，有标题、分类、标签、摘要、正文 | 列表/目录 → Markdown 渲染页 |
| 代码文件 | 独立的代码片段/源码文件 | 代码块展示页，语法高亮 + 一键复制 |

## 三、项目类型的展示方案（重点）

一个完整前端项目不能像笔记一样直接渲染，采用 **"演示 + 预览 + 源码"三位一体** 的展示方式。

### 1. 展示层级（项目卡片 → 详情页）

**列表页卡片**：
- 封面图/截图（运行截图或 GIF）
- 项目名 + 一句话简介
- 技术栈标签（React / Vue / TS …）
- 在线演示链接、GitHub 链接 / 下载入口

**详情页**（四个区块）：

```
① 项目头图区
   └── 轮播图（Carousel）放多张运行截图/录屏 GIF

② 在线预览区（可选但推荐）
   └── iframe 嵌入已部署的 demo（若项目部署过 Vercel/Netlify）
       配合"在新窗口打开"按钮（有些站点拒绝被 iframe 嵌套）

③ 项目信息区
   ├── 介绍（支持 Markdown）
   ├── 技术栈 Tag
   ├── 亮点/难点说明
   └── 关联笔记（这个项目相关的学习笔记）

④ 源码浏览区（重点）
   ├── 文件树（AntD Tree 组件，模拟 VSCode 目录结构）
   ├── 点击文件 → 语法高亮展示代码（只读浏览）
   └── 操作按钮：复制单文件 / 下载整个项目（打包 zip）
```

### 2. "能跑起来"的三个策略

| 策略 | 做法 | 成本 | 效果 |
|------|------|------|------|
| A. 在线演示（推荐必做） | 每个项目部署到 Vercel/Netlify（免费），详情页 iframe 嵌入或跳转 | 低 | 访客直接看到运行效果 |
| B. 静态构建产物 | 项目 `npm run build` 后把 dist 也放进博客，直接托管访问 | 低 | 无需外部平台，全部自包含 |
| C. 源码在线浏览 | 文件树 + 代码高亮（数据放 `public/projects/xxx/` 下） | 中 | 满足"看代码"的需求 |

> 建议：A 用于长期维护的项目，B 用于不想部署的小 demo，C 是标配。详情页按项目实际情况配置展示哪些区块。

### 3. 项目数据结构

```ts
interface Project {
  id: string;
  title: string;
  summary: string;
  cover: string;            // 封面
  screenshots: string[];    // 截图轮播
  stack: string[];          // 技术栈标签
  intro: string;            // md 介绍文档
  demoUrl?: string;         // 在线演示（策略A/B）
  embedable?: boolean;      // 是否允许 iframe 嵌入
  repoUrl?: string;         // GitHub
  downloadUrl?: string;     // zip 下载
  files: FileNode[];        // 源码树（策略C）
  relatedNoteIds: string[]; // 关联笔记
}

interface FileNode {
  name: string;
  type: 'dir' | 'file';
  children?: FileNode[];
  content?: string;         // 文件内容
}
```

> 源码浏览采用**白名单方式**只放想展示的文件（排除 `node_modules`、`dist` 等），构建时只复制选中文件。

## 四、内容数据结构（统一设计）

```ts
interface BaseItem {
  id: string;
  title: string;
  tags: string[];
  category: string;
  createdAt: string;
  updatedAt: string;
}

interface Note extends BaseItem { type: 'note'; summary: string; content: string; /* md */ }
interface Snippet extends BaseItem { type: 'snippet'; language: string; code: string; description: string; }
```

## 五、页面规划

```
首页 (/)
├── 个人简介 + 快捷入口
├── 最新笔记 / 精选项目
└── 数据统计（文章数、项目数、分类数）

笔记列表页 (/notes)
├── 左侧：分类树（前端 / 后端 / 工具 / 算法…）
├── 右侧：文章列表（卡片流，含标题、摘要、标签、日期、阅读时长）
└── 顶部：搜索框 + 标签筛选

笔记详情页 (/notes/:id)
├── Markdown 正文渲染
├── 目录导航 TOC（右侧悬浮，滚动高亮）
├── 上一篇 / 下一篇
└── 相关笔记推荐

项目列表页 (/projects)
└── 项目卡片网格（封面图、简介、技术栈 Tag、演示链接）

项目详情页 (/projects/:id)
└── 截图轮播 + 在线预览 + 文件树源码浏览器 + 关联笔记

代码片段页 (/snippets)
├── 按语言/用途分组（Tabs 或分类侧栏）
└── 代码展示卡片：文件名 + 语言标签 + 高亮代码 + 复制按钮 + 说明

关于页 (/about)
└── 个人介绍、技能栈、联系方式
```

## 六、技术选型

- **框架**：React 18 + Vite
- **UI 组件**：Ant Design 5.x
- **路由**：React Router v6（BrowserRouter）
- **Markdown 渲染**：`react-markdown` + `remark-gfm` + `rehype-highlight`
- **代码高亮**：`shiki`（构建时转 HTML，效果好）或 `react-syntax-highlighter`
- **打包下载**：`jszip`（浏览器端把源码文件打包成 zip）
- **样式**：AntD 主题令牌 + CSS Modules 补充
- **暗色模式**：AntD `darkAlgorithm` + localStorage + `prefers-color-scheme`

## 七、目录结构

```
public/
└── projects/           # 各项目源码副本 + 截图
    └── demo-project/
        ├── shots/      # 截图
        └── src/...     # 源码文件（供文件树浏览）

src/
├── api/                # 数据获取层（现在是本地数据）
├── data/               # md 笔记（frontmatter 元信息）
├── components/         # 通用组件
│   ├── CodeBrowser/    # 文件树 + 代码查看器（项目详情核心组件）
│   ├── MarkdownView/
│   ├── Toc/
│   └── Placeholder.tsx
├── layouts/            # BasicLayout：顶部导航 + 内容区 + 页脚
├── pages/              # Home / Notes / Projects / Snippets / About
├── routes/             # 路由配置
├── hooks/              # useSearch、useScrollSpy 等
├── styles/             # 全局样式
└── theme/              # ThemeProvider：亮暗模式 + AntD 主题令牌
```

## 八、开发阶段

1. **阶段一：骨架搭建** ✅
   Vite + AntD 主题（含暗色模式切换）+ Layout 布局 + 路由结构
2. **阶段二：笔记模块（核心）**
   md 导入管线（frontmatter 解析）+ 列表页分类/标签筛选 + 详情渲染 + TOC 目录
3. **阶段三：项目模块**
   卡片列表 + 详情页（截图轮播、在线预览、文件树源码浏览器、zip 下载）
4. **阶段四：代码片段 + 体验增强**
   代码高亮与复制、搜索、阅读进度条、返回顶部、响应式适配
5. **阶段五：内容填充与部署**
   批量导入 md 笔记、部署到 Vercel / GitHub Pages

## 九、设计基调

- 定位"工程师的笔记本"：界面安静克制，内容当主角
- 亮色：冷调纸白底 + 石墨墨色文字；暗色：深岩灰底（不做纯黑）
- 主色：靛蓝（笔记/链接色）
- 元信息（日期、标签、文件名）使用等宽字体，呼应代码主题
- 布局：顶部导航 + 居中内容区（最大 1200px）
