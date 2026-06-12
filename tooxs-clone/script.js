// Tooxs — interacciones del sitio

// Año dinámico en el footer
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Animación de aparición progresiva de las tarjetas / secciones
const revealEls = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window && revealEls.length) {
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          // pequeño escalonado según el orden de aparición
          entry.target.style.transitionDelay = `${(i % 3) * 80}ms`;
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  revealEls.forEach((el) => observer.observe(el));
} else {
  // Fallback: mostrar todo si no hay soporte
  revealEls.forEach((el) => el.classList.add("is-visible"));
}
