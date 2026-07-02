# StandupSync — 敏捷站会速记平台

## 项目概述

前后端分离的站会管理工具，支持多团队、实时语音输入、AI结构化纪要、待办追踪、数据看板。

## 目录结构

```
E:\软件实习\
├── standup-sync/                # Vue3 前端
│   ├── src/
│   │   ├── main.js              # 入口：Pinia + ElementPlus + Router
│   │   ├── App.vue              # 根组件 <router-view>
│   │   ├── router/index.js      # 路由配置 + 鉴权守卫
│   │   ├── stores/              # Pinia 状态管理（6个store）
│   │   ├── views/               # 页面组件（8个）
│   │   ├── components/standup/  # 站会组件
│   │   ├── composables/         # 可复用逻辑
│   │   ├── services/api/        # axios HTTP 封装
│   │   ├── services/websocket/  # WebSocket 封装
│   │   ├── utils/               # 常量/格式化/ID生成
│   │   └── assets/              # CSS 主题
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
│
├── standup-sync-backend/        # SpringBoot 2.7 后端
│   └── src/main/java/com/standupsync/
│       ├── StandupSyncApplication.java
│       ├── config/              # Security, JWT, CORS, WebSocket, Exception
│       ├── controller/          # REST API（6个Controller：Auth/Team/Standup/Todo/Dashboard/Sprint）
│       ├── service/             # 业务逻辑（7个Service）
│       ├── entity/              # 数据实体（8张表，含Sprint）
│       ├── mapper/              # MyBatis-Plus Mapper（8个）
│       ├── dto/                 # 请求/响应DTO
│       ├── websocket/           # WebSocket Handler
│       └── util/                # JWT工具类
│
└── standup-sync/sql/init.sql    # 数据库建表+初始数据
```

## 技术栈

| 层 | 技术 | 版本 |
|------|------|------|
| 前端框架 | Vue 3 | ^3.4 |
| UI库 | Element Plus | ^2.8 |
| 状态管理 | Pinia + persist | ^2.3 / ^3.2 |
| 路由 | Vue Router | ^4.4 |
| 图表 | ECharts + vue-echarts | ^5.5 / ^6.7 |
| 拖拽 | vuedraggable | ^4.1 |
| 构建 | Vite | ^5.4 |
| 后端框架 | Spring Boot | 2.7.18 |
| ORM | MyBatis-Plus | 3.5.3.1 |
| 认证 | JWT (jjwt) | 0.9.1 |
| 数据库 | MySQL | 8.0 |
| 实时通信 | WebSocket (Spring) | — |

## 启动方式

### 前置条件
- Node.js (v24 可用)
- Java 8
- Maven 3.9+ (已安装于 `E:\apache-maven-3.9.6\bin\mvn`)
- MySQL 8.0 (root/123456)

### 1. 数据库
```bash
mysql -u root -p123456 < E:/软件实习/standup-sync/sql/init.sql
```

### 2. 后端 (端口 8088)
```bash
cd E:/软件实习/standup-sync-backend
E:/apache-maven-3.9.6/bin/mvn spring-boot:run
```

### 3. 前端 (端口 5173)
```bash
cd E:/软件实习/standup-sync
npm install
npm run dev
```

### 测试账号
用户名：zhangsan / lisi / wangwu / zhaoliu / qianqi
密码：123456

## 前端架构

### 路由表

| 路径 | 组件 | 权限 | 说明 |
|------|------|------|------|
| `/login` | LoginView | 无 | 登录/注册 |
| `/standup` | StandupIndex | 登录 | 站会首页（进行中卡片+历史表格） |
| `/standup/:id/meeting` | StandupMeeting | 登录 | 实时站会发言 |
| `/standup/:id/result` | StandupResult | 登录 | AI纪要 |
| `/todo` | TodoList | 登录 | 待办管理 |
| `/dashboard` | Dashboard | 登录 | 数据看板 |
| `/team` | TeamView | 登录 | 团队管理 |
| `/setting` | SettingView | 登录 | 系统设置 |
| `/*` | NotFound | 无 | 404 |

### 状态管理 (Pinia Stores)

