# 运行与部署

完整项目介绍见 [README.md](README.md)。所有命令均在仓库根目录执行。

## 1. 环境与离线模式

安装 Node.js ≥ 22.18.0（推荐 Node.js 24 LTS），然后：

```bash
npm ci
MAGI_PROVIDER=mock npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)。Mock 不读取 PAT 或云资源状态，不消耗额度；适合先确认界面和动画。

可指定三台票型与重大议题标记，顺序为 MELCHIOR、BALTHASAR、CASPER：

```bash
MAGI_PROVIDER=mock MAGI_MOCK_VOTES=APPROVE,REJECT,ABSTAIN MAGI_MOCK_CRITICAL=0,0,1 npm run dev
```

## 2. 真实账号初始化

在 Qoder 控制台创建具备 Cloud Agents 所需权限的个人访问令牌（PAT），并填写本机配置：

```bash
cp .env.local.example .env.local
# 编辑 .env.local：QODER_PAT=你的令牌
```

中国区账号默认 `QODER_API_ORIGIN=https://api.qoder.com.cn`；国际区账号可设为 `https://api.qoder.com`。填写不带路径的 HTTPS origin，并与账号区域一致。PAT 仅由服务端读取，不要使用 `NEXT_PUBLIC_` 前缀存放令牌。

```bash
npm run bootstrap
```

此命令只读查询模型及已有资源，不创建资源、不写 `.magi-state.json`。根据输出选择账号当前可用的 model id，按需在 `.env.local` 中设置：

```dotenv
MAGI_MODEL_MELCHIOR=可用的模型ID
MAGI_MODEL_BALTHASAR=可用的模型ID
MAGI_MODEL_CASPER=可用的模型ID
```

没有覆盖时，可用列表有至少三个模型便取前三个 id；少于三个时会回退到第一个。模型名称和权限以账号的查询结果为准，不应照抄其他账号的历史配置。

```bash
npm run bootstrap -- --create
```

`--create` 会创建或复用一个 Environment 和三台 Agent，写入各人格的 `system` 提示词用于新 Agent，并生成 `.magi-state.json`。已有 Agent 按 metadata 匹配复用；若其模型与本次配置不同，会更新模型版本。此步骤会写入云端资源；切换账号时应分开工作目录与 `.env.local`、`.magi-state.json`，重新初始化，不混用账号资源索引。

```bash
npm run dev
```

若刚才用过 Mock，确认 `.env.local` 与当前终端未保留 `MAGI_PROVIDER=mock`。真实审议创建 Session 并消耗 Qoder credits。前端只发出一次审议请求，三台依次提交、独立判断，按完成顺序返回结果。

## 3. 可选的真实链路探测

```bash
npm run probe -- "是否现在发布新版本？"
```

Probe 输出每台耗时、票型、额度及合并裁决。**它直接调用真实 Qoder API，不受 `MAGI_PROVIDER=mock` 控制，也不经过网页调用的本机每日额度闸或用量记账。** 需要已配置 PAT 和 `.magi-state.json`；此操作会创建真实 Session、消耗 credits。

## 4. 常用配置

完整示例见 [.env.local.example](.env.local.example)。

| 变量 | 默认值 / 用途 |
| --- | --- |
| `MAGI_PROVIDER` | 默认 Qoder；设为 `mock` 进入离线模式 |
| `MAGI_MODEL_MELCHIOR` / `MAGI_MODEL_BALTHASAR` / `MAGI_MODEL_CASPER` | 初始化或更换各台模型；修改后重跑 `bootstrap -- --create` |
| `MAGI_DEADLINE_MS` | 单台等待上限，默认 `150000` 毫秒 |
| `MAGI_POLL_INTERVAL_MS` | 上游事件查询间隔，默认 `1200` 毫秒 |
| `MAGI_SESSION_MODE` | 默认 `per_query`，每次创建新 Session；`persistent` 仅读取状态中已有的 Session 索引，本仓库未自动维护这些索引，通常保持默认 |
| `MAGI_DEBUG` | `1` 时将原始事件写入 `.magi-debug`；其中可能包含议题与模型回复 |
| `MAGI_DAILY_CREDIT_CAP` | 默认 `500`；`0` 关闭本机额度闸 |
| `MAGI_BASE_PATH` | 可选构建期路径前缀，例如 `/magi` |

