/** H5 basicInfo 公里数（与 Django task_basic_fields 对齐） */
const MAX_MILEAGE_KM = 9_999_999;

function normalizeMileageKm(raw) {
  if (raw === null || raw === undefined || typeof raw === "boolean") return null;
  const text = String(raw).trim().replace(/,/g, "").replace(/，/g, "");
  if (!text) return null;
  const num = Number(text);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0 || num > MAX_MILEAGE_KM) {
    return null;
  }
  return num;
}

function validateBasicInfoMileage(basicInfo, { required = false } = {}) {
  const basic = basicInfo && typeof basicInfo === "object" ? basicInfo : {};
  const raw = basic.mileageKm != null ? basic.mileageKm : basic.mileage_km;
  const text = String(raw ?? "").trim();
  if (!text) {
    if (required) return { ok: false, error: "mileage_required" };
    return { ok: true };
  }
  const mileageKm = normalizeMileageKm(text);
  if (mileageKm == null) return { ok: false, error: "mileage_invalid" };
  return { ok: true, mileageKm };
}

module.exports = {
  MAX_MILEAGE_KM,
  normalizeMileageKm,
  validateBasicInfoMileage,
};
