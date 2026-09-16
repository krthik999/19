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

  // -------------------------------------------------------------------------
  // Education video
  // Play exactly once whenever the Education section becomes the active view.
  // When the user leaves the section, pause and reset it to the beginning so
  // returning to Education starts a fresh one-time playback.
  // -------------------------------------------------------------------------
  const educationVideo = document.querySelector('[data-education-video]');
  const educationSection = document.getElementById('education');

  if (educationVideo && educationSection) {
    let educationIsActive = false;

    educationVideo.controls = false;
    educationVideo.loop = false;
    educationVideo.muted = true;

    const playEducationVideo = () => {
      if (educationIsActive) return;
      educationIsActive = true;

      educationVideo.pause();
      try { educationVideo.currentTime = 0; } catch (_) {}

      const playPromise = educationVideo.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // Muted inline playback is normally allowed. If a browser delays
          // loading, retry once the video has enough data.
          const retry = () => {
            if (!educationIsActive) return;
            try { educationVideo.currentTime = 0; } catch (_) {}
            educationVideo.play().catch(() => {});
          };
          educationVideo.addEventListener('canplay', retry, { once: true });
        });
      }
    };

    const resetEducationVideo = () => {
      if (!educationIsActive) return;
      educationIsActive = false;
      educationVideo.pause();
      try { educationVideo.currentTime = 0; } catch (_) {}
    };

    if ('IntersectionObserver' in window) {
      const educationVideoObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.52) {
          playEducationVideo();
        } else if (!entry.isIntersecting || entry.intersectionRatio < 0.24) {
          resetEducationVideo();
        }
      }, {
        threshold: [0, 0.24, 0.52, 0.72]
      });

      educationVideoObserver.observe(educationSection);
    } else {
      // Fallback for older browsers.
      playEducationVideo();
    }
  }

})();

