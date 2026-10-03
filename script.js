/**
 * Akhil Portfolio - Cinematic Smooth Scroll Engine
 * Seamlessly drives 224 frames of zoom animation synchronized with page content
 */

(function () {
  'use strict';

  const TOTAL_FRAMES = 224;
  const FRAME_PATH = (index) => `PNG/ezgif-frame-${String(index).padStart(3, '0')}.png`;

  // DOM Elements
  const canvas = document.getElementById('sequence-canvas');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const loader = document.getElementById('loader');
  const loaderBar = document.getElementById('loader-bar');
  const loaderText = document.getElementById('loader-text');

  // Frames Cache
  const frames = new Array(TOTAL_FRAMES);
  let loadedCount = 0;

  // Animation Interpolation State
  let targetProgress = 0;
  let currentProgress = 0;
  let currentFrame = 0;
  let lastDrawnFrame = -1;
  let needsRedraw = true;

  // Calculate maximum page scroll
  function getMaxScroll() {
    return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }

  // Handle High-DPI canvas resizing
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const displayWidth = window.innerWidth;
    const displayHeight = window.innerHeight;

    const targetWidth = Math.round(displayWidth * dpr);
    const targetHeight = Math.round(displayHeight * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      needsRedraw = true;
    }
  }

  // Draw frame with smart focal anchoring
  function drawImageProp(img) {
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    // Scale to cover
    const scale = Math.max(cw / iw, ch / ih);
    const dw = iw * scale;
    const dh = ih * scale;

    // Center focal point on Akhil across both mobile portrait and widescreen monitors
    const anchorX = 0.58;
    const anchorY = 0.45;

    const dx = (cw - dw) * anchorX;
    const dy = (ch - dh) * anchorY;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(img, dx, dy, dw, dh);
  }

  // Search outward for nearest loaded frame to guarantee zero flicker
  function getFrame(index) {
    const clampedIndex = Math.max(0, Math.min(TOTAL_FRAMES - 1, Math.round(index)));
    if (frames[clampedIndex]) return frames[clampedIndex];

    for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
      if (clampedIndex - offset >= 0 && frames[clampedIndex - offset]) {
        return frames[clampedIndex - offset];
      }
      if (clampedIndex + offset < TOTAL_FRAMES && frames[clampedIndex + offset]) {
        return frames[clampedIndex + offset];
      }
    }
    return frames[0] || null;
  }

  function renderFrame(index) {
    const img = getFrame(index);
    if (img) {
      drawImageProp(img);
    }
  }

  // Progressive Preloader
  function preloadImages() {
    // 1. Load frame 1 immediately for instant paint
    const firstImg = new Image();
    firstImg.src = FRAME_PATH(1);
    firstImg.onload = () => {
      frames[0] = firstImg;
      loadedCount++;
      resizeCanvas();
      renderFrame(0);
      updateProgress();
    };

    // 2. Load remaining frames with concurrent batching
    const CONCURRENCY_LIMIT = 8;
    const queue = [];
    for (let i = 2; i <= TOTAL_FRAMES; i++) {
      queue.push(i);
    }

    let activeRequests = 0;
    function processQueue() {
      while (queue.length > 0 && activeRequests < CONCURRENCY_LIMIT) {
        const frameIndex = queue.shift();
        loadFrame(frameIndex);
      }
    }

    function loadFrame(frameNum) {
      activeRequests++;
      const img = new Image();
      img.src = FRAME_PATH(frameNum);

      const onDone = () => {
        frames[frameNum - 1] = img;
        loadedCount++;
        activeRequests--;
        updateProgress();

        if (loadedCount >= TOTAL_FRAMES) {
          onAllLoaded();
        } else {
          processQueue();
        }
      };

      img.onload = onDone;
      img.onerror = () => {
        activeRequests--;
        processQueue();
      };
    }

    for (let i = 0; i < CONCURRENCY_LIMIT; i++) {
      processQueue();
    }
  }

  function updateProgress() {
    const pct = Math.min(100, Math.round((loadedCount / TOTAL_FRAMES) * 100));
    if (loaderBar) loaderBar.style.width = `${pct}%`;
    if (loaderText) loaderText.textContent = `${pct}%`;
  }

  function onAllLoaded() {
    if (loader) {
      loader.classList.add('hidden');
      setTimeout(() => {
        if (loader && loader.parentNode) {
          loader.parentNode.removeChild(loader);
        }
      }, 1000);
    }
  }

  // Update target progress on scroll
  function updateScrollTarget() {
    const maxScroll = getMaxScroll();
    targetProgress = Math.max(0, Math.min(1, window.scrollY / maxScroll));
  }

  window.addEventListener('scroll', updateScrollTarget, { passive: true });

  // Main 60/120 FPS Sub-pixel Lerp Loop
  function animationLoop() {
    // Smoothly glide currentProgress toward targetProgress
    const progressDiff = targetProgress - currentProgress;
    if (Math.abs(progressDiff) > 0.0001) {
      currentProgress += progressDiff * 0.1; // Smooth dampening factor
    } else {
      currentProgress = targetProgress;
    }

    // Map progress to frames
    const targetFrame = currentProgress * (TOTAL_FRAMES - 1);
    const frameDiff = targetFrame - currentFrame;
    if (Math.abs(frameDiff) > 0.001) {
      currentFrame += frameDiff * 0.15;
    } else {
      currentFrame = targetFrame;
    }

    const frameToDraw = Math.round(currentFrame);
    if (frameToDraw !== lastDrawnFrame || needsRedraw) {
      renderFrame(frameToDraw);
      lastDrawnFrame = frameToDraw;
      needsRedraw = false;
    }

    requestAnimationFrame(animationLoop);
  }

  // Handle window resizing
  window.addEventListener('resize', () => {
    resizeCanvas();
    updateScrollTarget();
    needsRedraw = true;
  });

  // Smooth click scrolling for content navigation pills
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Initialization
  function init() {
    resizeCanvas();
    updateScrollTarget();
    preloadImages();
    requestAnimationFrame(animationLoop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
