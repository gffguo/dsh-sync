# @weibaohui/dsh-sync

[![DSH plugin](https://img.shields.io/badge/dsh-plugin-green)](https://github.com/topics/dsh-plugin)
[![npm version](https://img.shields.io/npm/v/@weibaohui/dsh-sync)](https://www.npmjs.com/package/@weibaohui/dsh-sync)

**多机同步插件**：让多台机器上的 dsh 通过一个私有 GitCode 仓库保持一致——技能、会话、设置、插件清单都能同步。除 Git 完整同步外，还支持 **WebDAV** 与 **本地文件夹** 两种纯备份协议，各协议一个页签一个开关。

![多机同步：仓库配置、同步开关与冲突处理](https://cdn.jsdelivr.net/gh/weibaohui/dsh-sync@main/docs/demo.gif)

## 核心功能

- **多协议备份，一个协议一个页签一个开关**：
  - **Git 仓库**（默认开）：完整的 分支 → PR → 合并 同步语义，冲突显化、AI 语义合并
  - **WebDAV**（默认关）：填地址/账号/密码/子目录即可，兼容坚果云、Nextcloud、Alist 等一切标准 WebDAV 服务；每次同步按 sha1 清单增量上传（只传变化的文件、删除同步传播）
  - **本地文件夹**（默认关）：填一个目录（支持 `~`）即可；每次同步整目录原子镜像（tmp-swap，中断不留半截备份）
  - 未开启的协议只显示开关；开启后出现地址参数配置与「测试连接」
  - 纯备份协议的内容与布局和 git 的备份策略完全一致：`backup/<实例ID>/…`，本地永不被读回覆盖；单协议失败不影响其他协议
- **四类内容可同步，每类独立开关 + 独立策略**：
  - 技能 skills（默认开，策略=并集）：覆盖 `~/.dsh/skills`、`~/.agents/skills`、`~/agents/skills` 三个根；新增都收、双方改动交 AI 语义合并
  - 会话 sessions（默认关，策略=备份）：写 `backup/<实例ID>/`，各机云上独立，本地永不被覆盖
  - 设置 settings.yaml（默认开，策略=备份）：机器专属配置不打架，想共享键用「AI 智能对齐」逐键并
  - 插件清单（默认开，策略=备份）：各机 bundle/依赖清单互不覆盖（跨机整文件覆盖曾致宿主 crash loop）
  - 四种策略：**备份**（各机独立，永不被覆盖）/ **并集**（新增都收、逐文件三方、冲突交 AI）/ **覆盖·远端为准**（本地只读镜像，远端删本地也删）/ **覆盖·本地为准**（只推不拉）
- **快照：本地优先，通用上云，勾选才传**
  - 「立即快照」默认只落本机（`~/.dsh/dsh-sync/snapshots/`，滚动保留 30 份，超窗真删除真释放）；勾选「上传到云端」才写入**所有已启用的云端协议**（git → `backup/<实例ID>/snapshots/`，WebDAV / 本地文件夹同布局），永久存档
  - 每天首个同步自动打一份本地快照；范围=设置+插件清单（可选含技能），永远不含会话（体积大头）
  - 一键恢复：本地快照直接恢复；本地没有的按 **git → WebDAV → 本地文件夹** 依次回退取回；恢复前自动把当前状态再拍一份（pre-restore-*）
- **分支 → PR → 合并**：每台机器的变更以 PR 形式提交，冲突显化为一个待合并的 PR，绝不静默覆盖
- **同步前自动回填**：每次推送前先把远端新增、本机没动过的内容拉回本机，本机快照不会误删别的机器推上来的新技能/新配置
- **AI 智能对齐**：点「AI 智能对齐」，先自动回填远端新增，再由 AI 对两边都改过的文件做语义合并（动手前自动备份本机文件），合并后由系统自动推送
- **AI 一键解决冲突**：出现冲突时设置页冒出「AI 解决冲突」按钮，点击后由系统取回冲突分支与 main 制造冲突工作树，AI 只做本地语义解冲突，推送与 PR 合并由系统自动完成
- **浏览远端备份**：点「浏览远端」可查看云端仓库的完整目录树，自动识别 `backup/<实例ID>/` 下每台机器的备份并标记本机；在树中勾选文件后「预览拉取」会给出安全判定（哪些可拉、哪些会被阻止及原因），确认后才写入本地——写入前自动拍一份 pre-remote-pull 安全快照
  - 跨机安全提示（不阻止拉取）：另一台机器的 **插件清单**（本地已有时）和 **settings.yaml** 跨机拉取时会⚠警告（覆盖机器专属配置可能导致宿主崩溃），但允许用户自行决定是否拉取；**技能文件**可安全跨机拉取；本机自己的备份无警告（恢复语义）
  - 浏览是只读的：远端 main 拉进独立 ref（`refs/dshsync/browse`），不触碰 FETCH_HEAD，与同步循环无竞争
- **安全**：强制私有仓库（公共仓库直接拒绝保存）；访问 token 只写不回读
- **凭据不出域**：AI agent（冲突处理/智能对齐/远端对齐）的提示词**不含任何访问令牌**——需要凭据的 git 推送、PR 查询/合并全部由插件 host 侧完成，token 不会随提示词发送给模型服务（0.4.1 修复）。git 子进程同样不经 argv 携带 token（argv 可被 `ps` 全机看到），改为 `GIT_ASKPASS` 环境变量注入（0.4.1）；`conflictMode=manual` 时所有 AI 入口（自动触发 + 手动按钮）一律关闭，`ai` 才放行
- **残余风险提示**：「智能对齐」的本质是把待合并文件的内容交给模型做语义判断——若 `settings.yaml` 等文件内含其他机密（如模型 apiKey），这些值仍会进入模型上下文（这是语义合并功能的固有性质，无法在保留功能的前提下消除）；介意者请把 `conflictMode` 设为 `manual` 或关闭对应同步开关
- **拉取安全**：pull 只回写本地没动过的远端变更，本地改过的内容不会被覆盖

## 安装

```bash
dsh plugin --profile web add @weibaohui/dsh-sync -w
```

装完重启 `dsh web` 即生效。

## 本地打包与测试

### 1. 打包

```bash
npm run check          # 语法检查（src + client）
npm test               # 离线测试 69 项
npm run build:client   # 改了 client/index.js 必须先重建，否则打进去的是旧界面
npm pack               # → weibaohui-dsh-sync-<version>.tgz
tar -tzf weibaohui-dsh-sync-0.4.3.tgz   # 应只含 src/、client/、cordis.patch.yml、package.json、README.md
```

发布时 `npm publish` 会自动跑 `prepublishOnly`（build:client + check + test），无需手工前置。

### 2. 装进本地 profile 验证

Desktop 的 profile 名是 `desktop`；**先完全退出 Desktop**（profile 的 `package.json` 有文件锁）：

```bash
dsh plugin --profile desktop add file:C:\path\to\weibaohui-dsh-sync-0.4.3.tgz
# 或从 npm 装发布版：dsh plugin --profile desktop add @weibaohui/dsh-sync -w
# 普通 web profile：dsh plugin --profile web add @weibaohui/dsh-sync -w
```

装完重启即生效。若只想跑一次端到端、不碰真实 profile，可用仓库内脚手架
（真实 dsh-app-boot + 真实 dsh-settings，用 file URL 直接加载工作区 `src/index.js`）：
`node .repro/harness4.mjs real`，结果写入 `.repro/out4-real.json`。

### 3. 开发期免「改一次装一次」

把 profile 里的安装副本换成指向源码目录的 **junction**（Windows 需开发者模式或管理员），
之后改 `src/index.js` → 重启 dsh；改 `client/index.js` → `npm run build:client` → 刷新页面：

```powershell
$dst = "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\@weibaohui\dsh-sync"
Rename-Item $dst "$dst.bak"
New-Item -ItemType Junction -Path $dst -Target "D:\GfKaifaApplication\dsh-sync"
```

回滚：删除 junction，把 `dsh-sync.bak` 改回原名。

### 4. 验证与排障

- 设置页保存后，`GET /dsh-sync/api/status` 的 `persist.fileOk` 应为 `true`，并可看到 `~/.dsh/dsh-sync/settings.json` 生成；重启 dsh 后值应保留。
- `GET /dsh-sync/api/diag` 显示 `schemaKind` / `descriptorVisible` / `lastPersist`：宿主写回失败时 `persist.hostOk=false`，此时 UI 提示「已保存到本地」。

## 使用

1. 到 [gitcode.com](https://gitcode.com) 创建一个**私有**仓库（插件不会代建）
2. 打开 Web UI → **设置页 → dsh-sync**，填入仓库地址与 access token，保存
3. 按需开关四类同步内容
4. 之后每次修改，通过同步操作把本机变更推成 PR；多机之间即可保持一致
5. 日常可点「AI 智能对齐」让 AI 先回填远端新增、语义合并双方改动；出现冲突时设置页会出现「AI 解决冲突」按钮，点一下即可
6. 需要从其他机器恢复个别文件时，点「浏览远端」→ 在远端目录树中找到文件并勾选 → 「预览拉取」确认安全判定 → 「应用」写入本地（自动拍安全快照）

## Windows 用户注意（路径转换）

在 Windows 的 Git Bash 里，MSYS2 runtime 会对**传给原生 `.exe` 的参数**做 POSIX→Windows 路径转换。
若路径中某个**目录名带点**（如 `C:\Users\x\.dsh\dsh-sync\repo`），这个点会被当成路径分隔符，
路径被改写成 `C:\Users\x\dsh\dsh-sync\repo`（点消失、多出一级），git 于是在不存在的目录里执行并报 `fetch failed`。

这是 Git for Windows 的既有行为，官方定性为 wontfix（[git-for-windows#685](https://github.com/git-for-windows/git/issues/685)）。
本插件自 0.4.2 起做了两层防护：

- **host 侧**：git 子进程在 Windows 下自动注入 `MSYS_NO_PATHCONV=1` 与 `MSYS2_ARG_CONV_EXCL='*'`（仅该子进程，不写全局环境）
- **AI 侧**：三个 AI 提示词都带 Windows 前置保险——先判定平台，再自检路径是否被改写，每条 git 命令前置开关，
  并用 `git -C <影子仓库> rev-parse --show-toplevel` 确认目录真实可达后才动手；验证失败即停止汇报

> ⚠️ 请**不要**把 `MSYS_NO_PATHCONV=1` 写进 `.bashrc` 或全局环境——全局设置会影响其它程序，
> Git for Windows 官方也专门警告过这一点（[build-extra#376](https://github.com/git-for-windows/build-extra/issues/376)）。
> 只在你自己的终端里按"每条命令前置"的方式临时使用即可。

## 设置持久化与排障（0.4.3）

点「保存」后设置被写到**两处**，任何一处成功都能跨重启生效：

1. **宿主 settings 文档**（profile 的 `cordis.patch.yml`）——由 dsh 的 settings/config-editor 服务写回，成功时与宿主设置页完全一致；
2. **自持文件** `~/.dsh/dsh-sync/settings.json`（`0600`，仅本机）——不依赖宿主 settings 通道，保存即落盘。

重启后的合并优先级：**内置默认 < 插件 config.sync < 宿主文档 < 自持文件 < 本次运行内存覆写**。
若宿主通道在运行中被确认写入过（文档 mtime 更新），则以宿主文档为准；否则自持文件生效——这正是为了在宿主写回失败时仍能跨重启保留设置（见下）。

- 宿主写回失败时（宿主日志出现 `No configurable plugin entry "dsh-sync"` 或 `Plugin entry "dsh-sync" is no longer configurable`），设置**仍然**写入自持文件，UI 提示
  「设置已保存到本地（宿主设置写回失败，重启后仍生效）」，不再静默成功。
- `Config` 永不为 `undefined`：schemastery 不可用（< 3.18.4 没有 `.volatile()`）时使用自铸 Config，宿主依旧能识别本插件设置并投影字段。
  schemastery 加载已加固：逐候选校验 `.volatile()` 是否存在，全部不可用才降级，并且**始终**打印一行警告。
- **排障端点**：`GET /dsh-sync/api/diag` 返回 `schemaKind` / `schemasterySource` / `schemasteryError` / `descriptorVisible` / `documentPath` / `lastPersist` / `settingsFile` / `fileSettingsKeys` 等；
  `GET /dsh-sync/api/status` 的 `persist` 字段给出 `fileOk` / `fileError` / `hostOk` / `hostError`。
- token / webdavPassword 与宿主文档一致地存放在自持文件里（明文、仅本机、`0600`），**永不回显**；置空保存即清除。
- 卸载或换机时可安全删除 `~/.dsh/dsh-sync/settings.json`，插件会回到默认值。

## 联系我 :飞书群

![link](https://foruda.gitee.com/images/1774880015525784725/4fd67005_77493.png "link")

## 版本兼容性

本插件与 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`@deepseek-ai/dsh`）的版本对应关系：

| 插件版本 | 适配 dsh 版本 | 备注 |
|---------|--------------|------|
| 0.4.3 | 0.1.7-rc.2 | 修复：保存配置后重启 dsh 又回到默认配置。新增自持设置文件 `~/.dsh/dsh-sync/settings.json`（保存即落盘、重启后生效，不依赖宿主 settings 写回）；`Config` 永不 undefined（自铸 Config 兜底，宿主仍可识别）；schemastery 加载加固（拒绝 < 3.18.4 无 `.volatile()` 的副本，失败不再静默）；PUT /settings 响应带 `persist`，宿主写回失败时 UI 提示「已保存到本地」；新增 `GET /dsh-sync/api/diag` 与 `status.persist`；离线测试 69 项（新增 settings-persist 7 项 + 跨重启回归 2 项） |
| 0.4.2 | 0.1.7-rc.2 | 修复 issue #10（Windows）：Git Bash 的 POSIX→Windows 路径转换会把目录名里的**点**拆成路径段（`C:\Users\x\.dsh\...` → `C:\Users\x\dsh\...`），git 于是在不存在的目录里执行而报 `fetch failed`。git 子进程在 win32 下注入 `MSYS_NO_PATHCONV=1` + `MSYS2_ARG_CONV_EXCL='*'`（仅子进程，绝不写全局）；三个 AI 提示词加入 Windows 前置保险（判定平台 → 路径自检 → 每条命令前置开关 → `rev-parse --show-toplevel` 验证目录可达，失败即停）；离线测试 60 项全绿 |
| 0.4.1 | 0.1.7-rc.2 | 安全修复（issue #9）：AI agent 提示词不再携带 GitCode 访问令牌（prepare/finalize 收归 host 侧）；git 子进程改经 `GIT_ASKPASS` env 注入凭证，argv 不再出现 token；`conflictMode=manual` 现在关闭全部 AI 入口（含手动按钮端点）；离线测试 52 项全绿 |
| 0.4.0 | 0.1.7-rc.2 | 新增 WebDAV / 本地文件夹备份协议（每协议一页签一开关）、快照多协议通用上云与恢复回退；离线测试 45 项全绿（含伪 WebDAV 服务器 wire 级集成测试） |
| 0.3.5 | 0.1.7-rc.2 | 新增 `~/agents/skills`（无点目录）技能根，随技能开关与策略一起同步/快照 |
| 0.3.2 | 0.1.7-rc.2 | 修复宿主将 volatile 字段物化为 {} 导致的设置毒化（saneConfigValues 清洗 + 移除 Config 兼容字符串字段） |
| 0.3.1 | 0.1.7-rc.2 | 适配 0.1.7 settings 模型（导出 volatile `Config`，`ctx.settings.update` 持久化），面板改动重启不再丢失 |
| 0.2.3 | 0.1.7-rc.2 | 已在 @deepseek-ai/dsh@0.1.7-rc.2 下验证运行 |
| 0.3.0 | 0.1.7-rc.2 | 新增远端备份浏览+选择性拉取+AI对齐+文件预览；已在 @deepseek-ai/dsh@0.1.7-rc.2 下验证运行 |

> **发版约定**：每次发布新版本时，请在上表追加一行，记录该插件版本实际验证所用的 `@deepseek-ai/dsh` 版本。`package.json` 的 `engines.dsh` 声明最低支持版本；本表记录实际验证版本，二者配合使用。
