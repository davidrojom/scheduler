import { toBlob } from 'html-to-image';

// TODO: Fix document is not defined inside worker
addEventListener('message', async ({ data }) => {
  const { nodeHTML } = data;

  const $node = document.createElement('div');
  $node.innerHTML = nodeHTML;

  const imageBlob = await toBlob($node, {
    skipFonts: true,
    width: $node.scrollWidth,
    height: $node.scrollHeight,
    backgroundColor: '#bfdbfe',
    type: 'image/png',
  });

  if (!imageBlob) {
    postMessage({ error: 'Failed to take screenshot' });
  } else {
    postMessage({ imageBlob });
  }
});
