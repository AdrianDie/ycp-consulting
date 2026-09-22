(function () {
  var header = document.querySelector(".site-header");
  if (!header) return;

  var lastY = window.scrollY;
  var hidden = false;
  var threshold = 12;
  var revealAt = header.offsetHeight;

  window.addEventListener("scroll", function () {
    var y = window.scrollY;
    var diff = y - lastY;

    if (y < revealAt) {
      header.classList.remove("header-hidden");
      hidden = false;
      lastY = y;
      return;
    }

    if (diff > threshold && !hidden) {
      header.classList.add("header-hidden");
      hidden = true;
      lastY = y;
    } else if (diff < -threshold && hidden) {
      header.classList.remove("header-hidden");
      hidden = false;
      lastY = y;
    } else if (Math.abs(diff) > threshold) {
      lastY = y;
    }
  }, { passive: true });

  var toggle = document.querySelector(".hamburger");
  var nav = document.querySelector("nav.main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("nav-open");
      toggle.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("nav-open");
        toggle.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }
})();
