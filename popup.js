document.addEventListener("DOMContentLoaded", () => {
  const queueList = document.getElementById("queueList");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const clearBtn = document.getElementById("clearBtn");
  const skipBtn = document.getElementById("skipBtn");

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
      li.textContent = displayText;
      if (item.duration) {
        li.textContent += ` (${formatDuration(item.duration)})`;
      }

      if (index === currentIndex) {
        li.style.color = "black";
        li.style.fontWeight = "bold";
        li.textContent += " (Playing)";
      } else if (playedSongs.includes(item.url)) {
        li.style.color = "#888888";
        li.style.textDecoration = "line-through";
        li.textContent += " (Played)";
      } else {
        li.style.color = "blue";
        li.style.textDecoration = "underline";
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
});
