(() => {
  'use strict';
  const field = document.getElementById('message'), send = document.getElementById('sendMessage'), status = document.getElementById('messageStatus');
  const name = document.getElementById('senderName'), email = document.getElementById('senderEmail');
  let busy = false, sent = false;
  field.addEventListener('input', () => {
    document.getElementById('count').textContent = `${field.value.length} / 500 characters`;
    send.disabled = busy || sent || !field.value.trim() || field.value.length > 500;
    status.textContent = '';
  });
  send.onclick = async () => {
    if (busy || sent || !field.value.trim() || field.value.length > 500) return;
    if (!email.reportValidity()) return;
    name.readOnly = email.readOnly = true;
    busy = true; send.disabled = true; field.readOnly = true; send.textContent = 'Sending…'; status.textContent = 'Sending your message…';
    try {
      const result = await window.licketyMessage.send({ message: field.value, name: name.value, email: email.value });
      sent = result?.ok === true;
      status.textContent = result?.message || 'Your message could not be delivered. Please try again.';
    } catch { status.textContent = 'Your message could not be delivered. Please try again.'; }
    finally { busy = false; name.readOnly = email.readOnly = field.readOnly = sent; send.disabled = sent || !field.value.trim(); send.textContent = sent ? 'Sent' : 'Send message'; }
  };
  document.getElementById('closeMessage').onclick = () => window.close();
  addEventListener('keydown', event => { if (event.key === 'Escape') window.close(); });
})();
