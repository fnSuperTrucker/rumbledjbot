// Linkify and YouTube link extraction for pilled.net chat

// Regex to match URLs
const urlRegex = /(?:^|\s)(https?:\/\/[^\s]+)/g;

// Regex to match YouTube links
const youtubeRegex =
  /https?:\/\/(?:[\w-]+\.)?youtube\.com\/(?:watch\?v=|embed\/|v\/|live\/|shorts\/)?([\w-]{11})(?:\?.*)?|youtu\.be\/([\w-]{11})(?:\?.*)?/i;

// Function to linkify and extract YouTube links
function linkifyAndExtract(span) {
  const text = span.textContent.trim();
  if (span.dataset.linkified) return;

  let newHtml = text;
  let hasLinks = false;
  let youtubeLinks = [];

  // Replace URLs with anchor tags and collect YouTube links
  newHtml = text.replace(urlRegex, (match, url) => {
    hasLinks = true;
    // If there's a space before the URL, preserve it
    const prefix = match.startsWith(' ') ? ' ' : '';
    // Check for YouTube link
    if (youtubeRegex.test(url)) {
      youtubeLinks.push(url);
    }
    return `${prefix}<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #1e90ff; text-decoration: underline; cursor: pointer;">${url}</a>`;
  });

  if (hasLinks) {
    span.innerHTML = newHtml;
    span.dataset.linkified = 'true';
    console.log(`Linkified: "${text}" -> "${span.innerHTML}"`);
  }

  // Send YouTube links to extension
  if (youtubeLinks.length > 0) {
    chrome.runtime.sendMessage({ type: "newLinks", links: youtubeLinks });
  }
}

// Process chat spans
function processChat() {
  const spans = document.querySelectorAll('span.ng-star-inserted:not([data-linkified]), span.chat-message:not([data-linkified])');
  spans.forEach(linkifyAndExtract);
}

// Initialize with observer for dynamic updates
function initialize() {
  processChat();
  setTimeout(processChat, 1000);
  setTimeout(processChat, 3000);

  const observer = new MutationObserver((mutations) => {
    let shouldProcess = false;
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length) {
        shouldProcess = true;
      }
    });
    if (shouldProcess) {
      processChat();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  console.log('Pilled.net chat observer started');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}