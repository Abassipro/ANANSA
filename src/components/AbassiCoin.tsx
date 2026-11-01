import { useEffect, useRef, useState } from "react";
import type * as THREE from "three";

interface AbassiCoinProps {
  compact?: boolean;
}

export function AbassiCoin({ compact = false }: AbassiCoinProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [webglAvailable, setWebglAvailable] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let disposeScene = () => {};
    void import("three").then((THREE) => {
      if (disposed) return;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: "low-power",
          failIfMajorPerformanceCaveat: true,
        });
      } catch {
        setWebglAvailable(false);
        return;
      }

      setWebglAvailable(true);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0, 5.4);

    const coin = new THREE.Group();
    scene.add(coin);

    const baseShape = new THREE.Shape();
    baseShape.absarc(0, 0, 0.88, 0, Math.PI * 2, false);
    const geometry = new THREE.ExtrudeGeometry(baseShape, {
      depth: 0.12,
      steps: 1,
      bevelEnabled: true,
      bevelThickness: 0.035,
      bevelSize: 0.025,
      bevelSegments: 4,
      curveSegments: 88,
    });
    geometry.translate(0, 0, -0.06);
    const body = new THREE.Mesh(
      geometry,
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#e9eaed"),
        metalness: 0.84,
        roughness: 0.24,
        clearcoat: 0.6,
        clearcoatRoughness: 0.23,
      }),
    );
    coin.add(body);

    const rimMaterial = new THREE.MeshStandardMaterial({
      color: "#fafafa",
      metalness: 0.92,
      roughness: 0.23,
    });
    const outerRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.825, 0.018, 8, 96),
      rimMaterial,
    );
    outerRim.position.z = 0.075;
    coin.add(outerRim);

    const innerRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.007, 6, 96),
      new THREE.MeshStandardMaterial({
        color: "#a7acb4",
        metalness: 0.84,
        roughness: 0.3,
      }),
    );
    innerRim.position.z = 0.092;
    coin.add(innerRim);

    let logoTexture: THREE.Texture | null = null;
    let isDisposed = false;
    const loader = new THREE.TextureLoader();
    loader.load(
      "/abassi-mark.png",
      (texture) => {
        if (isDisposed) {
          texture.dispose();
          return;
        }
        logoTexture = texture;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        const emblem = new THREE.Mesh(
          new THREE.PlaneGeometry(0.94, 0.94),
          new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        emblem.position.z = 0.101;
        coin.add(emblem);
      },
      undefined,
      () => {
        if (!isDisposed) setWebglAvailable(false);
      },
    );

    scene.add(new THREE.HemisphereLight("#ffffff", "#68768c", 2.1));
    const keyLight = new THREE.DirectionalLight("#ffffff", 5.2);
    keyLight.position.set(-2, 3, 4);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight("#ffffff", 2.4);
    rimLight.position.set(3, 0, -3);
    scene.add(rimLight);

    const stage = new THREE.Group();
    stage.add(coin);
    scene.remove(coin);
    scene.add(stage);
    stage.rotation.x = -0.2;
    stage.rotation.z = -0.12;

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.max(1, entry.contentRect.width);
      const height = Math.max(1, entry.contentRect.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(host);

    let isVisible = true;
    let frame = 0;
    let previousTimestamp = 0;
    let targetX = -0.2;
    let targetY = 0;
    let prefersStatic = reducedMotion.matches;

    const observer = new IntersectionObserver(([entry]) => {
      isVisible = Boolean(entry?.isIntersecting);
      if (isVisible && !prefersStatic && !document.hidden && frame === 0) {
        frame = requestAnimationFrame(render);
      }
    });
    observer.observe(host);

    const render = (timestamp = 0) => {
      frame = 0;
      if (isDisposed || !isVisible || document.hidden) return;
      const delta = Math.min((timestamp - previousTimestamp) / 1000, 0.05);
      previousTimestamp = timestamp;
      if (!prefersStatic) {
        const idleTurn = Math.sin(timestamp * 0.00032) * 0.12;
        stage.rotation.x += (targetX - stage.rotation.x) * Math.min(delta * 3, 1);
        stage.rotation.y += (targetY + idleTurn - stage.rotation.y) * Math.min(delta * 3, 1);
        stage.rotation.z += (-0.12 - stage.rotation.z) * Math.min(delta * 3, 1);
        stage.position.y = Math.sin(timestamp * 0.0008) * 0.025;
      }
      renderer.render(scene, camera);
      if (!prefersStatic) frame = requestAnimationFrame(render);
    };

    if (!prefersStatic) frame = requestAnimationFrame(render);
    else renderer.render(scene, camera);

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const bounds = host.getBoundingClientRect();
      targetY = ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.28;
      targetX = -0.2 + ((event.clientY - bounds.top) / bounds.height - 0.5) * 0.16;
    };
    const resetPointer = () => {
      targetX = -0.2;
      targetY = 0;
    };
    const onVisibilityChange = () => {
      if (!document.hidden && isVisible && !prefersStatic && frame === 0) {
        previousTimestamp = 0;
        frame = requestAnimationFrame(render);
      }
    };
    const onMotionChange = (event: MediaQueryListEvent) => {
      prefersStatic = event.matches;
      if (prefersStatic) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        renderer.render(scene, camera);
      } else if (isVisible && !document.hidden && frame === 0) {
        previousTimestamp = 0;
        frame = requestAnimationFrame(render);
      }
    };

    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerleave", resetPointer);
    document.addEventListener("visibilitychange", onVisibilityChange);
    reducedMotion.addEventListener("change", onMotionChange);

      disposeScene = () => {
      isDisposed = true;
      if (frame) cancelAnimationFrame(frame);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", resetPointer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      reducedMotion.removeEventListener("change", onMotionChange);
      observer.disconnect();
      resizeObserver.disconnect();
      geometry.dispose();
      rimMaterial.dispose();
      body.material.dispose();
      coin.traverse((object) => {
        if (object instanceof THREE.Mesh && object !== body) {
          object.geometry.dispose();
          if (object.material !== rimMaterial) {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
        }
      });
      logoTexture?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      };
    }).catch((error: unknown) => {
      if (disposed) return;
      setWebglAvailable(false);
      console.warn("The ABASSI coin scene could not be loaded.", error);
    });

    return () => {
      disposed = true;
      disposeScene();
    };
  }, []);

  return (
    <div
      className={`abassi-coin${compact ? " abassi-coin--compact" : ""}`}
      role="img"
      aria-label="Decorative three-dimensional silver ABASSI coin illustration"
    >
      <div className="coin-glow" aria-hidden="true" />
      <div className="coin-fallback" data-webgl-fallback={!webglAvailable}>
        <div className="coin-fallback-inner">
          <img src="/abassi-mark.png" alt="" width="110" height="110" />
        </div>
      </div>
      <div
        ref={hostRef}
        className="coin-canvas"
        aria-hidden="true"
        data-webgl-available={webglAvailable}
      />
      <span className="coin-caption" aria-hidden="true">ABASSI · CONCEPT ART</span>
    </div>
  );
}