`.magi-usage.json` 按 UTC 日期计数，仅记录应用收到的部分上游用量；并发、超时、API 未返回用量或文件写入失败均可能造成低估。它不是账户账单，也不是严格预算或并发控制。不要让多个账户、多个容器共用同一账本。

## 5. 本机生产运行与子路径

```bash
npm run build
npm run start
```

子路径示例：

```bash
MAGI_BASE_PATH=/magi npm run build
npm run start
```

访问 [http://localhost:3000/magi](http://localhost:3000/magi)。`MAGI_BASE_PATH` 与静态资源路径在构建时确定，只改运行时环境无效。服务需要可读的 `.magi-state.json` 和可写的用量账本位置。

## Docker

镜像包含 Next.js standalone 运行文件，**不包含 `scripts/`**；不能在运行中的镜像里执行初始化脚本。每个账号先在宿主机完成 `npm ci`、配置 `.env.local`、执行 `npm run bootstrap -- --create`。

默认 Compose 监听 `127.0.0.1:3000`，读取 `.env.local`，将本机 `.magi-state.json` 只读挂载、`.magi-usage.json` 可写挂载到 `/app`。首次启动前准备账本文件，避免 Docker 将不存在的绑定路径创建为目录：

```bash
# .magi-state.json 必须已由本账号的 bootstrap -- --create 生成
test -f .magi-usage.json || printf '{}\n' > .magi-usage.json
docker compose up --build -d
```

容器使用 UID/GID `1001:1001`。确认该用户可读取状态文件、可写账本；Linux 宿主机如有权限问题，可将账本所有者设为容器用户，例如 `sudo chown 1001:1001 .magi-usage.json`。账本写入失败不会中断审议，因此需要主动确认权限。账号更换、备份和重新初始化在宿主机进行，不把 `.env.local` 或状态烘焙进镜像。

当前 Dockerfile 没有传入 `MAGI_BASE_PATH` 的构建参数，默认构建在 `/`；Compose 的 `env_file` 只设置运行时环境，不能改变构建路径。需要子路径时，可先采用上面的宿主机构建方式，或自行补齐 Docker 构建期配置。

仅体验 Mock 可直接构建和运行镜像，无需配置文件、状态绑定或云端初始化：

```bash
docker build -t magi-qoder .
docker run --rm -p 127.0.0.1:3000:3000 -e MAGI_PROVIDER=mock magi-qoder
```

## 6. 检查

以下命令使用本机代码和测试替身，不发起付费审议：

```bash
npm run test:verdict
node --test scripts/mobile-parallel-test.mjs scripts/ordered-admission-test.mjs scripts/bootstrap-survey-test.mjs
npm run typecheck
```

裁决检查覆盖 216 组票型与重大议题标记组合，另有未完成状态及否决者追踪检查；其余测试检查流式返回、输入边界、粒子坐标和按序提交后的独立完成。测试不保证真实上游的延迟、额度或输出质量。

## 7. 公开部署前

应用需要运行 Node/Next.js 服务端，不能作为纯静态 GitHub Pages 站点运行。反向代理应支持长请求与流式响应，避免缓冲审议接口，超时要覆盖单台等待窗口及提交开销。

应用当前没有登录或访问鉴权；同源校验不限制访问者调用。公开部署应自行配置反向代理访问认证、限流和独立服务账号，限制 PAT 的可用范围。保留本机状态与账本，避免重建容器后丢失用量记录。

当前保留 Next.js 16.1.6 的现有依赖，`npm audit` 仍报告已知风险；面向公网的新部署应先升级依赖并回归验证，本次源码整理不代表已完成安全加固。

部署前也请修改 `lib/site.ts` 的站点地址和描述；目前仍保留上游元数据。`app/layout.tsx` 的 `/og-image.png` 预览图需要自行提供。

仓库未包含作者的 PAT、云端资源索引、原始审议日志或线上服务器配置。请以自己的账号资源和部署环境为准。
