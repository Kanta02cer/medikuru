"use strict";
(() => {
  const videos = Array.from(document.querySelectorAll(".player video"));
  const ui = new Map(videos.map(video => {
    const player = video.closest(".player");
    return [video, { state: player.querySelector(".play-state"), time: player.querySelector(".play-time") }];
  }));
  const pending = new Map();
  let activeVideo = null;
  let requestId = 0;

  const clock = seconds => {
    const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
  };
  function duration(video) {
    const declared = Number(video.dataset.duration);
    if (Number.isFinite(declared) && declared > 0) return declared;
    return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  }
  function update(video) {
    if (video.error) return;
    const elements = ui.get(video);
    const state = video.ended ? "再生終了" : video.paused ? "停止中" : "再生中";
    if (elements.state.textContent !== state) elements.state.textContent = state;
    elements.time.textContent = `${clock(video.currentTime)} / ${clock(duration(video))}`;
  }
  function pauseOthers(video) {
    videos.forEach(other => { if (other !== video) other.pause(); });
  }
  async function start(video, seconds) {
    const currentRequest = ++requestId;
    pending.set(video, currentRequest);
    activeVideo = video;
    pauseOthers(video);
    try {
      const limit = duration(video);
      video.currentTime = Math.max(0, limit ? Math.min(seconds, limit) : seconds);
      await video.play();
      if (currentRequest !== requestId && activeVideo !== video) video.pause();
    } catch (error) {
      if (currentRequest !== requestId || error.name === "AbortError") return;
      ui.get(video).state.textContent = "再生ボタンを押してください。";
    } finally {
      if (pending.get(video) === currentRequest) pending.delete(video);
    }
  }

  videos.forEach(video => {
    video.volume = 0.65;
    video.addEventListener("play", () => {
      if (pending.has(video) && pending.get(video) !== requestId) {
        video.pause();
        return;
      }
      if (activeVideo !== video) ++requestId;
      activeVideo = video;
      pauseOthers(video);
      update(video);
    });
    ["pause", "timeupdate", "ended", "loadedmetadata"].forEach(event => {
      video.addEventListener(event, () => update(video));
    });
    video.addEventListener("error", () => {
      ui.get(video).state.textContent = "動画を読み込めませんでした。ページを再読み込みしてください。";
    });
  });
  document.querySelectorAll("[data-player][data-scene]").forEach(button => {
    button.addEventListener("click", () => {
      const video = document.getElementById(button.dataset.player);
      const seconds = Number(button.dataset.scene);
      if (videos.includes(video) && Number.isFinite(seconds)) start(video, seconds);
    });
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    ++requestId;
    activeVideo = null;
    videos.forEach(video => video.pause());
  });
})();
