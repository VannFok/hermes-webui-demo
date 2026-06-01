import * as THREE from "./node_modules/three/build/three.module.js";

const qualitySettings = {
  low: { iterations: 24, waveIterations: 1, pixelRatio: 0.5, precision: "mediump", stepMultiplier: 1.5, targetFps: 30 },
  medium: { iterations: 40, waveIterations: 2, pixelRatio: 0.65, precision: "mediump", stepMultiplier: 1.2, targetFps: 60 },
  high: { iterations: 80, waveIterations: 4, pixelRatio: Math.min(window.devicePixelRatio || 1, 2), precision: "highp", stepMultiplier: 1.0, targetFps: 60 }
};

const defaults = {
  topColor: "#5527ff",
  bottomColor: "#d615d0",
  intensity: 1.6,
  rotationSpeed: 0.8,
  interactive: false,
  className: "",
  glowAmount: 0.005,
  pillarWidth: 3.5,
  pillarHeight: 0.1,
  noiseIntensity: 0,
  mixBlendMode: "screen",
  pillarRotation: 42,
  quality: "high"
};

export default class LightPillar {
  constructor(container, options = {}) {
    this.container = container;
    this.options = { ...defaults, ...options };
    this.mouse = new THREE.Vector2(0, 0);
    this.time = 0;
    this.lastTime = performance.now();
    this.raf = null;
    this.resizeTimer = null;
    this.mouseTimer = null;
    this.webGLSupported = this.checkWebGL();
    this.handleResize = this.handleResize.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.animate = this.animate.bind(this);
    this.init();
  }

  checkWebGL() {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  }

