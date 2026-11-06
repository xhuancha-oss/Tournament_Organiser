# 创建赛事前端模块

对应你负责的“添加比赛 / 创建赛事”功能：输入名称、开始与结束时间、赛制和说明，校验后创建赛事。

附件同时出现 React 分工示例和原生技术方案。由于当前仓库为空，本实现采用第三张图片中的 **HTML5 + CSS3 + 原生 JavaScript（ES Modules）**，不依赖 React、Vue、Vite 或第三方包。只实现创建赛事模块，不包含选手管理、对阵和比分等其他同学负责的功能。

## 运行

在本目录运行：

```sh
npm start
```

或不使用 Node，直接运行：

```sh
python3 -m http.server 5173 --bind 127.0.0.1
```

浏览器打开 <http://127.0.0.1:5173>。请通过 HTTP 访问，ES Modules 不适合直接双击 HTML 使用 `file://` 打开。

测试（Node.js 20+，无需安装依赖）：

```sh
npm test
```

## 已实现

- 名称必填、去除首尾空格，最多 80 个字符；赛事说明选填，最多 1000 个字符。
- 开始、结束时间必填，结束时间必须晚于开始时间。支持跨天赛事，也允许录入历史赛事。
- 单败淘汰、双败淘汰、循环赛三种赛制，默认单败淘汰。
- 实时预览、字符计数、字段级错误、提交中锁定表单、防止连续点击提交。
- 草稿自动保存、刷新恢复，清空前二次确认。
- 明确区分本地演示和服务器保存；接口失败保留表单，不自动转为本地成功。
- 响应式布局、键盘操作、可读标签、错误关联与成功提示。

## 文件与团队合并

```text
index.html                    页面结构与模块入口
css/create-tournament.css     样式
js/create-tournament.js       表单、草稿、预览、提交交互
js/tournament-model.js        校验与请求数据转换
js/tournament-service.js      本地保存 / Fetch API
js/config.js                  模式和接口地址
tests/tournament.test.js      核心业务与接口异常测试
```

合并到已有项目时，将页面主体与所需样式、脚本复制到团队统一结构中，并修改资源路径。页面脚本依赖 HTML 中的 ID，合并时请一并保留。此页面当前有一个独立侧栏；若团队已经有导航，可移除页面的 `.sidebar` 与 `.topbar`，并相应调整 `.workspace` 的边距。未创建其他模块的占位链接。

## 本地演示保存

默认 `js/config.js` 中 `mode: 'local'`，赛事以 JSON 数组保存在当前站点的 localStorage：

```js
JSON.parse(localStorage.getItem('tos.tournaments.v1') || '[]')
```

草稿单独保存在 `tos.create-tournament.draft.v1`。创建成功后清除草稿，保留赛事。演示记录仅限同一浏览器和同一来源（协议、主机和端口），不会同步到 Flask / SQLite。清理浏览器数据会删除记录；该模式用于演示，正式多人协作应切换到 API。

其他前端模块可在成功创建时监听：

```js
document.addEventListener('tournament:created', (event) => {
  const tournament = event.detail;
  // 根据 tournament.id 更新列表或进入团队已经实现的页面。
});
```

## Flask 接口对接

**截图未提供实际接口，因此以下是本模块采用的建议约定，需要与后端确认。**

将 `js/config.js` 改为：

```js
export const config = Object.freeze({
  mode: 'api',
  endpoint: '/api/tournaments',
  timeoutMs: 15000,
});
```

请求：`POST /api/tournaments`，`Content-Type: application/json`。

```json
{
  "name": "2026 校园羽毛球公开赛",
  "start_time": "2026-11-20T01:00:00.000Z",
  "end_time": "2026-11-20T10:00:00.000Z",
  "format": "single_elimination",
  "description": "欢迎同学们参加"
}
```

用户在设备本地时区输入时间，提交时转换为 UTC ISO 8601（上述示例对应上海时区 09:00–18:00）。后端请按 UTC 保存，并在读取展示时转换到用户时区。`format` 可取 `single_elimination`、`double_elimination`、`round_robin`。

成功响应：HTTP `201`，返回带有非空 `id` 的赛事对象，也支持外层包装为 `{ "tournament": { ... } }`：

```json
{
  "id": 1,
  "name": "2026 校园羽毛球公开赛",
  "start_time": "2026-11-20T01:00:00.000Z",
  "end_time": "2026-11-20T10:00:00.000Z",
  "format": "single_elimination",
  "description": "欢迎同学们参加",
  "status": "upcoming"
}
```

失败响应使用非 2xx 状态码，支持总提示 `message` 与字段错误 `errors`（值为字符串）：

```json
{
  "message": "请检查赛事信息",
  "errors": {
    "name": "赛事名称已存在",
    "end_time": "结束时间必须晚于开始时间"
  }
}
```

前后端在同一来源部署时可直接使用相对接口地址。若分别运行，需将 `endpoint` 设置为 Flask 的完整地址，并由后端配置开发来源的 CORS；推荐最终由 Flask 统一提供静态文件。若后端需要认证或 CSRF token，在 `tournament-service.js` 的 Fetch 请求头中按团队约定添加。本实现不包含 Flask 后端，后端仍需独立执行相同的数据校验。

前端会处理非 JSON 错误响应、HTTP 失败、网络中断、请求超时和成功响应格式异常。超时等不确定结果会提醒先核实是否已创建；不会自动重试 POST。
