const store = [];

export function rememberOutboundEmail(entry) {
  store.unshift({ ...entry, sentAt: new Date().toISOString() });
  if (store.length > 50) store.pop();
}

export function listOutboundEmails() {
  return store;
}
