import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { compileGraph, readUniformValue, type CompileResult } from '../graph/codegen';
import type { Graph } from '../graph/types';

type Shape = 'plane' | 'sphere';

export class TexturePreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private mesh: THREE.Mesh | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private compileResult: CompileResult | null = null;
  private shape: Shape = 'plane';
  private raf = 0;
  private disposed = false;
  onError: ((message: string | null) => void) | null = null;
  onCompiled: ((result: CompileResult) => void) | null = null;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x20242c, 1);
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0, 3.2);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.resize();
    window.addEventListener('resize', this.resize);
    this.loop();
  }

  private resize = () => {
    const { clientWidth, clientHeight } = this.container;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  };

  private buildGeometry(shape: Shape): THREE.BufferGeometry {
    return shape === 'sphere'
      ? new THREE.SphereGeometry(1, 64, 48)
      : new THREE.PlaneGeometry(2, 2, 1, 1);
  }

  /** Recompile shader from graph topology. On failure keeps the previous valid preview. */
  setGraph(graph: Graph): boolean {
    this.resize();
    let result: CompileResult;
    try {
      result = compileGraph(graph);
    } catch (error) {
      this.onError?.(error instanceof Error ? error.message : String(error));
      return false;
    }

    const uniforms: Record<string, THREE.IUniform> = {};
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const spec of result.uniforms) {
      const node = nodeById.get(spec.nodeId);
      const value = node ? readUniformValue(node, spec.param, spec.type) : spec.type === 'float' ? 0 : [0, 0, 0];
      uniforms[spec.name] = { value: spec.type === 'float' ? value : new THREE.Vector2().fromArray(value as [number, number]) };
      if (spec.type === 'vec3') {
        uniforms[spec.name].value = new THREE.Vector3().fromArray(value as [number, number, number]);
      }
    }

    const candidate = new THREE.ShaderMaterial({
      vertexShader: result.vertexShader,
      fragmentShader: result.fragmentShader,
      uniforms,
      glslVersion: undefined,
    });
    const error = this.validateGLSL(result.vertexShader, result.fragmentShader);
    if (error) {
      candidate.dispose();
      this.onError?.(error);
      return false;
    }

    // Commit the candidate and release the previous GPU resources.
    const previousMaterial = this.material;
    const previousGeometry = this.mesh?.geometry ?? null;
    if (!this.mesh) {
      this.mesh = new THREE.Mesh(this.buildGeometry(this.shape), candidate);
      this.scene.add(this.mesh);
    } else {
      this.mesh.material = candidate;
    }
    this.material = candidate;
    this.compileResult = result;
    previousMaterial?.dispose();
    previousGeometry?.dispose();
    this.onError?.(null);
    this.onCompiled?.(result);
    return true;
  }

  /** Compile/link GLSL on the real GL context before accepting a new program. */
  private validateGLSL(vertex: string, fragment: string): string | null {
    const gl = this.renderer.getContext() as WebGL2RenderingContext | WebGLRenderingContext;
    const compile = (type: number, source: string): WebGLShader | string => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader) ?? '着色器编译失败';
        gl.deleteShader(shader);
        return log;
      }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, vertex);
    if (typeof vs === 'string') return vs;
    const fs = compile(gl.FRAGMENT_SHADER, fragment);
    if (typeof fs === 'string') {
      gl.deleteShader(vs);
      return fs;
    }
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    const ok = gl.getProgramParameter(program, gl.LINK_STATUS);
    const log = ok ? null : gl.getProgramInfoLog(program) ?? '着色器链接失败';
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return log;
  }

  /** Update uniform values without recompiling the shader. */
  updateUniforms(graph: Graph): void {
    if (!this.material || !this.compileResult) return;
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const spec of this.compileResult.uniforms) {
      const uniform = this.material.uniforms[spec.name];
      const node = nodeById.get(spec.nodeId);
      if (!uniform || !node) continue;
      const value = readUniformValue(node, spec.param, spec.type);
      if (spec.type === 'float') uniform.value = value;
      else if (spec.type === 'vec2') (uniform.value as THREE.Vector2).fromArray(value as [number, number]);
      else (uniform.value as THREE.Vector3).fromArray(value as [number, number, number]);
    }
  }

  setShape(shape: Shape): void {
    if (shape === this.shape) return;
    this.shape = shape;
    if (this.mesh && this.material) {
      const old = this.mesh.geometry;
      this.mesh.geometry = this.buildGeometry(shape);
      old.dispose();
    }
  }

  resetView(): void {
    this.camera.position.set(0, 0, 3.2);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  /** Render the current shader onto a full-plane UV and export a 1024x1024 PNG. */
  async exportPNG(size = 1024): Promise<string> {
    if (!this.material || !this.compileResult) throw new Error('还没有成功编译的纹理');
    const target = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    scene.add(quad);
    this.renderer.setRenderTarget(target);
    this.renderer.render(scene, camera);
    const pixels = new Uint8Array(size * size * 4);
    this.renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    this.renderer.setRenderTarget(null);
    target.dispose();
    quad.geometry.dispose();

    // readRenderTargetPixels returns rows bottom-to-top; flip for the PNG.
    const flipped = new Uint8ClampedArray(size * size * 4);
    const rowBytes = size * 4;
    for (let y = 0; y < size; y += 1) {
      flipped.set(pixels.subarray(y * rowBytes, (y + 1) * rowBytes), (size - 1 - y) * rowBytes);
    }
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const image = new ImageData(flipped, size, size);
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.controls.dispose();
    this.mesh?.geometry.dispose();
    this.material?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
