import test from "node:test";
import assert from "node:assert/strict";
import { MAX_UPLOAD_BYTES, validateUpload, allowLocalRequest, validRunId, OUTPUT_FILES } from "../src/lib/analysis-contract.ts";
import { runnerArguments } from "../src/lib/server-analysis.ts";

test("accepts supported image/video inputs and normalizes extension casing", () => {
  assert.equal(validateUpload("my classroom.JPG", 100, "head").kind, "image");
  assert.equal(validateUpload("clip.MP4", 100, "baseline").kind, "video");
  assert.equal(validateUpload("input.tiff", 100, "head").extension, ".tiff");
});

test("rejects empty, oversized, and unsupported uploads before inference", () => {
  assert.throws(() => validateUpload("input.jpg", 0, "head"), /nonempty/);
  assert.throws(() => validateUpload("input.jpg", MAX_UPLOAD_BYTES + 1, "head"), /64 MB/);
  assert.throws(() => validateUpload("input.jpg.exe", 20, "head"), /supported/);
  assert.throws(() => validateUpload("input.jpg", NaN, "head"), /nonempty/);
  assert.equal(validateUpload("input.jpg", MAX_UPLOAD_BYTES, "head").kind, "image");
});

test("accepts only automatic-runner methods", () => {
  for (const value of ["pose", "--help", null, "head; exit"]) assert.throws(() => validateUpload("input.jpg", 20, value), /head model or geometric baseline/);
});

test("permits loopback requests and matching local browser origins", () => {
  assert.ok(allowLocalRequest(new Request("http://127.0.0.1:3000/api/analyze")));
  assert.ok(allowLocalRequest(new Request("http://localhost:3000/api/analyze", { headers: { origin: "http://127.0.0.1:3000" } })));
  assert.ok(allowLocalRequest(new Request("http://[::1]:3000/api/analyze")));
});

test("rejects cross-site requests, unrelated origins, and remote hosts", () => {
  for (const origin of ["https://example.com", "http://localhost:9000", "null", "https://localhost:3000"]) {
    assert.equal(allowLocalRequest(new Request("http://127.0.0.1:3000/api/analyze", { headers: { origin } })), false);
  }
  assert.equal(allowLocalRequest(new Request("http://example.com/api/analyze")), false);
  assert.equal(allowLocalRequest(new Request("http://localhost:3000/api/analyze", { headers: { "sec-fetch-site": "cross-site" } })), false);
});

test("run IDs cannot act as filesystem paths", () => {
  assert.ok(validRunId("6f788ac5-bb61-4c43-a0db-72f5200a12ab"));
  for (const value of ["../", "..\\models", "anything", "6f788ac5-bb61-4c43-a0db-72f5200a12ab/../", ""]) assert.equal(validRunId(value), false);
});

test("downloads expose only generated artifacts, never arbitrary paths or the original upload", () => {
  assert.equal(Object.hasOwn(OUTPUT_FILES, "../../AGENTS.md"), false);
  assert.equal(Object.hasOwn(OUTPUT_FILES, "__proto__"), false);
  assert.equal(Object.hasOwn(OUTPUT_FILES, "input.jpg"), false);
  assert.equal(Object.hasOwn(OUTPUT_FILES, "annotated.avi"), true);
  assert.ok(Object.values(OUTPUT_FILES).every((entry) => !entry.relative.includes("..")));
});

test("runner receives literal path arguments, with settings scoped to the chosen method", () => {
  const input = "C:/folder with spaces/$(input).jpg";
  const output = "C:/new output";
  const baseline = runnerArguments(input, output, "baseline", true, 2);
  assert.equal(baseline[baseline.indexOf("--input") + 1], input);
  assert.equal(baseline[baseline.indexOf("--output-dir") + 1], output);
  assert.ok(baseline.includes("--mirrored"));
  assert.equal(baseline[baseline.indexOf("--tile-grid") + 1], "2");
  const head = runnerArguments(input, output, "head", false, 3);
  assert.equal(head.includes("--mirrored"), false);
  assert.equal(head.includes("--tile-grid"), false);
});
