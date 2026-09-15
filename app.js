(() => {
  "use strict";

  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const finePointer = window.matchMedia("(hover:hover) and (pointer:fine)").matches;
  const coarsePointer = window.matchMedia("(pointer:coarse)").matches;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const year = document.querySelector("[data-year]");
  if (year) year.textContent = new Date().getFullYear();

  // -------------------------------------------------------------------------
  // Custom cursor
  // -------------------------------------------------------------------------
  const dot = document.querySelector(".cursor-dot");
  const ring = document.querySelector(".cursor-ring");
  let ringX = innerWidth / 2;
  let ringY = innerHeight / 2;
  let mouseX = ringX;
  let mouseY = ringY;

  if (finePointer && dot && ring) {
    document.body.classList.add("has-pointer");

    window.addEventListener("pointermove", (event) => {
      mouseX = event.clientX;
      mouseY = event.clientY;
      dot.style.left = `${mouseX}px`;
      dot.style.top = `${mouseY}px`;
    }, { passive: true });

    document.querySelectorAll("a, button").forEach((element) => {
      element.addEventListener("pointerenter", () => document.body.classList.add("cursor-hover"));
      element.addEventListener("pointerleave", () => document.body.classList.remove("cursor-hover"));
    });

    const drawCursor = () => {
      ringX += (mouseX - ringX) * 0.18;
      ringY += (mouseY - ringY) * 0.18;
      ring.style.left = `${ringX}px`;
      ring.style.top = `${ringY}px`;
      requestAnimationFrame(drawCursor);
    };

    requestAnimationFrame(drawCursor);
  }

  // -------------------------------------------------------------------------
  // Cursor-reactive character
  //
  // V5 blends the horizontal / up / down sequences continuously instead of
  // hard-switching the visible pose. This makes transitions feel much smoother
  // and avoids the “four videos stitched together” look.
  // -------------------------------------------------------------------------
  const stage = document.querySelector("[data-character]");

  if (stage) {
    const poseEls = {
      horizontal: stage.querySelector('[data-pose="horizontal"]'),
      up: stage.querySelector('[data-pose="up"]'),
      down: stage.querySelector('[data-pose="down"]')
    };

    const frameEls = {
      horizontal: [
        stage.querySelector('[data-sequence="horizontal-left"]'),
        stage.querySelector('[data-sequence="horizontal-right"]')
      ],
      up: [stage.querySelector('[data-sequence="up"]')],
      down: [stage.querySelector('[data-sequence="down"]')]
    };

    const horizontalNeutral = stage.querySelector('.horizontal-neutral');
    const horizontalLeft = stage.querySelector('.horizontal-left');
    const horizontalRight = stage.querySelector('.horizontal-right');

    const counts = {
      horizontal: 30,
      up: 28,
      down: 30
    };

    const framePath = (name, index) =>
      `assets/frames/${name}/${String(index).padStart(3, "0")}.webp`;

    const loaded = new Set();
    const preload = (src) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        loaded.add(src);
        resolve();
      };
      image.onerror = resolve;
      image.src = src;
    });

    const allFrames = [];
    Object.entries(counts).forEach(([name, count]) => {
      for (let i = 0; i < count; i += 1) allFrames.push(framePath(name, i));
    });

    const state = {
      targetX: 0,
      targetY: 0,
      x: 0,
      y: 0,
      ready: false,
      lastMove: performance.now(),
      indices: { horizontal: 0, up: 0, down: 0 },
      mix: { horizontal: 1, up: 0, down: 0 }
    };

    // Keep all pose layers present so we can crossfade them smoothly.
    Object.values(poseEls).forEach((element) => {
      if (element) element.classList.add("is-active");
    });

    Promise.all([
      preload(framePath("horizontal", 0)),
      preload(framePath("up", 0)),
      preload(framePath("down", 0))
    ]).then(() => {
      state.ready = true;
      Promise.all(allFrames.map(preload)).catch(() => {});
    });

    const setFrame = (name, normalizedAmount) => {
      const elements = frameEls[name]?.filter(Boolean) || [];
      if (!elements.length) return;

      const maxIndex = counts[name] - 1;
      const nextIndex = Math.round(clamp(normalizedAmount) * maxIndex);
      if (nextIndex === state.indices[name]) return;

      const nextSrc = framePath(name, nextIndex);
      const applyFrame = () => {
        state.indices[name] = nextIndex;
        elements.forEach((element) => { element.src = nextSrc; });
      };

      if (!loaded.has(nextSrc)) {
        preload(nextSrc).then(() => {
          if (state.indices[name] !== nextIndex) applyFrame();
        });
        return;
      }

      applyFrame();
    };

    const setHorizontalDirection = (x, amount) => {
      if (!horizontalNeutral || !horizontalLeft || !horizontalRight) return;

      // Keep left and right continuous around the center by using a broader
      // neutral bridge and gradually handing off to each side.
      const sideAmount = smoothstep(clamp((amount - 0.015) / 0.985));
      const leftIntent = x < 0 ? smoothstep(clamp((-x - 0.01) / 0.99)) * sideAmount : 0;
      const rightIntent = x > 0 ? smoothstep(clamp((x - 0.01) / 0.99)) * sideAmount : 0;
      const sideMix = Math.max(leftIntent, rightIntent);
      const neutralOpacity = 1 - sideMix;

      horizontalNeutral.style.opacity = neutralOpacity.toFixed(3);
      horizontalLeft.style.opacity = leftIntent.toFixed(3);
      horizontalRight.style.opacity = rightIntent.toFixed(3);
    };

    const setPoseBlend = (horizontal, up, down) => {
      if (poseEls.horizontal) poseEls.horizontal.style.opacity = horizontal.toFixed(3);
      if (poseEls.up) poseEls.up.style.opacity = up.toFixed(3);
      if (poseEls.down) poseEls.down.style.opacity = down.toFixed(3);
    };

    const mapPointer = (clientX, clientY) => {
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      state.targetX = clamp((clientX - rect.left) / rect.width, 0, 1) * 2 - 1;
      state.targetY = clamp((clientY - rect.top) / rect.height, 0, 1) * 2 - 1;
      state.lastMove = performance.now();
    };

    if (!reduceMotion) {
      // Desktop: follow the mouse continuously, exactly like V5.
      if (finePointer) {
        window.addEventListener("pointermove", (event) => {
          mapPointer(event.clientX, event.clientY);
        }, { passive: true });

        document.addEventListener("mouseleave", () => {
          state.targetX = 0;
          state.targetY = 0;
        });
      }

      // Mobile/tablet: there is no cursor, so touch-and-drag becomes the
      // equivalent interaction. It does not block normal vertical scrolling.
      if (coarsePointer) {
        const hero = stage.closest(".hero") || stage;

        window.addEventListener("pointerdown", (event) => {
          if (event.pointerType === "mouse") return;
          if (!hero.contains(event.target)) return;
          state.touchActive = true;
          state.touchPointerId = event.pointerId;
          mapPointer(event.clientX, event.clientY);
        }, { passive: true });

        window.addEventListener("pointermove", (event) => {
          if (!state.touchActive || event.pointerId !== state.touchPointerId) return;
          mapPointer(event.clientX, event.clientY);
        }, { passive: true });

        const endTouch = (event) => {
          if (state.touchPointerId !== null && event.pointerId !== state.touchPointerId) return;
          state.touchActive = false;
          state.touchPointerId = null;
          state.lastMove = performance.now();
        };

        window.addEventListener("pointerup", endTouch, { passive: true });
        window.addEventListener("pointercancel", endTouch, { passive: true });
      }

      window.addEventListener("blur", () => {
        state.targetX = 0;
        state.targetY = 0;
        state.touchActive = false;
        state.touchPointerId = null;
      });

      let last = performance.now();

      const animate = (now) => {
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;

        if (now - state.lastMove > 2200) {
          state.targetX *= 0.965;
          state.targetY *= 0.965;
        }

        // Smoother motion damping.
        const follow = 1 - Math.exp(-7.2 * dt);
        state.x += (state.targetX - state.x) * follow;
        state.y += (state.targetY - state.y) * follow;

        const ax = Math.abs(state.x);
        const ay = Math.abs(state.y);
        const overall = Math.max(ax, ay);

        const horizontalAmount = smoothstep(clamp((ax - 0.035) / 0.88));
        const verticalAmount = smoothstep(clamp((ay - 0.035) / 0.88));

        // Instead of hard pose switching, compute a smooth directional blend.
        const verticalBias = smoothstep(clamp((ay - ax + 0.16) / 0.44));
        const movementBias = smoothstep(clamp((overall - 0.03) / 0.22));

        let rawHorizontal = 1 - (verticalBias * movementBias);
        let rawUp = state.y < 0 ? verticalBias * movementBias : 0;
        let rawDown = state.y > 0 ? verticalBias * movementBias : 0;

        // Keep the neutral horizontal layer dominant near the center.
        if (overall < 0.09) {
          rawHorizontal = 1;
          rawUp = 0;
          rawDown = 0;
        }

        const total = rawHorizontal + rawUp + rawDown || 1;
        const targetMix = {
          horizontal: rawHorizontal / total,
          up: rawUp / total,
          down: rawDown / total
        };

        const blendFollow = 1 - Math.exp(-10.5 * dt);
        state.mix.horizontal += (targetMix.horizontal - state.mix.horizontal) * blendFollow;
        state.mix.up += (targetMix.up - state.mix.up) * blendFollow;
        state.mix.down += (targetMix.down - state.mix.down) * blendFollow;

        const mixTotal = state.mix.horizontal + state.mix.up + state.mix.down || 1;
        state.mix.horizontal /= mixTotal;
        state.mix.up /= mixTotal;
        state.mix.down /= mixTotal;

        if (state.ready) {
          setFrame("horizontal", horizontalAmount);
          setFrame("up", verticalAmount);
          setFrame("down", verticalAmount);

          setHorizontalDirection(state.x, horizontalAmount);
          setPoseBlend(state.mix.horizontal, state.mix.up, state.mix.down);
        }

        requestAnimationFrame(animate);
      };

      requestAnimationFrame(animate);
    }
  }

  // -------------------------------------------------------------------------
  // Scroll reveals
  // -------------------------------------------------------------------------
  const reveals = [...document.querySelectorAll(".reveal")];

  if (reduceMotion || !("IntersectionObserver" in window)) {
    reveals.forEach((element) => element.classList.add("is-visible"));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    reveals.forEach((element) => observer.observe(element));
  }
})();
