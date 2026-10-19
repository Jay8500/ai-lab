/** Print an HTML document from a hidden iframe (waits for its images so logos / QR / barcodes appear). */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1500);
  };
  // Wait for the logo + QR to load so they appear on paper
  const imgs = Array.from(doc.images);
  let pending = imgs.filter((i) => !i.complete).length;
  if (!pending) {
    setTimeout(go, 50);
    return;
  }
  const done = () => --pending <= 0 && go();
  imgs.forEach((i) => {
    if (!i.complete) {
      i.onload = done;
      i.onerror = done;
    }
  });
  setTimeout(() => pending > 0 && ((pending = 0), go()), 3000);
}
