# CloudCall 面试材料

这些文档根据仓库当前代码、测试和一次本地基准重写。旧稿里出现过、但代码中不存在的说法已经删掉，包括 `useSyncExternalStore`、`replaceTrack`、`getStats` 聚合，以及“ConnectionManager 已经接上 SDK”。

## 怎么读

| 文档 | 内容 |
| --- | --- |
| [01-architecture.md](./01-architecture.md) | 业务、架构、数据流、已实现与未实现 |
| [02-ranking.md](./02-ranking.md) | 8 个技术故事的评分和取舍 |
| [03-stories.md](./03-stories.md) | 每个故事的原理、口述稿和追问 |
| [04-gaps.md](./04-gaps.md) | 面试官视角的短板和补强顺序 |
| [05-prep.md](./05-prep.md) | 项目介绍、简历表述、待测指标、技术债 |

## 使用前先确认的事实

Git 历史只有一次提交：`869866a`，作者 `omencao <omencao@tungee.com>`，说明是“初始化 CloudCall SDK 与 Playground 工作台”。没有评审记录，也没有按模块拆开的提交。

因此：

- 代码可以证明某个设计存在。
- 代码不能证明这段设计在团队里由谁拍板、谁实现。
- 如果这次提交就是你独立完成的，面试时按“我设计并实现”来讲，并主动说出缺陷。
- 如果其中有生成代码、结对或他人方案，把那一部分改成“我负责讲清并验证了……”。

下文的 Task 默认写成“这个仓库里的职责”，不默认写成“我在公司独立负责”。
