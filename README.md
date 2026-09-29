# 程序化纹理节点编辑器（Procedural Texture Nodes）

在浏览器里通过连线方式创作表面图案的节点编辑器。图模型与 GLSL 生成在 TypeScript 中完成，最终着色器由 Three.js（WebGL）执行，实时预览平面或球体，并可导出 1024×1024 PNG。

## 运行

```sh
npm install
npm run dev      # 启动开发服务器（Vite，--host 0.0.0.0）
npm run build    # 类型检查 + 生产构建
npm test         # 运行 vitest 单元测试
npm run preview  # 预览生产构建
```

环境：Node.js 22.19.0、React 19.0.0、TypeScript 5.8.3、Three.js 0.180.0、Vite 6.2.0。

## 操作

- 左侧工具栏点击「+ 节点」在画布创建节点；拖动节点标题栏移动；点击节点右上角 `×` 删除（同时清除其全部关联连线）。
- 连线：从节点右侧输出圆点按下，拖到目标节点左侧输入圆点松开。每个输入至多一条线，拖入新线会替换旧线；输出可被多条线复用。
- 断开：点击已有连线即可删除。
- 鼠标左键拖动预览区域旋转视角，滚轮缩放；「平面 / 球体」切换预览网格，「重置视角」复位。
- 「查看 GLSL」面板展示从颜色输出节点裁剪后、按拓扑序生成的片元着色器；共享子图只生成一次。
- 「导出 1024×1024 PNG」用正交相机把当前着色器按平面 UV 渲染到离屏 RenderTarget，再翻转行序下载，不含预览背景或球体投影。
- 图与参数自动保存到 `localStorage`，刷新页面后恢复；「恢复示例图」载入内置棋盘 + 双色混合示例。

## 节点语义

端口类型有三种，圆点颜色区分：`float`（黄）、`vec2`（绿）、`vec3`（粉）。输入端口旁标注类型及未连接时的默认值。

| 节点 | 输入 | 输出 | 语义 / 默认值 |
| --- | --- | --- | --- |
| 数值 Number | — | float | uniform `value`，滑块/数字框调节，默认 0.5 |
| RGB 颜色 | — | vec3 | uniform `color`，取色器调节，默认 (0.8, 0.2, 0.4) |
| UV | — | vec2 | 网格内插 UV `vUv` |
| 二维缩放 Scale2D | `uv: vec2`、`scale: vec2` | vec2 | `uv * scale`；uv 默认 `(u,v)`，scale 默认 uniform `(4,4)` |
| 棋盘格 Checker | `uv: vec2` | float | `mod(floor(uv.x)+floor(uv.y), 2.0)`，按缩放后的 UV 交替输出 0/1 |
| 加法 Add | `a`、`b` | 与输入同型 | 同型相加，或 float 与 vec2/vec3 广播；未连接分量默认 0 |
| 乘法 Multiply | `a`、`b` | 与输入同型 | 同型相乘，或 float 广播；未连接分量默认 1 |
| 混合 Mix | `a`、`b`（必须同型）、`t: float` | 与 a/b 同型 | `mix(a, b, t)`；权重未连接时使用 uniform，默认 0.5 |
| 颜色输出 Output | `color: vec3 或 float` | — | 唯一终点；float 自动 `vec3(x)` 转灰度，未连接为 0.5 灰 |

类型规则：

- Add/Multiply 允许同型连接，也允许 float 标量广播到 vec2/vec3；vec2 与 vec3 混用被拒绝。
- Mix 的 a、b 必须同型（float↔float 或 vec3↔vec3），权重 t 必须是 float。
- Checker 与 Scale2D 的 UV/scale 端口只接受 vec2；Output 接受 vec3 或 float。
- 拒绝自环和任何会产生间接环的连接。非法连接会弹出提示，指明源端口与目标端口，原有连线保持不变。

## 渲染与生命周期

- 数值、颜色、缩放与默认权重都是 uniform，拖动参数只更新 uniform，不重编译着色器。
- 连线变化、节点增删（拓扑 / 种类变化）时重新生成并编译 GLSL：先用真实 WebGL 上下文编译链接校验，成功后替换 `ShaderMaterial` 和几何体，并 `dispose()` 上一份 material / geometry / render target；失败时保留上次有效预览并显示错误。
- 生成时从颜色输出节点反向裁剪，仅保留贡献到输出的节点。

## 代码结构

- `src/graph/types.ts`、`src/graph/nodes.ts`：图模型、节点/端口定义、输出类型推导规则。
- `src/graph/graph.ts`：连接校验（类型、自环、间接环）、类型推导、裁剪、增删改。
- `src/graph/codegen.ts`：依赖排序与 GLSL/uniform 生成。
- `src/graph/example.ts`：示例图与 `localStorage` 持久化。
- `src/three/TexturePreview.ts`：Three.js 场景、编译校验、uniform 更新、平面/球体切换、PNG 导出与资源释放。
- `src/ui/`：React 节点画布、端口连线交互与样式。
- `src/graph/graph.test.ts`：类型推导、广播/冲突、环、裁剪、共享子图等测试。
