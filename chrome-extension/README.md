# AI Marketing Crew Assistant (Chrome Extension)

AI Marketing Crew Assistant 是一个浏览器客户端桥接插件，用于将 **AI Marketing Crew Dashboard (看板)** 与各大主流社媒平台和本地生活商家后台（如大众点评、美团、小红书、Instagram、TikTok 等）双向打通，实现全自动/半自动的评价回复、内容发布以及数据采集。

## 核心功能

1. **自动回复评论 (Reviews Reply Automation)**：通过 DOM 注入与事件模拟，在真实的商家后台页面（以及开发模拟器页面）自动填写 AI 生成的回复文案并提交。
2. **多平台支持**：支持国内（大众点评、美团、小红书）及海外（Instagram、TikTok）商家/创作后台。
3. **SSE 实时桥接**：利用 Server-Sent Events (SSE) 协议在看板与插件背景脚本间建立低延迟的双向控制通道，免除第三方登录授权过期困扰。

---

## 安装步骤 (本地开发/测试版加载)

由于插件目前为开发测试版本，需通过 Chrome 的开发者模式进行“加载已解压的扩展程序”安装：

1. 打开 **Google Chrome 浏览器**。
2. 在地址栏中输入 `chrome://extensions/` 并回车，进入扩展程序管理页面。
3. 在页面右上角，开启 **“开发者模式” (Developer mode)** 开关。
4. 在页面左上角，点击 **“加载已解压的扩展程序” (Load unpacked)** 按钮。
5. 在弹出的文件选择器中，定位并选中本项目根目录下的 **`chrome-extension`** 文件夹。
6. 安装成功后，您将在列表中看到 **AI Marketing Crew Assistant** 插件。

---

## 本地联调与 E2E 测试指南

我们在项目中内置了一个商户后台模拟器和端到端测试脚本，方便您在不依赖真实平台账号的情况下验证整个闭环。

### 1. 模拟联调测试

1. 启动本地 Next.js 开发服务器：
   ```bash
   npm run dev
   ```
2. 打开 Chrome 浏览器并确保已按照上述步骤加载了插件。
3. 访问看板并登录（例如：使用测试账号 `admin@example.com` / `password123`）：
   * 地址：`http://localhost:3000/board`
   * 看板加载后，插件的 `content_amc.js` 会自动在页面 DOM 中读取当前活跃的 `brandId`，并建立 SSE 实时监控连接。
4. 在另一个标签页中打开**商户模拟器**：
   * 地址：`http://localhost:3000/mock-merchant`
5. 在模拟器页面中，选择关联同一个测试品牌，然后点击任意一条待回复评论右下角的 **“AI 自动响应测试”**。
6. 观察模拟器页面：插件将立刻捕获到后端下发的指令，在 0.5 秒内将回复注入到 `textarea` 中，并触发“手动发送”模拟点击。评论下方将实时显示 `已由 插件/AI 自动发表回复`。

### 2. 自动化 E2E 测试脚本

我们使用 Playwright 封装了全自动测试脚本，它会自动拉起独立 Chrome 实例、载入插件、模拟登录、激活看板长连接并在模拟器页面触发回复断言：

```bash
# 确保 Next.js 开发服务器已启动
node scratch/test-extension-e2e.mjs
```

测试通过后将输出：
```text
Verification Success: Review text contains "已由 插件/AI 自动发表回复"!
✨ All e2e extension tests passed successfully! ✨
```

---

## 文件结构

* `manifest.json`：定义插件元数据、所需权限（`tabs`, `scripting`, `activeTab`）以及内容脚本的匹配模式。
* `content_amc.js`：注入到看板页面（`immedi.ai` / `localhost`）的轻量级探针，用于实时监听看板状态并与插件 Background 进程进行消息中转。
* `background.js`：插件后台 Service Worker，常驻后台监听看板的执行指令，检索对应匹配的平台标签页，并将自动化 DOM 填充脚本注入目标商户页面执行。
