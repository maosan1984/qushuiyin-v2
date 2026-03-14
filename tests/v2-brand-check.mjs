import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const htmlPath = path.resolve("public/v2.html");
const html = fs.readFileSync(htmlPath, "utf8");

assert.match(html, /no-watermark-hero/, "expected hero marker");
assert.match(html, /parse-cta/, "expected parse CTA marker");
assert.match(html, /wuxia-scene/, "expected wuxia scene marker");
assert.doesNotMatch(html, /jianghu-copy/, "jianghu copy block should be removed");
assert.doesNotMatch(html, /工具铺/, "tool shop description should be removed");

console.log("v2-brand-check:ok");
