let videoQueue = []; // Stores objects: { url: string, title: string, duration: number }
let playedSongs = new Set();
let currentIndex = -1;
let currentTabId = null;
let isPaused = true;
let isStateLoaded = false;
let pendingMessages = [];
let isPlayingNext = false;

function loadState() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(
      ["videoQueue", "playedSongs", "currentIndex", "isPaused", "currentTabId"],
      (result) => {
        try {
          videoQueue = Array.isArray(result.videoQueue)
            ? result.videoQueue.map((item) =>
                typeof item === "string"
                  ? { url: item, title: null, duration: null }
                  : item
              )
            : [];
          playedSongs = new Set(
            Array.isArray(result.playedSongs) ? result.playedSongs : []
          );
          currentIndex = Number.isInteger(result.currentIndex)
            ? result.currentIndex
            : -1;
          isPaused =
            typeof result.isPaused === "boolean" ? result.isPaused : true;
          currentTabId = Number.isInteger(result.currentTabId)
            ? result.currentTabId
            : null;
          isStateLoaded = true;
          console.log("Loaded state:", {
            videoQueue,
            playedSongs: Array.from(playedSongs),
            currentIndex,
            isPaused,
            currentTabId,
          });
          resolve();
        } catch (e) {
          console.error("State load error:", e);
          reject(e);
        }
      }
    );
  });
}

function saveState() {
  if (!isStateLoaded) {
    console.warn("State not loaded, skipping save");
    return;
  }
  const state = {
    videoQueue: Array.isArray(videoQueue) ? videoQueue : [],
    playedSongs: Array.from(playedSongs),
    currentIndex: Number.isInteger(currentIndex) ? currentIndex : -1,
    isPaused,
    currentTabId: Number.isInteger(currentTabId) ? currentTabId : null,
  };
  chrome.storage.local.set(state, () => {
    if (chrome.runtime.lastError) {
      console.error("State save error:", chrome.runtime.lastError.message);
    } else {
      console.log("Saved state:", state);
    }
  });
}

loadState()
  .then(() => {
    console.log(
      "Background ready, handling",
      pendingMessages.length,
      "messages"
    );
    pendingMessages.forEach(({ message, sender, sendResponse }) => {
      handleMessage(message, sender, sendResponse);
    });
    pendingMessages = [];
  })
  .catch((e) => {
    console.error("State load failed, resetting:", e);
    videoQueue = [];
    playedSongs.clear();
    currentIndex = -1;
    isPaused = true;
    currentTabId = null;
    isStateLoaded = true;
    saveState();
  });

function handleMessage(message, sender, sendResponse) {
  if (message.type === "newLinks") {
    console.log("New links:", message.links);
    if (Array.isArray(message.links)) {
      message.links.forEach((link) => {
        if (
          typeof link === "string" &&
          !videoQueue.some((item) => item.url === link)
        ) {
          videoQueue.push({ url: link, title: null, duration: null });
          console.log("Added:", link);
        }
      });
    }
    console.log("Queue:", videoQueue);
    saveState();
    if (videoQueue.length > 0 && !isPaused && currentIndex === -1) {
      playNextUnplayed();
    }
    sendResponse({ status: "links added" });
  } else if (message.type === "getQueue") {
    console.log("Queue requested:", videoQueue);
    sendResponse({
      queue: Array.isArray(videoQueue) ? videoQueue : [],
      currentIndex,
      playedSongs: Array.from(playedSongs),
    });
  } else if (message.type === "startPlayback") {
    console.log("Start playback:", videoQueue);
    isPaused = false;
    saveState();
    if (videoQueue.length > 0) {
      if (
        currentTabId &&
        currentIndex >= 0 &&
        !playedSongs.has(videoQueue[currentIndex].url)
      ) {
        chrome.tabs.get(currentTabId, (tab) => {
          if (chrome.runtime.lastError || !tab) {
            console.log("Tab not found:", currentTabId);
            currentTabId = null;
            saveState();
            playNextUnplayed();
          } else {
            console.log("Resuming tab:", currentTabId);
            chrome.tabs.sendMessage(
              currentTabId,
              {
                type: "playVideo",
                queue: videoQueue,
                currentIndex: currentIndex,
                playedSongs: Array.from(playedSongs),
              },
              (response) => {
                console.log("Play response:", response);
              }
            );
          }
        });
      } else {
        playNextUnplayed();
      }
    }
    sendResponse({ status: "playback started" });
  } else if (message.type === "videoEnded" || message.type === "skipVideo") {
    console.log(`${message.type}, index:`, currentIndex);
    if (currentIndex >= 0 && currentIndex < videoQueue.length) {
      playedSongs.add(videoQueue[currentIndex].url);
      console.log("Played:", videoQueue[currentIndex].url);
    }
    isPaused = false;
    saveState();
    playNextUnplayed();
    sendResponse({ status: "next video" });
  } else if (message.type === "stopPlayback") {
    console.log("Stop playback");
    if (currentTabId && currentIndex >= 0) {
      isPaused = true;
      chrome.tabs.sendMessage(
        currentTabId,
        { type: "pauseVideo" },
        (response) => {
          console.log("Pause response:", response);
        }
      );
    }
    saveState();
    sendResponse({ status: "playback stopped" });
  } else if (message.type === "clearQueue") {
    console.log("Clear queue");
    if (currentTabId) {
      chrome.tabs.remove(currentTabId, () => {
        if (chrome.runtime.lastError) {
          console.log("Tab close error:", chrome.runtime.lastError.message);
        }
      });
      currentTabId = null;
    }
    videoQueue = [];
    playedSongs.clear();
    currentIndex = -1;
    isPaused = true;
    saveState();
    sendResponse({ status: "queue cleared" });
  } else if (message.type === "videoInfo") {
    console.log("Received video info:", message);
    if (
      currentIndex >= 0 &&
      currentIndex < videoQueue.length &&
      videoQueue[currentIndex].url === message.url
    ) {
      videoQueue[currentIndex].title = message.title || "Unknown Title";
      videoQueue[currentIndex].duration = message.durationSeconds || 0;
      saveState();
      if (message.durationSeconds > 720) {
        console.log("Video too long, skipping:", message.url);
        playedSongs.add(videoQueue[currentIndex].url);
        playNextUnplayed();
      } else {
        chrome.tabs.sendMessage(
          currentTabId,
          {
            type: "showPlaylist",
            queue: videoQueue,
            currentIndex,
            playedSongs: Array.from(playedSongs),
          },
          (response) => {
            console.log("Playlist sent after info:", response);
          }
        );
      }
    }
    sendResponse({ status: "video info processed" });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isStateLoaded) {
    console.log("Queuing message:", message.type);
    pendingMessages.push({ message, sender, sendResponse });
    return true;
  }
  handleMessage(message, sender, sendResponse);
  return true;
});