| Store | Key | Persist | 核心职责 |
|-------|-----|---------|---------|
| `useUserStore` | sessionStorage | ✅ | 登录态、JWT token、角色 |
| `useTeamStore` | localStorage | ✅ | 团队列表、成员、Sprint |
| `useStandupStore` | localStorage | ✅ | 站会列表、当前会议、AI纪要 |
| `useTodoStore` | localStorage | 仅 persist activeTab+notifications | 待办CRUD(API)、通知、多团队聚合 |
| `useDashboardStore` | 无 | ❌ | 看板KPI、图表数据 |
| `useSettingsStore` | localStorage | ✅ | 主题暗色/亮色、通知开关 |

### 用户角色 (RBAC)

| 角色 | 常量 | 中文 | 创建团队 | 创建站会 | 开始站会 | 发言 |
|------|------|------|:---:|:---:|:---:|:---:|
| Tech Lead | `tech_lead` | 团长 | ✅ | ✅ | ✅ | ✅ |
| Scrum Master | `scrum_master` | 主持人 | ❌ | ❌ | ✅ | ✅ |
| Developer | `developer` | 开发者 | ❌ | ❌ | ❌ | ✅ |
| Observer | `observer` | 观察者 | ❌ | ❌ | ❌ | ❌ |

**注意**：角色检查应使用 `teamStore.activeMembers` 查找当前用户在团队中的角色（`userId` 匹配），而非 `userStore.currentUser.role`（全局角色可能不准确）。

### WebSocket 通信

- **站会频道**：`ws://localhost:8088/ws/standup/{standupId}` — 站会实时发言
- **团队频道**：`ws://localhost:8088/ws/team/{teamId}` — 待办通知、跨用户实时同步
- 前端封装：`wsService.js`（站会）、`teamWsService.js`（团队通知）
- 后端处理：`StandupWebSocketHandler.java`（统一处理两个频道）
- 通知类型：`todo:created`、`todo:assigned`、`todo:status-changed`、`todo:transfer-requested`、`todo:transfer-approved`
- 通知可跨用户实时推送，前端 `useTodoStore._fixWs()` 接收并写入通知面板

### 暗色模式

- Element Plus 官方暗色：`import 'element-plus/theme-chalk/dark/css-vars.css'`
- 切换方式：`html` 元素添加/移除 `class="dark"`
- 预加载脚本在 `index.html` 中提前设置 class，防止闪烁
- 自定义暗色覆盖在 `assets/theme.css`

## 后端 API

### 认证 (AuthController)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register?username=&password=&nickname=` | 注册 |
| POST | `/api/auth/login` | 登录（Body: JSON username+password） |
| GET | `/api/auth/profile` | 获取个人信息 |
| POST | `/api/auth/logout` | 退出（JWT加入黑名单） |

### 团队 (TeamController)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/teams?name=xxx` | 创建团队 |
| POST | `/api/teams/join?inviteCode=xxx` | 加入团队 |
| GET | `/api/teams/mine` | 我的团队列表 |
| GET | `/api/teams/{id}/members` | 团队成员（含姓名） |
| PUT | `/api/teams/{id}/members/{mid}/role?role=xxx` | 修改成员角色 |
| DELETE | `/api/teams/{id}/members/{mid}` | 移除成员 |
| POST | `/api/teams/{id}/invite-code` | 重新生成邀请码 |
| PUT | `/api/teams/{id}?name=xxx` | 修改团队名称 |
| POST | `/api/teams/{id}/dissolve` | 解散团队 |

### 站会 (StandupController)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/standups?teamId=xxx` | 站会列表 |
| POST | `/api/standups` | 创建站会 |
| GET | `/api/standups/{id}` | 站会详情（含发言记录） |
| POST | `/api/standups/{id}/start` | 开始站会 |
| POST | `/api/standups/{id}/speeches` | 提交发言 |
| POST | `/api/standups/{id}/end` | 结束站会 |
| POST | `/api/standups/{id}/summary/generate` | 生成AI纪要 |
| GET | `/api/standups/{id}/summary` | 获取纪要 |

### 待办 (TodoController)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/todos?teamId=xxx` | 单团队待办列表 |
| GET | `/api/todos/mine` | **多团队聚合**：当前用户所有团队的待办（团长看全团/团员看自己） |
| POST | `/api/todos` | 创建待办（Body: JSON 含 teamId/content/assigneeId/priority/deadline/sprintId） |
| PATCH | `/api/todos/{id}/status?status=xxx` | 更新状态（责任人本人或团队成员可操作） |
| POST | `/api/todos/{id}/transfer?newAssigneeId=xxx` | 发起转交请求 |
| POST | `/api/todos/{id}/transfer/approve` | 团长审批转交 |
| GET | `/api/todos/unfinished` | 未完成待办 |

