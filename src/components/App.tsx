import { useEffect, useMemo, useRef, useState } from 'react';
import { generateGLSL } from '../graph/codegen';
import { checkerExample, twoToneExample } from '../graph/examples';
import {
  addEdge,
  addNode,
  deleteNode,
  disconnectInput,
  moveNode,
  updateNodeData,
} from '../graph/graph';
import { loadGraph, saveGraph } from '../graph/storage';
import type { Graph, NodeKind, PortRef } from '../graph/types';
import { NodeCanvas } from './NodeCanvas';
import { Inspector } from './Inspector';
import { TextureRenderer, type PreviewShape } from '../render/TextureRenderer';

const PALETTE: { kind: NodeKind; label: string }[] = [
  { kind: 'number', label: '数值' },
  { kind: 'color', label: 'RGB 颜色' },
  { kind: 'uv', label: 'UV' },
  { kind: 'scale2d', label: '二维缩放' },
  { kind: 'checker', label: '棋盘格' },
  { kind: 'add', label: '加法' },
  { kind: 'mul', label: '乘法' },
  { kind: 'mix', label: '混合' },
  { kind: 'output', label: '颜色输出' },
];

function signature(g: Graph): string {
  return JSON.stringify({ n: g.nodes.map((x) => [x.id, x.kind]), e: g.edges });
}

export function App() {
  const [graph, setGraph] = useState<Graph>(() => loadGraph());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shape, setShape] = useState<PreviewShape>('plane');
  const [error, setError] = useState<string | null>(null);
  const [showGlsl, setShowGlsl] = useState(true);
  const previewRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<TextureRenderer | null>(null);
  const sigRef = useRef('');

  const glsl = useMemo(() => generateGLSL(graph)?.fragmentShader ?? '', [graph]);

  useEffect(() => {
    if (!previewRef.current) return;
    const renderer = new TextureRenderer(previewRef.current, graph);
    rendererRef.current = renderer;
    const result = renderer.build(graph);
    sigRef.current = signature(graph);
    setError(result.error);
    const onResize = () => renderer.resize(previewRef.current!);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    saveGraph(graph);
    const sig = signature(graph);
    if (sig === sigRef.current) {
      renderer.syncUniforms(graph);
      return;
    }
    const result = renderer.build(graph);
    if (result.ok) {
      sigRef.current = sig;
      setError(null);
    } else {
      setError(result.error);
    }
  }, [graph]);

  useEffect(() => {
    rendererRef.current?.setShape(shape);
  }, [shape]);

  const handleAdd = (kind: NodeKind) => {
    const result = addNode(graph, kind, 120 + Math.random() * 120, 120 + Math.random() * 80);
    setGraph(result.graph);
    setSelectedId(result.node.id);
  };

  const handleConnect = (from: PortRef, to: PortRef) => {
    setGraph((prev) => {
      const result = addEdge(prev, from, to);
      if (result.error) setError('端口 ' + to.node + '/' + to.port + '：' + result.error.message + '（原连线保留）');
      return result.graph;
    });
  };

  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;

  const handleExport = () => {
    const url = rendererRef.current?.exportPNG() ?? null;
    if (!url) {
      setError('当前没有可导出的有效着色器');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = 'texture-1024.png';
    a.click();
  };

  const loadExample = (which: 'checker' | 'twotone') => {
    setError(null);
    setGraph(which === 'checker' ? checkerExample() : twoToneExample());
  };

  return (
    <div className="app">
      <header className="topbar">
        <strong>程序化纹理节点编辑器</strong>
        <span className="spacer" />
        <button onClick={() => loadExample('checker')}>棋盘示例</button>
        <button onClick={() => loadExample('twotone')}>双色混合示例</button>
        <button onClick={handleExport}>导出 1024 PNG</button>
      </header>
      <div className="main">
        <aside className="left-panel">
          <h3>添加节点</h3>
          {PALETTE.map((p) => (
            <button key={p.kind} className="palette-btn" onClick={() => handleAdd(p.kind)}>
              ＋ {p.label}
            </button>
          ))}
          <h3>选中参数</h3>
          <Inspector node={selected} onData={(id, data) => setGraph((g) => updateNodeData(g, id, data))} />
        </aside>
        <section className="canvas-wrap">
          <NodeCanvas
            graph={graph}
            selectedId={selectedId}
            onMoveNode={(id, x, y) => setGraph((g) => moveNode(g, id, x, y))}
            onConnect={handleConnect}
            onDisconnectInput={(to) => setGraph((g) => disconnectInput(g, to))}
            onDeleteNode={(id) => setGraph((g) => deleteNode(g, id))}
            onSelect={setSelectedId}
          />
        </section>
        <aside className="right-panel">
          <h3>实时预览（GPU）</h3>
          <div className="shape-switch">
            <button className={shape === 'plane' ? 'active' : ''} onClick={() => setShape('plane')}>平面</button>
            <button className={shape === 'sphere' ? 'active' : ''} onClick={() => setShape('sphere')}>球体</button>
            <button onClick={() => rendererRef.current?.resetView()}>复位</button>
          </div>
          <div className="preview" ref={previewRef} />
          <p className="muted">在预览上按住拖动可旋转观察。</p>
          <div className="glsl-head">
            <h3>生成的 GLSL</h3>
            <button onClick={() => setShowGlsl((v) => !v)}>{showGlsl ? '收起' : '查看'}</button>
          </div>
          {showGlsl && <pre className="glsl">{glsl || '（无有效输出）'}</pre>}
        </aside>
      </div>
      {error && (
        <footer className="error-bar" onClick={() => setError(null)}>
          ⚠ {error}（点击关闭；预览保留上次有效程序）
        </footer>
      )}
    </div>
  );
}
