'use strict';
function cleanUsername(value) {
  if (typeof value !== 'string' || value.length > 80) return '';
  const name = value.trim().normalize('NFC');
  return /^[\p{L}\p{N}][\p{L}\p{N} _.'’\-]{0,79}$/u.test(name) ? name : '';
}
function validUsernameLink(value) {
  return value?.consentVersion === 1 && !!cleanUsername(value.username) && cleanUsername(value.username) === value.username &&
    typeof value.since === 'string' && Number.isFinite(Date.parse(value.since));
}
function usernameReportFields(link, occurredAt = Date.now()) {
  // Off is explicit so a newer report can clear an earlier displayed username.
  const fields = { usernameSharingVersion: 1 };
  if (validUsernameLink(link) && Date.parse(link.since) <= Number(occurredAt)) fields.babbleUsername = link.username;
  return fields;
}
module.exports = { cleanUsername, validUsernameLink, usernameReportFields };