function playNextUnplayed() {
  if (isPlayingNext) {
    console.log("Already playing next, skipping");
    return;
  }
  isPlayingNext = true;
  console.log(
    "playNextUnplayed, queue:",
    videoQueue,
    "played:",
    Array.from(playedSongs)
  );
  currentIndex = videoQueue.findIndex((item) => !playedSongs.has(item.url));
  console.log("Next index:", currentIndex);

  if (currentIndex >= 0 && currentIndex < videoQueue.length) {
    const video = videoQueue[currentIndex];
    console.log("Attempting to play:", video.url);

    if (currentTabId) {
      chrome.tabs.get(currentTabId, (tab) => {
        if (
          tab &&
          tab.url.includes("youtube.com") &&
          tab.status === "complete"
        ) {
          console.log("Using current tab:", currentTabId);
          updateTabWithRetry(currentTabId, video.url);
        } else {
          console.log("Current tab invalid:", currentTabId);
          currentTabId = null;
          findYouTubeTab(video.url);
        }
      });
    } else {
      findYouTubeTab(video.url);
    }
  } else {
    console.log("No unplayed videos");
    currentIndex = -1;
    isPaused = false;
    currentTabId = null;
    saveState();
    isPlayingNext = false;
  }
}

function findYouTubeTab(videoUrl) {
  chrome.tabs.query(
    {
      url: [
        "*://*.youtube.com/watch*",
        "*://*.youtube.com/shorts/*",
        "*://*.youtube.com/live/*",
      ],
    },
    (tabs) => {
      console.log(
        "Specific tabs:",
        tabs.map((t) => t.url)
      );
      if (tabs.length > 0 && tabs[0].status === "complete") {
        currentTabId = tabs[0].id;
        console.log("Reusing specific tab:", currentTabId, tabs[0].url);
        updateTabWithRetry(currentTabId, videoUrl);
      } else {
        chrome.tabs.query({ url: "*://*.youtube.com/*" }, (fallbackTabs) => {
          console.log(
            "Fallback tabs:",
            fallbackTabs.map((t) => t.url)
          );
          if (
            fallbackTabs.length > 0 &&
            fallbackTabs[0].status === "complete"
          ) {
            currentTabId = fallbackTabs[0].id;
            console.log(
              "Reusing fallback tab:",
              currentTabId,
              fallbackTabs[0].url
            );
            updateTabWithRetry(currentTabId, videoUrl);
          } else {
            console.log("No YouTube tabs, creating new");
            createNewTab(videoUrl);
          }
        });
      }
    }
  );
}

