# 第一阶段：发布 HTML 网页版

当前目录是可直接部署的静态网页项目。发布后，访问者在浏览器打开网址即可使用；微信小程序属于第二阶段。

## 1. 准备仓库

在 GitHub 新建仓库，例如 `fret-notes`。使用 GitHub Free 时，采用公开仓库发布 Pages。已有仓库也可以使用。

解压「弦记-GitHub发布包.zip」，将解压后的文件上传到仓库根目录。**不要把 ZIP 文件本身当作网站上传，也不要额外套一层 `fret-notes` 文件夹。**

最少需要保留以下文件的相对位置：

```text
仓库根目录/
├── index.html
├── styles.css
├── logic.js
├── audio.js
├── app.js
└── .nojekyll
```

发布包同时包含说明、测试和构建脚本，可一起上传，以保留完整源码。`.nojekyll` 是空文件，上传时注意不要漏掉隐藏文件。

仓库根目录的 `index.html` 是在线入口；`dist/弦记.html` 是本地下载使用的单文件版本。

## 2. 启用 GitHub Pages

1. 确保上述文件已经提交到仓库的发布分支。
2. 打开仓库 `Settings → Pages`。
3. 在 `Build and deployment → Source` 选择 `Deploy from a branch`。
4. 选择实际包含这些文件的分支，例如 `main`；目录选择 `/ (root)`。
5. 点击 `Save`，等待本次 Pages 发布完成，使用设置页显示的站点地址。

若账户、组织或仓库策略限制 Pages，以仓库设置页的实际提示为准。

普通项目仓库的网址形式通常是：

```text
https://你的用户名.github.io/仓库名/
```

分享 Pages 站点地址，访问者即可进入网页。仓库地址用于查看源码。

## 3. 发布后的检查

- 打开首页，确认样式和三个导航页面正常。
- 进入「指板地图」，应看到 0–12 品、6 根弦，共 78 个位置。
- 将「点击发声」设为开，依次试听几个自然音与升降音；5 弦 3 品应为 C3，2 弦 1 品应为 C4。
- 开启「唱名」，检查设备本地语音能否朗读唱名；无可用语音时，参考音和唱名文字应仍可使用。
- 完成一轮练习，刷新后检查进度是否保留；在「我的进度」中导出备份。
- 用实际手机浏览器检查横向滑动、点击发声和界面布局。

当前已完成自动化逻辑与模拟音频检查，真实浏览器及手机听感仍需实际验收。

## 4. 后续更新

网页使用源码文件直接运行。修改 `index.html`、`styles.css`、`logic.js`、`audio.js` 或 `app.js` 后，将更新提交到同一发布分支即可触发 Pages 更新。

如果也要更新单文件下载版，在本目录执行：

```powershell
node build.cjs
```

重新生成的文件位于 `dist/弦记.html`。运行已有测试可使用：

```powershell
node --test "tests/*.test.cjs"
```

学习记录保存在每个访问者的浏览器中。电脑、手机和不同浏览器之间目前不会自动同步；从本地 HTML 文件迁移到在线网址时，先导出再恢复备份。首次在线打开仍需要访问站点，当前未添加离线网页缓存机制。

## 官方说明

- [配置 GitHub Pages 发布源](https://docs.github.com/zh/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [创建 GitHub Pages 站点](https://docs.github.com/zh/pages/getting-started-with-github-pages/creating-a-github-pages-site)
