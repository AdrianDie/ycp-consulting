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
})();
