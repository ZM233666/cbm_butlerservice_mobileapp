const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mapDjangoRoleToNode,
  mapDjangoUserInfoToLocalUser,
  mergeIdentityWithLocalProfile,
  isLocalAuthAllowed,
  isRemoteAuthSkipped,
  createAuthCache,
  isRemoteDbSaturationError,
} = require("../server/services/django-auth");

test("mapDjangoRoleToNode should map FSE and manager roles", () => {
  assert.equal(mapDjangoRoleToNode("FSE", "FieldServiceEngineer", false), "fse");
  assert.equal(mapDjangoRoleToNode("RSM", "RegionalServiceManager", false), "manager");
  assert.equal(mapDjangoRoleToNode("admin", "管理员", false), "manager");
  assert.equal(mapDjangoRoleToNode("", "", true), "manager");
});

test("mapDjangoUserInfoToLocalUser should map django user_info payload", () => {
  const mapped = mapDjangoUserInfoToLocalUser({
    username: "20005303",
    name: "陈明亮",
    email: null,
    dept_info: { dept_name: "重庆" },
    role_info: [{ key: "FSE", name: "FieldServiceEngineer" }],
  });

  assert.deepEqual(mapped, {
    employeeId: "20005303",
    username: "陈明亮",
    email: "",
    department: "重庆",
    region: "重庆",
    role: "fse",
  });
});

test("mergeIdentityWithLocalProfile should preserve local certificates", () => {
  const merged = mergeIdentityWithLocalProfile(
    {
      employeeId: "20005303",
      username: "陈明亮",
      email: "",
      department: "",
      region: "重庆",
      role: "fse",
      specialWorkCertificates: [{ name: "登高证", status: "valid" }],
      qualifications: ["工程师"],
      skillLevel: "T3",
      skillTypes: ["EMU"],
    },
    {
      employeeId: "20005303",
      username: "陈明亮",
      email: "fse@example.com",
      department: "重庆区域",
      region: "重庆区域",
      role: "fse",
    }
  );

  assert.equal(merged.email, "fse@example.com");
  assert.equal(merged.region, "重庆区域");
  assert.deepEqual(merged.specialWorkCertificates, [{ name: "登高证", status: "valid" }]);
  assert.equal(merged.skillLevel, "T3");
});

test("isLocalAuthAllowed should default on in non-production", () => {
  assert.equal(isLocalAuthAllowed({ NODE_ENV: "development" }), true);
  assert.equal(isLocalAuthAllowed({ NODE_ENV: "production" }), false);
  assert.equal(isLocalAuthAllowed({ NODE_ENV: "production", ALLOW_LOCAL_AUTH: "1" }), true);
  assert.equal(isLocalAuthAllowed({ NODE_ENV: "development", ALLOW_LOCAL_AUTH: "0" }), false);
});

test("isRemoteAuthSkipped should only enable on explicit flag", () => {
  assert.equal(isRemoteAuthSkipped({}), false);
  assert.equal(isRemoteAuthSkipped({ SKIP_REMOTE_AUTH: "1" }), true);
  assert.equal(isRemoteAuthSkipped({ SKIP_REMOTE_AUTH: "yes" }), true);
  assert.equal(isRemoteAuthSkipped({ SKIP_REMOTE_AUTH: "0" }), false);
});

test("createAuthCache should expire entries by ttl", async () => {
  const cache = createAuthCache({ ttlMs: 30 });
  cache.set("k", { username: "a" });
  assert.deepEqual(cache.get("k"), { username: "a" });
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(cache.get("k"), null);
});

test("isRemoteDbSaturationError should detect postgres client exhaustion", () => {
  assert.equal(
    isRemoteDbSaturationError({
      msg: 'connection to server at "butler-service-postgres" failed: FATAL: sorry, too many clients already',
    }),
    true
  );
  assert.equal(isRemoteDbSaturationError({ msg: "ok" }), false);
});
