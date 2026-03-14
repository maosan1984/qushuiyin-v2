import test from "node:test";
import assert from "node:assert/strict";
import { extractFirstHttpUrl } from "../public/v2-url.js";

test("extract direct URL", () => {
  assert.equal(
    extractFirstHttpUrl("https://v.douyin.com/abc123/"),
    "https://v.douyin.com/abc123/"
  );
});

test("extract URL from share text", () => {
  const input =
    "2.05 copy this https://v.douyin.com/lbTFJ0v7WzY/ 11/04 abc";
  assert.equal(
    extractFirstHttpUrl(input),
    "https://v.douyin.com/lbTFJ0v7WzY/"
  );
});

test("strip trailing punctuation", () => {
  assert.equal(
    extractFirstHttpUrl("watch: https://example.com/video.mp4,"),
    "https://example.com/video.mp4"
  );
});

test("return empty if not found", () => {
  assert.equal(extractFirstHttpUrl("no link here"), "");
});
