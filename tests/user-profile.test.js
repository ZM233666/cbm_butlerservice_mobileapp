const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeUsersStore, upsertUser } = require("../server/services/work-order-center");

test("normalizeUsersStore should preserve user profile fields", () => {
  const out = normalizeUsersStore({
    users: [
      {
        employeeId: "1",
        username: "Zhen Miao",
        email: "1@com",
        role: "fse",
        region: "Shanghai",
        specialWorkCertificates: [{ name: "登高证", status: "valid", photoUrl: "/uploads/certificates/test-a.jpg" }],
        qualifications: ["工程师"],
        skillLevel: "T3",
        skillTypes: ["EMU"],
      },
    ],
  });

  assert.equal(out.users.length, 1);
  assert.deepEqual(out.users[0].specialWorkCertificates, [{ name: "登高证", status: "valid", photoUrl: "/uploads/certificates/test-a.jpg" }]);
  assert.deepEqual(out.users[0].qualifications, ["工程师"]);
  assert.equal(out.users[0].skillLevel, "T3");
  assert.deepEqual(out.users[0].skillTypes, ["EMU"]);
});

test("upsertUser should update certificates and preserve other profile fields", () => {
  const store = normalizeUsersStore({
    users: [
      {
        employeeId: "3",
        username: "Zhen Miao",
        email: "3@com",
        role: "fse",
        region: "Shanghai",
        specialWorkCertificates: [],
        qualifications: ["工程师"],
        skillLevel: "T4",
        skillTypes: ["LOCO"],
      },
    ],
  });

  const result = upsertUser(store, {
    ...store.users[0],
    specialWorkCertificates: [
      { name: "登高证", photoUrl: "/uploads/certificates/test-b.jpg" },
      { name: "电工证", photoUrl: "/uploads/certificates/test-c.jpg" },
    ],
  });

  assert.equal(result.error, undefined);
  assert.deepEqual(result.user.specialWorkCertificates, [
    { name: "登高证", status: "valid", photoUrl: "/uploads/certificates/test-b.jpg" },
    { name: "电工证", status: "valid", photoUrl: "/uploads/certificates/test-c.jpg" },
  ]);
  assert.deepEqual(result.user.qualifications, ["工程师"]);
  assert.equal(result.user.skillLevel, "T4");
  assert.deepEqual(result.user.skillTypes, ["LOCO"]);
});