### Sprint (SprintController)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sprints` | 全局 Sprint 列表（不关联团队） |
| POST | `/api/sprints?name=xxx&startDate=xxx&endDate=xxx` | 创建 Sprint |

### 看板 (DashboardController)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/dashboard/kpi?teamId=xxx&sprintId=xxx` | KPI指标（支持Sprint筛选） |
| GET | `/api/dashboard/trends?teamId=xxx&sprintId=xxx` | 趋势数据 |
| GET | `/api/dashboard/ranking?teamId=xxx` | 成员排行 |

## 关键注意事项

### 前端调用后端
- axios baseURL: `http://localhost:8088/api`
- 所有请求自动带 JWT token（从 sessionStorage 读取）
- API 响应格式：`{code:200, msg:"success", data:{...}}`

### 多团队待办权限
- `GET /api/todos/mine` 聚合当前用户**所有团队**的待办
- 团长的团队 → 看全团待办；团员的团队 → 只看分配给自己（assigneeId=自己）的
- 前端 `fetchTodos()` 统一调用 `/todos/mine`，不做单团队筛选
- 通知审批按钮按**每条待办所属团队**判断团长权限（`isMasterForTodo`）

### Sprint 系统
- Sprint 是全局共享标签，**不关联团队**
- 后端 `GET /api/sprints` 无团队参数，返回所有 Sprint
- Sprint 状态按结束日期判断：`>= 今天` → 进行中，否则已结束
- 待办通过 `sprintId` 关联 Sprint（`TodoCreateDTO.sprintId`, `TodoItem.sprintId`）

### 通知系统
- 通知通过 WebSocket **团队频道**（`ws://localhost:8088/ws/team/{teamId}`）实时推送
- 前端 `useTodoStore._fixWs()` 注册事件处理器（created/assigned/status-changed/transfer-requested/transfer-approved）
- 自己的操作不生成通知（通过 `operatorId`/`assignerId` 过滤）
- 转交审批按钮仅对该待办所属团队的团长可见（`isMasterForTodo` check）

### 常见问题排查

1. **白屏** → 检查路由守卫是否正常（router/index.js），确认 Pinia persist 插件没有报错
2. **登录失败** → 确认后端 8088 端口运行中，检查 CORS 配置（`SecurityConfig` 需允许 GET/POST/PUT/PATCH/DELETE/OPTIONS）
3. **语音识别不工作** → 必须用 Chrome/Edge，`useSpeechRecognition.js` 中 `isSupported` 为模块级常量
4. **创建站会失败** → 检查角色（需在 `teamStore.activeMembers` 中为 tech_lead）
5. **历史详情空数据** → 确认站会 ID 是后端返回的数字 ID（非本地生成的字符串 ID）
6. **AI 纪要不可用** → AIService 有 fallback（`localSummarize`），不会阻断流程
7. **名称显示乱码** → MySQL 字符集问题，用 `--default-character-set=utf8mb4` 重插数据

### 数据库字段注意
- `user.id` vs `team_member.id` vs `team_member.userId` — 三者的区别
- 前端 `userStore.currentUser.id` 是 String 类型，后端返回的 `userId` 是 Number
- 权限检查时必须 `String()` 转换后比较
- 所有表都有 `deleted` 逻辑删除字段，MyBatis-Plus `@TableLogic` 自动过滤

### SessionStorage vs LocalStorage
- `user` store → `sessionStorage`（每个标签页独立登录）
- `team`, `standup`, `settings` → `localStorage`（跨标签页共享）
- `todos` store → 仅 persist `activeTab` + `notifications`（待办数据每次从 API 加载，不缓存）
- 主题预加载脚本读 `localStorage` 的 `settings` key

## 修改指南

### 添加新页面
1. 在 `src/views/` 创建 Vue 组件
2. 在 `src/router/index.js` 添加路由
3. 如需要状态，在 `src/stores/` 创建 Pinia store

### 添加后端 API
1. 在 `controller/` 添加端点
2. 在 `service/` 实现业务逻辑
3. DTO 放在 `dto/` 目录

### 修改权限
- 前端：修改 `myTeamRole` computed 或 `canStart` computed
- 后端：在 Controller 中通过 `Authentication auth` 获取当前用户
- 角色常量在 `src/utils/constants.js`（前端）和 entity 注释中（后端）
