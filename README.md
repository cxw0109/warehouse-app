# 工装库房扫码出入库系统

一库一位制，扫码即出库/入库，无需手动选择。

## 快速开始

### 1. 安装依赖

```bash
cd warehouse-app
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入飞书应用凭证
```

**必填项**：
- `FEISHU_APP_ID` — 飞书应用的 App ID
- `FEISHU_APP_SECRET` — 飞书应用的 App Secret
- `BASE_URL` — 服务公网地址（用于 OAuth 回调）

### 3. 启动

```bash
npm start
# 开发模式（自动重启）
npm run dev
```

### 4. 飞书应用配置

1. 登录 [飞书开放平台](https://open.feishu.cn)
2. 创建企业自建应用
3. 获取 App ID 和 App Secret，填入 .env
4. 在「安全设置」中添加重定向 URL：`https://你的域名/auth/callback`
5. 在「权限管理」中申请：`contact:user.id:readonly`（获取用户信息）
6. 发布应用

## 核心流程

```
扫码 → 判断工装在不在库 → 在库则出库，不在则入库
```

- **出库**：工装在某库位 → 释放该库位
- **入库**：工装不在库 → 自动分配空库位（编码升序）
- **防重扫**：同一工装 5 秒内重复扫码自动忽略

## 库位编码规则

格式：`X-NN-MM`
- X = 区（A/B/C…）
- NN = 排（01-99）
- MM = 位（01-99）

示例：`A-03-05` = A区 第3排 第5位

## 接口一览

| 接口 | 方法 | 说明 |
|------|------|------|
| `/auth/login` | GET | 飞书 OAuth 登录 |
| `/api/scan` | POST | 扫码出入库 |
| `/api/scan/stats` | GET | 库位统计 |
| `/api/query` | GET | 查询工装 |
| `/api/history` | GET | 流水记录 |
| `/api/locations` | GET | 库位列表 |
| `/api/locations/manage` | POST | 库位增删（管理员） |
| `/api/tools` | GET/POST | 工装管理（管理员） |

## 数据存储

SQLite 文件：`data/warehouse.db`（自动创建）

三张表：
- `tool_archive` — 工装档案
- `location_table` — 库位表
- `transaction_log` — 流水表
