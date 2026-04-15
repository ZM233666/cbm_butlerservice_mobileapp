const test = require("node:test");
const assert = require("node:assert/strict");
const { buildHomeConfig } = require("../server/services/home-config");

test("buildHomeConfig should normalize valid cards", () => {
  const out = buildHomeConfig({
    tasks: [
      {
        maint: " C4C6 ",
        title: "C4/C6",
        meta: "CCBII · Maintenance",
        deadline: "2026-04-30",
        href: "/task-list.html?maint=c4c6",
      },
    ],
  });
  assert.equal(out.tasks.length, 1);
  assert.equal(out.tasks[0].maint, "c4c6");
});

test("buildHomeConfig should fallback when config invalid", () => {
  const out = buildHomeConfig({ tasks: [null, {}] });
  assert.equal(out.tasks.length, 2);
  assert.equal(out.tasks[0].maint, "c4c6");
});
