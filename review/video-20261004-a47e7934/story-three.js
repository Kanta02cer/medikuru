"use strict";
(() => {
  const videos = Array.from(document.querySelectorAll(".story-card video"));
  const statuses = new Map(videos.map(video => [video, video.closest(".story-card").querySelector(".player-status")]));
  const pending = new Map();
  let activeVideo = null;
  let requestId = 0;

  const time = seconds => {
    const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
  };
  function update(video) {
    if (video.error) return;
    const state = video.ended ? "再生終了" : video.paused ? "停止中" : "再生中";
    const status = statuses.get(video);
    const label = `${state} ${time(video.currentTime)} / 1:12`;
    if (status.dataset.label === label) return;
    status.dataset.label = label;
    status.replaceChildren(document.createTextNode(`${state} `));
    const position = document.createElement("span");
    position.textContent = `${time(video.currentTime)} / 1:12`;
    status.append(position);
  }
  function pauseOthers(video) {
    videos.forEach(other => {
      if (other !== video) other.pause();
    });
  }
  async function start(video, seconds) {
    const currentRequest = ++requestId;
    pending.set(video, currentRequest);
    activeVideo = video;
    pauseOthers(video);
    try {
      video.currentTime = seconds;
      await video.play();
      if (currentRequest !== requestId && activeVideo !== video) video.pause();
    } catch (error) {
      if (currentRequest !== requestId || error.name === "AbortError") return;
      statuses.get(video).textContent = "再生できませんでした。動画の再生ボタンを押してください。";
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
    ["pause", "timeupdate", "ended", "loadedmetadata"].forEach(event => video.addEventListener(event, () => update(video)));
    video.addEventListener("error", () => {
      statuses.get(video).textContent = "動画を読み込めませんでした。ページを再読み込みしてください。";
    });
  });
  document.querySelectorAll("[data-player][data-scene]").forEach(button => {
    button.addEventListener("click", () => {
      const video = document.getElementById(button.dataset.player);
      const seconds = Number(button.dataset.scene);
      if (videos.includes(video) && Number.isFinite(seconds)) start(video, seconds);
    });
  });
  document.querySelectorAll("[data-open-sources]").forEach(link => {
    link.addEventListener("click", () => {
      const sources = document.getElementById("sources-method");
      if (sources) sources.open = true;
    });
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    ++requestId;
    activeVideo = null;
    videos.forEach(video => video.pause());
  });
})();
