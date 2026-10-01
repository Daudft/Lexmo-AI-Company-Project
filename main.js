(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const root = document.documentElement;
  const capped = (promise, ms) => Promise.race([promise, new Promise((r) => setTimeout(r, ms))]);
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  /* =========================================================
     Hero intro
     The hero sits on its first frame (CSS) until the display and UI
     fonts are ready, then the whole sequence plays in one go. Capped
     so a slow font CDN can never hold the page back.
     ========================================================= */
  const fontsReady = document.fonts
    ? Promise.all([
        document.fonts.load('400 64px "BubbledotICG-FinePos"'),
        document.fonts.load('500 16px "Inter"'),
        document.fonts.load('600 16px "Inter"'),
      ]).catch(() => {})
    : Promise.resolve();

  // budget measured from navigation start: the intro begins by ~2.2s even on a slow font CDN
  const heroReady = capped(fontsReady, Math.max(0, 2200 - performance.now())).then(nextFrame);
  heroReady.then(() => {
    root.classList.add("is-ready");
    // release the compositor layers once the intro has finished
    setTimeout(() => root.classList.add("intro-done"), 3000);
  });

  // the background video fades in on its own clock, as soon as it can actually play
  const video = $(".bg-video");
  const showVideo = () => root.classList.add("video-ready");
  if (video.readyState >= 3) showVideo();
  else {
    video.addEventListener("canplay", showVideo, { once: true });
    video.addEventListener("playing", showVideo, { once: true });
  }
  setTimeout(showVideo, 4000);
  video.play?.().catch(() => {});

  /* =========================================================
     Mobile menu
     ========================================================= */
  const burger = $(".burger");
  const menu = $("#mobile-menu");
  const overlay = $(".menu-overlay");

  const setMenu = (open) => {
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.hidden = !open;
    overlay.hidden = !open;
    document.body.classList.toggle("menu-open", open);
    if (open) header.classList.remove("is-hidden");
  };

  burger.addEventListener("click", () => setMenu(burger.getAttribute("aria-expanded") !== "true"));
  overlay.addEventListener("click", () => setMenu(false));
  $$("a", menu).forEach((link) => link.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      setMenu(false);
      burger.focus();
    }
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 720 && !menu.hidden) setMenu(false);
  });

  /* =========================================================
     Header: hide on the way down, return on the way up
     ========================================================= */
  const header = $(".header");
  let lastY = window.scrollY;
  let ticking = false;
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (!document.body.classList.contains("menu-open")) {
          const goingDown = y > lastY + 2;
          const goingUp = y < lastY - 2;
          if (goingDown && y > window.innerHeight * 0.9) header.classList.add("is-hidden");
          else if (goingUp || y < 80) header.classList.remove("is-hidden");
        }
        lastY = y;
        ticking = false;
      });
    },
    { passive: true }
  );

  /* =========================================================
     Scrollspy: the three-dot indicator follows the section
     ========================================================= */
  const navLinks = $$("[data-nav]");
  const setActive = (key) => {
    navLinks.forEach((a) => {
      const on = a.dataset.nav === key;
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  };
  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && e.target.dataset.section) setActive(e.target.dataset.section);
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  $$("[data-section]").forEach((s) => spy.observe(s));

  /* =========================================================
     Smooth scrolling (Lenis) + anchor links
     ========================================================= */
  // Lenis loads async so a slow CDN never blocks the page; it switches on when ready
  let lenis = null;
  const initLenis = () => {
    if (lenis || !window.Lenis || reduceMotion) return;
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95 });
    if (document.body.classList.contains("menu-open")) lenis.stop();
    const raf = (time) => {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  };
  if (window.Lenis) initLenis();
  else $("#lenis-js")?.addEventListener("load", initLenis);

  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (id === "#") return e.preventDefault();
      const target = id === "#top" ? 0 : $(id);
      if (target === null) return;
      e.preventDefault();
      // force: the mobile menu may have paused Lenis a moment ago
      if (lenis) lenis.scrollTo(target, { offset: id === "#top" ? 0 : -24, duration: 1.4, force: true });
      else if (target === 0) window.scrollTo({ top: 0, behavior: "smooth" });
      else target.scrollIntoView({ behavior: "smooth" });
    });
  });

  // pause smooth scrolling while the mobile menu is open
  new MutationObserver(() => {
    if (!lenis) return;
    if (document.body.classList.contains("menu-open")) lenis.stop();
    else lenis.start();
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  /* =========================================================
     Scroll reveal choreography
     ========================================================= */
  // [selector, motion, stagger step (s), base delay (s)]
  const REVEALS = [
    [".section-head > :not(.section-title)", "up", 0.09, 0],
    [".section-title", "type", 0, 0.05],
    [".ticker", "fade", 0, 0],
    [".module-list li", "left", 0.07, 0.05],
    [".console", "scale", 0, 0.15],
    [".arch-in .node", "left", 0.09, 0.1],
    [".core", "scale", 0, 0],
    [".core-label", "up", 0, 0.2],
    [".arch-out .node", "right", 0.07, 0.25],
    [".arch-lines", "fade", 0, 0.45],
    [".steps li", "left", 0.09, 0.05],
    [".code", "right", 0, 0.15],
    [".global-copy > :not(.global-stats):not(.badges):not(.section-title)", "up", 0.09, 0],
    [".global-copy .section-title", "type", 0, 0.05],
    [".global-stats > div", "up", 0.08, 0.1],
    [".badges li", "up", 0.05, 0.15],
    [".globe-wrap", "scale", 0, 0.1],
    [".case", "up", 0.12, 0],
    [".billing", "up", 0, 0.1],
    [".plan", "up", 0.11, 0.05],
    [".faq-item", "up", 0.06, 0.05],
    [".final-inner > :not(.final-title)", "up", 0.1, 0.1],
    [".final-title", "type", 0, 0],
    [".footer-brand", "up", 0, 0],
    [".footer-cols > div", "up", 0.08, 0.05],
    [".footer-bottom", "fade", 0, 0.2],
  ];

  // split a heading into characters, keeping words unbreakable and <br>s intact
  const splitType = (el) => {
    const label = el.textContent.replace(/\s+/g, " ").trim();
    let n = 0;
    const walk = (node, out) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) return out.appendChild(document.createTextNode(" "));
            const word = document.createElement("span");
            word.className = "type-word";
            [...part].forEach((chr) => {
              const s = document.createElement("span");
              s.className = "ch";
              s.textContent = chr;
              // left-to-right sweep with a little jitter so it flickers on like LEDs
              s.style.setProperty("--cd", `${(n++ * 0.028 + Math.random() * 0.12).toFixed(3)}s`);
              word.appendChild(s);
            });
            out.appendChild(word);
          });
        } else if (child.nodeName === "BR") {
          out.appendChild(document.createElement("br"));
        } else {
          const clone = child.cloneNode(false);
          walk(child, clone);
          out.appendChild(clone);
        }
      });
    };
    const inner = document.createElement("span");
    inner.setAttribute("aria-hidden", "true");
    walk(el, inner);
    el.replaceChildren(inner);
    el.setAttribute("aria-label", label);
  };

  const revealEls = [];
  REVEALS.forEach(([sel, motion, step, base]) => {
    $$(sel).forEach((el) => {
      if (el.hasAttribute("data-reveal")) return;
      el.setAttribute("data-reveal", motion);
      el.dataset.step = step;
      el.dataset.base = base;
      if (motion === "type" && !reduceMotion) splitType(el);
      revealEls.push(el);
    });
  });

  const reveal = (el, delay) => {
    el.style.setProperty("--d", `${delay}s`);
    el.classList.add("in");
    // once settled, hand transitions back to the element (hover states stay snappy)
    if (el.dataset.reveal !== "type") {
      setTimeout(() => {
        el.removeAttribute("data-reveal");
        el.style.removeProperty("--d");
      }, (delay + 1.2) * 1000);
    }
  };

  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealEls.forEach((el) => el.classList.add("in"));
  } else {
    const ro = new IntersectionObserver(
      (entries) => {
        // elements entering together are staggered in reading order
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
        const counts = new Map();
        visible.forEach((e) => {
          const el = e.target;
          const key = el.dataset.step + "|" + el.parentElement?.className;
          const i = counts.get(key) || 0;
          counts.set(key, i + 1);
          reveal(el, Number(el.dataset.base) + Math.min(i, 8) * Number(el.dataset.step));
          ro.unobserve(el);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 }
    );
    revealEls.forEach((el) => ro.observe(el));
  }

  /* =========================================================
     Count-ups (hero stats + case study metrics)
     ========================================================= */
  const format = (el, value) => {
    const decimals = Number(el.dataset.decimals) || 0;
    el.textContent = value.toFixed(decimals) + (el.dataset.suffix || "");
  };

  const tween = (duration, onUpdate) => {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      onUpdate(easeOutCubic(t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const countUp = (el, i) => {
    const target = parseFloat(el.dataset.target);
    if (reduceMotion) return format(el, target);
    setTimeout(() => tween(1500 + i * 80, (k) => format(el, target * k)), 480 + i * 90);
  };

  const watchCounts = (els) => {
    if (!("IntersectionObserver" in window)) return els.forEach((el) => format(el, parseFloat(el.dataset.target)));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          countUp(e.target, els.indexOf(e.target));
          io.unobserve(e.target);
        });
      },
      { threshold: 0.25 }
    );
    els.forEach((el) => io.observe(el));
  };

  // hero stats count up as each one finishes appearing (matches the CSS --d delays)
  heroReady.then(() => {
    $$(".stat-value").forEach((el, i) => {
      const target = parseFloat(el.dataset.target);
      if (reduceMotion) return format(el, target);
      const appear = parseFloat(el.closest(".stat").style.getPropertyValue("--d")) || 1.1;
      setTimeout(() => tween(1600 + i * 80, (k) => format(el, target * k)), (appear + 0.25) * 1000);
    });
  });
  watchCounts($$(".case-metric"));

  /* =========================================================
     Dot-matrix field (canvas)
     ========================================================= */
  const smooth = (e0, e1, x) => {
    const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
    return t * t * (3 - 2 * t);
  };

  // each pattern returns brightness 0..1 for a point (u, v) in roughly [-1, 1]
  const PATTERNS = {
    reason(u, v, t) {
      const d = Math.hypot(u, v);
      const wave = 0.5 + 0.5 * Math.sin(d * 11 - t * 2.6);
      const arms = 0.5 + 0.5 * Math.cos(Math.atan2(v, u) * 3 + t * 0.8 - d * 4);
      return wave * (0.55 + 0.45 * arms) * (1 - smooth(0.75, 1.15, d));
    },
    memory(u, v, t) {
      const col = Math.floor((u + 1.6) * 5);
      const h = 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(col * 1.7 + t * 1.3)) * (0.6 + 0.4 * Math.sin(col * 0.9 - t * 0.7));
      const fill = (1 - v) / 2;
      const inCol = Math.abs(((u + 1.6) * 5) % 1 - 0.5) < 0.36 ? 1 : 0;
      return inCol * smooth(h + 0.04, h - 0.04, fill) * (1 - smooth(1.35, 1.6, Math.abs(u)));
    },
    tools(u, v, t) {
      const a = t * 0.45;
      const x = u * Math.cos(a) - v * Math.sin(a);
      const y = u * Math.sin(a) + v * Math.cos(a);
      const bar = (p, q) => smooth(0.22, 0.14, Math.abs(p)) * smooth(0.82, 0.74, Math.abs(q));
      const plus = Math.max(bar(x, y), bar(y, x));
      const ring = Math.exp(-Math.pow(Math.hypot(u, v) - 0.95, 2) * 220) * (0.5 + 0.5 * Math.sin(Math.atan2(v, u) * 12 - t * 2));
      return Math.max(plus, ring * 0.8);
    },
    agents(u, v, t) {
      let s = 0;
      for (let i = 0; i < 4; i++) {
        const r = 0.55 + 0.12 * Math.sin(t * 0.7 + i);
        const a = t * (0.6 + i * 0.12) + (i * Math.PI) / 2;
        const dx = u - Math.cos(a) * r;
        const dy = v - Math.sin(a) * r;
        s += 0.045 / (dx * dx + dy * dy + 0.012);
      }
      s += 0.03 / (u * u + v * v + 0.02);
      return smooth(0.9, 2.2, s);
    },
    guardrails(u, v, t) {
      const qx = Math.abs(u) - 0.9;
      const qy = Math.abs(v) - 0.7;
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const sd = outside + Math.min(Math.max(qx, qy), 0) - 0.12;
      const border = Math.exp(-sd * sd * 260);
      const scan = (((t * 0.45) % 1) * 2 - 1) * 0.85;
      const beam = sd < 0 ? Math.exp(-Math.pow(v - scan, 2) * 90) * 0.85 : 0;
      const fillDots = sd < 0 ? 0.12 : 0;
      return Math.min(1, border + beam + fillDots);
    },
    ripple(u, v, t) {
      const d = Math.hypot(u, v * 1.15);
      const w = 0.5 + 0.5 * Math.sin(d * 7 - t * 1.4);
      const w2 = 0.5 + 0.5 * Math.sin(u * 3 + t * 0.6) * Math.cos(v * 3 - t * 0.5);
      return w * 0.75 + w2 * 0.25;
    },
  };

  class DotField {
    constructor(canvas, { spacing = 12, radius = 2.4, base = 0.07, interactive = false } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.spacing = spacing;
      this.radius = radius;
      this.base = base;
      this.pattern = canvas.dataset.pattern;
      this.prev = null;
      this.mixStart = 0;
      this.pointer = null;
      this.running = false;
      this.t0 = performance.now();

      this.resize();
      new ResizeObserver(() => this.resize()).observe(canvas);

      if (interactive) {
        canvas.addEventListener("pointermove", (e) => {
          const r = canvas.getBoundingClientRect();
          this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
        });
        canvas.addEventListener("pointerleave", () => (this.pointer = null));
      }

      new IntersectionObserver(([e]) => (e.isIntersecting ? this.start() : this.stop())).observe(canvas);
      if (reduceMotion) this.draw(2.5);
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = this.canvas.clientWidth;
      this.h = this.canvas.clientHeight;
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduceMotion || !this.running) this.draw((performance.now() - this.t0) / 1000);
    }

    setPattern(name) {
      if (name === this.pattern) return;
      this.prev = this.pattern;
      this.pattern = name;
      this.mixStart = performance.now();
      if (reduceMotion) this.draw(2.5);
    }

    start() {
      if (this.running || reduceMotion) return;
      this.running = true;
      const loop = (now) => {
        if (!this.running) return;
        this.draw((now - this.t0) / 1000, now);
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }

    draw(t, now = performance.now()) {
      const { ctx, w, h, spacing, radius, base } = this;
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#fff";

      const cur = PATTERNS[this.pattern];
      const prev = this.prev ? PATTERNS[this.prev] : null;
      const mix = prev ? Math.min((now - this.mixStart) / 700, 1) : 1;
      if (mix >= 1) this.prev = null;

      const scale = Math.min(w, h) / 2 / 1.05;
      const cols = Math.floor(w / spacing);
      const rows = Math.floor(h / spacing);
      const ox = (w - (cols - 1) * spacing) / 2;
      const oy = (h - (rows - 1) * spacing) / 2;
      const p = this.pointer;

      for (let j = 0; j < rows; j++) {
        const y = oy + j * spacing;
        const v = (y - h / 2) / scale;
        for (let i = 0; i < cols; i++) {
          const x = ox + i * spacing;
          const u = (x - w / 2) / scale;
          let val = cur(u, v, t);
          if (prev && mix < 1) val = prev(u, v, t) * (1 - mix) + val * mix;
          if (p) {
            const dx = x - p.x;
            const dy = y - p.y;
            val = Math.max(val, Math.exp(-(dx * dx + dy * dy) / 2600) * 0.9);
          }
          val = Math.min(Math.max(val, 0), 1);
          ctx.globalAlpha = base + (1 - base) * val;
          const r = radius * (0.38 + 0.62 * val);
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  // created after the hero intro (see "Deferred graphics" below)
  let consoleField = null;
  const initDotFields = () => {
    const canvas = $(".console .dotfield");
    canvas.dataset.pattern = $(".module.is-active")?.dataset.module || "reason";
    consoleField = new DotField(canvas, { spacing: 13, radius: 2.6, interactive: true });
    new DotField($(".dotfield--bg"), { spacing: 18, radius: 2.2, base: 0.05 });
  };

  /* =========================================================
     Platform module explorer
     ========================================================= */
  const MODULES = {
    reason: [["Planning depth", "12 steps"], ["Accuracy", "94.1%"], ["Latency p95", "120ms"]],
    memory: [["Context", "2.4M tokens"], ["Recall", "98.7%"], ["Retention", "Unlimited"]],
    tools: [["Integrations", "340+"], ["Schemas", "Typed"], ["Retries", "Automatic"]],
    agents: [["Agents per run", "64"], ["Handoffs", "Native"], ["Runtime", "24/7"]],
    guardrails: [["Policies", "Custom"], ["PII redaction", "Built-in"], ["Audit log", "Immutable"]],
  };

  const modulesWrap = $(".modules");
  const moduleBtns = $$(".module");
  const consoleName = $(".console-name");
  const metrics = $(".console-metrics");

  const selectModule = (btn) => {
    const key = btn.dataset.module;
    moduleBtns.forEach((b) => {
      const on = b === btn;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
      // restart the progress bar animation
      const bar = $(".module-bar i", b);
      bar.style.animation = "none";
      void bar.offsetWidth;
      bar.style.animation = "";
    });
    consoleName.textContent = key;
    consoleField?.setPattern(key);

    metrics.classList.add("is-swapping");
    setTimeout(() => {
      $$("div", metrics).forEach((row, i) => {
        $("dt", row).textContent = MODULES[key][i][0];
        $("dd", row).textContent = MODULES[key][i][1];
      });
      metrics.classList.remove("is-swapping");
    }, 260);
  };

  moduleBtns.forEach((btn, i) => {
    btn.addEventListener("click", () => selectModule(btn));
    btn.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const next = moduleBtns[(i + (e.key === "ArrowDown" ? 1 : -1) + moduleBtns.length) % moduleBtns.length];
      next.focus();
      selectModule(next);
    });
    // auto-advance when the active module's progress bar completes
    $(".module-bar i", btn).addEventListener("animationend", () => {
      if (btn.classList.contains("is-active")) selectModule(moduleBtns[(i + 1) % moduleBtns.length]);
    });
  });

  modulesWrap.addEventListener("pointerenter", () => modulesWrap.classList.add("is-paused"));
  modulesWrap.addEventListener("pointerleave", () => modulesWrap.classList.remove("is-paused"));
  new IntersectionObserver(([e]) => {
    if (!modulesWrap.matches(":hover")) modulesWrap.classList.toggle("is-paused", !e.isIntersecting);
  }).observe(modulesWrap);

  /* =========================================================
     How it works: steps switch the code file
     ========================================================= */
  const stepBtns = $$(".step");
  const codeBodies = $$(".code-body");
  const codeFile = $(".code-file");
  const copyBtn = $(".copy");

  stepBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const n = Number(btn.dataset.step);
      stepBtns.forEach((b, i) => {
        b.classList.toggle("is-active", i === n);
        b.setAttribute("aria-selected", String(i === n));
      });
      codeBodies.forEach((c, i) => c.classList.toggle("is-active", i === n));
      codeFile.textContent = codeBodies[n].dataset.file;
    });
  });

  copyBtn.addEventListener("click", async () => {
    const text = $(".code-body.is-active").textContent;
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.classList.add("is-done");
      $("span", copyBtn).textContent = "Copied";
    } catch {
      $("span", copyBtn).textContent = "Press Ctrl+C";
    }
    setTimeout(() => {
      copyBtn.classList.remove("is-done");
      $("span", copyBtn).textContent = "Copy";
    }, 1600);
  });

  /* =========================================================
     Pricing: monthly / yearly
     ========================================================= */
  const billingBtns = $$(".billing-opt");
  const prices = $$(".price[data-monthly]");

  billingBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const period = btn.dataset.billing;
      billingBtns.forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-checked", String(on));
      });
      prices.forEach((el) => {
        const from = Number(el.textContent.replace(/\D/g, "")) || 0;
        const to = Number(el.dataset[period]);
        if (reduceMotion || from === to) {
          el.textContent = "$" + to;
          return;
        }
        tween(600, (k) => (el.textContent = "$" + Math.round(from + (to - from) * k)));
      });
    });
  });

  /* =========================================================
     FAQ accordion
     ========================================================= */
  $$(".faq-item").forEach((item, i) => {
    const q = $(".faq-q", item);
    const toggle = (open) => {
      item.classList.toggle("is-open", open);
      q.setAttribute("aria-expanded", String(open));
    };
    q.addEventListener("click", () => toggle(!item.classList.contains("is-open")));
    if (i === 0) toggle(true);
  });

  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs = {}) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  };

  /* =========================================================
     Architecture: signals travel app → runtime → modules
     ========================================================= */
  const initArch = () => {
    const arch = $(".arch");
    const svg = $(".arch-lines");
    const core = $("[data-core]");
    let packets = [];
    let running = false;
    let raf = 0;

    const build = () => {
      const box = arch.getBoundingClientRect();
      if (!box.width) return;
      svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
      svg.replaceChildren();
      packets = [];

      const rel = (el) => {
        const r = el.getBoundingClientRect();
        return { l: r.left - box.left, r: r.right - box.left, t: r.top - box.top, b: r.bottom - box.top, cx: r.left - box.left + r.width / 2, cy: r.top - box.top + r.height / 2, w: r.width };
      };
      const c = rel(core);
      const R = c.w * 0.3;
      const stacked = $(".arch-in").getBoundingClientRect().bottom <= core.getBoundingClientRect().top + 1;

      const curve = (sx, sy, ex, ey) =>
        stacked
          ? `M${sx} ${sy} C${sx} ${(sy + ey) / 2} ${ex} ${(sy + ey) / 2} ${ex} ${ey}`
          : `M${sx} ${sy} C${(sx + ex) / 2} ${sy} ${(sx + ex) / 2} ${ey} ${ex} ${ey}`;

      // point on the core's edge facing (x, y)
      const edge = (x, y) => {
        const a = Math.atan2(y - c.cy, x - c.cx);
        return [c.cx + Math.cos(a) * R, c.cy + Math.sin(a) * R];
      };

      const addPath = (d, out, target, count) => {
        const path = svgEl("path", { d, class: out ? "arch-path arch-path--out" : "arch-path" });
        svg.appendChild(path);
        const len = path.getTotalLength();
        for (let k = 0; k < count; k++) {
          const color = out ? (k % 2 ? "var(--rose)" : "var(--violet)") : "#fff";
          const glow = svgEl("circle", { r: 7, class: "pk-glow", fill: color });
          const dot = svgEl("circle", { r: 2.6, fill: color });
          svg.append(glow, dot);
          packets.push({ path, len, glow, dot, target, speed: 0.22 + Math.random() * 0.12, offset: Math.random() + k / count, last: 0 });
        }
      };

      $$("[data-from]").forEach((n) => {
        const a = rel(n);
        const [sx, sy] = stacked ? [a.cx, a.b] : [a.r, a.cy];
        const [ex, ey] = edge(sx, sy);
        addPath(curve(sx, sy, ex, ey), false, null, 1);
      });

      // stacked layout: outgoing lines leave from under the runtime label so they never cross it
      const coreBlock = rel($(".arch-core"));
      $$("[data-to]").forEach((n) => {
        const a = rel(n);
        const [ex, ey] = stacked ? [a.cx, a.t] : [a.l, a.cy];
        const [sx, sy] = stacked ? [c.cx, coreBlock.b + 6] : edge(ex, ey);
        addPath(curve(sx, sy, ex, ey), true, n, 2);
      });

      if (reduceMotion) frame(1800);
    };

    const frame = (now) => {
      const t = now / 1000;
      packets.forEach((p) => {
        const prog = (t * p.speed + p.offset) % 1;
        const pt = p.path.getPointAtLength(prog * p.len);
        const fade = Math.sin(Math.PI * prog);
        p.dot.setAttribute("cx", pt.x);
        p.dot.setAttribute("cy", pt.y);
        p.glow.setAttribute("cx", pt.x);
        p.glow.setAttribute("cy", pt.y);
        p.dot.setAttribute("opacity", 0.25 + 0.75 * fade);
        p.glow.setAttribute("opacity", 0.32 * fade);
        // flash the module a packet just arrived at
        if (p.target && prog < p.last) {
          p.target.classList.add("is-hit");
          clearTimeout(p.target._hit);
          p.target._hit = setTimeout(() => p.target.classList.remove("is-hit"), 520);
        }
        p.last = prog;
      });
    };

    const loop = (now) => {
      if (!running) return;
      frame(now);
      raf = requestAnimationFrame(loop);
    };

    let pending = 0;
    const rebuild = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(build);
    };
    new ResizeObserver(rebuild).observe(arch);
    if (document.fonts) document.fonts.ready.then(rebuild);

    new IntersectionObserver(([e]) => {
      if (reduceMotion) return;
      if (e.isIntersecting && !running) {
        running = true;
        raf = requestAnimationFrame(loop);
      } else if (!e.isIntersecting) {
        running = false;
        cancelAnimationFrame(raf);
      }
    }).observe(arch);
  };

  /* =========================================================
     Dot-matrix globe
     ========================================================= */
  const initGlobe = () => {
    const canvas = $(".globe");
    const ctx = canvas.getContext("2d");

    // rough continent outlines as [lon, lat] polygons — enough to read as Earth in dots
    const LAND = [
      [[-168,65],[-140,70],[-95,72],[-80,63],[-60,55],[-55,47],[-70,43],[-76,35],[-81,25],[-97,26],[-97,18],[-87,15],[-80,8],[-92,14],[-105,20],[-117,32],[-124,40],[-125,49],[-135,58],[-150,60],[-165,60]],
      [[-50,60],[-42,60],[-20,70],[-20,80],[-45,83],[-65,78],[-55,70]],
      [[-80,8],[-60,10],[-50,0],[-35,-6],[-40,-22],[-48,-28],[-58,-38],[-65,-55],[-73,-50],[-72,-30],[-70,-18],[-81,-5]],
      [[-10,36],[-9,43],[-2,44],[-5,48],[0,50],[5,54],[8,57],[5,62],[12,66],[20,70],[30,70],[40,67],[40,45],[28,41],[22,36],[12,38],[5,43],[-5,36]],
      [[-6,50],[2,51],[0,55],[-3,58.5],[-6,56]],
      [[-17,15],[-17,21],[-10,30],[-5,36],[10,37],[20,32],[32,31],[35,28],[43,12],[51,12],[42,-2],[40,-15],[35,-25],[20,-35],[17,-29],[12,-18],[13,-5],[9,4],[-8,5],[-13,8]],
      [[40,45],[40,67],[60,70],[80,73],[100,78],[140,72],[180,68],[170,60],[160,55],[142,50],[135,43],[127,35],[122,30],[120,22],[108,18],[105,10],[100,13],[98,8],[92,22],[80,15],[77,8],[72,20],[66,25],[57,26],[50,30],[48,30],[36,36],[28,41]],
      [[35,28],[43,12],[52,16],[56,22],[57,26],[50,30],[48,30],[36,33]],
      [[95,5],[105,-6],[120,-9],[140,-8],[140,-3],[120,2],[110,3],[100,3]],
      [[130,31],[141,38],[142,45],[139,41],[132,34]],
      [[114,-22],[122,-18],[130,-12],[137,-12],[142,-11],[146,-19],[153,-26],[150,-37],[140,-38],[132,-32],[115,-35]],
    ];

    const inPoly = (x, y, poly) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };

    const toXYZ = (lat, lon) => {
      const la = (lat * Math.PI) / 180;
      const lo = (lon * Math.PI) / 180;
      return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
    };

    // Fibonacci sphere, tagged land / ocean
    const N = 2400;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const points = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = golden * i;
      const x = Math.cos(th) * r;
      const z = Math.sin(th) * r;
      const lat = (Math.asin(y) * 180) / Math.PI;
      const lon = (Math.atan2(x, z) * 180) / Math.PI;
      points.push([x, y, z, LAND.some((p) => inPoly(lon, lat, p))]);
    }

    const REGIONS = [
      [38.9, -77.4], [45.6, -121.2], [-23.5, -46.6], [51.5, -0.1], [50.1, 8.7], [19.1, 72.9],
      [1.35, 103.8], [35.7, 139.7], [-33.9, 151.2], [25.2, 55.3], [-26.2, 28.0],
    ].map(([la, lo]) => toXYZ(la, lo));
    const ARCS = [[0, 3], [3, 4], [4, 9], [9, 5], [5, 6], [6, 7], [7, 1], [1, 0], [0, 2], [6, 8], [4, 10]];

    // pre-sample each arc along the great circle, lifted off the surface
    const arcs = ARCS.map(([a, b]) => {
      const A = REGIONS[a];
      const B = REGIONS[b];
      const omega = Math.acos(Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
      const pts = [];
      for (let s = 0; s <= 1.0001; s += 1 / 40) {
        const k1 = Math.sin((1 - s) * omega) / Math.sin(omega);
        const k2 = Math.sin(s * omega) / Math.sin(omega);
        const lift = 1 + 0.18 * omega * Math.sin(Math.PI * s);
        pts.push([(A[0] * k1 + B[0] * k2) * lift, (A[1] * k1 + B[1] * k2) * lift, (A[2] * k1 + B[2] * k2) * lift]);
      }
      return pts;
    });

    let w = 0, h = 0, R = 0;
    let rotY = -1.2;
    let tilt = 0.32;
    let vel = 0;
    let dragging = false;
    let lastX = 0, lastY = 0;
    let running = false;
    let prev = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(w, h) * 0.4;
      if (!running) draw(performance.now());
    };

    const project = ([x, y, z]) => {
      const cy = Math.cos(rotY), sy = Math.sin(rotY);
      const x1 = x * cy + z * sy;
      const z1 = -x * sy + z * cy;
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const y2 = y * ct - z1 * st;
      const z2 = y * st + z1 * ct;
      return [w / 2 + x1 * R, h / 2 - y2 * R, z2];
    };

    const draw = (now) => {
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);

      // sphere body
      const g = ctx.createRadialGradient(w / 2 - R * 0.3, h / 2 - R * 0.35, R * 0.1, w / 2, h / 2, R);
      g.addColorStop(0, "rgba(169,150,255,0.10)");
      g.addColorStop(1, "rgba(0,0,0,0.0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // dots
      ctx.fillStyle = "#fff";
      for (const p of points) {
        const [px, py, z] = project(p);
        if (z < -0.05 && !p[3]) continue;
        const front = Math.max(z, 0);
        ctx.globalAlpha = p[3] ? (z > 0 ? 0.35 + 0.6 * front : 0.06) : 0.05 + 0.1 * front;
        const r = p[3] ? 0.9 + 1.1 * front : 0.7;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // arcs with travelling pulses
      ctx.lineWidth = 1.2;
      arcs.forEach((pts, i) => {
        const proj = pts.map(project);
        ctx.strokeStyle = i % 2 ? "rgba(240,163,200,0.45)" : "rgba(169,150,255,0.5)";
        ctx.globalAlpha = 1;
        ctx.beginPath();
        let pen = false;
        proj.forEach(([x, y, z]) => {
          if (z > 0) {
            if (pen) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
            pen = true;
          } else pen = false;
        });
        ctx.stroke();

        const s = (t * 0.35 + i * 0.37) % 1;
        const [hx, hy, hz] = proj[Math.floor(s * (proj.length - 1))];
        if (hz > 0) {
          ctx.fillStyle = "#fff";
          ctx.globalAlpha = 0.95;
          ctx.beginPath();
          ctx.arc(hx, hy, 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.25;
          ctx.beginPath();
          ctx.arc(hx, hy, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // region beacons
      REGIONS.forEach((p, i) => {
        const [x, y, z] = project(p);
        if (z <= 0) return;
        const phase = (t * 0.6 + i * 0.29) % 1;
        ctx.globalAlpha = (1 - phase) * 0.7 * z;
        ctx.strokeStyle = "#a996ff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 3 + phase * 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.35 * z;
        ctx.fillStyle = "#a996ff";
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = z;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(x, y, 2.8, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    };

    const loop = (now) => {
      if (!running) return;
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;
      if (!dragging) {
        vel += (0.16 - vel) * 0.04; // ease back to idle spin
        rotY += vel * dt;
        tilt += (0.32 - tilt) * 0.02;
      }
      draw(now);
      requestAnimationFrame(loop);
    };

    canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add("is-dragging");
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      rotY += dx * 0.006;
      tilt = Math.max(-0.6, Math.min(0.9, tilt + dy * 0.004));
      vel = dx * 0.35;
      lastX = e.clientX;
      lastY = e.clientY;
      if (reduceMotion) draw(performance.now());
    });
    const release = () => {
      dragging = false;
      canvas.classList.remove("is-dragging");
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);

    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver(([e]) => {
      if (reduceMotion) return draw(performance.now());
      if (e.isIntersecting && !running) {
        running = true;
        prev = performance.now();
        requestAnimationFrame(loop);
      } else if (!e.isIntersecting) running = false;
    }).observe(canvas);
  };

  /* =========================================================
     Case study dot charts
     ========================================================= */
  const initCharts = () => $$(".case-chart").forEach((el) => {
    const values = el.dataset.values.split(",").map(Number);
    const split = Number(el.dataset.split);
    const rows = 7;
    const gap = 10;
    const max = Math.max(...values);
    const svg = svgEl("svg", { viewBox: `0 0 ${values.length * gap} ${rows * gap}` });

    values.forEach((v, c) => {
      const lit = Math.max(1, Math.round((v / max) * rows));
      for (let j = 0; j < rows; j++) {
        const dot = svgEl("circle", { cx: (c + 0.5) * gap, cy: (rows - j - 0.5) * gap, r: 2.5 });
        if (j < lit) {
          const after = c >= split;
          dot.classList.add("lit");
          if (after && c === values.length - 1 && j === lit - 1) dot.classList.add("peak");
          dot.style.setProperty("--o", after ? 1 : 0.38);
          dot.style.setProperty("--td", `${c * 45 + j * 30}ms`);
        }
        svg.appendChild(dot);
      }
    });

    const x = split * gap;
    svg.appendChild(svgEl("line", { x1: x, x2: x, y1: -2, y2: rows * gap + 2, class: "split" }));
    el.appendChild(svg);

    const legend = document.createElement("div");
    legend.className = "chart-legend";
    legend.innerHTML = "<span><i></i>Before</span><span><i></i>With Evolve</span>";
    el.after(legend);
  });

  /* =========================================================
     Deferred graphics
     Canvas/SVG set-up (globe geometry, dot fields, diagram, charts)
     waits until the hero intro has played so it never competes with it.
     It starts early if the visitor scrolls first or lands mid-page.
     ========================================================= */
  let graphicsStarted = false;
  const startGraphics = () => {
    if (graphicsStarted) return;
    graphicsStarted = true;
    initCharts();
    initDotFields();
    initArch();
    initGlobe();
  };
  const idle = (fn) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 1000 }) : setTimeout(fn, 200));

  if (window.scrollY > window.innerHeight * 0.5) startGraphics();
  else {
    window.addEventListener("scroll", startGraphics, { once: true, passive: true });
    heroReady.then(() => setTimeout(() => idle(startGraphics), 1800));
  }
})();
