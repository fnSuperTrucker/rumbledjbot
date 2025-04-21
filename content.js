console.log("YouTube DJ Bot: Chat scanning starting...");

const youtubeRegex =
  /https?:\/\/(?:[\w-]+\.)?youtube\.com\/(?:watch\?v=|embed\/|v\/|live\/|shorts\/)?([\w-]{11})(?:\?.*)?|youtu\.be\/([\w-]{11})(?:\?.*)?|https?:\/\/(?:[\w-]+\.)?youtube\.com\/(?:@[\w-]+|channel\/[\w-]{24}|playlist\?list=PL[\w-]{32})/i;

function extractYouTubeLinks(text) {
  const matches = [...text.matchAll(youtubeRegex)];
  const youtubeUrls = matches.map((match) => match[0]);
  return youtubeUrls.filter((url) => url);
}

function watchChat() {
  const target = document.getElementById("chat-history-list");

  if (!target) {
    console.log(
      "Chat container (#chat-history-list) not found yet, retrying in 1s..."
    );
    setTimeout(watchChat, 1000);
    return;
  }

  console.log("Found chat container, starting to watch for YouTube links...");

  processInitialChat(target);

  const observer = new MutationObserver((mutations) => {
    let youtubeLinks = [];

    mutations.forEach((mutation) => {
      console.log(
        "Mutation detected, processing",
        mutation.addedNodes.length,
        "new nodes"
      );
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const spans = node.matches("span.ng-star-inserted, span.chat-message")
          ? [node]
          : [
              ...node.querySelectorAll(
                "span.ng-star-inserted, span.chat-message"
              ),
            ];

        spans.forEach((span) => {
          if (span.dataset?.processed) return;

          const text = span.textContent || "";
          const links = extractYouTubeLinks(text);

          if (links.length > 0) {
            console.log(`Found ${links.length} YouTube links in span:`, links);
            youtubeLinks.push(...links);
          }

          span.dataset.processed = true;
        });

        const links = [...node.querySelectorAll("a[href]")];
        links.forEach((link) => {
          if (link.dataset?.processed) return;

          const url = link.href;
          if (youtubeRegex.test(url)) {
            console.log(`Found YouTube link in <a> tag: ${url}`);
            youtubeLinks.push(url);
          }

          link.dataset.processed = true;
        });
      });
    });

    if (youtubeLinks.length > 0) {
      console.log("Sending new YouTube links to background:", youtubeLinks);
      chrome.runtime.sendMessage({ type: "newLinks", links: youtubeLinks });
    } else {
      console.log("No new YouTube links in this mutation");
    }
  });

  observer.observe(target, { childList: true, subtree: true });
  console.log("MutationObserver started on #chat-history-list");
}

function processInitialChat(target) {
  const spans = target.querySelectorAll(
    "span.ng-star-inserted:not([data-processed]), span.chat-message:not([data-processed])"
  );
  console.log("Processing initial", spans.length, "spans");

  let youtubeLinks = [];

  spans.forEach((span) => {
    const text = span.textContent || "";
    const links = extractYouTubeLinks(text);

    if (links.length > 0) {
      console.log(`Initial scan found ${links.length} YouTube links:`, links);
      youtubeLinks.push(...links);
    }

    span.dataset.processed = true;
  });

  const links = target.querySelectorAll("a[href]:not([data-processed])");
  links.forEach((link) => {
    const url = link.href;
    if (youtubeRegex.test(url)) {
      console.log(`Initial scan found YouTube link in <a> tag: ${url}`);
      youtubeLinks.push(url);
    }

    link.dataset.processed = true;
  });

  if (youtubeLinks.length > 0) {
    console.log("Sending initial YouTube links to background:", youtubeLinks);
    chrome.runtime.sendMessage({ type: "newLinks", links: youtubeLinks });
  } else {
    console.log("No YouTube links found in initial scan");
  }
}

watchChat();
