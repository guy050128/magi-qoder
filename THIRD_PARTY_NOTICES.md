# 来源、第三方素材与许可说明

本文件记录源码和素材的来源，以及本次整理能够确认的许可信息。公开仓库不代表这些内容统一适用某个开源许可证。

## 上游项目

- 源码基于 [hirakujira/MAGI-System](https://github.com/hirakujira/MAGI-System)。保留并扩展其 MAGI 控制台、主机角色、提示词及裁决实现。
- 上游原始 README 保存在 [docs/upstream](docs/upstream)，用于保留原作者说明与致谢；其中旧的 API 配置和运行步骤不适用于当前 Qoder 版本，当前操作以仓库根目录文档为准。
- 截至本次整理（2026-11-02），上游仓库未提供可确认的项目级 `LICENSE`。本仓库没有据此补写 MIT、Apache 等授权，也不宣称已取得上游代码的通用再许可权。

## EVA 同人内容与参考画面

这是致敬《新世纪福音战士》的非官方同人项目，与原作权利人不存在官方关联。Evangelion、NERV、MAGI、角色名称及相关概念、图像的权利属于各自权利人；本仓库不声称拥有这些权利。

[public/eva/frame-data.js](public/eva/frame-data.js) 内嵌了参考片段导出的图像帧，**这些帧不是本项目的原创画面**。来源页面、媒体链接、尺寸、帧时间及校验信息记录于 [public/eva/attribution.json](public/eva/attribution.json)；其中防卫演算片段来源页面为 [Tenor](https://tenor.com/view/neon-genesis-evangelion-screen-calculate-anime-gif-17152243)。公开可访问与来源标注均不等于授予再分发许可。

部分动画为参考原作风格的重建，不能据此称为原片的逐帧完整复刻。`attribution.json` 中的路径与说明也包含制作时的来源记录，不代表所有原始媒体或字体文件都随仓库分发。

## 字体

| 文件 / 字体 | 来源与已知许可 |
| --- | --- |
| `public/fonts/TsukuhouShogoMin.woff2` | 继承自上游项目。本次整理尚未找到随附且可核对的该字体许可文件，不将其标为可自由使用或再分发。 |
| `public/fonts/MagiReferenceLabels.woff` | 基于 Noto Serif JP Black 900 制作的字形子集，使用名称「MAGI Reference Labels」。随附 [SIL Open Font License 1.1](public/fonts/MagiReferenceLabels-OFL.txt)，来源与处理方式见 `attribution.json` 的 `headerDisplay`。不是原作 Matisse 字体文件。字体文件中保留的版权声明为 `(c) 2017-2024 Adobe (http://www.adobe.com/).`，已同时保留在随附许可文本中。 |
| Matisse / EVA Matisse、Times、Helvetica、Arial 等 | CSS 以 `local()` 或系统字体族引用用户设备上的可用字体；没有因此分发这些商业或系统字体文件。具体使用角色见 `public/eva/fonts.css` 与来源记录。 |

## 软件依赖

本项目使用 Next.js、React、Tailwind CSS、TypeScript 等第三方软件。具体依赖版本记录于 [package.json](package.json) 和 [package-lock.json](package-lock.json)，各依赖及其传递依赖保留各自的版权与许可，详见安装包随附的 `LICENSE`、`NOTICE` 等文件。本文件不替代这些许可文本。

Qoder Cloud Agents 是外部服务；本项目只提供客户端集成，不包含其模型、服务实现或账户额度，也不代表 Qoder 的官方项目。
