document.addEventListener("DOMContentLoaded", () => {
  const queueList = document.getElementById("queueList");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const clearBtn = document.getElementById("clearBtn");
  const skipBtn = document.getElementById("skipBtn");
  const saveBtn = document.getElementById("saveBtn");
  const loadBtn = document.getElementById("loadBtn");
  const addUrlInput = document.getElementById("addUrlInput");
  const addUrlBtn = document.getElementById("addUrlBtn");

  let lastValidQueue = null;

  chrome.storage.local.get("popupQueueCache", (result) => {
    if (result.popupQueueCache && Array.isArray(result.popupQueueCache.queue)) {
      lastValidQueue = result.popupQueueCache;
      console.log("Loaded cached queue:", lastValidQueue);
      updateQueueDisplay(
        lastValidQueue.queue,
        lastValidQueue.currentIndex,
        lastValidQueue.playedSongs
      );
    } else {
      queueList.innerHTML = "<li>Loading...</li>";
    }
    updateQueue();
  });

  setInterval(() => updateQueue(true), 2000);

  startBtn.addEventListener("click", () => {
    console.log("Start clicked");
    chrome.runtime.sendMessage({ type: "startPlayback" }, (response) => {
      console.log("Start response:", response);
      updateQueue();
    });
  });

  stopBtn.addEventListener("click", () => {
    console.log("Stop clicked");
    chrome.runtime.sendMessage({ type: "stopPlayback" }, (response) => {
      console.log("Stop response:", response);
      updateQueue();
    });
  });

  clearBtn.addEventListener("click", () => {
    console.log("Clear clicked");
    chrome.runtime.sendMessage({ type: "clearQueue" }, (response) => {
      console.log("Clear response:", response);
      lastValidQueue = null;
      chrome.storage.local.remove("popupQueueCache", () => {
        console.log("Cleared cache");
        updateQueueDisplay([], -1, []);
      });
    });
  });

  skipBtn.addEventListener("click", () => {
    console.log("Skip clicked");
    chrome.runtime.sendMessage({ type: "skipVideo" }, (response) => {
      console.log("Skip response:", response);
      updateQueue();
    });
  });

  saveBtn.addEventListener("click", () => {
    console.log("Save playlist clicked");
    chrome.runtime.sendMessage({ type: "savePlaylist" }, (response) => {
      if (response && response.status === "playlist saved") {
        console.log("Playlist saved:", response.playlist);
        const blob = new Blob([JSON.stringify(response.playlist, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "youtube_dj_playlist.json";
        a.click();
        URL.revokeObjectURL(url);
      } else {
        console.error("Failed to save playlist:", response);
      }
    });
  });

  loadBtn.addEventListener("click", () => {
    console.log("Load playlist clicked");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (event) => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const playlist = JSON.parse(e.target.result);
            if (Array.isArray(playlist)) {
              chrome.runtime.sendMessage(
                { type: "loadPlaylist", playlist },
                (response) => {
                  console.log("Load playlist response:", response);
                  updateQueue();
                }
              );
            } else {
              console.error("Invalid playlist format");
            }
          } catch (error) {
            console.error("Error parsing playlist:", error);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  });

  addUrlBtn.addEventListener("click", () => {
    const url = addUrlInput.value.trim();
    if (!url) return;
    chrome.runtime.sendMessage({ type: "newLinks", links: [url] }, (response) => {
      addUrlInput.value = "";
      updateQueue();
    });
  });

  addUrlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      addUrlBtn.click();
    }
  });

  function updateQueue(isPeriodic = false, retries = 5) {
    if (!isPeriodic) {
      queueList.innerHTML = "<li>Loading...</li>";
    }
    chrome.runtime.sendMessage({ type: "getQueue" }, (response) => {
      if (
        chrome.runtime.lastError ||
        !response ||
        !Array.isArray(response.queue)
      ) {
        console.error(
          "Fetch error:",
          chrome.runtime.lastError?.message,
          response
        );
        if (retries > 0) {
          console.log(`Retrying (${retries} left)`);
          setTimeout(() => updateQueue(isPeriodic, retries - 1), 1000);
        } else if (lastValidQueue) {
          console.log("Using cache:", lastValidQueue);
          updateQueueDisplay(
            lastValidQueue.queue,
            lastValidQueue.currentIndex,
            lastValidQueue.playedSongs
          );
        } else {
          console.log("No cache, empty queue");
          queueList.innerHTML = "<li>No songs in queue</li>";
        }
        return;
      }
      console.log("Fetched queue:", response);
      lastValidQueue = {
        queue: response.queue,
        currentIndex: Number.isInteger(response.currentIndex)
          ? response.currentIndex
          : -1,
        playedSongs: Array.isArray(response.playedSongs)
          ? response.playedSongs
          : [],
      };
      chrome.storage.local.set({ popupQueueCache: lastValidQueue }, () => {
        console.log("Saved cache:", lastValidQueue);
      });
      updateQueueDisplay(
        lastValidQueue.queue,
        lastValidQueue.currentIndex,
        lastValidQueue.playedSongs
      );
    });
  }

  function updateQueueDisplay(queue, currentIndex, playedSongs) {
    queueList.innerHTML = "";
    if (!Array.isArray(queue) || queue.length === 0) {
      queueList.innerHTML = "<li>No songs in queue</li>";
      return;
    }
    queue.forEach((item, index) => {
      const li = document.createElement("li");
      const displayText =
        item.title ||
        (item.url.length > 50 ? item.url.substring(0, 47) + "..." : item.url);

      // Use a span for the text so buttons are not overwritten
      const textSpan = document.createElement("span");
      textSpan.textContent = displayText;
      if (item.duration) {
        textSpan.textContent += ` (${formatDuration(item.duration)})`;
      }
      if (index === currentIndex) {
        textSpan.style.color = "black";
        textSpan.style.fontWeight = "bold";
        textSpan.textContent += " (Playing)";
      } else if (playedSongs.includes(item.url)) {
        textSpan.style.color = "#888888";
        textSpan.style.textDecoration = "line-through";
        textSpan.textContent += " (Played)";
      } else {
        textSpan.style.color = "blue";
        textSpan.style.textDecoration = "underline";
      }
      li.appendChild(textSpan);

      // Remove button
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Remove";
      removeBtn.title = "Remove";
      removeBtn.style.marginLeft = "8px";
      removeBtn.onclick = () => {
        chrome.runtime.sendMessage({ type: "removeFromQueue", index }, () => {
          updateQueue();
        });
      };
      li.appendChild(removeBtn);

      // Move up button
      if (index > 0) {
        const upBtn = document.createElement("button");
        upBtn.textContent = "▲"; // Changed from "↑"
        upBtn.title = "Move Up";
        upBtn.style.marginLeft = "4px";
        upBtn.onclick = () => {
          chrome.runtime.sendMessage(
            { type: "moveInQueue", from: index, to: index - 1 },
            () => {
              updateQueue();
            }
          );
        };
        li.appendChild(upBtn);
      }

      // Move down button
      if (index < queue.length - 1) {
        const downBtn = document.createElement("button");
        downBtn.textContent = "▼"; // Changed from "↓"
        downBtn.title = "Move Down";
        downBtn.style.marginLeft = "4px";
        downBtn.onclick = () => {
          chrome.runtime.sendMessage(
            { type: "moveInQueue", from: index, to: index + 1 },
            () => {
              updateQueue();
            }
          );
        };
        li.appendChild(downBtn);
      }

      queueList.appendChild(li);
    });
    console.log(
      "Displayed:",
      queue,
      "Index:",
      currentIndex,
      "Played:",
      playedSongs
    );
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

  // Check and play the next unplayed video if applicable
  function checkAndPlayNext() {
    chrome.runtime.sendMessage({ type: "getQueue" }, (response) => {
      if (chrome.runtime.lastError || !response || !Array.isArray(response.queue)) {
        console.error("Error fetching queue:", chrome.runtime.lastError);
        return;
      }
      const { queue: videoQueue, currentIndex, isPaused } = response;
      if (videoQueue.length > 0 && !isPaused && currentIndex === -1) {
        playNextUnplayed();
      }
    });
  }

  // Play the next unplayed video in the queue
  function playNextUnplayed() {
    chrome.runtime.sendMessage({ type: "playNextUnplayed" }, (response) => {
      if (chrome.runtime.lastError || !response || response.status !== "success") {
        console.error("Error playing next unplayed video:", chrome.runtime.lastError);
      } else {
        console.log("Playing next unplayed video:", response.video);
        updateQueue();
      }
    });
  }
});