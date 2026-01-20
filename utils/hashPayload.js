export async function signPayload(payload, secrets, options = {}) {
  const { salt = "", info = "payload-signing" } = options;

  if (!Array.isArray(secrets) || secrets.length === 0) {
    throw new Error("`secrets` must be a non-empty string[]");
  }

  // 1) Canonicalize payload for deterministic signing
  const normalized =
    typeof payload === "string" ? payload : JSON.stringify(sortObject(payload));

  // 2) Combine multiple secrets into Initial Key Material (IKM)
  const enc = new TextEncoder();
  const ikm = concatBytes(secrets.map(s => enc.encode(s)));

  // 3) HKDF derive a key for HMAC-SHA256
  const baseKey = await crypto.subtle.importKey(
    "raw",
    ikm,
    "HKDF",
    false,
    ["deriveKey"]
  );

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode(salt),         // public, consistent across signer/verifier
      info: enc.encode(info),         // public, describes purpose (domain separation)
    },
    baseKey,
    {
      name: "HMAC",
      hash: "SHA-256",
      length: 256,
    },
    false,
    ["sign"]
  );

  // 4) HMAC-sign the payload
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    derivedKey,
    enc.encode(normalized)
  );

  // 5) Return hex signature
  return toHex(new Uint8Array(sigBuffer));
}

/** Recursively sort object keys so the same data → same signature */
function sortObject(obj) {
  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  } else if (obj && typeof obj === "object") {
    return Object.keys(obj)
      .sort()
      .reduce((o, k) => ((o[k] = sortObject(obj[k])), o), {});
  }
  return obj;
}

/** Concatenate Uint8Array pieces */
function concatBytes(chunks) {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Convert bytes to lowercase hex */
function toHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