  effectiveQuality() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isLowEnd = isMobile || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    let quality = this.options.quality;
    if (isLowEnd && quality === "high") quality = "medium";
    if (isMobile && quality !== "low") quality = "low";
    return qualitySettings[quality] ? quality : "medium";
  }

  init() {
    if (!this.container) return;
    this.container.textContent = "";
    this.container.className = `light-pillar-container ${this.options.className}`.trim();
    this.container.style.mixBlendMode = this.options.mixBlendMode;

    if (!this.webGLSupported) {
      this.container.className = `light-pillar-fallback ${this.options.className}`.trim();
      return;
    }

    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.quality = this.effectiveQuality();
    this.settings = qualitySettings[this.quality];
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: this.quality === "high" ? "high-performance" : "low-power",
        precision: this.settings.precision,
        stencil: false,
        depth: false
      });
    } catch {
      this.webGLSupported = false;
      this.init();
      return;
    }

    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.settings.pixelRatio);
    this.container.appendChild(this.renderer.domElement);

    this.material = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: this.fragmentShader(),
      uniforms: this.uniforms(width, height),
      transparent: true,
      depthWrite: false,
      depthTest: false
    });

    this.geometry = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);
    if (this.options.interactive) this.container.addEventListener("mousemove", this.handleMouseMove, { passive: true });
    window.addEventListener("resize", this.handleResize, { passive: true });
    this.raf = requestAnimationFrame(this.animate);
  }

  uniforms(width, height) {
    const pillarRotRad = (this.options.pillarRotation * Math.PI) / 180;
    return {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(width, height) },
      uMouse: { value: this.mouse },
      uTopColor: { value: this.parseColor(this.options.topColor) },
      uBottomColor: { value: this.parseColor(this.options.bottomColor) },
      uIntensity: { value: this.options.intensity },
      uInteractive: { value: this.options.interactive },
      uGlowAmount: { value: this.options.glowAmount },
      uPillarWidth: { value: this.options.pillarWidth },
      uPillarHeight: { value: this.options.pillarHeight },
      uNoiseIntensity: { value: this.options.noiseIntensity },
      uRotCos: { value: 1 },
      uRotSin: { value: 0 },
      uPillarRotCos: { value: Math.cos(pillarRotRad) },
      uPillarRotSin: { value: Math.sin(pillarRotRad) },
      uWaveSin: { value: Math.sin(0.4) },
      uWaveCos: { value: Math.cos(0.4) }
    };
  }

  fragmentShader() {
    const settings = this.settings;
    return `
      precision ${settings.precision} float;

      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec2 uMouse;
      uniform vec3 uTopColor;
      uniform vec3 uBottomColor;
      uniform float uIntensity;
      uniform bool uInteractive;
      uniform float uGlowAmount;
      uniform float uPillarWidth;
      uniform float uPillarHeight;
      uniform float uNoiseIntensity;
      uniform float uRotCos;
      uniform float uRotSin;
      uniform float uPillarRotCos;
      uniform float uPillarRotSin;
      uniform float uWaveSin;
      uniform float uWaveCos;
      varying vec2 vUv;

      const float STEP_MULT = ${settings.stepMultiplier.toFixed(1)};
      const int MAX_ITER = ${settings.iterations};
      const int WAVE_ITER = ${settings.waveIterations};

      void main() {
        vec2 uv = (vUv * 2.0 - 1.0) * vec2(uResolution.x / uResolution.y, 1.0);
        uv = vec2(uPillarRotCos * uv.x - uPillarRotSin * uv.y, uPillarRotSin * uv.x + uPillarRotCos * uv.y);

        vec3 ro = vec3(0.0, 0.0, -10.0);
        vec3 rd = normalize(vec3(uv, 1.0));
        float rotC = uRotCos;
        float rotS = uRotSin;

        if (uInteractive && (uMouse.x != 0.0 || uMouse.y != 0.0)) {
          float a = uMouse.x * 6.283185;
          rotC = cos(a);
          rotS = sin(a);
        }

        vec3 col = vec3(0.0);
        float t = 0.1;

        for (int i = 0; i < MAX_ITER; i++) {
          vec3 p = ro + rd * t;
          p.xz = vec2(rotC * p.x - rotS * p.z, rotS * p.x + rotC * p.z);

          vec3 q = p;
          q.y = p.y * uPillarHeight + uTime;

          float freq = 1.0;
          float amp = 1.0;
          for (int j = 0; j < WAVE_ITER; j++) {
            q.xz = vec2(uWaveCos * q.x - uWaveSin * q.z, uWaveSin * q.x + uWaveCos * q.z);
            q += cos(q.zxy * freq - uTime * float(j) * 2.0) * amp;
            freq *= 2.0;
            amp *= 0.5;
          }

          float d = length(cos(q.xz)) - 0.2;
          float bound = length(p.xz) - uPillarWidth;
          float k = 4.0;
          float h = max(k - abs(d - bound), 0.0);
          d = max(d, bound) + h * h * 0.0625 / k;
          d = abs(d) * 0.15 + 0.01;

          float grad = clamp((15.0 - p.y) / 30.0, 0.0, 1.0);
          col += mix(uBottomColor, uTopColor, grad) / d;

          t += d * STEP_MULT;
          if (t > 50.0) break;
        }

        float widthNorm = uPillarWidth / 3.0;
        col = tanh(col * uGlowAmount / widthNorm);
        col -= fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) / 15.0 * uNoiseIntensity;

        gl_FragColor = vec4(col * uIntensity, 1.0);
      }
    `;
  }

  parseColor(hex) {
    const color = new THREE.Color(hex);
    return new THREE.Vector3(color.r, color.g, color.b);
  }

  handleMouseMove(event) {
    if (!this.options.interactive || this.mouseTimer) return;
    this.mouseTimer = window.setTimeout(() => {
      this.mouseTimer = null;
    }, 16);
    const rect = this.container.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.mouse.set(x, y);
  }

  handleResize() {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      if (!this.renderer || !this.material) return;
      const width = Math.max(this.container.clientWidth, 1);
      const height = Math.max(this.container.clientHeight, 1);
      this.renderer.setSize(width, height);
      this.material.uniforms.uResolution.value.set(width, height);
    }, 150);
  }

  animate(currentTime) {
    if (!this.renderer || !this.material || !this.scene || !this.camera) return;
    const frameTime = 1000 / this.settings.targetFps;
    const deltaTime = currentTime - this.lastTime;

    if (deltaTime >= frameTime) {
      this.time += 0.016 * this.options.rotationSpeed;
      this.material.uniforms.uTime.value = this.time;
      this.material.uniforms.uRotCos.value = Math.cos(this.time * 0.3);
      this.material.uniforms.uRotSin.value = Math.sin(this.time * 0.3);
      this.renderer.render(this.scene, this.camera);
      this.lastTime = currentTime - (deltaTime % frameTime);
    }

    this.raf = requestAnimationFrame(this.animate);
  }

  update(options = {}) {
    const oldQuality = this.options.quality;
    const oldInteractive = this.options.interactive;
    this.options = { ...this.options, ...options };
    this.container.style.mixBlendMode = this.options.mixBlendMode;

    if (oldQuality !== this.options.quality || oldInteractive !== this.options.interactive) {
      this.dispose();
      this.init();
      return;
    }

    if (!this.material) return;
    const uniforms = this.material.uniforms;
    uniforms.uTopColor.value = this.parseColor(this.options.topColor);
    uniforms.uBottomColor.value = this.parseColor(this.options.bottomColor);
    uniforms.uIntensity.value = this.options.intensity;
    uniforms.uInteractive.value = this.options.interactive;
    uniforms.uGlowAmount.value = this.options.glowAmount;
    uniforms.uPillarWidth.value = this.options.pillarWidth;
    uniforms.uPillarHeight.value = this.options.pillarHeight;
    uniforms.uNoiseIntensity.value = this.options.noiseIntensity;
    const pillarRotRad = (this.options.pillarRotation * Math.PI) / 180;
    uniforms.uPillarRotCos.value = Math.cos(pillarRotRad);
    uniforms.uPillarRotSin.value = Math.sin(pillarRotRad);
  }

  dispose() {
    window.removeEventListener("resize", this.handleResize);
    this.container?.removeEventListener("mousemove", this.handleMouseMove);
    window.clearTimeout(this.resizeTimer);
    window.clearTimeout(this.mouseTimer);
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      if (this.renderer.domElement.parentElement === this.container) {
        this.container.removeChild(this.renderer.domElement);
      }
    }
    this.material?.dispose();
    this.geometry?.dispose();
    this.renderer = null;
    this.material = null;
    this.geometry = null;
    this.scene = null;
    this.camera = null;
    this.raf = null;
  }
}
