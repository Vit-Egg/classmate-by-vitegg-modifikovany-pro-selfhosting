export const dynamic = "force-dynamic";

/** Otisk (SHA-256) podpisového certifikátu oficiální aplikace Classmate pro Android. Je veřejný, slouží jen k ověření odkazů. */
const OFFICIAL_CERT = "90:54:30:54:1E:71:D6:3F:80:34:92:43:88:13:23:1C:5B:5E:81:A1:34:CF:1E:90:83:16:BF:7F:61:62:F8:6E";

/**
 * Digital Asset Links: díky tomuto souboru Android otevírá odkazy na tenhle server rovnou v aplikaci (App Links), bez výběru prohlížeče.
 * Pro vlastní sestavení aplikace nastav ANDROID_APP_PACKAGE a ANDROID_APP_CERTS (otisky SHA-256 oddělené čárkou;
 * u Google Play přidej i otisk „App signing key“ z Play Console, který se liší od klíče, kterým podepisuješ nahrání).
 */
export function GET() {
  const certs = (process.env.ANDROID_APP_CERTS || OFFICIAL_CERT).split(",").map((c) => c.trim().toUpperCase()).filter((c) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(c));
  const pkg = (process.env.ANDROID_APP_PACKAGE || "cz.classmate.app").trim();
  return Response.json(
    [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: certs } }],
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
