(() => {
  'use strict';
  const field = document.getElementById('message'), send = document.getElementById('sendMessage'), status = document.getElementById('messageStatus');
  const name = document.getElementById('senderName'), email = document.getElementById('senderEmail');
  const username = document.getElementById('babbleUsername'), remember = document.getElementById('rememberUsername');
  const linked = document.getElementById('linkedUsername'), unlink = document.getElementById('unlinkUsername');
  window.licketyMessage.identity().then(identity => {
    if (!identity?.username) return;
    username.value = identity.username;
    linked.textContent = `Currently linked: ${identity.username}. Linking another username replaces this choice after successful delivery.`;
    linked.hidden = unlink.hidden = false;
  }).catch(() => {});
  unlink.onclick = async () => {
    if (busy) return;
    unlink.disabled = true;
    try {
      const result = await window.licketyMessage.unlink();
      if (result?.ok) { linked.hidden = unlink.hidden = true; username.value = ''; remember.checked = false; }
      status.textContent = result?.message || 'The link could not be removed. Please try again.';
    } catch { status.textContent = 'The link could not be removed. Please try again.'; }
    finally { unlink.disabled = false; }
  };
  let busy = false, sent = false;
  field.addEventListener('input', () => {
    document.getElementById('count').textContent = `${field.value.length} / 500 characters`;
    send.disabled = busy || sent || !field.value.trim() || field.value.length > 500;
    status.textContent = '';
  });
  send.onclick = async () => {
    if (busy || sent || !field.value.trim() || field.value.length > 500) return;
    if (!email.reportValidity()) return;
    if (remember.checked && !/^[\p{L}\p{N}][\p{L}\p{N} _.'’\-]{0,79}$/u.test(username.value.trim().normalize('NFC'))) { status.textContent = 'Enter your Babble username before choosing to link it.'; username.focus(); return; }
    name.readOnly = email.readOnly = true;
    username.readOnly = true; remember.disabled = unlink.disabled = true;
    busy = true; send.disabled = true; field.readOnly = true; send.textContent = 'Sending…'; status.textContent = 'Sending your message…';
    try {
      const result = await window.licketyMessage.send({ message: field.value, name: name.value, email: email.value,
        ...(remember.checked ? { rememberUsername: true, babbleUsername: username.value } : {}) });
      sent = result?.ok === true;
      if (sent && result.usernameLinked === true) { linked.textContent = `Currently linked: ${username.value.trim()}`; linked.hidden = unlink.hidden = false; }
      status.textContent = result?.message || 'Your message could not be delivered. Please try again.';
    } catch { status.textContent = 'Your message could not be delivered. Please try again.'; }
    finally { busy = false; name.readOnly = email.readOnly = field.readOnly = sent; username.readOnly = sent; remember.disabled = sent; unlink.disabled = false; send.disabled = sent || !field.value.trim(); send.textContent = sent ? 'Sent' : 'Send message'; }
  };
  document.getElementById('closeMessage').onclick = () => window.close();
  addEventListener('keydown', event => { if (event.key === 'Escape') window.close(); });
})();
