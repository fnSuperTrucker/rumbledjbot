console.log('YouTube content script loaded');

function monitorVideoEvents() {
  const video = document.querySelector('video');
  if (video) {
    attachVideoListeners(video);
  } else {
    console.log('No video element found, setting up observer...');
    setupVideoObserver();
  }
}

function attachVideoListeners(video) {
  console.log('Attaching listeners to video element');
  // Show overlay when video starts playing
  video.onplay = () => {
    console.log('Video started playing');
    chrome.runtime.sendMessage({ type: "getQueue" }, (response) => {
      if (response && response.queue) {
        showPlaylistOverlay(response.queue, response.currentIndex, response.playedSongs);
      }
    });
  };
  // Handle video end for playback
  video.onended = () => {
    console.log('Video ended');
    chrome.runtime.sendMessage({ type: "videoEnded" });
  };
}

function setupVideoObserver() {
  const observer = new MutationObserver((mutations) => {
    const video = document.querySelector('video');
    if (video && !video.dataset.djMonitored) {
      console.log('New video element detected');
      video.dataset.djMonitored = 'true'; // Prevent duplicate listeners
      attachVideoListeners(video);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

monitorVideoEvents();

window.addEventListener('load', () => {
  const playButton = document.querySelector('.ytp-play-button');
  if (playButton && playButton.getAttribute('aria-label') === 'Play') {
    console.log('Clicking play button');
    playButton.click();
  }
});

function showPlaylistOverlay(queue, currentIndex, playedSongs) {
  // Remove existing overlay if present
  const existingOverlay = document.getElementById('dj-playlist-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'dj-playlist-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '20px';
  overlay.style.right = '20px';
  overlay.style.maxWidth = '400px';
  overlay.style.maxHeight = '80vh';
  overlay.style.overflowY = 'auto';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
  overlay.style.color = 'white';
  overlay.style.padding = '15px';
  overlay.style.zIndex = '10000';
  overlay.style.fontFamily = 'Arial, sans-serif';
  overlay.style.opacity = '1';
  overlay.style.transition = 'opacity 1s ease-out';
  overlay.style.border = '2px solid #1e90ff';
  overlay.style.borderRadius = '8px';

  // Create playlist title
  const title = document.createElement('h3');
  title.textContent = 'YouTube DJ Queue';
  title.style.margin = '0 0 15px 0';
  title.style.fontSize = '24px';
  title.style.fontWeight = 'bold';
  overlay.appendChild(title);

  // Create list
  const ul = document.createElement('ul');
  ul.style.listStyle = 'none';
  ul.style.padding = '0';
  ul.style.margin = '0';

  if (queue.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No songs in queue';
    li.style.color = '#cccccc';
    li.style.fontSize = '18px';
    ul.appendChild(li);
  } else {
    queue.forEach((url, index) => {
      const li = document.createElement('li');
      const displayText = url.length > 50 ? url.substring(0, 47) + '...' : url;
      li.textContent = displayText;
      li.style.margin = '8px 0';
      li.style.wordWrap = 'break-word';
      li.style.fontSize = '18px';

      if (index === currentIndex) {
        li.style.color = 'white';
        li.style.fontWeight = 'bold';
        li.textContent += ' (Playing)';
      } else if (playedSongs.includes(url)) {
        li.style.color = '#888888';
        li.style.textDecoration = 'line-through';
        li.textContent += ' (Played)';
      } else {
        li.style.color = '#1e90ff';
      }

      ul.appendChild(li);
    });
  }

  overlay.appendChild(ul);
  document.body.appendChild(overlay);

  // Fade out after 8 seconds
  setTimeout(() => {
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.remove();
    }, 1000); // Remove after fade-out completes
  }, 8000);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "pauseVideo") {
    const video = document.querySelector('video');
    if (video) {
      console.log('Pausing video');
      video.pause();
      sendResponse({ status: "video paused" });
    } else {
      console.log('No video element found to pause');
      sendResponse({ status: "no video found" });
    }
  } else if (message.type === "playVideo") {
    const video = document.querySelector('video');
    if (video) {
      console.log('Resuming video');
      video.play();
      sendResponse({ status: "video playing" });
    } else {
      console.log('No video element found to play');
      sendResponse({ status: "no video found" });
    }
  } else if (message.type === "showPlaylist") {
    if (message.queue && message.currentIndex !== undefined && message.playedSongs) {
      showPlaylistOverlay(message.queue, message.currentIndex, message.playedSongs);
    }
    sendResponse({ status: "playlist shown" });
  }
});