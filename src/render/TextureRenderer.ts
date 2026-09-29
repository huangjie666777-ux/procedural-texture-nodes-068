import * as THREE from 'three';
import type { Graph } from '../graph/types';
import { generateGLSL, type GeneratedProgram } from '../graph/codegen';

export type PreviewShape = 'plane' | 'sphere';

export interface BuildResult {
  ok: boolean;
  error: string | null;
}

const EXPORT_SIZE = 1024;

function compileStandalone(gl: WebGLRenderingContext, type: number, source: string): string | null {
  const shader = gl.createShader(type);
  if (!shader) return '无法创建 WebGL shader';
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '未知编译错误';
    gl.deleteShader(shader);
    return log;
  }
  gl.deleteShader(shader);
  return null;
}

export class TextureRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private plane: THREE.Mesh;
  private sphere: THREE.Mesh;
  private active: THREE.Mesh;
  private material: THREE.ShaderMaterial | null = null;
  private program: GeneratedProgram | null = null;
  private shape: PreviewShape = 'plane';
  private rotX = 0;
  private rotY = 0;
  private raf = 0;
  private disposed = false;

  constructor(container: HTMLElement, graph: Graph) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1a1d24, 1);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camera.position.set(0, 0, 3.2);

    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1.25, 64, 48), new THREE.MeshBasicMaterial());
    this.sphere.visible = false;
    this.active = this.plane;
    this.scene.add(this.plane, this.sphere);

    this.resize(container);
    this.bindPointer();
    this.loop();
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.active.rotation.set(this.rotX, this.rotY, 0);
    this.renderer.render(this.scene, this.camera);
  };

  resize(container: HTMLElement): void {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setShape(shape: PreviewShape): void {
    this.shape = shape;
    const next = shape === 'plane' ? this.plane : this.sphere;
    this.active.visible = false;
    next.visible = true;
    next.rotation.set(this.rotX, this.rotY, 0);
    this.active = next;
  }

  resetView(): void {
    this.rotX = 0;
    this.rotY = 0;
  }

  private bindPointer() {
    const el = this.renderer.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    el.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.rotY += (e.clientX - lastX) * 0.01;
      this.rotX += (e.clientY - lastY) * 0.01;
      this.rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotX));
      lastX = e.clientX;
      lastY = e.clientY;
    });
    const end = () => {
      dragging = false;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /** Rebuild the shader program after structural changes. Keeps the previous good program on failure. */
  build(graph: Graph): BuildResult {
    const generated = generateGLSL(graph);
    if (!generated) return { ok: false, error: '缺少颜色输出节点，无法生成着色器' };

    const gl = this.renderer.getContext();
    const fragError = compileStandalone(gl, gl.FRAGMENT_SHADER, generated.fragmentShader);
    if (fragError) return { ok: false, error: `片元着色器编译失败：\n${fragError}` };
    const vertError = compileStandalone(gl, gl.VERTEX_SHADER, generated.vertexShader);
    if (vertError) return { ok: false, error: `顶点着色器编译失败：\n${vertError}` };

    const uniforms: Record<string, THREE.IUniform> = {};
    for (const spec of generated.uniforms) {
      uniforms[spec.name] = { value: this.uniformValue(spec.type, spec.value) };
    }
    const material = new THREE.ShaderMaterial({
      vertexShader: generated.vertexShader,
      fragmentShader: generated.fragmentShader,
      uniforms,
    });

    const old = this.material;
    this.plane.material = material;
    this.sphere.material = material;
    this.material = material;
    this.program = generated;
    this.syncUniforms(graph);
    if (old) old.dispose();
    return { ok: true, error: null };
  }

  /** Update uniform values only; no shader rebuild. */
  syncUniforms(graph: Graph): void {
    if (!this.material || !this.program) return;
    for (const spec of this.program.uniforms) {
      const node = graph.nodes.find((n) => n.id === spec.nodeId);
      if (!node) continue;
      const values = spec.keys.map((k) => node.data[k] ?? 0);
      const u = this.material.uniforms[spec.name];
      if (spec.type === 'float') {
        u.value = values[0];
      } else if (spec.type === 'vec2') {
        (u.value as THREE.Vector2).set(values[0], values[1]);
      } else {
        (u.value as THREE.Vector3).set(values[0], values[1], values[2]);
      }
    }
  }

  private uniformValue(type: string, value: number[]): number | THREE.Vector2 | THREE.Vector3 {
    if (type === 'float') return value[0];
    if (type === 'vec2') return new THREE.Vector2(value[0], value[1]);
    return new THREE.Vector3(value[0], value[1], value[2]);
  }

  getFragmentShader(): string {
    return this.program?.fragmentShader ?? '';
  }

  /** Render the active graph with plane UVs to a 1024x1024 PNG (no background / sphere projection). */
  exportPNG(): string | null {
    if (!this.material || !this.program) return null;
    const target = new THREE.WebGLRenderTarget(EXPORT_SIZE, EXPORT_SIZE, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    scene.add(quad);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.renderer.setRenderTarget(target);
    this.renderer.render(scene, camera);
    const pixels = new Uint8Array(EXPORT_SIZE * EXPORT_SIZE * 4);
    this.renderer.readRenderTargetPixels(target, 0, 0, EXPORT_SIZE, EXPORT_SIZE, pixels);
    this.renderer.setRenderTarget(null);
    target.dispose();
    quad.geometry.dispose();

    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_SIZE;
    canvas.height = EXPORT_SIZE;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(EXPORT_SIZE, EXPORT_SIZE);
    for (let row = 0; row < EXPORT_SIZE; row++) {
      const src = (EXPORT_SIZE - 1 - row) * EXPORT_SIZE * 4;
      image.data.set(pixels.subarray(src, src + EXPORT_SIZE * 4), row * EXPORT_SIZE * 4);
    }
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.material?.dispose();
    this.plane.geometry.dispose();
    this.sphere.geometry.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
