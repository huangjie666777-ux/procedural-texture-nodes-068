# Procedural Texture Nodes

面向美术的程序化纹理节点编辑器：在节点画布上连线，实时生成 GLSL 并在 Three.js（WebGL）平面 / 球体上预览，支持导出 1024×1024 PNG。

## 启动

```sh
npm install
npm run dev       # 开发服务器
npm run build     # 类型检查 + 生产构建
npm test          # Vitest 单元测试
npm run preview   # 预览生产构建
```

环境：Node.js 22、React 19、TypeScript 5.8、Three.js 0.180、Vite 6。

## 节点语义

| 节点 | 输入（默认值） | 输出 | 说明 |
| --- | --- | --- | --- |
| 数值 | — | float | 可编辑 uniform，范围 0~2 |
| RGB 颜色 | — | vec3 | 取色器 + 各通道滑杆，uniform |
| UV | — | vec2 | 模型 UV（平面为 0~1 覆盖） |
| 二维缩放 | in: vec2 = UV，scale: vec2 = (1,1) | vec2 | 节点自带 sx/sy uniform，连接后以输入为准 |
| 棋盘格 | uv: vec2 = UV，scale: vec2 = (4,4) | float | mod(floor(u*s.x)+floor(v*s.y),2)，在 0 / 1 间交替 |
| 加法 | a = 0，b = 0（同型多态） | 与输入同型 | 同型相加；float 与 vec2/vec3 时标量广播 |
| 乘法 | a = 1，b = 1（同型多态） | 与输入同型 | 同上，标量广播 |
| 混合 | a = 0，b = 1，factor: float = 0.5 | 与 a/b 同型 | a、b 同型或其一为 float；权重必须是 float |
| 颜色输出 | color: float/vec3 = 灰 0.5 | — | 唯一终点；float 以 vec3(x) 转灰度，vec2 不可接入 |

端口圆点颜色即类型：蓝 float、黄 vec2、粉 vec3；加法/乘法/混合的数据口标注“同型”，表示按连线推导。每个输入旁标注未连接时的默认值。

## 类型与连线规则

- 每个输入至多一条连线（重复连接会替换旧线）；输出可被任意多个输入复用。
- 拒绝：固定端口的类型冲突（如 vec3 接入需要 vec2 的输入）；加法/乘法两端都是非标量且类型不同（vec2 与 vec3）；混合权重非 float；自环；间接环路。
- 拒绝时错误条指出目标端口，且原连线保持不变。
- 删除节点会同时删除与它相连的所有边。
- GLSL 只从“颜色输出”做依赖反向裁剪，无关节点不生成；共享子图只 emit 一次（变量按节点 ID 命名复用）。

## 操作

- 左侧面板点击按钮在画布上创建节点；拖动节点标题栏移动；点 × 删除节点（自动清除关联连线）。
- 连线：按住输出端口圆点拖到输入端口；反向从输入拖到输出也可以。
- 断开：按住已连接的输入圆点拖到空白处松开；或点击连线中点的 ✕。
- 选中节点后在左下方面板调参数（数值 / 颜色 / 缩放）。
- 右侧切换平面 / 球体，在预览上按住拖动旋转，点“复位”回正。
- “生成的 GLSL”面板可随时查看当前片元着色器。

## 渲染生命周期

- 参数（数值、颜色、缩放）走 uniform 更新，不重编译。
- 连线或节点种类变化才重新生成并编译着色器；新程序编译成功后才替换到模型，旧 ShaderMaterial 立即 dispose。
- 编译失败时错误显示在底部，画布继续使用上一个有效程序。
- 导出使用正交相机 + 独立平面，按平面 UV 离屏渲染到 1024×1024 渲染目标，翻转 Y 行序后输出 PNG，不含预览背景，也不是球体投影或 CPU 逐像素计算。
- 图与参数持久化到 localStorage，刷新页面自动恢复；顶栏可载入“棋盘示例”和“双色混合示例”。

## 代码结构

```
src/
  graph/types.ts       图、节点、端口模型
  graph/nodes.ts       节点定义、端口类型与默认值
  graph/graph.ts       增删改、连线校验（类型 / 自环 / 间接环）
  graph/codegen.ts     依赖裁剪、类型推导、GLSL 与 uniform 生成
  graph/examples.ts    棋盘 / 双色混合示例
  graph/storage.ts     localStorage 持久化
  graph/graph.test.ts  类型规则、环、裁剪、共享子图测试
  render/TextureRenderer.ts  Three.js 生命周期、编译替换、预览、PNG 导出
  components/          React 画布、节点、连线、检查器、主编排
```
