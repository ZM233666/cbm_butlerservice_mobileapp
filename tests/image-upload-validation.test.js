const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  imageTypeFromHeader,
  validateUploadMetadata,
  validateStoredImage,
} = require("../server/image-upload-validation");

test("recognizes supported image signatures", () => {
  assert.equal(imageTypeFromHeader(Buffer.from("ffd8ffe000104a46", "hex")), "jpeg");
  assert.equal(imageTypeFromHeader(Buffer.from("89504e470d0a1a0a", "hex")), "png");
  assert.equal(imageTypeFromHeader(Buffer.from("524946460000000057454250", "hex")), "webp");
  assert.equal(imageTypeFromHeader(Buffer.from("00000018667479706865696300000000", "hex")), "heif");
  assert.equal(imageTypeFromHeader(Buffer.from("00000018667479706176696600000000", "hex")), "avif");
});

test("requires matching extension and MIME type", () => {
  assert.equal(validateUploadMetadata({ originalname: "photo.jpg", mimetype: "image/jpeg" }), true);
  assert.equal(validateUploadMetadata({ originalname: "photo.jpg", mimetype: "image/png" }), false);
  assert.equal(validateUploadMetadata({ originalname: "photo.exe", mimetype: "image/jpeg" }), false);
});

test("rejects a file whose content does not match its metadata", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "butler-image-validation-"));
  const filePath = path.join(dir, "fake.jpg");
  try {
    fs.writeFileSync(filePath, "not an image");
    assert.equal(
      validateStoredImage({ path: filePath, originalname: "fake.jpg", mimetype: "image/jpeg" }),
      false,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
