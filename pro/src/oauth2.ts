import { base64url } from "rfc4648";

/**
 * https://datatracker.ietf.org/doc/html/rfc7636
 * dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
 * => E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
 * @param x
 * @returns BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))
 */
export async function codeVerifier2CodeChallenge(x: string) {
  if (x === undefined || x === "") {
    return "";
  }
  try {
    return base64url.stringify(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(x))
      ),
      {
        pad: false,
      }
    );
  } catch (e) {
    return "";
  }
}
