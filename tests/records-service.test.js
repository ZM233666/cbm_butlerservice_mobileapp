const test = require("node:test");
const assert = require("node:assert/strict");
const { queryRecords } = require("../server/services/records-service");

const rows = [
  {
    id: "REC-1",
    code: "KG-2104",
    taskSeq: "8.1",
    trainNo: "HXD1-1234",
    maintType: "C4/C6",
    date: "2026-03-24 09:32",
    desc: "EBVA SOCKET 插针歪斜",
  },
  {
    id: "REC-2",
    code: "WSP-SN",
    taskSeq: "11.1",
    trainNo: "HXD1-1132",
    maintType: "C4/C6",
    date: "2026-03-21 11:56",
    desc: "WSP 自检通过",
  },
];

test("queryRecords should match by keyword", () => {
  const res = queryRecords(rows, "kg-2104", 50);
  assert.equal(res.length, 1);
  assert.equal(res[0].id, "REC-1");
});

test("queryRecords should return empty when keyword blank", () => {
  const res = queryRecords(rows, "  ", 50);
  assert.deepEqual(res, []);
});

test("queryRecords should cap results by limit", () => {
  const res = queryRecords(rows, "hxd1", 1);
  assert.equal(res.length, 1);
});
