# Bosszhipin-job-bot 架构与开发铁律 (Architectural Guidelines)

本项目前端采用 Tauri + React + TypeScript + TailwindCSS 构建。所有开发与 AI Agent 协助开发必须无条件遵循以下架构铁律：

## 一、主视图职责铁律（Dashboard Layout Router）
1. **Dashboard.tsx 仅作为布局路由外壳 (Layout Router)**：
   - 控制代码行数在 **200 行左右**。
   - 仅负责顶层框架组装（`Sidebar` + `DashboardHeader` + `main` 内容区 + `SettingsDrawer` / `SettingsModal`）以及各 Tab 面板的按需挂载。
   - **严禁** 在 `Dashboard.tsx` 中编写具体的业务逻辑、复杂的表单处理、DOM 3D 物理变换或底层通信。

## 二、功能演化与扩展铁律（Anti-Monolith Rules）
1. **新功能面板归位法则**：
   - 任何新增的页面级功能（如求职统计大盘、面试邀约、会话管理等），必须在 `src/views/` 或 `src/components/` 建立独立的组件文件（如 `XxxPanel.tsx` 或 `XxxView.tsx`）。
   - 在 `Dashboard.tsx` 中仅允许通过单行条件渲染挂载（如 `{activeNav === "xxx" && <XxxView {...props} />}`）。
2. **状态与网络通信 Hook 归位法则**：
   - 任何复杂的前端状态聚合、后端 IPC 接口调用或轮询逻辑，必须封装至独立的 Custom Hook（如 `src/hooks/useXxx.ts`）。
   - 严禁在页面外壳中直接堆砌无序的 `useState` 与 `useEffect`。
3. **视图小部件下沉法则**：
   - 纯展示型卡片、状态指示器、按钮组，必须拆分为独立的小组件（如 `ReviewCard.tsx`、`DashboardHeader.tsx`）。

## 三、用户体验与视觉完整性铁律
1. **3D 万花筒滚轮动力学完整性**：
   - 工作台必须保持 OptionWheel 物理动力学（Cylindrical 3D Wheel Physics），通过 `stepY = Math.max(600, vh * 0.8)` 与 `pastProg >= 0.8` 严格防止卡片透视重叠与鬼影。
2. **多语言与普通用户文案视角**：
   - 避免直接暴露过度技术化的内部风控词汇，以普通求职者友好的方式呈现。
   - 界面中英文切换必须保持 100% 彻底。

## 四、代码提交与验证铁律
1. 每次模块拆分或功能迭代后，必须依次执行：
   - `npx tsc --noEmit`（TypeScript 类型检查通过，零报错）
   - `npm run test -- --run`（单元测试与回归测试全部通过）
   - `npm run build`（生产构建成功）
2. Git 提交信息遵循 Conventional Commits 规范，严禁包含任何 `Co-authored-by` 尾注。

## 五、发版铁律
- 任何涉及「打安装包 / 发版本 / 自动更新」的任务，**先通读根目录
  《发布与自动更新SOP.md》**再动手：版本号 7 处同步、双通道发布流程、
  latest.json 生成、发布后验证清单、数据安全红线（私钥管理、卸载钩子、
  sanitize 边界）全在里面，照做即可，不要即兴发挥。
