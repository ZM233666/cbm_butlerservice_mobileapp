"use strict";

const fs = require("fs");
const path = require("path");

const EXTENSION_TYPES = new Map([
  [".jpg", "jpeg"],
  [".jpeg", "jpeg"],
  [".png", "png"],
  [".webp", "webp"],
  [".heic", "heif"],
  [".heif", "heif"],
  [".avif", "avif"],
]);

const MIME_TYPES = new Map([
  ["image/jpeg", "jpeg"],
  ["image/jpg", "jpeg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/heic", "heif"],
  ["image/heif", "heif"],
  ["image/avif", "avif"],
]);

function imageTypeFromMetadata(filename, mimetype) {
  const extensionType = EXTENSION_TYPES.get(path.extname(String(filename || "")).toLowerCase());
  const mimeType = MIME_TYPES.get(String(mimetype || "").toLowerCase());
  return extensionType && extensionType === mimeType ? extensionType : null;
}

function imageTypeFromHeader(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brands = [];
    for (let offset = 8; offset + 4 <= buffer.length; offset += 4) {
      brands.push(buffer.toString("ascii", offset, offset + 4));
    }
    if (brands.some((brand) => brand === "avif" || brand === "avis")) return "avif";
    if (brands.some((brand) => /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand))) {
      return "heif";
    }
  }
  return null;
}

function validateUploadMetadata(file) {
  return imageTypeFromMetadata(file && file.originalname, file && file.mimetype) !== null;
}

function validateStoredImage(file) {
  const expectedType = imageTypeFromMetadata(file && file.originalname, file && file.mimetype);
  if (!expectedType || !file || !file.path) return false;
  const fd = fs.openSync(file.path, "r");
  try {
    const header = Buffer.alloc(64);
    const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
    return imageTypeFromHeader(header.subarray(0, bytesRead)) === expectedType;
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = {
  imageTypeFromMetadata,
  imageTypeFromHeader,
  validateUploadMetadata,
  validateStoredImage,
};
