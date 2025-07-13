console.log("YouTube content script initialized");

function monitorVideoEvents() {
  const video = document.querySelector("video");
  if (video) {
    attachVideoListeners(video);
  } else {
    console.log("No video element found, setting up observer...");
    setupVideoObserver();
  }
}

function attachVideoListeners(video) {
  console.log("Attaching listeners to video element");
  let hasEnded = false;

  video.onplay = () => {
    console.log("Video started playing");
    hasEnded = false;
    chrome.runtime.sendMessage({ type: "getQueue" }, (response) => {
      if (response && response.queue) {
        showPlaylistOverlay(
          response.queue,
          response.currentIndex,
          response.playedSongs
        );
      } else {
        console.warn("No queue on play:", response);
      }
    });
  };

  video.onended = () => {
    if (hasEnded) {
      console.log("Ignoring duplicate onended");
      return;
    }
    hasEnded = true;
    console.log("Video ended (onended)");
    chrome.runtime.sendMessage({ type: "videoEnded" }, (response) => {
      console.log("Video ended response:", response);
    });
  };

  let lastCurrentTime = -1;
  video.ontimeupdate = () => {
    if (hasEnded || !video.duration || video.paused) return;
    const remainingTime = video.duration - video.currentTime;
    if (
      remainingTime < 0.5 &&
      remainingSinceTime > 0 && // <-- ERROR: remainingSinceTime is not defined
      lastCurrentTime !== video.currentTime
    ) {
      hasEnded = true;
      lastCurrentTime = video.currentTime;
      console.log("Video ended (timeupdate)");
      chrome.runtime.sendMessage({ type: "videoEnded" }, (response) => {
        console.log("Timeupdate response:", response);
      });
    }
  };
}