// ---------------------------------------------------------------------------
// V10 portfolio-wide carousel navigation + horizontal carousels
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// V11 premium portfolio carousel system — no arrow controls
// ---------------------------------------------------------------------------
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slides = [...document.querySelectorAll('.portfolio-slide')];
  const dotsHost = document.querySelector('[data-section-dots]');
  const currentLabel = document.querySelector('[data-section-current]');
  const sectionName = document.querySelector('[data-section-label]');
  let activeSectionIndex = 0;

  const pad = (n) => String(n + 1).padStart(2, '0');

  // -----------------------------------------------------------------------
  // Vertical section rail: click a rail segment to move between sections.
  // -----------------------------------------------------------------------
  if (slides.length && dotsHost) {
    slides.forEach((slide, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'section-nav-dot';
      button.setAttribute('aria-label', `Go to ${slide.dataset.slideLabel || `section ${index + 1}`}`);
      button.addEventListener('click', () => {
        slide.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      });
      button.addEventListener('pointerenter', () => document.body.classList.add('cursor-hover'));
      button.addEventListener('pointerleave', () => document.body.classList.remove('cursor-hover'));
      dotsHost.appendChild(button);
    });

    const dots = [...dotsHost.children];
    const activateSection = (index) => {
      activeSectionIndex = Math.max(0, Math.min(slides.length - 1, index));
      slides.forEach((slide, i) => slide.classList.toggle('is-section-active', i === activeSectionIndex));
      dots.forEach((dot, i) => dot.classList.toggle('is-active', i === activeSectionIndex));
      if (currentLabel) currentLabel.textContent = pad(activeSectionIndex);
      if (sectionName) sectionName.textContent = (slides[activeSectionIndex]?.dataset.slideLabel || '').toUpperCase();
    };

    activateSection(0);

    const sectionObserver = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const index = slides.indexOf(visible.target);
      if (index >= 0) activateSection(index);
    }, { threshold: [0.28, 0.42, 0.58, 0.72] });

    slides.forEach((slide) => sectionObserver.observe(slide));
  }

  // -----------------------------------------------------------------------
  // Tech card pointer glow / subtle 3D response.
  // -----------------------------------------------------------------------
  const wireTechCard = (card) => {
    if (card.dataset.techWired === '1') return;

    // V19: Contact cards must remain visually stable while the cursor moves.
    // They only move when the carousel is intentionally dragged.
    if (card.closest('.contact-panel-shell')) {
      card.dataset.techWired = '1';
      card.style.setProperty('--gx', '50%');
      card.style.setProperty('--gy', '50%');
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
      return;
    }

    card.dataset.techWired = '1';

    card.addEventListener('pointermove', (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      const rect = card.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const py = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      card.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
      card.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
      card.style.setProperty('--tilt-y', `${((px - 0.5) * 3.2).toFixed(2)}deg`);
      card.style.setProperty('--tilt-x', `${((0.5 - py) * 2.4).toFixed(2)}deg`);
    }, { passive: true });

    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--gx', '50%');
      card.style.setProperty('--gy', '50%');
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
    });
  };

  document.querySelectorAll('[data-tech-card]').forEach(wireTechCard);

  // -----------------------------------------------------------------------
  // Horizontal premium coverflow carousels.
  // Drag on desktop; swipe on mobile; click progress bars to jump.
  // -----------------------------------------------------------------------
  const setupCarousel = (track) => {
    const shell = track.parentElement;
    const hud = shell?.querySelector('.carousel-hud') || track.previousElementSibling;
    const current = hud?.querySelector('[data-carousel-current]');
    const progress = hud?.querySelector('[data-carousel-progress]');
    const cards = [...track.children];
    if (!cards.length) return;

    cards.forEach(wireTechCard);

    let activeIndex = 0;
    let rafQueued = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startScroll = 0;
    let dragging = false;
    let suppressClickUntil = 0;

    const cardCenter = (card) => card.offsetLeft + card.offsetWidth / 2;
    const trackCenter = () => track.scrollLeft + track.clientWidth / 2;

    const nearestIndex = () => {
      const center = trackCenter();
      let best = 0;
      let distance = Infinity;
      cards.forEach((card, i) => {
        const d = Math.abs(cardCenter(card) - center);
        if (d < distance) {
          distance = d;
          best = i;
        }
      });
      return best;
    };

    const centerCard = (index, behavior = 'smooth') => {
      const i = Math.max(0, Math.min(cards.length - 1, index));
      const card = cards[i];
      const target = card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
      track.scrollTo({ left: Math.max(0, target), behavior: reduceMotion ? 'auto' : behavior });
    };

    let segments = [];
    if (progress) {
      progress.innerHTML = '';
      segments = cards.map((card, index) => {
        const segment = document.createElement('button');
        segment.type = 'button';
        segment.className = 'carousel-progress-segment';
        segment.setAttribute('aria-label', `Show item ${index + 1} of ${cards.length}`);
        segment.addEventListener('click', () => centerCard(index));
        segment.addEventListener('pointerenter', () => document.body.classList.add('cursor-hover'));
        segment.addEventListener('pointerleave', () => document.body.classList.remove('cursor-hover'));
        progress.appendChild(segment);
        return segment;
      });
    }

    const update = () => {
      rafQueued = false;
      activeIndex = nearestIndex();
      cards.forEach((card, index) => {
        card.classList.toggle('is-active', index === activeIndex);
        card.classList.toggle('is-before', index < activeIndex);
        card.classList.toggle('is-after', index > activeIndex);
        card.setAttribute('aria-current', index === activeIndex ? 'true' : 'false');
      });
      segments.forEach((segment, index) => segment.classList.toggle('is-active', index === activeIndex));
      if (current) current.textContent = pad(activeIndex);
    };

    const scheduleUpdate = () => {
      if (rafQueued) return;
      rafQueued = true;
      requestAnimationFrame(update);
    };

    track.addEventListener('scroll', scheduleUpdate, { passive: true });

    // Robust grab/swipe interaction.
    // Mouse: click + drag anywhere on the track.
    // Touch/pen: horizontal intent locks the carousel; vertical intent keeps page scrolling.
    let dragAxis = null;
    let lastX = 0;
    let lastTime = 0;
    let velocityX = 0;

    const beginDrag = (event) => {
      if (event.button != null && event.button !== 0) return;

      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      lastX = event.clientX;
      lastTime = performance.now();
      startScroll = track.scrollLeft;
      velocityX = 0;
      dragging = event.pointerType === 'mouse';
      dragAxis = event.pointerType === 'mouse' ? 'x' : null;

      track.style.scrollBehavior = 'auto';

      if (dragging) {
        track.classList.add('is-dragging');
        document.body.classList.add('carousel-dragging');
        if (event.cancelable) event.preventDefault();
      }

      try { track.setPointerCapture?.(pointerId); } catch (_) {}
    };

    const moveDrag = (event) => {
      if (pointerId !== event.pointerId) return;

      const dx = event.clientX - startX;
      const dy = event.clientY - startY;

      if (!dragAxis && (Math.abs(dx) > 7 || Math.abs(dy) > 7)) {
        // On touch, don't hijack a normal vertical page scroll.
        dragAxis = Math.abs(dx) > Math.abs(dy) * 1.05 ? 'x' : 'y';

        if (dragAxis === 'x') {
          dragging = true;
          track.classList.add('is-dragging');
          document.body.classList.add('carousel-dragging');
        }
      }

      if (dragAxis !== 'x') return;

      const now = performance.now();
      const dt = Math.max(1, now - lastTime);
      velocityX = (event.clientX - lastX) / dt;
      lastX = event.clientX;
      lastTime = now;

      track.scrollLeft = startScroll - dx;

      if (event.cancelable) event.preventDefault();
    };

    const endDrag = (event) => {
      if (pointerId !== event.pointerId) return;

      try { track.releasePointerCapture?.(pointerId); } catch (_) {}
      pointerId = null;

      const wasDragging = dragging && dragAxis === 'x';

      dragging = false;
      dragAxis = null;
      track.classList.remove('is-dragging');
      document.body.classList.remove('carousel-dragging');

      requestAnimationFrame(() => {
        track.style.scrollBehavior = '';
      });

      if (wasDragging) {
        suppressClickUntil = performance.now() + 320;

        // Momentum-biased snap: a quick flick advances one card even if
        // the pointer didn't travel all the way to the next center.
        let index = nearestIndex();
        if (Math.abs(velocityX) > 0.35) {
          index += velocityX < 0 ? 1 : -1;
        }
        centerCard(index);
      }

      scheduleUpdate();
    };

    track.addEventListener('pointerdown', beginDrag, { passive: false });
    track.addEventListener('pointermove', moveDrag, { passive: false });
    track.addEventListener('pointerup', endDrag, { passive: false });
    track.addEventListener('pointercancel', endDrag, { passive: false });

    // Prevent the browser's native image/text drag behavior from stealing
    // the pointer gesture from the carousel.
    track.addEventListener('dragstart', (event) => event.preventDefault());

    // Trackpads already emit horizontal deltaX. Preserve vertical page scrolling,
    // but make horizontal two-finger swipes move the carousel reliably.
    track.addEventListener('wheel', (event) => {
      if (Math.abs(event.deltaX) < 2 || Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 0.35) return;
      track.scrollLeft += event.deltaX;
      if (event.cancelable) event.preventDefault();
      scheduleUpdate();
    }, { passive: false });

    track.addEventListener('click', (event) => {
      if (performance.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const card = cards.find((candidate) => candidate === event.target || candidate.contains(event.target));
      if (!card || card.tagName === 'A') return;
      const index = cards.indexOf(card);
      if (index >= 0 && index !== activeIndex) centerCard(index);
    });

    // Keyboard support: arrows work when the carousel itself is focused, but
    // no visual arrow buttons are shown.
    if (!track.hasAttribute('tabindex')) track.tabIndex = 0;
    track.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      centerCard(activeIndex + (event.key === 'ArrowRight' ? 1 : -1));
    });

    requestAnimationFrame(() => {
      update();
      // Keep the first card naturally aligned rather than forcing a large jump.
      if (track.scrollLeft > 4) centerCard(nearestIndex(), 'auto');
    });
  };


  // -----------------------------------------------------------------------
  // V13 About orbital carousel — transform-based, no scrollLeft dependency.
  // -----------------------------------------------------------------------
  const setupAboutOrbit = () => {
    const root = document.querySelector('[data-about-orbit]');
    if (!root) return;
    const stage = root.querySelector('.about-orbit-stage');
    const cards = [...root.querySelectorAll('[data-orbit-card]')];
    const current = root.querySelector('[data-orbit-current]');
    const dots = root.querySelector('[data-orbit-dots]');
    if (!stage || !cards.length) return;

    let index = 0;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let dragX = 0;
    let axis = null;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;

    const shortest = (i) => {
      let d = i - index;
      const n = cards.length;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      return d;
    };

    const buttons = cards.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'about-orbit-dot';
      b.setAttribute('aria-label', `Show focus area ${i + 1}`);
      b.addEventListener('click', () => { index = i; dragX = 0; render(true); });
      dots?.appendChild(b);
      return b;
    });

    const render = (animate = false) => {
      const w = Math.max(300, stage.clientWidth);
      const dragUnits = dragX / Math.max(180, w * .34);
      cards.forEach((card, i) => {
        const offset = shortest(i) + dragUnits;
        const abs = Math.min(2, Math.abs(offset));
        const x = offset * Math.min(195, w * .29);
        const y = abs * 34 + Math.pow(abs, 1.5) * 8;
        const scale = Math.max(.72, 1 - abs * .18);
        const rotate = offset * -9;
        const opacity = Math.max(.20, 1 - abs * .42);
        card.style.transition = animate && !reduceMotion
          ? 'transform .58s cubic-bezier(.2,.86,.22,1),opacity .46s ease,filter .46s ease'
          : 'none';
        card.style.transform = `translate(-50%,-50%) translate3d(${x}px,${y}px,${-abs*90}px) scale(${scale}) rotateZ(${rotate}deg)`;
        card.style.opacity = opacity.toFixed(3);
        card.style.filter = `blur(${Math.max(0,abs-1)*1.5}px) saturate(${1-abs*.12})`;
        card.style.zIndex = String(20 - Math.round(abs * 5));
        card.classList.toggle('is-active', abs < .28);
      });
      buttons.forEach((b,i)=>b.classList.toggle('is-active',i===index));
      if (current) current.textContent = String(index+1).padStart(2,'0');
    };

    const moveIndex = (dir) => {
      index = (index + dir + cards.length) % cards.length;
      dragX = 0;
      render(true);
    };

    stage.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      pointerId = e.pointerId; startX = lastX = e.clientX; startY = e.clientY;
      lastT = performance.now(); velocity = 0; axis = e.pointerType === 'mouse' ? 'x' : null;
      stage.classList.add('is-dragging');
      try { stage.setPointerCapture(pointerId); } catch(_) {}
      if (e.pointerType === 'mouse' && e.cancelable) e.preventDefault();
    }, {passive:false});
    stage.addEventListener('pointermove', (e) => {
      if (pointerId !== e.pointerId) return;
      const dx=e.clientX-startX, dy=e.clientY-startY;
      if (!axis && (Math.abs(dx)>7 || Math.abs(dy)>7)) axis = Math.abs(dx)>Math.abs(dy)*1.05 ? 'x':'y';
      if (axis !== 'x') return;
      const now=performance.now(); velocity=(e.clientX-lastX)/Math.max(1,now-lastT); lastX=e.clientX; lastT=now;
      dragX = dx;
      render(false);
      if (e.cancelable) e.preventDefault();
    }, {passive:false});
    const end = (e) => {
      if (pointerId !== e.pointerId) return;
      try { stage.releasePointerCapture(pointerId); } catch(_) {}
      pointerId=null; stage.classList.remove('is-dragging');
      if (axis==='x' && (Math.abs(dragX)>48 || Math.abs(velocity)>.28)) moveIndex(dragX<0 ? 1:-1);
      else { dragX=0; render(true); }
      axis=null;
    };
    stage.addEventListener('pointerup',end,{passive:false});
    stage.addEventListener('pointercancel',end,{passive:false});
    stage.addEventListener('dragstart',e=>e.preventDefault());
    stage.addEventListener('wheel',(e)=>{
      if (Math.abs(e.deltaX)>Math.abs(e.deltaY)*.45 && Math.abs(e.deltaX)>4) {
        e.preventDefault(); moveIndex(e.deltaX>0?1:-1);
      }
    },{passive:false});
    stage.addEventListener('keydown',(e)=>{
      if (e.key==='ArrowRight' || e.key==='ArrowLeft') { e.preventDefault(); moveIndex(e.key==='ArrowRight'?1:-1); }
    });
    cards.forEach((c,i)=>c.addEventListener('click',()=>{ if (i!==index) { index=i; dragX=0; render(true); }}));
    window.addEventListener('resize',()=>render(false),{passive:true});
    render(false);
  };

  // -----------------------------------------------------------------------
  // V13 What-I-Do cinematic deck — live 3D grab/flick, no overflow scrolling.
  // -----------------------------------------------------------------------
  const setupWorkDeck = () => {
    const root = document.querySelector('[data-work-deck]');
    if (!root) return;
    const stage = root.querySelector('.work-deck-stage');
    const cards = [...root.querySelectorAll('[data-deck-card]')];
    const current = root.querySelector('[data-deck-current]');
    const meter = root.querySelector('[data-deck-meter]');
    if (!stage || !cards.length) return;

    let index=0,pointerId=null,startX=0,startY=0,dragX=0,axis=null,lastX=0,lastT=0,velocity=0;
    const n=cards.length;
    const shortest=(i)=>{let d=i-index;if(d>n/2)d-=n;if(d<-n/2)d+=n;return d;};
    const segments=cards.map((_,i)=>{
      const b=document.createElement('button');b.type='button';b.className='work-deck-segment';b.setAttribute('aria-label',`Show capability ${i+1}`);
      b.addEventListener('click',()=>{index=i;dragX=0;render(true);});meter?.appendChild(b);return b;
    });

    const render=(animate=false)=>{
      const w=Math.max(360,stage.clientWidth);
      const dragUnits=dragX/Math.max(230,w*.42);
      cards.forEach((card,i)=>{
        const offset=shortest(i)+dragUnits;
        const abs=Math.min(2,Math.abs(offset));
        const x=offset*Math.min(520,w*.44);
        const scale=Math.max(.68,1-abs*.18);
        const ry=offset*-19;
        const rz=offset*1.3;
        const z=-abs*180;
        const opacity=Math.max(.18,1-abs*.47);
        card.style.transition=animate&&!reduceMotion?'transform .62s cubic-bezier(.16,.84,.24,1),opacity .48s ease,filter .48s ease':'none';
        card.style.transform=`translateX(-50%) translate3d(${x}px,${abs*14}px,${z}px) scale(${scale}) rotateY(${ry}deg) rotateZ(${rz}deg)`;
        card.style.opacity=opacity.toFixed(3);
        card.style.filter=`brightness(${1-abs*.22}) saturate(${1-abs*.14})`;
        card.style.zIndex=String(30-Math.round(abs*8));
        card.classList.toggle('is-active',abs<.28);
      });
      segments.forEach((b,i)=>b.classList.toggle('is-active',i===index));
      if(current)current.textContent=String(index+1).padStart(2,'0');
    };
    const moveIndex=(dir)=>{index=(index+dir+n)%n;dragX=0;render(true);};

    stage.addEventListener('pointerdown',(e)=>{
      if(e.button!=null&&e.button!==0)return;
      pointerId=e.pointerId;startX=lastX=e.clientX;startY=e.clientY;lastT=performance.now();velocity=0;axis=e.pointerType==='mouse'?'x':null;
      stage.classList.add('is-dragging');try{stage.setPointerCapture(pointerId);}catch(_){}
      if(e.pointerType==='mouse'&&e.cancelable)e.preventDefault();
    },{passive:false});
    stage.addEventListener('pointermove',(e)=>{
      if(pointerId!==e.pointerId)return;
      const dx=e.clientX-startX,dy=e.clientY-startY;
      if(!axis&&(Math.abs(dx)>7||Math.abs(dy)>7))axis=Math.abs(dx)>Math.abs(dy)*1.05?'x':'y';
      if(axis!=='x')return;
      const now=performance.now();velocity=(e.clientX-lastX)/Math.max(1,now-lastT);lastX=e.clientX;lastT=now;dragX=dx;render(false);if(e.cancelable)e.preventDefault();
    },{passive:false});
    const end=(e)=>{
      if(pointerId!==e.pointerId)return;try{stage.releasePointerCapture(pointerId);}catch(_){}pointerId=null;stage.classList.remove('is-dragging');
      if(axis==='x'&&(Math.abs(dragX)>58||Math.abs(velocity)>.3))moveIndex(dragX<0?1:-1);else{dragX=0;render(true);}axis=null;
    };
    stage.addEventListener('pointerup',end,{passive:false});stage.addEventListener('pointercancel',end,{passive:false});stage.addEventListener('dragstart',e=>e.preventDefault());
    stage.addEventListener('wheel',(e)=>{if(Math.abs(e.deltaX)>Math.abs(e.deltaY)*.45&&Math.abs(e.deltaX)>4){e.preventDefault();moveIndex(e.deltaX>0?1:-1);}},{passive:false});
    stage.addEventListener('keydown',(e)=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();moveIndex(e.key==='ArrowRight'?1:-1);}});
    cards.forEach((c,i)=>c.addEventListener('click',()=>{if(i!==index){index=i;dragX=0;render(true);}}));
    window.addEventListener('resize',()=>render(false),{passive:true});
    render(false);
  };


  // -----------------------------------------------------------------------
  // V14 ABOUT — native magnetic tech rail.
  // Uses horizontal scroll-snap for maximum reliability on mouse, touch and
  // trackpads. Mouse dragging is custom; touch remains native and fluid.
  // -----------------------------------------------------------------------
  const setupAboutRail = () => {
    const root = document.querySelector('[data-about-rail]');
    if (!root) return;
    const viewport = root.querySelector('.about-rail-viewport');
    const track = root.querySelector('[data-about-track]');
    const cards = [...root.querySelectorAll('[data-about-card]')];
    const current = root.querySelector('[data-about-current]');
    const meter = root.querySelector('[data-about-meter]');
    if (!viewport || !track || !cards.length) return;

    const buttons = cards.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'about-rail-segment';
      b.setAttribute('aria-label', `Show focus area ${i + 1}`);
      b.addEventListener('click', () => center(i));
      meter?.appendChild(b);
      return b;
    });

    const centers = () => cards.map(card => card.offsetLeft + card.offsetWidth / 2);
    const nearest = () => {
      const c = viewport.scrollLeft + viewport.clientWidth / 2;
      const cs = centers();
      let best = 0, dist = Infinity;
      cs.forEach((v,i)=>{ const d=Math.abs(v-c); if(d<dist){dist=d;best=i;} });
      return best;
    };
    const center = (i, behavior='smooth') => {
      i = Math.max(0, Math.min(cards.length - 1, i));
      const card = cards[i];
      const left = card.offsetLeft - (viewport.clientWidth - card.offsetWidth)/2;
      viewport.scrollTo({left: Math.max(0,left), behavior: reduceMotion ? 'auto' : behavior});
    };
    const update = () => {
      const i = nearest();
      cards.forEach((c,n)=>c.classList.toggle('is-active',n===i));
      buttons.forEach((b,n)=>b.classList.toggle('is-active',n===i));
      if(current) current.textContent = String(i+1).padStart(2,'0');
    };

    let raf = 0;
    viewport.addEventListener('scroll',()=>{
      if(raf) return;
      raf=requestAnimationFrame(()=>{raf=0;update();});
    },{passive:true});

    // Mouse drag only. Touch devices use the browser's native momentum swipe,
    // which is faster and less likely to get stuck than pointer-captured touch.
    let down=false,startX=0,startScroll=0,lastX=0,lastT=0,vel=0;
    viewport.addEventListener('pointerdown',(e)=>{
      if(e.pointerType!=='mouse' || e.button!==0) return;
      down=true; startX=lastX=e.clientX; startScroll=viewport.scrollLeft; lastT=performance.now(); vel=0;
      viewport.classList.add('is-dragging');
      try{viewport.setPointerCapture(e.pointerId);}catch(_){ }
      e.preventDefault();
    },{passive:false});
    viewport.addEventListener('pointermove',(e)=>{
      if(!down || e.pointerType!=='mouse') return;
      const now=performance.now();
      vel=(e.clientX-lastX)/Math.max(1,now-lastT); lastX=e.clientX; lastT=now;
      viewport.scrollLeft=startScroll-(e.clientX-startX);
      e.preventDefault();
    },{passive:false});
    const endMouse=(e)=>{
      if(!down) return;
      down=false; viewport.classList.remove('is-dragging');
      try{viewport.releasePointerCapture(e.pointerId);}catch(_){ }
      let i=nearest();
      if(Math.abs(vel)>.22) i += vel<0 ? 1 : -1;
      center(i);
    };
    viewport.addEventListener('pointerup',endMouse,{passive:false});
    viewport.addEventListener('pointercancel',endMouse,{passive:false});
    viewport.addEventListener('dragstart',e=>e.preventDefault());

    // Trackpad horizontal gestures stay native; wheel listener only updates UI.
    viewport.addEventListener('wheel',()=>requestAnimationFrame(update),{passive:true});
    viewport.addEventListener('keydown',(e)=>{
      if(e.key!=='ArrowLeft' && e.key!=='ArrowRight') return;
      e.preventDefault(); center(nearest()+(e.key==='ArrowRight'?1:-1));
    });
    cards.forEach((c,i)=>c.addEventListener('click',()=>{ if(!down) center(i); }));
    window.addEventListener('resize',()=>{center(nearest(),'auto');update();},{passive:true});
    requestAnimationFrame(()=>{center(0,'auto');update();});
  };

  // -----------------------------------------------------------------------
  // V14 WHAT-I-DO — direct command slider.
  // One panel at a time with a live, low-threshold drag. The track follows the
  // finger/mouse immediately, then snaps with a short premium spring easing.
  // -----------------------------------------------------------------------
  const setupWorkSlider = () => {
    const root = document.querySelector('[data-work-slider]');
    if (!root) return;
    const viewport = root.querySelector('.work-command-viewport');
    const track = root.querySelector('[data-work-track]');
    const cards = [...root.querySelectorAll('[data-work-card]')];
    const current = root.querySelector('[data-work-current]');
    const meter = root.querySelector('[data-work-meter]');
    if(!viewport || !track || !cards.length) return;

    let index=0, pointerId=null, startX=0, startY=0, dx=0, axis=null, lastX=0, lastT=0, velocity=0;
    const n=cards.length;
    const segments=cards.map((_,i)=>{
      const b=document.createElement('button'); b.type='button'; b.className='work-command-segment';
      b.setAttribute('aria-label',`Show capability ${i+1}`);
      b.addEventListener('click',()=>go(i)); meter?.appendChild(b); return b;
    });

    const setTrack = (animate=true) => {
      const w = viewport.clientWidth || 1;
      const dragPct = (dx / w) * 100;
      track.style.transition = animate && !reduceMotion ? 'transform .42s cubic-bezier(.22,.86,.3,1)' : 'none';
      track.style.transform = `translate3d(calc(${-index*100}% + ${dragPct}%),0,0)`;
      cards.forEach((c,i)=>c.classList.toggle('is-active',i===index));
      segments.forEach((b,i)=>b.classList.toggle('is-active',i===index));
      if(current) current.textContent=String(index+1).padStart(2,'0');
    };
    const go=(i)=>{ index=Math.max(0,Math.min(n-1,i)); dx=0; setTrack(true); };

    viewport.addEventListener('pointerdown',(e)=>{
      if(e.button!=null && e.button!==0) return;
      pointerId=e.pointerId; startX=lastX=e.clientX; startY=e.clientY; dx=0; axis=e.pointerType==='mouse'?'x':null;
      lastT=performance.now(); velocity=0; viewport.classList.add('is-dragging');
      try{viewport.setPointerCapture(pointerId);}catch(_){ }
      if(e.pointerType==='mouse' && e.cancelable) e.preventDefault();
    },{passive:false});

    viewport.addEventListener('pointermove',(e)=>{
      if(pointerId!==e.pointerId) return;
      const mx=e.clientX-startX, my=e.clientY-startY;
      if(!axis && (Math.abs(mx)>3 || Math.abs(my)>3)) axis=Math.abs(mx)>=Math.abs(my)?'x':'y';
      if(axis!=='x') return;
      const now=performance.now(); velocity=(e.clientX-lastX)/Math.max(1,now-lastT); lastX=e.clientX; lastT=now;
      // gentle edge resistance, otherwise 1:1 movement
      dx=mx;
      if((index===0 && dx>0) || (index===n-1 && dx<0)) dx*=.28;
      setTrack(false);
      if(e.cancelable) e.preventDefault();
    },{passive:false});

    const end=(e)=>{
      if(pointerId!==e.pointerId) return;
      try{viewport.releasePointerCapture(pointerId);}catch(_){ }
      pointerId=null; viewport.classList.remove('is-dragging');
      const threshold=Math.min(34,viewport.clientWidth*.07);
      if(axis==='x' && (Math.abs(dx)>threshold || Math.abs(velocity)>.16)) {
        if(dx<0 || velocity<-.16) index=Math.min(n-1,index+1);
        else if(dx>0 || velocity>.16) index=Math.max(0,index-1);
      }
      dx=0; axis=null; setTrack(true);
    };
    viewport.addEventListener('pointerup',end,{passive:false});
    viewport.addEventListener('pointercancel',end,{passive:false});
    viewport.addEventListener('dragstart',e=>e.preventDefault());

    // Horizontal trackpad flicks move exactly one slide with a short lockout.
    let wheelLock=false;
    viewport.addEventListener('wheel',(e)=>{
      if(wheelLock || Math.abs(e.deltaX)<10 || Math.abs(e.deltaX)<=Math.abs(e.deltaY)*.45) return;
      e.preventDefault(); wheelLock=true; go(index+(e.deltaX>0?1:-1));
      setTimeout(()=>{wheelLock=false;},260);
    },{passive:false});

    viewport.addEventListener('keydown',(e)=>{
      if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight') return;
      e.preventDefault(); go(index+(e.key==='ArrowRight'?1:-1));
    });
    window.addEventListener('resize',()=>setTrack(false),{passive:true});
    setTrack(false);
  };


  // -----------------------------------------------------------------------
  // V15 Skills + Contact — frame-driven transform sliders.
  // These intentionally avoid scrollLeft + scroll-snap. The track follows the
  // pointer 1:1 while dragging, then settles with a requestAnimationFrame ease.
  // This removes the sticky/stalled feeling seen in the previous two carousels.
  // -----------------------------------------------------------------------
  const setupSmoothTransformSlider = (viewport) => {
    const track = viewport.querySelector('.smooth-swipe-track');
    const slides = [...viewport.querySelectorAll('[data-smooth-slide]')];
    if (!track || !slides.length) return;

    const shell = viewport.closest('.skills-info-carousel, .contact-panel-shell');
    const hud = shell?.querySelector('.carousel-hud');
    const currentLabel = hud?.querySelector('[data-carousel-current]');
    const progressHost = hud?.querySelector('[data-carousel-progress]');

    slides.forEach(wireTechCard);

    let index = 0;
    let x = 0;
    let pointerId = null;
    let startPointerX = 0;
    let startPointerY = 0;
    let startX = 0;
    let axis = null;
    let dragging = false;
    let lastPointerX = 0;
    let lastPointerT = 0;
    let velocity = 0;
    let animationFrame = 0;
    let suppressClickUntil = 0;
    let wheelAccumulator = 0;
    let wheelTimer = 0;
    let wheelLock = false;

    const progressButtons = [];
    if (progressHost) {
      progressHost.innerHTML = '';
      slides.forEach((_, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'carousel-progress-segment';
        button.setAttribute('aria-label', `Show item ${i + 1} of ${slides.length}`);
        button.addEventListener('click', () => goTo(i));
        progressHost.appendChild(button);
        progressButtons.push(button);
      });
    }

    const maxIndex = () => Math.max(0, slides.length - 1);

    const slideOffset = (i) => {
      const slide = slides[Math.max(0, Math.min(maxIndex(), i))];
      return slide.offsetLeft - Math.max(0, (viewport.clientWidth - slide.offsetWidth) / 2);
    };

    const targetFor = (i) => -slideOffset(i);

    const bounds = () => ({
      max: targetFor(0),
      min: targetFor(maxIndex())
    });

    const setX = (nextX) => {
      x = nextX;
      track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
      updateVisualState();
    };

    const nearestIndexFromX = () => {
      const viewportCenter = viewport.clientWidth / 2;
      let best = 0;
      let bestDistance = Infinity;
      slides.forEach((slide, i) => {
        const center = slide.offsetLeft + x + slide.offsetWidth / 2;
        const distance = Math.abs(center - viewportCenter);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      });
      return best;
    };

    const updateVisualState = () => {
      const active = nearestIndexFromX();
      slides.forEach((slide, i) => {
        const distance = Math.abs(i - active);
        slide.classList.toggle('is-active', i === active);
        slide.classList.toggle('is-near', distance === 1);
        slide.setAttribute('aria-current', i === active ? 'true' : 'false');
      });
      progressButtons.forEach((button, i) => button.classList.toggle('is-active', i === active));
      if (currentLabel) currentLabel.textContent = String(active + 1).padStart(2, '0');
    };

    const cancelAnimation = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };

    const animateTo = (target, duration = 430, onDone) => {
      cancelAnimation();
      if (reduceMotion) {
        setX(target);
        onDone?.();
        return;
      }

      const from = x;
      const delta = target - from;
      const started = performance.now();
      const ease = (t) => 1 - Math.pow(1 - t, 5);

      const tick = (now) => {
        const t = Math.min(1, (now - started) / duration);
        setX(from + delta * ease(t));
        if (t < 1) animationFrame = requestAnimationFrame(tick);
        else {
          animationFrame = 0;
          setX(target);
          onDone?.();
        }
      };

      animationFrame = requestAnimationFrame(tick);
    };

    function goTo(nextIndex, duration = 430) {
      index = Math.max(0, Math.min(maxIndex(), nextIndex));
      animateTo(targetFor(index), duration, updateVisualState);
    }

    const begin = (event) => {
      if (event.button != null && event.button !== 0) return;
      cancelAnimation();
      pointerId = event.pointerId;
      startPointerX = lastPointerX = event.clientX;
      startPointerY = event.clientY;
      startX = x;
      lastPointerT = performance.now();
      velocity = 0;
      // V17: keep normal links/buttons clickable. Pointer capture is delayed
      // until a real horizontal drag is detected.
      axis = null;
      dragging = false;
    };

    const move = (event) => {
      if (event.pointerId !== pointerId) return;
      const dx = event.clientX - startPointerX;
      const dy = event.clientY - startPointerY;

      if (!axis && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        axis = Math.abs(dx) > Math.abs(dy) * 1.08 ? 'x' : 'y';
        if (axis === 'x') {
          dragging = true;
          viewport.classList.add('is-dragging');
          document.body.classList.add('carousel-dragging');
          try { viewport.setPointerCapture?.(pointerId); } catch (_) {}
        }
      }
      if (axis !== 'x') return;

      const now = performance.now();
      velocity = (event.clientX - lastPointerX) / Math.max(1, now - lastPointerT);
      lastPointerX = event.clientX;
      lastPointerT = now;

      const limit = bounds();
      let nextX = startX + dx;
      if (nextX > limit.max) nextX = limit.max + (nextX - limit.max) * 0.18;
      if (nextX < limit.min) nextX = limit.min + (nextX - limit.min) * 0.18;
      setX(nextX);

      if (event.cancelable) event.preventDefault();
    };

    const end = (event) => {
      if (event.pointerId !== pointerId) return;
      try { viewport.releasePointerCapture?.(pointerId); } catch (_) {}
      pointerId = null;

      const horizontalDrag = dragging && axis === 'x';
      dragging = false;
      axis = null;
      viewport.classList.remove('is-dragging');
      document.body.classList.remove('carousel-dragging');

      if (!horizontalDrag) return;
      suppressClickUntil = performance.now() + 280;

      let next = nearestIndexFromX();
      // A fast flick advances a slide in the flick direction even when the
      // nearest card has not changed yet.
      if (Math.abs(velocity) > 0.24) {
        next += velocity < 0 ? 1 : -1;
      }
      index = Math.max(0, Math.min(maxIndex(), next));
      const distance = Math.abs(targetFor(index) - x);
      const duration = Math.max(260, Math.min(480, 260 + distance * 0.22));
      animateTo(targetFor(index), duration, updateVisualState);
    };

    viewport.addEventListener('pointerdown', begin, { passive: false });
    viewport.addEventListener('pointermove', move, { passive: false });
    viewport.addEventListener('pointerup', end, { passive: false });
    viewport.addEventListener('pointercancel', end, { passive: false });
    viewport.addEventListener('dragstart', (event) => event.preventDefault());

    viewport.addEventListener('click', (event) => {
      if (performance.now() < suppressClickUntil) {
        // Suppress the accidental click generated immediately after a swipe.
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);

    viewport.addEventListener('wheel', (event) => {
      if (Math.abs(event.deltaX) < 3 || Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 0.45) return;
      if (event.cancelable) event.preventDefault();
      wheelAccumulator += event.deltaX;
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { wheelAccumulator = 0; }, 160);

      if (!wheelLock && Math.abs(wheelAccumulator) > 24) {
        wheelLock = true;
        goTo(index + (wheelAccumulator > 0 ? 1 : -1), 360);
        wheelAccumulator = 0;
        setTimeout(() => { wheelLock = false; }, 230);
      }
    }, { passive: false });

    viewport.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      goTo(index + (event.key === 'ArrowRight' ? 1 : -1));
    });

    slides.forEach((slide, i) => {
      slide.addEventListener('click', (event) => {
        if (performance.now() < suppressClickUntil) return;
        if (i !== index && !event.target.closest('a[href],button')) {
          event.preventDefault();
          goTo(i);
        }
      });
    });

    const recenterSlider = () => {
      cancelAnimation();
      requestAnimationFrame(() => {
        setX(targetFor(index));
        updateVisualState();
      });
    };

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(recenterSlider, 80);
    }, { passive: true });

    // Mobile Chrome changes the visual viewport when its address bar shows/hides.
    // ResizeObserver keeps the cards centered when that changes the slider width.
    if ('ResizeObserver' in window) {
      const sliderResizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(recenterSlider, 60);
      });
      sliderResizeObserver.observe(viewport);
    }

    window.addEventListener('orientationchange', () => {
      setTimeout(recenterSlider, 180);
    }, { passive: true });

    requestAnimationFrame(() => {
      index = 0;
      setX(targetFor(0));
      updateVisualState();
    });
  };

  document.querySelectorAll('[data-smooth-slider]').forEach(setupSmoothTransformSlider);

  // Legacy generic carousels remain available for any future sections.
  document.querySelectorAll('[data-carousel]').forEach(setupCarousel);
  setupAboutRail();
  setupWorkSlider();

  // Mobile-safe Contact actions.
  // Do NOT stop pointerdown/pointermove propagation here: the carousel viewport
  // needs those events so a swipe can begin even when the finger starts on the
  // Gmail / phone / Back-to-top content. The slider's capture-phase click guard
  // already cancels accidental clicks after a genuine swipe.
  document.querySelectorAll('[data-contact-action]').forEach((action) => {
    action.addEventListener('click', (event) => {
      if (action.matches('[data-back-to-top]')) {
        event.preventDefault();
        const home = document.getElementById('home');
        if (home) {
          home.scrollIntoView({
            behavior: reduceMotion ? 'auto' : 'smooth',
            block: 'start'
          });
        } else {
          window.scrollTo({
            top: 0,
            behavior: reduceMotion ? 'auto' : 'smooth'
          });
        }
        if (history.replaceState) history.replaceState(null, '', '#home');
      }
      // mailto: and tel: links use their native browser behavior.
      // If the user swiped instead of tapped, the slider suppresses this click.
    });
  });

})();