function updateTabWithRetry(tabId, videoUrl, retries = 3) {
  console.log(`Updating tab ${tabId}: ${videoUrl}, retries: ${retries}`);
  chrome.tabs.update(tabId, { url: videoUrl, active: true }, (updatedTab) => {
    if (chrome.runtime.lastError) {
      console.error("Update failed:", chrome.runtime.lastError.message);
      if (retries > 0) {
        setTimeout(
          () => updateTabWithRetry(tabId, videoUrl, retries - 1),
          1000
        );
      } else {
        console.log("Retries exhausted, finding new tab");
        currentTabId = null;
        findYouTubeTab(videoUrl);
      }
    } else {
      console.log("Tab updated:", tabId);
      currentTabId = tabId;
      saveState();
      waitForTabReady(currentTabId, videoUrl, updatedTab);
      isPlayingNext = false;
    }
  });
}

function createNewTab(videoUrl) {
  console.log("Creating tab:", videoUrl);
  chrome.tabs.create({ url: videoUrl }, (tab) => {
    if (chrome.runtime.lastError) {
      console.error("Create tab error:", chrome.runtime.lastError.message);
      isPlayingNext = false;
      return;
    }
    currentTabId = tab.id;
    console.log("Created tab:", currentTabId);
    chrome.tabs.onRemoved.addListener(function listener(tabId) {
      if (tabId === currentTabId) {
        console.log("Tab closed:", tabId);
        currentTabId = null;
        currentIndex = -1;
        isPaused = false;
        saveState();
        chrome.tabs.onRemoved.removeListener(listener);
      }
    });
    saveState();
    waitForTabReady(currentTabId, videoUrl, tab);
    isPlayingNext = false;
  });
}

function waitForTabReady(tabId, videoUrl, tab) {
  chrome.tabs.get(tabId, (tabInfo) => {
    if (chrome.runtime.lastError || !tabInfo) {
      console.error("Tab not found:", tabId);
      currentTabId = null;
      findYouTubeTab(videoUrl);
      return;
    }
    if (tabInfo.status === "complete") {
      console.log("Tab ready:", tabId);
      fetchVideoInfoWithRetries(videoUrl, tab, 3, [3000, 3000, 3000]);
    } else {
      console.log("Tab not ready, waiting:", tabId, tabInfo.status);
      setTimeout(() => waitForTabReady(tabId, videoUrl, tab), 1000);
    }
  });
}

function fetchVideoInfoWithRetries(videoUrl, tab, retries, delays) {
  if (
    retries <= 0 ||
    currentIndex < 0 ||
    videoQueue[currentIndex].url !== videoUrl ||
    !currentTabId
  ) {
    console.log("Stopping retries:", {
      retries,
      currentIndex,
      videoUrl,
      currentTabId,
    });
    if (retries <= 0) {
      console.error("All retries failed for video info:", videoUrl);
      handleMessage(
        {
          type: "videoInfo",
          url: videoUrl,
          title: "Unknown Title",
          durationSeconds: 0,
        },
        { tab },
        () => {}
      );
    }
    return;
  }

  const delay = delays[3 - retries];
  console.log(
    `Attempting to fetch video info for ${videoUrl}, retry ${retries}, delay ${delay}ms`
  );

  setTimeout(() => {
    chrome.tabs.get(currentTabId, (tabInfo) => {
      if (chrome.runtime.lastError || !tabInfo) {
        console.error("Tab no longer exists:", currentTabId);
        currentTabId = null;
        findYouTubeTab(videoUrl);
        return;
      }
      chrome.tabs.sendMessage(
        currentTabId,
        { type: "getVideoInfo", url: videoUrl },
        (response) => {
          if (chrome.runtime.lastError || !response) {
            console.log(
              "Video info fetch failed, retrying...",
              chrome.runtime.lastError?.message
            );
            fetchVideoInfoWithRetries(videoUrl, tab, retries - 1, delays);
          } else {
            console.log("Video info received:", response);
            if (
              !response.title ||
              response.title === "Unknown Title" ||
              !response.durationSeconds
            ) {
              console.log("Incomplete info, retrying...");
              fetchVideoInfoWithRetries(videoUrl, tab, retries - 1, delays);
            } else {
              handleMessage(
                {
                  type: "videoInfo",
                  url: videoUrl,
                  title: response.title,
                  durationSeconds: response.durationSeconds,
                },
                { tab },
                () => {}
              );
            }
          }
        }
      );
    });
  }, delay);
}

function sendPlaylistWithRetry(
  tabId,
  queue,
  currentIndex,
  playedSongs,
  retries = 5,
  delay = 1000
) {
  if (retries <= 0) {
    console.log("Playlist send retries exhausted:", tabId);
    return;
  }
  chrome.tabs.sendMessage(
    tabId,
    {
      type: "showPlaylist",
      queue,
      currentIndex,
      playedSongs,
    },
    (response) => {
      if (chrome.runtime.lastError || !response) {
        console.log(
          `Playlist send failed, retrying in ${delay}ms (${retries - 1} left)`
        );
        setTimeout(() => {
          sendPlaylistWithRetry(
            tabId,
            queue,
            currentIndex,
            playedSongs,
            retries - 1,
            delay * 1.5
          );
        }, delay);
      } else {
        console.log("Playlist sent:", tabId, response);
      }
    }
  );
}
