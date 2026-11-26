# Wiki 个人笔记库

这是一个用 **React 18 + TypeScript + Vite + Ant Design 5** 搭建的个人笔记博客，也就是你现在看到的这个网站本身。

## 功能特性

- **笔记系统**：Markdown 文档渲染（GFM 表格、代码高亮）、分类筛选、搜索
- **代码片段**：与笔记一一对应，语法高亮 + 一键复制 + 下载
- **亮暗模式**：AntD 算法切换，跟随系统 + 手动切换 + localStorage 记忆
- **电子书阅读**：pdf.js 渲染的 PDF 在线阅读，支持缩放与键盘翻页
- **纯前端**：内容以静态文件方式随站点分发，无后端依赖

## 核心实现

- 内容管线：`public/content/` 静态文件 + 扫描脚本生成 `manifest.json` 索引
- 主题：`ThemeProvider` 通过 ConfigProvider 的 `darkAlgorithm` 切换算法，并把模式写到 `<html data-theme>` 供自定义 CSS 变量使用
- 路由：React Router 的 `createBrowserRouter`，按模块划分页面
