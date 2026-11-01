const isPrivateIpv4 = (host: string) => {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return false;
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    // Tailscale addresses; the app is meant to work across a tailnet.
    (a === 100 && b >= 64 && b <= 127)
  );
};

const isPrivateIpv6 = (host: string) => {
  const bare = host.replace(/^\[|\]$/g, "").toLowerCase();
  return bare === "::1" || /^f[cd][0-9a-f]{2}:/.test(bare) || bare.startsWith("fe80:");
};

/**
 * A speech queue address may point at this machine or the local network over HTTP(S),
 * never at credentials, fragments, or a public IP literal. Hostnames are allowed because
 * they cannot be classified without a lookup. Returns the parsed URL or the refusal reason.
 */
export function validateSpeechServiceAddress(address: string): URL | string {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return "Enter a full speech service address, such as http://127.0.0.1:8011/say.";
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
    return "Use an HTTP or HTTPS speech service address without credentials.";
  }
  const host = url.hostname;
  const literalIp = /^[\d.]+$/.test(host) || host.startsWith("[") || host.includes(":");
  if (literalIp && !isPrivateIpv4(host) && !isPrivateIpv6(host)) {
    return "The speech service must be on this machine or your local network.";
  }
  return url;
}
