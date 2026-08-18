// ---------- helpers ----------
function fmtPrice(n) {
  return n.toLocaleString("ru-RU").replace(/\u00a0/g, " ");
}

// ---------- scroll progress ----------
const progress = document.getElementById("scrollProgress");
function updateProgress() {
  const doc = document.documentElement;
  const total = doc.scrollHeight - doc.clientHeight;
  const p = total > 0 ? (window.scrollY / total) * 100 : 0;
  progress.style.width = p + "%";
}
window.addEventListener("scroll", updateProgress, { passive: true });
updateProgress();

// ---------- header on scroll ----------
const header = document.getElementById("siteHeader");
function onScrollHeader() {
  header.classList.toggle("scrolled", window.scrollY > 20);
}
window.addEventListener("scroll", onScrollHeader, { passive: true });
onScrollHeader();

// ---------- mobile menu ----------
const menuToggle = document.getElementById("menuToggle");
const mobileMenu = document.getElementById("mobileMenu");
menuToggle.addEventListener("click", () => {
  const open = mobileMenu.classList.toggle("open");
  menuToggle.classList.toggle("open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("menu-open", open);
});
mobileMenu.querySelectorAll("a").forEach((a) => {
  a.addEventListener("click", () => {
    mobileMenu.classList.remove("open");
    menuToggle.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
  });
});

// ---------- reveal on scroll ----------
const revealEls = document.querySelectorAll(".reveal");
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        io.unobserve(e.target);
      }
    });
  },
  { threshold: 0.12 }
);
revealEls.forEach((el) => io.observe(el));

// ---------- accordion ----------
function setupAccordion(containerId) {
  const root = document.getElementById(containerId);
  if (!root) return;
  root.querySelectorAll(".acc-item").forEach((item) => {
    const head = item.querySelector(".acc-head");
    head.addEventListener("click", () => {
      const isOpen = item.classList.contains("open");
      // close siblings
      root.querySelectorAll(".acc-item.open").forEach((s) => {
        s.classList.remove("open");
        s.querySelector(".acc-head").setAttribute("aria-expanded", "false");
      });
      if (!isOpen) {
        item.classList.add("open");
        head.setAttribute("aria-expanded", "true");
      }
    });
  });
}
setupAccordion("riskAccordion");
setupAccordion("faqAccordion");

// ---------- year ----------
document.getElementById("year").textContent = new Date().getFullYear();

// ---------- catalog ----------
const catalog = window.ERA_CATALOG || [];
const grid = document.getElementById("catalogGrid");
const countEl = document.getElementById("catalogCount");
const filterBtns = document.getElementById("filterBtns");
const leadCar = document.getElementById("leadCar");

const SPEC_ICONS = {
  power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" stroke-linejoin="round"/></svg>',
  accel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/></svg>',
  range: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
};

function carCardHTML(car) {
  return `
    <article class="car-card glass">
      <div class="car-media">
        <span class="car-type">${car.type}</span>
        <img src="${car.img}" alt="${car.name}" loading="lazy" onerror="this.closest('.car-media').classList.add('no-img'); this.remove()" />
      </div>
      <div class="car-body">
        <h3 class="car-name">${car.name}</h3>
        <p class="car-desc">${car.desc}</p>
        <div class="car-specs">
          <span class="car-spec">${SPEC_ICONS.power}<span>Мощность <b>${car.power}</b></span></span>
          <span class="car-spec">${SPEC_ICONS.accel}<span>0–100 <b>${car.accel}</b></span></span>
          <span class="car-spec">${SPEC_ICONS.range}<span>Запас хода <b>${car.range}</b></span></span>
          ${car.battery !== "—" ? `<span class="car-spec"><span>Батарея <b>${car.battery}</b></span></span>` : ""}
        </div>
        <p class="car-price">${fmtPrice(car.price)} ¥<small>CNY, Гуанчжоу</small></p>
        <div class="car-actions">
          <button class="btn btn-primary btn-sm" data-request="${car.name}">Узнать стоимость</button>
          <a class="btn btn-outline btn-sm" href="${car.url}" target="_blank" rel="noopener noreferrer">Детали ↗</a>
        </div>
      </div>
    </article>
  `;
}

function renderCatalog(filter) {
  const list = filter === "all" ? catalog : catalog.filter((c) => c.type === filter);
  grid.innerHTML = list.map(carCardHTML).join("");
  countEl.textContent = list.length + " из " + catalog.length + " моделей";
  leadCar.value = "";
}

filterBtns.addEventListener("click", (e) => {
  const btn = e.target.closest(".chip-btn");
  if (!btn) return;
  filterBtns.querySelectorAll(".chip-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  renderCatalog(btn.dataset.filter);
});

// request buttons -> scroll to form + prefill car
grid.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-request]");
  if (!btn) return;
  leadCar.value = btn.dataset.request;
  document.getElementById("zayavka").scrollIntoView({ behavior: "smooth" });
  document.getElementById("fname").focus();
});

renderCatalog("all");

// ---------- lead form ----------
const form = document.getElementById("leadForm");
const formStatus = document.getElementById("formStatus");
const leadSubmit = document.getElementById("leadSubmit");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formStatus.textContent = "";
  formStatus.className = "form-status";

  const payload = {
    name: form.name.value.trim(),
    phone: form.phone.value.trim(),
    email: form.email.value.trim(),
    comment: form.comment.value.trim(),
    car: leadCar.value.trim(),
  };

  if (!payload.name || !payload.phone) {
    formStatus.textContent = "Пожалуйста, заполните имя и телефон.";
    formStatus.className = "form-status err";
    return;
  }

  leadSubmit.disabled = true;
  const oldText = leadSubmit.textContent;
  leadSubmit.textContent = "Отправляем…";

  try {
    const res = await fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("server_error");
    formStatus.textContent = "Спасибо! Заявка отправлена. Эксперт свяжется с вами в ближайшее время.";
    formStatus.className = "form-status ok";
    form.reset();
    leadCar.value = "";
  } catch (err) {
    formStatus.textContent = "Не удалось отправить заявку. Попробуйте ещё раз или напишите в Telegram.";
    formStatus.className = "form-status err";
  } finally {
    leadSubmit.disabled = false;
    leadSubmit.textContent = oldText;
  }
});