function setupVideoObserver() {
  const observer = new MutationObserver((mutations) => {
    const video = document.querySelector("video");
    if (video && !video.dataset.djMonitored) {
      console.log("New video element detected");
      video.dataset.djMonitored = "true";
      attachVideoListeners(video);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

monitorVideoEvents();

window.addEventListener("load", () => {
  const playButton = document.querySelector(".ytp-play-button");
  if (playButton && playButton.getAttribute("aria-label") === "Play") {
    console.log("Clicking play button");
    playButton.click();
  }
});

function showPlaylistOverlay(queue, currentIndex, playedSongs) {
  const existingOverlay = document.getElementById("dj-playlist-overlay");
  if (existingOverlay) existingOverlay.remove();

  const overlay = document.createElement("div");
  overlay.id = "dj-playlist-overlay";
  overlay.style.position = "fixed";
  overlay.style.top = "20px";
  overlay.style.right = "20px";
  overlay.style.maxWidth = "400px";
  overlay.style.maxHeight = "calc(80vh - 200px)"; // Reduced by 200 pixels
  overlay.style.overflowY = "auto";
  overlay.style.backgroundColor = "rgba(0, 0, 0, 0.85)";
  overlay.style.color = "white";
  overlay.style.padding = "15px";
  overlay.style.zIndex = "10000";
  overlay.style.fontFamily = "Arial, sans-serif";
  overlay.style.opacity = "1";
  overlay.style.transition = "opacity 1s ease-out";
  overlay.style.border = "2px solid #1e90ff";
  overlay.style.borderRadius = "8px";

  const title = document.createElement("h3");
  title.textContent = "YouTube DJ Queue";
  title.style.margin = "0 0 15px 0";
  title.style.fontSize = "24px";
  title.style.fontWeight = "bold";
  overlay.appendChild(title);

  const ul = document.createElement("ul");
  ul.style.listStyle = "none";
  ul.style.padding = "0";
  ul.style.margin = "0";

  queue.forEach((item, index) => {
    const li = document.createElement("li");
    li.style.display = "flex";
    li.style.alignItems = "center";
    li.style.margin = "8px 0";
    li.style.fontSize = "18px";

    // Song title
    const displayText =
      item.title ||
      (item.url.length > 50 ? item.url.substring(0, 47) + "..." : item.url);
    const span = document.createElement("span");
    span.textContent =
      displayText + (item.duration ? ` (${formatDuration(item.duration)})` : "");
    if (index === currentIndex) {
      span.style.color = "white";
      span.style.fontWeight = "bold";
      span.textContent += " (Playing)";
      li.id = "current-song";
    } else if (playedSongs.includes(item.url)) {
      span.style.color = "#888";
      span.style.textDecoration = "line-through";
      span.textContent += " (Played)";
    } else {
      span.style.color = "#1e90ff";
    }
    li.appendChild(span);

    // REMOVE or COMMENT OUT these blocks:
    // Remove button
    // const removeBtn = document.createElement("button");
    // removeBtn.textContent = "❌";
    // removeBtn.title = "Remove";
    // removeBtn.style.marginLeft = "8px";
    // removeBtn.onclick = () => {
    //   chrome.runtime.sendMessage({ type: "removeFromQueue", index });
    // };
    // li.appendChild(removeBtn);

    // Move up button
    // if (index > 0) {
    //   const upBtn = document.createElement("button");
    //   upBtn.textContent = "⬆️";
    //   upBtn.title = "Move Up";
    //   upBtn.style.marginLeft = "4px";
    //   upBtn.onclick = () => {
    //     chrome.runtime.sendMessage({
    //       type: "moveInQueue",
    //       from: index,
    //       to: index - 1,
    //     });
    //   };
    //   li.appendChild(upBtn);
    // }

    // Move down button
    // if (index < queue.length - 1) {
    //   const downBtn = document.createElement("button");
    //   downBtn.textContent = "⬇️";
    //   downBtn.title = "Move Down";
    //   downBtn.style.marginLeft = "4px";
    //   downBtn.onclick = () => {
    //     chrome.runtime.sendMessage({
    //       type: "moveInQueue",
    //       from: index,
    //       to: index + 1,
    //     });
    //   };
    //   li.appendChild(downBtn);
    // }

    ul.appendChild(li);
  });

  // Add song input
  const addDiv = document.createElement("div");
  addDiv.style.marginTop = "12px";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "YouTube URL";
  input.style.width = "220px";
  addDiv.appendChild(input);
  const addBtn = document.createElement("button");
  addBtn.textContent = "Add";
  addBtn.onclick = () => {
    if (input.value.trim()) {
      chrome.runtime.sendMessage({ type: "addToQueue", url: input.value.trim() });
      input.value = "";
    }
  };
  addDiv.appendChild(addBtn);
  overlay.appendChild(ul);
  overlay.appendChild(addDiv);

  document.body.appendChild(overlay);

  // Center the current song in the scroll
  if (currentIndex >= 0) {
    const currentSong = document.getElementById("current-song");
    if (currentSong) {
      currentSong.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }
  setTimeout(() => {
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 1000);
  }, 8000);
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return "Unknown";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "pauseVideo") {
    const video = document.querySelector("video");
    if (video) {
      console.log("Pausing video");
      video.pause();
      sendResponse({ status: "video paused" });
    } else {
      console.log("No video element found to pause");
      sendResponse({ status: "no video found" });
    }
  } else if (message.type === "playVideo") {
    const video = document.querySelector("video");
    if (video) {
      console.log("Resuming video");
      video.play();
      sendResponse({ status: "video playing" });
    } else {
      console.log("No video element found to play");
      sendResponse({ status: "no video found" });
    }
  } else if (message.type === "showPlaylist") {
    if (
      message.queue &&
      message.currentIndex !== undefined &&
      message.playedSongs
    ) {
      showPlaylistOverlay(
        message.queue,
        message.currentIndex,
        message.playedSongs
      );
    }
    sendResponse({ status: "playlist shown" });
  } else if (message.type === "getVideoInfo") {
    try {
      const titleElement = document.querySelector(
        "h1.title.style-scope.ytd-video-primary-info-renderer, h1.slim-video-information-title"
      );
      const title = titleElement
        ? titleElement.textContent.trim()
        : "Unknown Title";

      const videoElement = document.querySelector("video");
      const durationSeconds =
        videoElement && !isNaN(videoElement.duration)
          ? Math.floor(videoElement.duration)
          : 0;

      console.log("Sending video info:", { title, durationSeconds });
      sendResponse({ title, durationSeconds });
    } catch (error) {
      console.error("Error fetching video info:", error);
      sendResponse({ title: "Unknown Title", durationSeconds: 0 });
    }
  }
  return true;
});