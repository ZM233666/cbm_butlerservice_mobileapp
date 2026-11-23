/**
 * 作业指导书设备信息字段（物料号 / 序列号 / 大修日期）归一化。
 */

function normalizeText(raw) {
  return String(raw || "").trim();
}

function normalizeEquipmentEntry(meta) {
  if (!meta || typeof meta !== "object") return null;
  const materialNumber = normalizeText(meta.materialNumber ?? meta.material_number);
  const serialNumber = normalizeText(meta.serialNumber ?? meta.serial_number);
  const overhaulOrManufactureDate = normalizeText(
    meta.overhaulOrManufactureDate
      ?? meta.overhaul_or_manufacture_date
      ?? meta.overhaulDate
      ?? meta.manufactureDate,
  );
  if (!materialNumber && !serialNumber && !overhaulOrManufactureDate) return null;
  const row = {};
  if (materialNumber) row.materialNumber = materialNumber;
  if (serialNumber) row.serialNumber = serialNumber;
  if (overhaulOrManufactureDate) row.overhaulOrManufactureDate = overhaulOrManufactureDate;
  return row;
}

function normalizeEquipmentMap(equipment) {
  const src = equipment && typeof equipment === "object" ? equipment : {};
  const out = {};
  Object.entries(src).forEach(([rowId, meta]) => {
    const key = normalizeText(rowId);
    if (!key) return;
    const row = normalizeEquipmentEntry(meta);
    if (row) out[key] = row;
  });
  return out;
}

module.exports = {
  normalizeEquipmentEntry,
  normalizeEquipmentMap,
};
