let videoQueue = []; // Full list of all requests in order
let playedSongs = new Set(); // Tracks URLs that have been played
let currentIndex = -1; // Index of the currently playing video
let currentTabId = null;
let isPaused = true; // Start in paused state to prevent auto-play on first load

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "newLinks") {
    console.log('Received new links:', message.links);
    message.links.forEach(link => {
      if (!videoQueue.includes(link)) {
        videoQueue.push(link);
      }
    });
    console.log('Updated queue:', videoQueue);
    // Only start playback if not paused and no video is playing
    if (videoQueue.length > 0 && !isPaused && currentIndex === -1) {
      playNextUnplayed();
    }
    sendResponse({ status: "links added" });
  } else if (message.type === "getQueue") {
    console.log('Queue requested, returning:', videoQueue);
    sendResponse({ queue: videoQueue, currentIndex: currentIndex, playedSongs: Array.from(playedSongs) });
  } else if (message.type === "startPlayback") {
    console.log('Starting playback with queue:', videoQueue);
    isPaused = false; // Unpause to allow playback
    if (videoQueue.length > 0) {
      if (currentTabId && currentIndex >= 0 && !playedSongs.has(videoQueue[currentIndex])) {
        chrome.tabs.sendMessage(currentTabId, { 
          type: "playVideo",
          queue: videoQueue,
          currentIndex: currentIndex,
          playedSongs: Array.from(playedSongs)
        }, (response) => {
          console.log('Play video response:', response);
        });
      } else {
        playNextUnplayed();
      }
    }
    sendResponse({ status: "playback started" });
  } else if (message.type === "videoEnded") {
    console.log('Video ended, advancing to next');
    if (currentIndex >= 0 && currentIndex < videoQueue.length) {
      playedSongs.add(videoQueue[currentIndex]);
    }
    isPaused = false; // Ensure we keep playing next video
    playNextUnplayed();
    sendResponse({ status: "next video" });
  } else if (message.type === "stopPlayback") {
    console.log('Stopping playback');
    if (currentTabId && currentIndex >= 0) {
      isPaused = true; // Pause playback
      chrome.tabs.sendMessage(currentTabId, { type: "pauseVideo" }, (response) => {
        console.log('Pause video response:', response);
      });
    }
    sendResponse({ status: "playback stopped" });
  } else if (message.type === "clearQueue") {
    console.log('Clearing queue');
    if (currentTabId) {
      chrome.tabs.remove(currentTabId);
      currentTabId = null;
    }
    videoQueue = [];
    playedSongs.clear();
    currentIndex = -1;
    isPaused = true; // Reset to paused state
    sendResponse({ status: "queue cleared" });
  }
});

function playNextUnplayed() {
  currentIndex = videoQueue.findIndex(url => !playedSongs.has(url));
  if (currentIndex >= 0 && currentIndex < videoQueue.length) {
    const videoUrl = videoQueue[currentIndex];
    console.log('Playing unplayed video at index', currentIndex, ':', videoUrl);
    if (currentTabId) {
      chrome.tabs.get(currentTabId, (tab) => {
        if (chrome.runtime.lastError || !tab || !tab.url.includes('youtube.com')) {
          console.log('Tab not found or not on YouTube, creating new one');
          createNewTab(videoUrl);
        } else {
          console.log('Reusing existing YouTube tab with ID:', currentTabId);
          chrome.tabs.update(currentTabId, { url: videoUrl, active: true }, (updatedTab) => {
            if (chrome.runtime.lastError) {
              console.log('Tab update failed, creating new one');
              createNewTab(videoUrl);
            } else {
              console.log('Updated tab with ID:', currentTabId);
              // Delay playlist message to ensure page is loaded
              setTimeout(() => {
                sendPlaylistWithRetry(currentTabId, videoQueue, currentIndex, Array.from(playedSongs));
              }, 2000); // Wait 2 seconds for page load
            }
          });
        }
      });
    } else {
      console.log('No current tab, creating new one');
      createNewTab(videoUrl);
    }
  } else {
    console.log('No unplayed songs in queue, stopping playback');
    currentIndex = -1;
    isPaused = false; // Allow auto-resumption when new links are added
  }
}

function createNewTab(videoUrl) {
  chrome.tabs.create({ url: videoUrl }, (tab) => {
    currentTabId = tab.id;
    console.log('Created tab with ID:', currentTabId);
    chrome.tabs.onRemoved.addListener(function listener(tabId) {
      if (tabId === currentTabId) {
        currentTabId = null;
        currentIndex = -1;
        isPaused = false; // Allow auto-resumption if tab is closed
        console.log('Tab closed, playback stopped');
        chrome.tabs.onRemoved.removeListener(listener);
      }
    });
    // Delay playlist message for new tab
    setTimeout(() => {
      sendPlaylistWithRetry(currentTabId, videoQueue, currentIndex, Array.from(playedSongs));
    }, 2000);
  });
}

function sendPlaylistWithRetry(tabId, queue, currentIndex, playedSongs, retries = 5, delay = 1000) {
  if (retries <= 0) {
    console.log('Max retries reached, could not show playlist');
    return;
  }
  chrome.tabs.sendMessage(tabId, {
    type: "showPlaylist",
    queue: queue,
    currentIndex: currentIndex,
    playedSongs: playedSongs
  }, (response) => {
    if (chrome.runtime.lastError || !response) {
      console.log(`No response, retrying in ${delay}ms (${retries - 1} retries left)`);
      setTimeout(() => {
        sendPlaylistWithRetry(tabId, queue, currentIndex, playedSongs, retries - 1, delay * 1.5);
      }, delay);
    } else {
      console.log('Show playlist response:', response);
    }
  });
}