import assert from "node:assert/strict";
import test from "node:test";

import worker from "../cloudflare/worker.js";

test("root serves v2 page from static assets", async () => {
  const request = new Request("https://example.workers.dev/");
  const response = await worker.fetch(request, {
    ASSETS: {
      fetch(assetRequest) {
        return new Response(new URL(assetRequest.url).pathname);
      },
    },
  });

  assert.equal(await response.text(), "/v2.html");
});

test("remove-watermark rejects empty body", async () => {
  const request = new Request("https://example.workers.dev/api/v2/remove-watermark", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  const response = await worker.fetch(request, {});
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
});

test("media route rejects invalid token", async () => {
  const request = new Request("https://example.workers.dev/api/v2/media/not-valid-token");
  const response = await worker.fetch(request, {});
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
});
