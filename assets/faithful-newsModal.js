(() => {
  const openButton = document.getElementById("openNewsModal");
  const closeButton = document.getElementById("closeNewsModal");
  const modal = document.getElementById("newsModal");
  const modalContent = document.getElementById("newsModalContent");
  const screenshot = modalContent?.querySelector(".news-modal__screenshot");

  if (!openButton || !closeButton || !modal) return;

  let previousFocus = null;
  let originalBodyStyle = null;
  let originalHtmlStyle = null;

  /* position:fixed + top オフセット方式は、解除する瞬間に
     一時的にtop:0を経由してページ最上部へジャンプして見える
     ことがあるため使わない。スクロール位置自体はそのままに、
     html/bodyにoverflow:hiddenを当てるだけで背景スクロールを
     封じる（見た目のスクロール位置は一切動かさない） */
  function lockLpBackground() {
    const body = document.body;
    const html = document.documentElement;
    const scrollbarWidth = window.innerWidth - html.clientWidth;

    originalBodyStyle = {
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight
    };
    originalHtmlStyle = {
      overflow: html.style.overflow
    };

    const currentPadding = parseFloat(window.getComputedStyle(body).paddingRight) || 0;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }
  }

  function unlockLpBackground() {
    if (!originalBodyStyle || !originalHtmlStyle) return;

    const body = document.body;
    const html = document.documentElement;

    html.style.overflow = originalHtmlStyle.overflow;
    body.style.overflow = originalBodyStyle.overflow;
    body.style.paddingRight = originalBodyStyle.paddingRight;

    originalBodyStyle = null;
    originalHtmlStyle = null;
  }

  function openNewsModal() {
    if (modal.open) return;

    /* dialog非対応ブラウザは何もしない（バナー自体は非表示にしない） */
    if (typeof modal.showModal !== "function") return;

    previousFocus = document.activeElement;

    /* 約600KBの長い記事画像は、モーダルを開いた時だけ取得する。 */
    if (screenshot && !screenshot.getAttribute("src") && screenshot.dataset.src) {
      screenshot.src = screenshot.dataset.src;
    }

    lockLpBackground();
    modal.showModal();

    openButton.setAttribute("aria-expanded", "true");

    if (modalContent) {
      modalContent.scrollTop = 0;
    }

    requestAnimationFrame(() => {
      closeButton.focus({ preventScroll: true });
    });
  }

  function closeNewsModal() {
    if (modal.open) {
      modal.close();
    }
  }

  openButton.addEventListener("click", openNewsModal);
  closeButton.addEventListener("click", closeNewsModal);

  /* Escキーで閉じる */
  modal.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeNewsModal();
  });

  /* 暗い背景を押して閉じる */
  modal.addEventListener("click", (event) => {
    if (event.target !== modal) return;

    const rect = modal.getBoundingClientRect();

    const clickedInside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;

    if (!clickedInside) {
      closeNewsModal();
    }
  });

  /* LPの元の位置へ戻す */
  modal.addEventListener("close", () => {
    unlockLpBackground();
    openButton.setAttribute("aria-expanded", "false");

    if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === "function") {
      previousFocus.focus({ preventScroll: true });
    }
  });
})();
