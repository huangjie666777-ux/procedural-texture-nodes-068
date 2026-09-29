import { useEffect, useMemo, useRef, useState } from 'react';
import { NodeEditor } from './NodeEditor';
import { TexturePreview } from '../three/TexturePreview';
import { KIND_ORDER, NODE_DEFS } from '../graph/nodes';
import { connect, createNode, deleteEdge, deleteNode, validateConnection } from '../graph/graph';
import { createExampleGraph, loadGraph, saveGraph } from '../graph/example';
import type { Edge, Graph, NodeKind, RGB } from '../graph/types';

type Shape = 'plane' | 'sphere';

function portLabel(nodeKind: NodeKind, portId: string, id: string): string {
  const def = NODE_DEFS[nodeKind];
  const port = [...def.inputs, ...def.outputs].find((p) => p.id === portId);
  return `${def.label.split(' ')[0]}.${port?.label ?? portId} (${id.slice(-4)})`;
}

export default function App() {
  const [graph, setGraph] = useState<Graph>(() => loadGraph() ?? createExampleGraph());
  const [shape, setShape] = useState<Shape>('plane');
  const [error, setError] = useState<string | null>(null);
  const [glsl, setGlsl] = useState('');
  const [showGlsl, setShowGlsl] = useState(true);
  const previewHostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<TexturePreview | null>(null);
  const firstCompile = useRef(true);

  useEffect(() => {
    if (!previewHostRef.current) return;
    const preview = new TexturePreview(previewHostRef.current);
    previewRef.current = preview;
    preview.onError = setError;
    preview.onCompiled = (result) => setGlsl(result.glslPreview);
    preview.setGraph(graph);
    return () => {
      preview.dispose();
      previewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Structural changes require shader recompilation.
  const structuralKey = useMemo(
    () => JSON.stringify({ n: graph.nodes.map((n) => [n.id, n.kind]), e: graph.edges.map((e) => [e.fromNode, e.fromPort, e.toNode, e.toPort]) }),
    [graph],
  );
  useEffect(() => {
    if (firstCompile.current) {
      firstCompile.current = false;
      return;
    }
    previewRef.current?.setGraph(graph);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structuralKey]);

  // Parameter edits only update uniforms; persist on every change for refresh recovery.
  useEffect(() => {
    previewRef.current?.updateUniforms(graph);
    saveGraph(graph);
  }, [graph]);

  useEffect(() => {
    previewRef.current?.setShape(shape);
  }, [shape]);

  const addNode = (kind: NodeKind) => {
    const node = createNode(kind, 60 + Math.random() * 120, 80 + Math.random() * 160);
    setGraph((g) => ({ nodes: [...g.nodes, node], edges: g.edges }));
  };

  const handleConnect = (candidate: Omit<Edge, 'id'>) => {
    const problem = validateConnection(graph, candidate.fromNode, candidate.fromPort, candidate.toNode, candidate.toPort);
    if (problem) {
      const from = graph.nodes.find((n) => n.id === candidate.fromNode);
      const to = graph.nodes.find((n) => n.id === candidate.toNode);
      setError(
        `${problem.message}\n源端口：${from ? portLabel(from.kind, candidate.fromPort, from.id) : problem.fromPort}\n目标端口：${to ? portLabel(to.kind, candidate.toPort, to.id) : problem.toPort}\n原连线已保留。`,
      );
      return;
    }
    setError(null);
    setGraph((g) => connect(g, candidate));
  };

  const exportPNG = async () => {
    try {
      const dataUrl = await previewRef.current!.exportPNG(1024);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'texture-1024.png';
      link.click();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className='app'>
      <aside className='sidebar'>
        <h1>纹理节点编辑器</h1>
        <div className='toolbar-group'>
          <div className='group-title'>添加节点</div>
          {KIND_ORDER.map((kind) => (
            <button key={kind} className='add-button' onClick={() => addNode(kind)}>
              + {NODE_DEFS[kind].label}
            </button>
          ))}
        </div>
        <div className='toolbar-group'>
          <div className='group-title'>场景</div>
          <div className='button-row'>
            <button className={shape === 'plane' ? 'active' : ''} onClick={() => setShape('plane')}>平面</button>
            <button className={shape === 'sphere' ? 'active' : ''} onClick={() => setShape('sphere')}>球体</button>
          </div>
          <button onClick={() => previewRef.current?.resetView()}>重置视角</button>
        </div>
        <div className='toolbar-group'>
          <div className='group-title'>文件</div>
          <button onClick={exportPNG}>导出 1024×1024 PNG</button>
          <button onClick={() => { const g = createExampleGraph(); setGraph(g); }}>恢复示例图</button>
          <button onClick={() => setShowGlsl((v) => !v)}>{showGlsl ? '隐藏' : '查看'} GLSL</button>
        </div>
        <div className='legend'>
          <div className='group-title'>端口类型</div>
          <div><i className='dot float' /> float 标量</div>
          <div><i className='dot vec2' /> vec2 二维向量</div>
          <div><i className='dot vec3' /> vec3 RGB 颜色</div>
        </div>
      </aside>
      <main className='main'>
        <section className='editor-pane'>
          <NodeEditor
            graph={graph}
            onMoveNode={(id, x, y) => setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) }))}
            onDeleteNode={(id) => setGraph((g) => deleteNode(g, id))}
            onDeleteEdge={(id) => setGraph((g) => deleteEdge(g, id))}
            onConnect={handleConnect}
            onParamChange={(id, param, value) =>
              setGraph((g) => ({
                ...g,
                nodes: g.nodes.map((n) => (n.id === id ? { ...n, params: { ...n.params, [param]: value as number | RGB } } : n)),
              }))
            }
          />
        </section>
        <section className='right-pane'>
          <div className='preview-host' ref={previewHostRef} />
          {error && <pre className='error-banner'>{error}</pre>}
          {showGlsl && <pre className='glsl-panel'>{glsl || '// 等待成功编译...'}</pre>}
        </section>
      </main>
    </div>
  );
}
