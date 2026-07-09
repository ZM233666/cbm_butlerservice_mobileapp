const test = require("node:test");
const assert = require("node:assert/strict");

test("django-task should read REMOTE_API_BASE after dotenv loads", () => {
  process.env.REMOTE_API_BASE = "http://127.0.0.1:8005";
  process.env.TASK_DATA_SOURCE = "db";
  delete require.cache[require.resolve("../server/services/django-task")];
  const { isTaskDataFromDb } = require("../server/services/django-task");
  assert.equal(isTaskDataFromDb(), true);
});
