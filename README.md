# 基础计算训练系统 - 微信小程序版

这是「基础计算训练系统」的微信小程序版本，从 Web 版（Vue3 + TypeScript + Dexie）**迁移**而来。

## 技术栈

- 原生小程序（WXML / WXSS / JavaScript），无第三方框架、无 TypeScript 编译
- 数据存储：`wx.setStorageSync`（本地优先，训练数据仅保存在本机）
- 算法层：从 Web 版纯 TS 逻辑**转译**为 CommonJS 模块，逻辑零改动

## 目录结构

```
├── app.js / app.json / app.wxss     # 全局
├── project.config.json / sitemap.json
├── utils/                            # 算法层 + 数据层 + 服务层（从 Web 版转译）
│   ├── config.js                     # 常量与默认配置
│   ├── id.js / format.js / random.js / timer.js
│   ├── calculator.js / validator.js  # 五除三 计算与校验
│   ├── calculator-sas.js / validator-sas.js / generator-sas.js  # 正负运算
│   ├── generator-f53.js              # 五除三 题目生成
│   ├── registry.js                   # 模块注册表
│   ├── grading.js / statistics.js / weakPattern.js / diagnosis.js
│   ├── trainingSession.js / training.js  # 训练编排
│   ├── queries.js                    # 页面读取服务
│   ├── aiAnalysis.js                 # AI 分析（前端直连）
│   └── storage.js                    # wx.storage 封装的 repository 层（替代 Dexie）
└── pages/                            # 14 个页面
    ├── home / basic                  # 首页 / 基础计算
    ├── five-divide-three / signed-add-sub  # 两个训练模块入口
    ├── training / result             # 训练中 / 训练结果
    ├── wrong / history / weak        # 错题本 / 训练记录 / 薄弱点
    ├── diagnosis / ai                # 能力诊断 / AI 解读
    ├── profile / settings            # 个人数据 / 设置
    └── coming-soon
```

## 如何导入运行

1. 打开**微信开发者工具**
2. 选择「导入项目」，目录选择本项目根目录
3. AppID 填写你自己的小程序 AppID（或使用测试号）
4. 即可预览运行

> `project.config.json` 里的 `appid` 当前为 `touristappid`（游客模式占位），
> 你需要替换为自己的小程序 AppID。

## 与原 Web 版的主要差异

| 项目 | Web 版 | 小程序版 |
|---|---|---|
| UI 框架 | Vue 3 + `<template>` | WXML/WXSS |
| 路由 | Vue Router + 导航守卫 | 原生页面栈 |
| 存储 | Dexie（IndexedDB，8 张表） | `wx.setStorageSync` |
| AI 请求 | fetch + local_proxy | `wx.request` 前端直连 |
| 计时 | `performance.now()` | `wx.getPerformance()` / `Date.now()` |
| 核心算法 | 纯 TS | 转译为 CommonJS，逻辑一致 |

## AI 配置说明

AI 解读采用**前端直连** deepseek（或其他 OpenAI 兼容接口）：

1. 进入「设置 → AI 解读」，开启 AI
2. 填写接口地址（默认 `https://api.deepseek.com`）、API Key、模型名称（如 `deepseek-chat`）
3. 勾选「同意发送聚合统计」，点击「测试连接」

> ⚠️ **安全提示**：前端直连会把 API Key 随请求发送，存在被反编译/抓包泄露的风险。
> 正式上线建议改用**微信云开发云函数**中转，把 Key 放在云端。

> ⚠️ **域名配置**：真机上 `wx.request` 需要在小程序后台「开发设置 → 服务器域名」中
> 配置合法的 HTTPS 域名（需备案）。开发工具里可勾选「不校验合法域名」调试。

## 功能清单

- 五除三（五位数 ÷ 三位数）：训练模式 / 竞速模式
- 正负运算（两位数加减含负数）：训练模式 / 竞速模式
- 错题本：自动记录、标记掌握、错题重练
- 薄弱点分析：按除数范围自动发现、定向强化
- 能力诊断：长期基线与近期变化（本地计算）
- AI 解读：自然语言解释薄弱范围（可选）
- 个人数据：模块分布饼状图、训练记录、收藏
- 设置：训练参数、薄弱点阈值、AI 配置、数据管理
