import { useEffect, useRef, useState } from "react";

const vertexShader = `#version 300 es
precision mediump float;
const vec2 positions[6] = vec2[6](
  vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0),
  vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0)
);
out vec2 uv;
void main() {
  uv = positions[gl_VertexID];
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}`;

const fragmentShader = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec3 u_primaryColor;
uniform vec3 u_secondaryColor;
uniform float u_intensity;
uniform float u_speed;
uniform float u_scale;
uniform float u_turbulence;
uniform float u_height;
uniform float u_opacity;
in vec2 uv;
out vec4 fragColor;

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}
float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 st) {
  float value = 0.0;
  float amplitude = 0.4;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(st);
    st *= 2.0;
    amplitude *= 0.4;
  }
  return value / 0.665;
}
void main() {
  vec2 st = uv * 0.5 + 0.5;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  float upward = 1.0 - st.y;
  vec2 field = vec2(st.x * max(aspect, 1.0) * 2.8, upward * 2.4 + u_time * u_speed * 0.75) * u_scale;

  float broad = fbm(field * vec2(0.48, 0.44));
  float warp = fbm(field * 0.55 + vec2(broad * u_turbulence, -u_time * 0.14));
  vec2 warpedField = field + vec2((warp - 0.5) * 3.4, (broad - 0.5) * 0.9);
  float clouds = fbm(warpedField * vec2(0.72, 0.68));
  float detail = fbm(warpedField * 1.65 + vec2(warp, -u_time * 0.24));
  float wisps = fbm(warpedField * 3.2 + vec2(broad, -u_time * 0.38));

  float contourNoise = fbm(vec2(st.x * max(aspect, 1.0) * 5.2 + warp * 2.2, -u_time * 0.16));
  float topDetail = fbm(vec2(st.x * max(aspect, 1.0) * 9.0 + detail * 2.0, -u_time * 0.24));
  float smokeTop = 0.82 - (contourNoise - 0.5) * 0.18 - (topDetail - 0.5) * 0.12;
  float smokeBody = 1.0 - smoothstep(smokeTop - 0.12, smokeTop + 0.14, st.y);
  float wispyEdge = 1.0 - smoothstep(smokeTop - 0.02, smokeTop + 0.28, st.y);
  float lowerNoise = fbm(vec2(
    st.x * max(aspect, 1.0) * 4.1 + broad * 1.3 + u_time * 0.06,
    u_time * 0.08
  ));
  float lowerEdge = 0.12 + (lowerNoise - 0.5) * 0.25 + (contourNoise - 0.5) * 0.06;
  float lowerFade = smoothstep(lowerEdge - 0.045, lowerEdge + 0.12, st.y);
  float lowerWisps = (1.0 - smoothstep(lowerEdge - 0.06, lowerEdge + 0.14, st.y))
    * smoothstep(0.55, 0.82, wisps)
    * smoothstep(0.42, 0.7, detail);

  float cloudDensity = clamp(
    0.5 + (clouds - 0.5) * 1.1 + (detail - 0.5) * 0.52 + (wisps - 0.5) * 0.2,
    0.0,
    1.0
  );
  float cloudTone = mix(0.4, 1.0, cloudDensity);
  float alpha = max(
    max(smokeBody * (0.72 + cloudDensity * 0.22), wispyEdge * wisps * 0.22) * lowerFade,
    lowerWisps * (0.1 + cloudDensity * 0.16)
  ) * u_opacity;
  float tone = mix(0.08 + cloudTone * 0.24, 0.48 + cloudTone * 0.42, smoothstep(0.12, 0.82, 1.0 - st.y));
  vec3 color = mix(u_secondaryColor, u_primaryColor, tone);
  fragColor = vec4(color, alpha);
}`;

const logos = [
  { symbol: "BTC", name: "Bitcoin", className: "home-fire-mark--btc" },
  { symbol: "ETH", name: "Ethereum", className: "home-fire-mark--eth" },
  { symbol: "TRX", name: "TRON", className: "home-fire-mark--trx" },
  { symbol: "TON", name: "Toncoin", className: "home-fire-mark--ton" },
  { symbol: "USDT", name: "Tether", className: "home-fire-mark--usdt" },
  { symbol: "SOL", name: "Solana", className: "home-fire-mark--sol" },
  { symbol: "BTC", name: "Bitcoin", className: "home-fire-mark--btc-secondary" },
  { symbol: "TRX", name: "TRON", className: "home-fire-mark--trx-secondary" },
] as const;

export function HomeFireHero() {
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="home-fire-section" aria-label="ABASSI visual centerpiece">
      <div
        className="home-fire-hero"
        role="img"
        aria-label="Illustrative animated grayscale smoke with the Bitcoin, Ethereum, TRON, Toncoin, Tether, and Solana logos."
      >
        <img className="home-fire-brand-mark" src="/abassi-mark.png" alt="" aria-hidden="true" draggable="false" />
        <div className="home-fire-canvas-wrap">
          <GrayscaleSmokeCanvas onError={setError} />
        </div>
        {logos.map(({ symbol, name, className }) => (
          <span className={`home-fire-mark ${className}`} key={className} aria-hidden="true">
            <img src={`/crypto-icons-hero/${symbol}.svg`} alt="" draggable="false" />
            <span className="sr-only">{name}</span>
          </span>
        ))}
        <span className="home-fire-caption">ILLUSTRATIVE ASSET MARKS · NO WALLET ACTIVITY IMPLIED</span>
      </div>
      {error && <p className="home-fire-error" role="status">{error}</p>}
    </section>
  );
}

function GrayscaleSmokeCanvas({ onError }: { onError: (message: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    let gl: WebGL2RenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let frameId: number | null = null;
    let frameCount = 0;
    let isVisible = true;
    let disposed = false;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

    const stopFrame = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    };

    try {
      gl = canvas.getContext("webgl2", {
        alpha: true,
        antialias: false,
        depth: false,
        premultipliedAlpha: false,
        powerPreference: "low-power",
      });
      if (!gl) throw new Error("WebGL2 is unavailable for the smoke effect on this device.");

      program = createProgram(gl);
      gl.useProgram(program);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);

      const uniforms = {
        time: gl.getUniformLocation(program, "u_time"),
        resolution: gl.getUniformLocation(program, "u_resolution"),
        primary: gl.getUniformLocation(program, "u_primaryColor"),
        secondary: gl.getUniformLocation(program, "u_secondaryColor"),
        intensity: gl.getUniformLocation(program, "u_intensity"),
        speed: gl.getUniformLocation(program, "u_speed"),
        scale: gl.getUniformLocation(program, "u_scale"),
        turbulence: gl.getUniformLocation(program, "u_turbulence"),
        height: gl.getUniformLocation(program, "u_height"),
        opacity: gl.getUniformLocation(program, "u_opacity"),
      };
      const startedAt = performance.now();

      const resize = () => {
        if (!gl) return;
        const bounds = host.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = Math.max(1, Math.round(bounds.width * ratio));
        const height = Math.max(1, Math.round(bounds.height * ratio));
        if (canvas.width === width && canvas.height === height) return;
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      };

      const draw = (timestamp: number) => {
        frameId = null;
        if (disposed || !gl) return;
        resize();
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(uniforms.time, motionPreference.matches ? 0 : (timestamp - startedAt) / 1000);
        gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
        gl.uniform3f(uniforms.primary, 1, 1, 1);
        gl.uniform3f(uniforms.secondary, 0.44, 0.45, 0.47);
        gl.uniform1f(uniforms.intensity, 1);
        gl.uniform1f(uniforms.speed, 0.22);
        gl.uniform1f(uniforms.scale, 0.85);
        gl.uniform1f(uniforms.turbulence, 0.92);
        gl.uniform1f(uniforms.height, 1);
        gl.uniform1f(uniforms.opacity, 0.96);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        canvas.dataset.frame = String(++frameCount);
        if (!motionPreference.matches && isVisible && document.visibilityState === "visible") {
          frameId = requestAnimationFrame(draw);
        }
      };

      const render = () => {
        stopFrame();
        if (!motionPreference.matches && isVisible && document.visibilityState === "visible") {
          frameId = requestAnimationFrame(draw);
        } else {
          draw(0);
        }
      };
      const handleMotionChange = () => render();
      const handleVisibilityChange = () => render();
      const handleContextLost = (event: Event) => {
        event.preventDefault();
        stopFrame();
        onError("The smoke animation paused because the graphics context was lost.");
      };

      const resizeObserver = new ResizeObserver(() => render());
      const intersectionObserver = new IntersectionObserver(([entry]) => {
        isVisible = entry.isIntersecting;
        render();
      });
      resizeObserver.observe(host);
      intersectionObserver.observe(host);
      motionPreference.addEventListener("change", handleMotionChange);
      document.addEventListener("visibilitychange", handleVisibilityChange);
      canvas.addEventListener("webglcontextlost", handleContextLost);
      onError(null);
      render();

      return () => {
        disposed = true;
        stopFrame();
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        motionPreference.removeEventListener("change", handleMotionChange);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        canvas.removeEventListener("webglcontextlost", handleContextLost);
        if (gl && program) gl.deleteProgram(program);
      };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The smoke shader could not be initialized.";
      onError(message);
      if (gl && program) gl.deleteProgram(program);
    }
  }, [onError]);

  return <canvas className="home-fire-canvas" ref={canvasRef} aria-hidden="true" />;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = compileShader(gl, vertexShader, gl.VERTEX_SHADER);
  const fragment = compileShader(gl, fragmentShader, gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error("The smoke shader program could not be created.");
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "The smoke shader could not be linked.";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function compileShader(gl: WebGL2RenderingContext, source: string, type: number): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("A smoke shader stage could not be created.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "A smoke shader stage could not be compiled.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}
