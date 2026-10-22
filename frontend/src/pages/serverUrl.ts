/**
 * Da una pagina https il browser blocca le richieste verso http:// (contenuto misto),
 * tranne verso localhost. In quel caso serve un indirizzo https, per esempio il tunnel.
 */
export function needsHttps(pageProtocol: string, backendUrl: string): boolean {
  const url = backendUrl.trim();
  if (pageProtocol !== 'https:' || !/^http:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname;
    return !(host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost'));
  } catch {
    return true;
  }
}
