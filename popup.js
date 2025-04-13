document.addEventListener('DOMContentLoaded', () => {
  const queueList = document.getElementById('queueList');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const clearBtn = document.getElementById('clearBtn');

  updateQueue();
  setInterval(updateQueue, 2000); // Keep updating every 2 seconds

  startBtn.addEventListener('click', () => {
    console.log('Start button clicked');
    chrome.runtime.sendMessage({ type: "startPlayback" }, (response) => {
      console.log('Start playback response:', response);
      updateQueue(); // Ensure queue updates immediately
    });
  });

  stopBtn.addEventListener('click', () => {
    console.log('Stop button clicked');
    chrome.runtime.sendMessage({ type: "stopPlayback" }, (response) => {
      console.log('Stop playback response:', response);
      updateQueue(); // Ensure queue updates after stopping
    });
  });

  clearBtn.addEventListener('click', () => {
    console.log('Clear button clicked');
    chrome.runtime.sendMessage({ type: "clearQueue" }, (response) => {
      console.log('Clear queue response:', response);
      updateQueue(); // Refresh UI after clearing
    });
  });

  function updateQueue() {
    chrome.runtime.sendMessage({ type: "getQueue" }, (response) => {
      console.log('Popup received queue:', response);
      if (response && response.queue) {
        updateQueueDisplay(response.queue, response.currentIndex, response.playedSongs);
      } else {
        queueList.innerHTML = '<li>No songs in queue</li>'; // Fallback if queue is empty
      }
    });
  }

  function updateQueueDisplay(queue, currentIndex, playedSongs) {
    queueList.innerHTML = '';
    if (queue.length === 0) {
      queueList.innerHTML = '<li>No songs in queue</li>';
      return;
    }
    queue.forEach((url, index) => {
      const li = document.createElement('li');
      const displayText = url.length > 50 ? url.substring(0, 47) + '...' : url;
      li.textContent = displayText;

      if (index === currentIndex) {
        li.style.color = 'black';
        li.style.fontWeight = 'bold';
        li.textContent += ' (Playing)';
      } else if (playedSongs.includes(url)) {
        li.style.color = '#888888';
        li.style.textDecoration = 'line-through';
        li.textContent += ' (Played)';
      } else {
        li.style.color = 'blue';
        li.style.textDecoration = 'underline';
      }

      queueList.appendChild(li);
    });
    console.log('Queue displayed:', queue, 'Current index:', currentIndex, 'Played songs:', playedSongs);
  }
});